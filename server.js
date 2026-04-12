const express = require('express');

const app = express();

// GET / — Preserves existing "Hello, World!" behavior
app.get('/', (req, res) => {
  res.send('Hello, World!\n');
});

// GET /good-evening — New endpoint returning "Good evening"
app.get('/good-evening', (req, res) => {
  res.send('Good evening');
});

app.listen(3000, () => {
  console.log('Server running at http://127.0.0.1:3000/');
});
