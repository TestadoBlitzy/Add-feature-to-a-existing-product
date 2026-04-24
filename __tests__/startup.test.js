/**
 * Startup tests for server.js: spawn `node server.js` as a child process
 * (so `require.main === module` is true inside the child), observe stdout
 * for the startup log, probe 127.0.0.1:3000 via raw TCP to confirm bind,
 * then cleanly terminate in afterEach. Covers the listen branch unreachable
 * from in-process supertest. Jest V8 instruments only the worker process,
 * not the child — lines here are behaviorally covered but not counted in
 * Jest's reported percentages (see README "Running Tests" for details).
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

// 10-second upper bound per test: spawn + log + TCP probe jitter.
jest.setTimeout(10000);

describe('server.js startup behavior', () => {
  const STARTUP_LOG = 'Server running at http://127.0.0.1:3000/';
  const SERVER_PATH = path.resolve(__dirname, '..', 'server.js');
  let child = null;

  // Terminate any spawned child so port 3000 is released between tests.
  // SIGTERM first; escalate to SIGKILL after 3s. Clear the SIGKILL timer
  // in BOTH resolution paths to keep --detectOpenHandles clean.
  afterEach(async () => {
    if (child && child.exitCode === null && !child.killed) {
      let sigkillTimer = null;
      const exitPromise = new Promise((resolve) => {
        child.once('exit', () => {
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
      if (sigkillTimer !== null) {
        clearTimeout(sigkillTimer);
        sigkillTimer = null;
      }
    }
    child = null;
  });

  // Spawn `node server.js` with the same Node binary as Jest.
  function spawnServer() {
    return spawn(process.execPath, [SERVER_PATH], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
  }

  // Resolve when stdout contains `expected`; reject on timeout/error/exit.
  function waitForStartupLog(proc, expected, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let settled = false;
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const timer = setTimeout(() => {
        settle(reject, new Error(
          'Timeout waiting for startup log "' + expected + '". ' +
          'stdout: ' + JSON.stringify(stdoutBuffer) + '. ' +
          'stderr: ' + JSON.stringify(stderrBuffer) + '.'
        ));
      }, timeoutMs);
      proc.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString('utf8');
        if (stdoutBuffer.includes(expected)) settle(resolve, stdoutBuffer);
      });
      proc.stderr.on('data', (chunk) => { stderrBuffer += chunk.toString('utf8'); });
      proc.once('error', (err) => settle(reject, err));
      proc.once('exit', (code, signal) => {
        if (!stdoutBuffer.includes(expected)) {
          settle(reject, new Error(
            'Process exited before startup log appeared. ' +
            'code=' + code + ', signal=' + signal + ', ' +
            'stdout=' + JSON.stringify(stdoutBuffer) + ', ' +
            'stderr=' + JSON.stringify(stderrBuffer) + '.'
          ));
        }
      });
    });
  }

  // Raw TCP probe (not HTTP) — resolves on connect, rejects on error/timeout.
  function tcpProbe(host, port, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const socket = net.createConnection({ host, port });
      const timer = setTimeout(() => {
        socket.destroy();
        settle(reject, new Error(
          'TCP connect timeout after ' + timeoutMs + 'ms for ' + host + ':' + port
        ));
      }, timeoutMs);
      socket.once('connect', () => {
        socket.end();
        settle(resolve, undefined);
      });
      socket.once('error', (err) => settle(reject, err));
    });
  }

  it('emits the startup log line on stdout', async () => {
    child = spawnServer();
    const stdoutBuffer = await waitForStartupLog(child, STARTUP_LOG);
    expect(stdoutBuffer).toContain(STARTUP_LOG);
    // console.log appends '\n'; a regression to process.stdout.write would fail.
    expect(stdoutBuffer).toContain(STARTUP_LOG + '\n');
  });

  it('binds to 127.0.0.1:3000 and accepts TCP connections', async () => {
    child = spawnServer();
    await waitForStartupLog(child, STARTUP_LOG);
    // Log observation implies app.listen callback fired, i.e., bind succeeded.
    await expect(tcpProbe('127.0.0.1', 3000)).resolves.toBeUndefined();
  });

  it('emits the log after TCP bind succeeds (log-after-bind ordering)', async () => {
    child = spawnServer();
    await waitForStartupLog(child, STARTUP_LOG);
    // Would regress if console.log were moved outside the app.listen callback.
    await expect(tcpProbe('127.0.0.1', 3000)).resolves.toBeUndefined();
  });
});
