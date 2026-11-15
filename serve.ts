// Serves game/ on http://localhost:8080 for playing and screenshots. Standard library only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, 'game');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = createServer(async (request, response) => {
  try {
    const path = request.url === '/' ? '/index.html' : decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = await readFile(join(root, path));
    response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});

server.listen(8080, () => console.log('Lanternkeeper at http://localhost:8080'));
