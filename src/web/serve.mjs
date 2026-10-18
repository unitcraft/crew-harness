// serve.mjs — крошечный статический сервер, чтобы открыть страницу без npm и без сборки.
//   node src/web/serve.mjs [порт]      затем: http://localhost:8093/?mock=1
// Нужен потому, что браузеры не грузят модули (<script type="module">) со страницы file://.
// Слушает только 127.0.0.1. Это не сервис продукта: настоящий /ws и раздачу страницы даст сервис.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] ?? 8093);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.resolve(root, `.${rel}`);
  const type = TYPES[path.extname(file)];
  const inside = file.startsWith(root + path.sep);
  if (!inside || !type || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
    return;
  }
  // Тот же запрет встроенного кода, что и у сервиса: страница, пустая здесь, пуста и там.
  res.writeHead(200, {
    'content-type': type,
    'content-security-policy': "default-src 'self'; connect-src 'self' ws://localhost:* ws://127.0.0.1:*",
    'cache-control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`http://localhost:${port}/?mock=1`);
});
