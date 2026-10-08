import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// A response map, never an image of new stars. R marks existing photographic
// light that may be gently modulated; G and B keep its animation coherent.
const width = 4096,
  height = 2048;
const photo = sharp('dist/assets/milky-way-photo-8k.jpg').resize(width, height);
const pixels = await photo.clone().removeAlpha().raw().toBuffer();
const surround = await photo.clone().blur(4).removeAlpha().raw().toBuffer();
const count = width * height;
const luminance = new Float32Array(count);
const contrast = new Float32Array(count);
const candidate = new Uint8Array(count);
const response = Buffer.alloc(count * 4);
for (let index = 0; index < count; index++) {
  const offset = index * 3;
  luminance[index] =
    (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255;
  const local =
    (surround[offset] * 0.2126 + surround[offset + 1] * 0.7152 + surround[offset + 2] * 0.0722) /
    255;
  contrast[index] = luminance[index] - local;
  candidate[index] = luminance[index] > 0.55 && contrast[index] > 0.22 ? 1 : 0;
  response[index * 4 + 3] = 255;
}

const regions = [];
for (let start = 0; start < count; start++) {
  if (!candidate[start]) continue;
  const queue = [start];
  candidate[start] = 0;
  let minX = width,
    maxX = 0,
    minY = height,
    maxY = 0;
  let centerX = 0,
    centerY = 0,
    total = 0;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor],
      x = index % width,
      y = Math.floor(index / width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    const weight = contrast[index];
    centerX += x * weight;
    centerY += y * weight;
    total += weight;
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const neighbor = ny * width + nx;
      if (candidate[neighbor]) {
        candidate[neighbor] = 0;
        queue.push(neighbor);
      }
    }
  }
  const spanX = maxX - minX + 1,
    spanY = maxY - minY + 1;
  // Exclude diffuse nebulae and long stitching streaks, especially at poles.
  if (queue.length < 3 || spanX > 40 || spanY > 40 || spanX / spanY > 3 || spanY / spanX > 3)
    continue;
  regions.push({
    x: centerX / total,
    y: centerY / total,
    radius: Math.max(2, Math.sqrt(queue.length / Math.PI) * 1.7),
  });
}

for (let id = 0; id < regions.length; id++) {
  const { x, y, radius } = regions[id];
  const phase = Math.round(((id * 0.61803398875) % 1) * 255);
  const frequency = Math.round(((id * 0.41421356237) % 1) * 255);
  const reach = Math.ceil(radius * 3);
  for (
    let py = Math.max(0, Math.floor(y) - reach);
    py <= Math.min(height - 1, Math.ceil(y) + reach);
    py++
  ) {
    for (let px = Math.floor(x) - reach; px <= Math.ceil(x) + reach; px++) {
      const wrappedX = (px + width) % width;
      const index = py * width + wrappedX;
      const falloff = Math.exp(-((px - x) ** 2 + (py - y) ** 2) / (2 * radius ** 2));
      const isolatedLight = Math.min(1, Math.max(0, contrast[index]) / 0.12);
      // Keep dim photographic grain completely steady, even inside a halo.
      const brightLight = Math.min(1, Math.max(0, (luminance[index] - 0.2) / 0.35));
      const strength = Math.round(255 * falloff * isolatedLight * brightLight);
      if (strength <= response[index * 4]) continue;
      response[index * 4] = strength;
      response[index * 4 + 1] = phase;
      response[index * 4 + 2] = frequency;
    }
  }
}
await sharp(response, { raw: { width, height, channels: 4 } })
  .png()
  .toFile('dist/assets/starlight-response.png');
await writeFile(
  'dist/assets/starlight-response-source.json',
  JSON.stringify(
    {
      source: 'milky-way-photo-8k.jpg',
      width,
      height,
      sourceSha256: createHash('sha256')
        .update(await readFile('dist/assets/milky-way-photo-8k.jpg'))
        .digest('hex'),
      isolatedPhotographicRegions: regions.length,
      channels: {
        R: 'response weight',
        G: 'constant phase per photographed region',
        B: 'frequency variation per region',
        A: 'opaque data',
      },
      processing:
        'Local-contrast segmentation of existing photographic pixels. No new star positions, emitted light, or image warping.',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Response map: ${regions.length} existing photographic light regions; ${width} × ${height}`,
);
