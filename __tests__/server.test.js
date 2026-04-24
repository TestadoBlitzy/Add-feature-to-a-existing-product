/**
 * Route-level HTTP integration tests for server.js via supertest.
 * Because server.js guards `app.listen(...)` with `require.main === module`,
 * requiring it here does NOT start a listener — supertest binds the app to
 * an ephemeral per-request port, enabling parallel execution without port
 * contention. Covers GET /, GET /good-evening, default 404, method
 * mismatch, and app configuration per AAP Section 0.4.2 (19 tests).
 */

const request = require('supertest');
const app = require('../server');

describe('server.js HTTP behavior', () => {
  // Inline constants mirror server.js literals byte-for-byte so whitespace,
  // casing, or punctuation regressions are caught deterministically.
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

    // Express 5's default "case sensitive routing" is DISABLED; server.js
    // does not enable it, so '/Good-evening' matches '/good-evening' and
    // returns 200. Asserts the CURRENT observable contract — would regress
    // (and correctly force an intentional contract update) if a future edit
    // called `app.set('case sensitive routing', true)` in server.js.
    it('matches case-insensitively by default (GET /Good-evening returns 200 with the same body)', async () => {
      const response = await request(app).get('/Good-evening');
      expect(response.status).toBe(200);
      expect(response.text).toBe(EVENING_BODY);
    });
  });

  describe('Default 404 behavior for unknown routes', () => {
    // Status only — Express's default 404 body is framework-owned and may
    // change across patch versions; asserting on it would be brittle.
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
    // Express 5 default: unmatched method on a registered path yields 404.
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
      // Express 5 uses app.router (public); Express 4 used app._router.
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
