import { mkdir, writeFile, access, rename, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';

const url = 'https://noirlab.edu/public/media/archives/images/large/noirlab2430b.jpg';
const original = 'original-assets/noirlab2430b.jpg';
await mkdir('original-assets', { recursive: true });
try {
  await access(original);
} catch {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Photographic sky download: ${response.status}`);
  if (!response.headers.get('content-type')?.includes('image'))
    throw new Error('The source did not return an image.');
  const download = original + '.download';
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(download));
    await sharp(download, { limitInputPixels: false }).metadata();
    await rename(download, original);
  } catch (error) {
    await rm(download, { force: true });
    throw error;
  }
}
const metadata = await sharp(original, { limitInputPixels: false }).metadata();
if (metadata.width < 8192 || metadata.width !== metadata.height * 2)
  throw new Error('The source is not a high-resolution full-sky panorama.');
await sharp(original, { limitInputPixels: false })
  .resize(8192, 4096, { kernel: 'lanczos3' })
  .jpeg({ quality: 96, chromaSubsampling: '4:4:4' })
  .toFile('dist/assets/milky-way-photo-8k.jpg');
await sharp(original, { limitInputPixels: false })
  .resize(16384, 8192, { kernel: 'lanczos3' })
  .jpeg({ quality: 96, chromaSubsampling: '4:4:4' })
  .toFile('dist/assets/milky-way-photo-16k.jpg');
await writeFile(
  'dist/assets/photographic-sky-source.json',
  JSON.stringify(
    {
      title: 'All-sky photo of the night sky',
      credit: 'NOIRLab/NSF/AURA/E. Slawik/M. Zamani',
      page: 'https://noirlab.edu/public/images/noirlab2430b/',
      url,
      license: 'CC BY 4.0; https://noirlab.edu/public/copyright/',
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      variants: [
        { file: 'milky-way-photo-16k.jpg', width: 16384, height: 8192 },
        { file: 'milky-way-photo-8k.jpg', width: 8192, height: 4096 },
      ],
      processing:
        'Lanczos3 downsampling of the photographic full-sky source to 16K and 8K; JPEG quality 96, 4:4:4 chroma. No blur or generated sky content.',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Photographic sky: ${metadata.width} × ${metadata.height} → 16384 × 8192 and 8192 × 4096`,
);
