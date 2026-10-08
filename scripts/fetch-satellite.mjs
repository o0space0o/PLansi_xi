import { mkdir, writeFile } from 'node:fs/promises';
const source = 'https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/h/Hubble.glb';
const response = await fetch(source);
if (!response.ok) throw new Error(`NASA spacecraft download: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('NASA did not return a GLB model.');
await mkdir('dist/assets/models', { recursive: true });
await writeFile('dist/assets/models/hubble.glb', bytes);
await writeFile(
  'dist/assets/models/hubble-source.json',
  JSON.stringify(
    {
      title: 'Hubble Space Telescope',
      credit: 'NASA Visualization Technology Applications and Development (VTAD)',
      page: 'https://science.nasa.gov/resource/hubble-space-telescope-3d-model/',
      source,
      bytes: bytes.length,
    },
    null,
    2,
  ),
);
const data = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
console.log(
  JSON.stringify(
    {
      bytes: bytes.length,
      meshes: data.meshes?.length,
      materials: data.materials?.map((m) => ({
        name: m.name,
        pbr: m.pbrMetallicRoughness,
        extensions: m.extensions,
      })),
      images: data.images?.length,
      extensions: data.extensionsUsed,
    },
    null,
    2,
  ),
);
