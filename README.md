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

## License

MIT
