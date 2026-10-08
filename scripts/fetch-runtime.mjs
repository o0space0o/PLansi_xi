import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Pin an official LTS release so a saved project remains reproducible.
const version = 'v24.21.0';
const base = `https://nodejs.org/dist/${version}`;
const checksumsResponse = await fetch(`${base}/SHASUMS256.txt`);
if (!checksumsResponse.ok) throw new Error('Could not get official Node.js checksums.');
const checksums = await checksumsResponse.text();
await mkdir('runtime', { recursive: true });
await writeFile('runtime/SHASUMS256.txt', checksums);

const metadata = { version, source: base, architectures: {} };
for (const architecture of ['win-arm64', 'win-x64']) {
  const remotePath = `${architecture}/node.exe`;
  const expected = checksums
    .split('\n')
    .find((line) => line.endsWith(`  ${remotePath}`))
    ?.split(' ')[0];
  if (!expected) throw new Error(`No official checksum for ${remotePath}.`);
  const directory = `runtime/${architecture}`;
  const destination = `${directory}/node.exe`;
  await mkdir(directory, { recursive: true });
  let data;
  try {
    data = await readFile(destination);
  } catch {
    /* First download. */
  }
  if (!data || createHash('sha256').update(data).digest('hex') !== expected) {
    const response = await fetch(`${base}/${remotePath}`);
    if (!response.ok) throw new Error(`Node.js download failed: ${response.status}`);
    data = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(data).digest('hex') !== expected) {
      throw new Error(`Checksum mismatch for ${remotePath}.`);
    }
    await writeFile(destination, data);
  }
  metadata.architectures[architecture] = { path: remotePath, sha256: expected, bytes: data.length };
  console.log(`Verified official Node.js ${version}: ${architecture}`);
}
const licenseResponse = await fetch(
  `https://raw.githubusercontent.com/nodejs/node/${version}/LICENSE`,
);
if (!licenseResponse.ok) throw new Error('Node.js redistribution license unavailable.');
await writeFile('runtime/LICENSE.txt', await licenseResponse.text());
await writeFile('runtime/source.json', JSON.stringify(metadata, null, 2) + '\n');
