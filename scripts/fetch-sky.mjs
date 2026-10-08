import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { FloatType } from 'three';
import sharp from 'sharp';
await mkdir('original-assets', { recursive: true });
await mkdir('original-assets/nasa-reference', { recursive: true });
const file = 'original-assets/starmap_2020_8k_gal.exr';
let source;
try {
  source = await readFile(file);
} catch {
  const response = await fetch(
    'https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_8k_gal.exr',
  );
  if (!response.ok) throw new Error(`NASA star map download: ${response.status}`);
  source = Buffer.from(await response.arrayBuffer());
  await writeFile(file, source);
}
console.log(`NASA EXR downloaded: ${(source.length / 1048576).toFixed(1)} MB`);
const atlas = new EXRLoader()
  .setDataType(FloatType)
  .parse(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
const data = atlas.data,
  channels = data.length / (atlas.width * atlas.height);
const sample = [];
for (let i = 0; i < data.length; i += channels * 113)
  sample.push(data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722);
sample.sort((a, b) => a - b);
const percentile = (fraction) => sample[Math.floor((sample.length - 1) * fraction)];
const exposure = 0.24 / Math.max(percentile(0.99), 0.000001);
console.log(
  JSON.stringify({
    width: atlas.width,
    height: atlas.height,
    channels,
    median: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    exposure,
  }),
);
const rgb = Buffer.alloc(atlas.width * atlas.height * 3);
const encode = (value) => {
  const x = Math.max(0, value * exposure);
  const linear = Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
  return Math.round(
    255 * (linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055),
  );
};
for (let pixel = 0; pixel < atlas.width * atlas.height; pixel++) {
  for (let c = 0; c < 3; c++) rgb[pixel * 3 + c] = encode(data[pixel * channels + c]);
}
// EXRLoader stores scanlines in texture order; invert for conventional JPEG UVs.
await sharp(rgb, { raw: { width: atlas.width, height: atlas.height, channels: 3 } })
  .flip()
  .jpeg({ quality: 96, chromaSubsampling: '4:4:4' })
  .toFile('original-assets/nasa-reference/milky-way-8k.jpg');
await sharp('original-assets/nasa-reference/milky-way-8k.jpg')
  .resize(1600, 800)
  .jpeg({ quality: 90 })
  .toFile('original-assets/nasa-reference/milky-way-preview.jpg');
await writeFile(
  'original-assets/nasa-reference/milky-way-source.json',
  JSON.stringify(
    {
      title: 'NASA Deep Star Maps 2020',
      credit: 'NASA SVS / Ernie Wright; Hipparcos-2, Tycho-2, Gaia DR2 and supporting catalogs',
      page: 'https://svs.gsfc.nasa.gov/4851/',
      width: atlas.width,
      height: atlas.height,
      processing:
        'Linear HDR EXR converted to ACES-tone-mapped 8K sRGB JPEG; retained as catalog reference, not the rendered sky.',
      exposure,
    },
    null,
    2,
  ),
);
console.log('8K Milky Way atlas ready.');
