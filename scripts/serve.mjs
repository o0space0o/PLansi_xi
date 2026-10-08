import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { serveMusic } from './music-server.mjs';
const portArgument = process.argv.indexOf('--port');
const port = portArgument < 0 ? 4173 : Number(process.argv[portArgument + 1]);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Use --port followed by a port from 1024 to 65535.');
const address = `http://127.0.0.1:${port}`;
const openBrowser = () => {
  if (process.platform === 'win32')
    execFile('cmd.exe', ['/d', '/c', 'start', address], { windowsHide: true }, () => {});
};
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const project = JSON.parse(await readFile(resolve(root, '../package.json'), 'utf8'));
const audioRoot = resolve(root, '../Audio');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
};
const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(
        req.method === 'HEAD'
          ? undefined
          : JSON.stringify({ application: 'PLansi_xi', version: project.version }),
      );
      return;
    }
    if (await serveMusic(req, res, audioRoot, pathname)) return;
    let path = resolve(root, '.' + decodeURIComponent(pathname));
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    const information = await stat(path);
    res.writeHead(200, {
      'Content-Type': mime[extname(path)] || 'application/octet-stream',
      'Content-Length': information.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else {
      // Stream large 16K photographs instead of buffering every request in RAM.
      const stream = createReadStream(path);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    }
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log(`PLansi_xi · ${address}`);
  console.log(`Instructions: ${address}/help.html`);
  console.log('Keep this terminal open. Press Ctrl+C to stop.');
  if (process.argv.includes('--open')) openBrowser();
});
server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE' && process.argv.includes('--open')) {
    try {
      const existing = await fetch(`${address}/api/health`, { signal: AbortSignal.timeout(1500) });
      if ((await existing.json()).application !== 'PLansi_xi')
        throw new Error('Different application.');
      console.log('PLansi_xi is already running. Opening it.');
      openBrowser();
    } catch {
      console.error(
        `Port ${port} is occupied by another application. Use --port 4174 to choose another.`,
      );
      process.exitCode = 1;
    }
  } else {
    console.error(error.message);
    process.exitCode = 1;
  }
});
