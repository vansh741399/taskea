/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const hostname = '0.0.0.0';

const app = next({ dir: '.', dev: false, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl).catch(err => {
      console.error('Error handling request:', err.message);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });
  }).listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });

  server.on('error', (err) => {
    console.error('Server error:', err);
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
  });
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
  });
}).catch((err) => {
  console.error('Error preparing app:', err);
  process.exit(1);
});
