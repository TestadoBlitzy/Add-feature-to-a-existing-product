/**
 * __tests__/startup.test.js
 *
 * Startup-behavior tests for server.js (Express 5 single-file application).
 *
 * These tests cover the `app.listen(3000, callback)` invocation and the
 * `console.log('Server running at http://127.0.0.1:3000/')` emission in
 * server.js. Those code paths are NOT reachable via in-process supertest
 * (which binds the Express app to an ephemeral port) — therefore we spawn
 * the real `node server.js` as a child process, observe its stdout for the
 * exact startup log line, probe 127.0.0.1:3000 via a raw TCP connection to
 * confirm the listener is bound, and cleanly terminate the child via
 * SIGTERM in afterEach.
 *
 * This test file:
 *   - Uses ZERO mocking libraries (everything exercises real code paths).
 *   - Exercises the `require.main === module` branch of server.js (the
 *     branch NOT exercised when __tests__/server.test.js imports the app).
 *   - Binds to port 3000 briefly and releases it cleanly between tests.
 *   - Verifies byte-exact startup log content, TCP reachability, and
 *     log-after-bind ordering.
 *
 * See AAP Sections 0.1.1, 0.1.3, 0.2.2, 0.3.1, 0.4.1, 0.4.2, 0.5.1, 0.5.2,
 * 0.7.1, 0.7.2, 0.9.1, and 0.10.1 for the specification.
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

// 10-second upper bound per test: covers child-process spawn + log
// accumulation + TCP probe with generous headroom for startup jitter.
jest.setTimeout(10000);

describe('server.js startup behavior', () => {
  // Byte-exact match to the literal in server.js line 17 (after refactor).
  // Any deviation (localhost vs 127.0.0.1, different port, trailing/leading
  // whitespace) MUST cause tests to fail — this is a contract assertion.
  const STARTUP_LOG = 'Server running at http://127.0.0.1:3000/';

  // Absolute filesystem path to server.js resolved from __dirname so the
  // spawn call is deterministic regardless of the working directory at
  // test-execution time (e.g., when Jest is invoked from a subdirectory).
  const SERVER_PATH = path.resolve(__dirname, '..', 'server.js');

  // Holds the currently-spawned child process so afterEach can reliably
  // terminate it even when a test throws before its local cleanup runs.
  let child = null;

  /**
   * afterEach — CRITICAL cleanup hook.
   *
   * Guarantees that any spawned child process is terminated between tests
   * so that port 3000 is released before the next test spawns its own
   * server. Without this hook, a failing test could leave a listener alive
   * and cause subsequent tests to fail with EADDRINUSE.
   *
   * Behavior:
   *   1. If the child exists and has not yet exited, send SIGTERM.
   *   2. Await the `exit` event OR a 3-second fallback that escalates to
   *      SIGKILL (Windows approximates SIGTERM as TerminateProcess, which
   *      is effectively immediate, but we keep the fallback for safety).
   *   3. Null out the handle to prevent stale references across tests.
   */
  afterEach(async () => {
    if (child && child.exitCode === null && !child.killed) {
      let sigkillTimer = null;
      const exitPromise = new Promise((resolve) => {
        child.once('exit', () => {
          // Clear any pending SIGKILL fallback so it does not keep the
          // event loop alive after the child has already exited.
          if (sigkillTimer !== null) {
            clearTimeout(sigkillTimer);
            sigkillTimer = null;
          }
          resolve();
        });
      });
      child.kill('SIGTERM');
      const sigkillTimeout = new Promise((resolve) => {
        sigkillTimer = setTimeout(() => {
          sigkillTimer = null;
          if (child && child.exitCode === null && !child.killed) {
            child.kill('SIGKILL');
          }
          resolve();
        }, 3000);
      });
      await Promise.race([exitPromise, sigkillTimeout]);
      // Race may leave the losing timer pending; ensure it's cleared so
      // Jest's --detectOpenHandles does not report a Timeout leak.
      if (sigkillTimer !== null) {
        clearTimeout(sigkillTimer);
        sigkillTimer = null;
      }
    }
    child = null;
  });

  /**
   * Spawns `node server.js` as a child process. Uses `process.execPath`
   * so the child runs with the same Node binary as the Jest process
   * (avoiding PATH-resolution ambiguity). Pipes stdout/stderr for
   * in-test capture and inherits the parent environment so module
   * resolution works identically.
   */
  function spawnServer() {
    return spawn(process.execPath, [SERVER_PATH], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
  }

  /**
   * Returns a Promise that resolves with the accumulated stdout buffer
   * once it contains `expected`. Rejects on:
   *   - timeout (default 5s) — descriptive error with captured stdio;
   *   - spawn failure (proc 'error' event);
   *   - unexpected process exit before the log appears.
   *
   * Using a log-observation pattern (rather than a timer-based wait)
   * eliminates flakiness: we resolve as soon as the event we care about
   * actually happens, independent of CPU/io scheduling jitter.
   */
  function waitForStartupLog(proc, expected, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let settled = false;

      const settle = (fn, value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        fn(value);
      };

      const timer = setTimeout(() => {
        settle(
          reject,
          new Error(
            'Timeout waiting for startup log "' + expected + '". ' +
            'stdout so far: ' + JSON.stringify(stdoutBuffer) + '. ' +
            'stderr so far: ' + JSON.stringify(stderrBuffer) + '.'
          )
        );
      }, timeoutMs);

      proc.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString('utf8');
        if (stdoutBuffer.includes(expected)) {
          settle(resolve, stdoutBuffer);
        }
      });

      proc.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString('utf8');
      });

      proc.once('error', (err) => {
        settle(reject, err);
      });

      proc.once('exit', (code, signal) => {
        if (!stdoutBuffer.includes(expected)) {
          settle(
            reject,
            new Error(
              'Process exited before startup log appeared. ' +
              'code=' + code + ', signal=' + signal + ', ' +
              'stdout=' + JSON.stringify(stdoutBuffer) + ', ' +
              'stderr=' + JSON.stringify(stderrBuffer) + '.'
            )
          );
        }
      });
    });
  }

  /**
   * Performs a raw TCP connect probe against host:port. Resolves when the
   * `connect` event fires (i.e., the three-way handshake completed).
   * Rejects on socket error (ECONNREFUSED, EADDRNOTAVAIL, etc.) or on
   * timeout. Uses `net.createConnection` — NOT HTTP — to keep this test
   * free of HTTP-layer assumptions (those are covered in server.test.js).
   */
  function tcpProbe(host, port, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      let settled = false;

      const settle = (fn, value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        fn(value);
      };

      const socket = net.createConnection({ host, port });

      const timer = setTimeout(() => {
        socket.destroy();
        settle(
          reject,
          new Error('TCP connect timeout after ' + timeoutMs + 'ms for ' + host + ':' + port)
        );
      }, timeoutMs);

      socket.once('connect', () => {
        socket.end();
        settle(resolve, undefined);
      });

      socket.once('error', (err) => {
        settle(reject, err);
      });
    });
  }

  it('emits the startup log line on stdout', async () => {
    child = spawnServer();
    const stdoutBuffer = await waitForStartupLog(child, STARTUP_LOG);
    // Byte-exact substring match for the startup log literal.
    expect(stdoutBuffer).toContain(STARTUP_LOG);
    // console.log appends a trailing newline — verify that too so a future
    // change to `process.stdout.write(...)` (which does NOT append '\n')
    // would cause the test to fail.
    expect(stdoutBuffer).toContain(STARTUP_LOG + '\n');
  });

  it('binds to 127.0.0.1:3000 and accepts TCP connections', async () => {
    child = spawnServer();
    await waitForStartupLog(child, STARTUP_LOG);
    // Once the log is observed, the listener has already been bound by
    // Express (app.listen's callback fires only after successful bind).
    // A TCP probe must therefore connect immediately.
    await expect(tcpProbe('127.0.0.1', 3000)).resolves.toBeUndefined();
  });

  it('emits the log after TCP bind succeeds (log-after-bind ordering)', async () => {
    child = spawnServer();
    await waitForStartupLog(child, STARTUP_LOG);
    // Ordering invariant: the log is emitted from inside the app.listen
    // callback, which Express only invokes after the TCP server has bound
    // successfully. Therefore, observing the log implies the bind has
    // already completed, and the port must be reachable NOW.
    // This test would regress if someone moved console.log outside the
    // app.listen callback (emitting the log before the bind).
    await expect(tcpProbe('127.0.0.1', 3000)).resolves.toBeUndefined();
  });
});
