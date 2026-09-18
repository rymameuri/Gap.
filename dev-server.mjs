import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./apps/frontend/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const url = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    let file = resolve(root, '.' + pathname);
    const pageRoutes = { '/teacher/': 'src/pages/instructor/index.html', '/student/': 'src/pages/student/index.html' };
    if (pathname === '/teacher' || pathname === '/student') {
      response.writeHead(302, { Location: pathname + '/' + url.search }).end();
      return;
    }
    if (pageRoutes[pathname]) file = resolve(root, pageRoutes[pathname]);
    if (pathname === '/data/demo-state.js') {
      const demo = await readFile(fileURLToPath(new URL('./data/demo-state.js', import.meta.url)));
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : demo);
      return;
    }
    if ((file !== resolve(root) && !file.startsWith(resolve(root) + sep)) || pathname.split('/').some(part => part.startsWith('.'))) {
      response.writeHead(404).end('Not found');
      return;
    }
    if ((await stat(file)).isDirectory()) {
      if (!pathname.endsWith('/')) {
        response.writeHead(302, { Location: url.pathname + '/' + url.search }).end();
        return;
      }
      file = resolve(file, 'index.html');
    }
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
const port = Number(process.env.PORT || 3000);
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'Port is busy. Try PORT=3001 npm run dev' : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log('Gap is ready: http://localhost:' + port + '\nEdit files in apps/frontend/src/ and refresh your browser.'));
