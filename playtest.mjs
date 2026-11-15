// Interactive smoke test: loads the real game, clicks to start, moves and fires with the
// mouse and keyboard for a few seconds, and reports the announced status and any page
// error. Exits non-zero on a page error.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, 'game');
const types = { '.html': 'text/html', '.js': 'text/javascript' };
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
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
const errors = [];
const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  console.log('title status:', await page.textContent('#status'));
  // Click to start, then hold fire while sweeping the mouse and strafing.
  await page.mouse.click(640, 360);
  await page.waitForTimeout(300);
  console.log('after start:', await page.textContent('#status'));
  await page.mouse.move(900, 200);
  await page.mouse.down();
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyD');
  await page.mouse.move(400, 500);
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyD');
  await page.mouse.up();
  console.log('after play:', await page.textContent('#status'));
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(300);
  console.log('after pause:', await page.textContent('#status'));
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(300);
  console.log('after resume:', await page.textContent('#status'));
  await page.screenshot({ path: join(here, 'screenshots', '_playtest.jpg'), type: 'jpeg', quality: 80 });
  console.log('page errors:', errors.length === 0 ? 'none' : errors);
  if (errors.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
