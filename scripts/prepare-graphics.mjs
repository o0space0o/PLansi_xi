import sharp from 'sharp';

// Prepared small files avoid decoding a huge source on memory-limited devices.
for (const [source, destination, width] of [
  ['milky-way-photo-8k.jpg', 'milky-way-photo-4k.jpg', 4096],
  ['milky-way-photo-8k.jpg', 'milky-way-photo-2k.jpg', 2048],
  ['earth-day.jpg', 'earth-day-2k.jpg', 2048],
  ['moon.jpg', 'moon-2k.jpg', 2048],
  ['earth-night-4k.jpg', 'earth-night-2k.jpg', 2048],
  ['earth-clouds-4k.jpg', 'earth-clouds-2k.jpg', 2048],
]) {
  await sharp(`dist/assets/${source}`)
    .resize(width, width / 2, { kernel: 'lanczos3' })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
    .toFile(`dist/assets/${destination}`);
}
await sharp('dist/assets/starlight-response.png')
  .resize(2048, 1024, { kernel: 'lanczos3' })
  .png()
  .toFile('dist/assets/starlight-response-2k.png');
console.log('Prepared adaptive 2K/4K photographs and photographic response map.');
