import { readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { basename, extname, resolve } from 'node:path';

const formats = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
};
export async function listMusic(root) {
  return (await readdir(root, { withFileTypes: true }))
    .filter((file) => file.isFile() && formats[extname(file.name).toLowerCase()])
    .map((file) => ({
      id: file.name,
      title: basename(file.name, extname(file.name)),
      url: `/music/${encodeURIComponent(file.name)}`,
    }))
    .sort(
      (a, b) =>
        Number(!/^Words before sleep\./i.test(a.id)) -
          Number(!/^Words before sleep\./i.test(b.id)) ||
        a.id.localeCompare(b.id, undefined, { numeric: true }),
    );
}

export async function serveMusic(req, res, root, pathname) {
  if (pathname === '/api/music') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ tracks: await listMusic(root) }));
    return true;
  }
  if (!pathname.startsWith('/music/')) return false;
  const name = decodeURIComponent(pathname.slice(7));
  const track = (await listMusic(root)).find((item) => item.id === name);
  if (!track) {
    res.writeHead(404).end('Music file not found');
    return true;
  }
  const path = resolve(root, track.id),
    size = (await stat(path)).size;
  const headers = {
    'Content-Type': formats[extname(name).toLowerCase()],
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-cache',
  };
  let start = 0,
    end = size - 1,
    status = 200;
  if (req.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!range || (!range[1] && !range[2])) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      return true;
    }
    start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start >= size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      return true;
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') res.end();
  else {
    const stream = createReadStream(path, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  }
  return true;
}
