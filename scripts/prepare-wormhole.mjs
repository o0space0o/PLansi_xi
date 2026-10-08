import { writeFile } from 'node:fs/promises';
import { ellisRay } from '../dist/relativity.js';
// 1024 angular samples, 193 logarithmically spaced proper distances.
// Cos/sin storage avoids angle wrapping during interpolation.
const width = 1024,
  height = 193;
const table = new Float32Array(width * height * 4);
let maxError = 0;
for (let y = 0; y < height; y++) {
  const l = Math.expm1((y / (height - 1)) * Math.log(65));
  for (let x = 0; x < width; x++) {
    const angle = ((x + 0.5) / width) * Math.PI;
    const ray = ellisRay(l, angle, { boundary: 16 });
    const i = (y * width + x) * 4;
    table[i] = Math.cos(ray.phi);
    table[i + 1] = Math.sin(ray.phi);
    table[i + 2] = ray.side;
    table[i + 3] = ray.error;
    maxError = Math.max(maxError, ray.error);
  }
}
await writeFile('dist/assets/ellis-rays.bin', new Uint8Array(table.buffer));
await writeFile(
  'dist/assets/ellis-rays.json',
  JSON.stringify(
    {
      width,
      height,
      boundary: 16,
      maxProperDistance: 64,
      accuracy: 0.035,
      maxEnergyError: maxError,
      metric: 'Ellis a=1; RK4; float32 cos(phi),sin(phi),side,error',
      interpolation:
        'linear away from critical ray; analytic side classification; Euclidean exterior beyond 16a',
    },
    null,
    2,
  ) + '\n',
);
console.log(`Ellis ray table: ${table.byteLength} bytes, worst energy residual ${maxError}`);
