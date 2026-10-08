import sharp from 'sharp';

// Compare a sky-only strip from two browser captures at a fixed camera.
// Captures stay outside the shared repository; this optional helper documents the QA.
const [first, second] = process.argv.slice(2);
if (!first || !second) throw new Error('Pass two fixed-camera screenshot paths.');
const dimensions = await sharp(first).metadata();
const region = {
  left: 0,
  top: 0,
  width: dimensions.width,
  height: Math.min(240, dimensions.height),
};
const read = (file) => sharp(file).extract(region).removeAlpha().raw().toBuffer();
const [a, b] = await Promise.all([read(first), read(second)]);
let changed = 0,
  visible = 0,
  colorChanged = 0,
  maximum = 0;
for (let offset = 0; offset < a.length; offset += 3) {
  const difference = Math.max(
    ...[0, 1, 2].map((channel) => Math.abs(a[offset + channel] - b[offset + channel])),
  );
  const colorDifference = Math.abs(a[offset] - a[offset + 2] - (b[offset] - b[offset + 2]));
  if (difference > 1) changed++;
  if (difference > 8) visible++;
  if (colorDifference > 8) colorChanged++;
  maximum = Math.max(maximum, difference);
}
console.log(
  JSON.stringify(
    {
      pixels: a.length / 3,
      changedAbove1: changed,
      changedAbove8: visible,
      redBlueChangesAbove8: colorChanged,
      maximum,
    },
    null,
    2,
  ),
);
