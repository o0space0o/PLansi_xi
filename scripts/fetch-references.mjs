import { mkdir, writeFile } from 'node:fs/promises';

// Reference observations are kept with the documentation, not in the 3D scene.
const references = [
  {
    file: 'barnard-68-wavelengths.jpg',
    title: 'Barnard 68 observed in six wavebands',
    url: 'https://cdn.eso.org/images/screen/eso9934b.jpg',
    page: 'https://www.eso.org/public/images/eso9934b/',
    credit: 'ESO',
    license: 'CC BY 4.0; https://www.eso.org/public/outreach/copyright/',
  },
  {
    file: 'gaia-dust-map.png',
    title: 'Gaia map of interstellar dust in the Milky Way',
    url: 'https://www.esa.int/var/esa/storage/images/esa_multimedia/images/2022/06/gaia_map_of_interstellar_dust_in_the_milky_way/24305612-1-eng-GB/Gaia_map_of_interstellar_dust_in_the_Milky_Way_pillars.png',
    page: 'https://www.esa.int/ESA_Multimedia/Images/2022/06/Gaia_map_of_interstellar_dust_in_the_Milky_Way',
    credit: 'ESA/Gaia/DPAC; T. E. Dharmawardena, Gaia group at MPIA',
    license: 'CC BY-SA 3.0 IGO; https://creativecommons.org/licenses/by-sa/3.0/igo/',
  },
];

await mkdir('docs/images', { recursive: true });
for (const reference of references) {
  const response = await fetch(reference.url);
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
    throw new Error(`Reference image unavailable: ${reference.title}`);
  }
  await writeFile(`docs/images/${reference.file}`, Buffer.from(await response.arrayBuffer()));
  console.log(`Downloaded: ${reference.title}`);
}
await writeFile('docs/images/sources.json', JSON.stringify(references, null, 2) + '\n');
