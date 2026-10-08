import { writeFile, mkdir } from 'node:fs/promises';
await mkdir('dist/assets', { recursive: true });
await mkdir('original-assets/planet-textures', { recursive: true });
const sources = {
  'earth-day.jpg':
    'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg',
  'earth-night.jpg': 'https://www.solarsystemscope.com/textures/download/8k_earth_nightmap.jpg',
  'earth-clouds.jpg': 'https://www.solarsystemscope.com/textures/download/8k_earth_clouds.jpg',
  'earth-specular.jpg': 'https://threejs.org/examples/textures/planets/earth_specular_2048.jpg',
  'earth-bump.jpg': 'https://threejs.org/examples/textures/planets/earth_normal_2048.jpg',
  'moon-original.tif':
    'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif',
  'moon-height.jpg': 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg',
};
const downloads = await Promise.allSettled(
  Object.entries(sources).map(async ([name, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${name}: ${response.status}`);
    const data = new Uint8Array(await response.arrayBuffer());
    const destination = name.endsWith('.tif') ? 'original-assets/planet-textures' : 'dist/assets';
    await writeFile(`${destination}/${name}`, data);
    console.log(`${name}: ${(data.length / 1024 / 1024).toFixed(1)} MB`);
  }),
);
for (const result of downloads)
  if (result.status === 'rejected') console.error(result.reason.message);
if (downloads.some((result) => result.status === 'rejected')) process.exitCode = 1;
const { default: sharp } = await import('sharp');
await sharp('original-assets/planet-textures/moon-original.tif')
  .jpeg({ quality: 95 })
  .toFile('dist/assets/moon.jpg');
for (const name of ['earth-clouds', 'earth-night'])
  await sharp(`dist/assets/${name}.jpg`)
    .resize(4096, 2048)
    .jpeg({ quality: 94 })
    .toFile(`dist/assets/${name}-4k.jpg`);
