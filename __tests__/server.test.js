/**
 * __tests__/server.test.js
 *
 * Route-level HTTP integration tests for server.js (Express 5 single-file
 * application).
 *
 * These tests exercise the Express routing pipeline end-to-end against the
 * real `app` object exported by server.js. Because server.js guards its
 * `app.listen(3000, ...)` call with `if (require.main === module)`, the
 * `require('../server')` below does NOT start a listener on port 3000 —
 * supertest binds the app to an ephemeral per-request port automatically,
 * eliminating port contention and enabling parallel test execution.
 *
 * Coverage (per AAP Section 0.4.2):
 *   - GET /                      (4 cases)
 *   - GET /good-evening          (4 cases)
 *   - Default 404 behavior       (4 cases)
 *   - Method mismatch            (4 cases)
 *   - App configuration          (3 cases)
 *                                ------
 *                                19 total
 *
 * Style constraints (per AAP Sections 0.7.2 and 0.10.1):
 *   - CommonJS require(), 2-space indentation, single-quoted strings.
 *   - Byte-exact comparisons via expect(...).toBe(...) — no trim, lowercase,
 *     or regex normalization on bodies or headers.
 *   - async/await with supertest (never .end(done)).
 *   - No beforeAll/afterAll hooks (the Express app is stateless).
 *   - No fixture files, no helper functions — all expected values inline.
 *   - Observable-behavior only — the App configuration block inspects the
 *     router stack to count/verify routes, which is the single permitted
 *     peek at Express's internals (asserting counts and paths/methods, not
 *     internal route-object shape).
 */

const request = require('supertest');
const app = require('../server');

describe('server.js HTTP behavior', () => {
  // Inline expected-value constants mirror the literals in server.js
  // byte-for-byte so that any regression (whitespace, casing, punctuation)
  // in the handlers is caught deterministically.
  const TEXT_PLAIN = 'text/plain; charset=utf-8';
  const HELLO_BODY = 'Hello, World!\n';
  const EVENING_BODY = 'Good evening';

  describe('GET /', () => {
    it('responds with HTTP 200', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
    });

    it('responds with body "Hello, World!\\n" (byte-exact, including trailing newline)', async () => {
      const response = await request(app).get('/');
      expect(response.text).toBe(HELLO_BODY);
    });

    it('responds with Content-Type text/plain; charset=utf-8', async () => {
      const response = await request(app).get('/');
      expect(response.headers['content-type']).toBe(TEXT_PLAIN);
    });

    it('ignores query string parameters and returns the same body and status', async () => {
      const response = await request(app).get('/?foo=bar&baz=qux');
      expect(response.status).toBe(200);
      expect(response.text).toBe(HELLO_BODY);
    });
  });

  describe('GET /good-evening', () => {
    it('responds with HTTP 200', async () => {
      const response = await request(app).get('/good-evening');
      expect(response.status).toBe(200);
    });

    it('responds with body "Good evening" (byte-exact, NO trailing newline)', async () => {
      const response = await request(app).get('/good-evening');
      expect(response.text).toBe(EVENING_BODY);
    });

    it('responds with Content-Type text/plain; charset=utf-8', async () => {
      const response = await request(app).get('/good-evening');
      expect(response.headers['content-type']).toBe(TEXT_PLAIN);
    });

    it('matches case-insensitively by default (GET /Good-evening returns 200 with the same body)', async () => {
      // Express's default for the "case sensitive routing" setting is
      // DISABLED (per Express 5.x API reference: "disabled by default,
      // treating '/Foo' and '/foo' as the same"). server.js never enables
      // this setting, so '/Good-evening' matches the '/good-evening' route
      // and returns the "Good evening" body verbatim. This test asserts the
      // CURRENT observable contract and would regress if someone called
      // `app.set('case sensitive routing', true)` in server.js (in which
      // case '/Good-evening' would then yield the default 404 instead).
      const response = await request(app).get('/Good-evening');
      expect(response.status).toBe(200);
      expect(response.text).toBe(EVENING_BODY);
    });
  });

  describe('Default 404 behavior for unknown routes', () => {
    // These tests assert status code ONLY. Express's default 404 HTML body
    // is framework-owned and may vary across patch versions — asserting on
    // its content would introduce brittleness against Express upgrades.
    it('returns 404 for GET /missing', async () => {
      const response = await request(app).get('/missing');
      expect(response.status).toBe(404);
    });

    it('returns 404 for GET /api', async () => {
      const response = await request(app).get('/api');
      expect(response.status).toBe(404);
    });

    it('returns 404 for GET /good-evening-extra', async () => {
      const response = await request(app).get('/good-evening-extra');
      expect(response.status).toBe(404);
    });

    it('returns 404 for GET /root-with-suffix', async () => {
      const response = await request(app).get('/root-with-suffix');
      expect(response.status).toBe(404);
    });
  });

  describe('Method handling on defined paths', () => {
    // Express 5's default behavior for an unmatched method on a registered
    // path is 404 (not 405), because no method-specific handler is
    // registered. If a future refactor added `app.all(...)` or a
    // method-override middleware, these tests would regress.
    it('returns 404 for POST /', async () => {
      const response = await request(app).post('/');
      expect(response.status).toBe(404);
    });

    it('returns 404 for PUT /', async () => {
      const response = await request(app).put('/');
      expect(response.status).toBe(404);
    });

    it('returns 404 for DELETE /', async () => {
      const response = await request(app).delete('/');
      expect(response.status).toBe(404);
    });

    it('returns 404 for POST /good-evening', async () => {
      const response = await request(app).post('/good-evening');
      expect(response.status).toBe(404);
    });
  });

  describe('App configuration', () => {
    it('exports an Express app (function with .get, .listen APIs)', () => {
      expect(typeof app).toBe('function');
      expect(typeof app.get).toBe('function');
      expect(typeof app.listen).toBe('function');
    });

    it('registers exactly 2 routes', () => {
      // Express 5 exposes `app.router` (public API); Express 4 used
      // `app._router` (private). The `||` fallback supports both versions
      // to keep this assertion resilient across minor Express upgrades.
      const stack = (app.router && app.router.stack) || (app._router && app._router.stack) || [];
      const routeLayers = stack.filter((layer) => layer.route);
      expect(routeLayers).toHaveLength(2);
    });

    it('registers GET / and GET /good-evening specifically', () => {
      const stack = (app.router && app.router.stack) || (app._router && app._router.stack) || [];
      const routeLayers = stack.filter((layer) => layer.route);
      const routes = routeLayers.map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]),
      }));
      const paths = routes.map((r) => r.path).sort();
      expect(paths).toEqual(['/', '/good-evening']);
      routes.forEach((route) => {
        expect(route.methods).toEqual(['get']);
      });
    });
  });
});
