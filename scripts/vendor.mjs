import { cp, mkdir, readFile, rename } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';

// Copy only addons actually imported by this application, plus their complete
// transitive relative imports. The saved browser app never calls a CDN.
const packageRoot = resolve('node_modules/three');
const workspaceRoot = resolve('.');
function insideWorkspace(path) {
  const absolute = resolve(path);
  if (!absolute.startsWith(workspaceRoot + sep))
    throw new Error('Generated bundle path escaped the workspace.');
  return absolute;
}
const staging = resolve(`dist/vendor-staging-${Date.now()}`);
await mkdir(staging, { recursive: true });
for (const file of ['three.module.js', 'three.core.js']) {
  await cp(resolve(packageRoot, 'build', file), resolve(staging, file));
}
const files = await Promise.all(
  ['dist/main.js', 'dist/satellite.js'].map((file) => readFile(file, 'utf8')),
);
const queue = [...files.join('\n').matchAll(/from\s+['"]three\/addons\/([^'"]+)['"]/g)].map(
  (match) => resolve(packageRoot, 'examples/jsm', match[1]),
);
const copied = new Set();
for (let cursor = 0; cursor < queue.length; cursor++) {
  const source = queue[cursor];
  if (copied.has(source)) continue;
  const addonsRoot = resolve(packageRoot, 'examples/jsm');
  if (!source.startsWith(addonsRoot + sep))
    throw new Error('An addon import escaped its source folder.');
  copied.add(source);
  const destination = resolve(staging, 'addons', relative(addonsRoot, source));
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination);
  const code = await readFile(source, 'utf8');
  for (const match of code.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+\.js)['"]/g)) {
    if (match[1].startsWith('.')) queue.push(resolve(dirname(source), match[1]));
  }
}
// Preserve the previous generated bundle in the source archive before swapping.
await mkdir('original-assets', { recursive: true });
try {
  await rename(
    insideWorkspace('dist/vendor'),
    insideWorkspace(`original-assets/vendor-previous-${Date.now()}`),
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await rename(insideWorkspace(staging), insideWorkspace('dist/vendor'));
console.log(
  `Three.js bundled locally: 2 engine modules and ${copied.size} required addon modules.`,
);
