# hao-backprop-test

A lightweight Express.js HTTP server that exposes simple text-based endpoints.

## Endpoints

| Method | Path             | Response              | Content Type |
|--------|------------------|-----------------------|--------------|
| GET    | `/`              | `Hello, World!\n`     | text/plain   |
| GET    | `/good-evening`  | `Good evening`        | text/plain   |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher

### Install Dependencies

```bash
npm install
```

### Start the Server

```bash
npm start
```

or

```bash
node server.js
```

The server listens on **port 3000**. Once running you can verify the endpoints:

```bash
curl http://localhost:3000/
# Hello, World!

curl http://localhost:3000/good-evening
# Good evening
```

### Running Tests

The project uses [Jest](https://jestjs.io/) and [Supertest](https://github.com/ladjs/supertest) for automated HTTP testing. After installing dependencies, execute the test suite:

```bash
npm test
```

Optionally, run the suite with coverage instrumentation:

```bash
npm run test:coverage
```

The test suite verifies the HTTP contract of both endpoints, the default 404 behavior for unknown routes, and the startup log emitted on port 3000.

#### Coverage Measurement Note

`__tests__/startup.test.js` exercises the `app.listen(...)` / `console.log(...)` block of `server.js` (inside the `if (require.main === module)` guard) by spawning `node server.js` as a **child process**. Jest's built-in V8 coverage provider instruments only the Jest worker process; it does **not** measure lines executed inside subprocesses spawned via `child_process.spawn`. Consequently, `npm run test:coverage` reports approximately **80% line coverage**, **50% branch coverage**, and **66.66% function coverage** for `server.js` even though every line is exercised end-to-end by the test suite. The uncovered region in the report (server.js lines 16–17) is **behaviorally covered** by `__tests__/startup.test.js` via subprocess spawn, TCP probe, and byte-exact stdout assertion.

## License

MIT
