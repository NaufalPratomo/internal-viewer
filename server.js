const { createServer } = require('http');
const { parse } = require('url');
const path = require('path');
const next = require('next');

// Set APP_ROOT sekali di sini — server.js selalu ada di project root
// dan tidak pernah dikompilasi oleh Next.js, jadi __dirname selalu benar.
process.env.APP_ROOT = __dirname;

const dev = false;
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT, 10) || 3030;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
