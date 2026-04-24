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

## License

MIT
