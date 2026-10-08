import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationClocks, animationTargets } from '../dist/animation.js';

test('Pointed-body speed changes only its orbit/spin clock', () => {
  for (const target of animationTargets.filter((id) => id !== 'background')) {
    const clocks = new AnimationClocks();
    clocks.advance(2);
    const before = clocks.snapshot();
    clocks.adjust(target, -240);
    clocks.advance(2);
    const after = clocks.snapshot();
    assert.ok(after.bodyDays[target] > before.bodyDays[target] + 0.1);
    for (const other of animationTargets.filter((id) => id !== target)) {
      assert.equal(after.animationRates[other], 1);
      if (other !== 'background') assert.equal(after.bodyDays[other], 0.2);
    }
    assert.equal(after.skyTime, 4);
  }
});

test('Background pause/resume is independent of all body clocks and predictions', () => {
  const clocks = new AnimationClocks();
  clocks.adjust('background', 2400);
  clocks.advance(10);
  assert.equal(clocks.snapshot().skyTime, 0);
  assert.equal(clocks.daysFor('earth'), 0.5);
  assert.ok(Math.abs(clocks.daysFor('earth', 4) - 0.7) < 1e-10);
  clocks.adjust('moon', 2400);
  clocks.adjust('background', -120);
  clocks.advance(2);
  assert.equal(clocks.snapshot().skyTime, 2);
  assert.equal(clocks.daysFor('moon', 20), 0.5);
  assert.ok(Math.abs(clocks.daysFor('earth') - 0.6) < 1e-10);
});

test('Rates stay bounded, paused targets resume, and invalid inputs cannot corrupt clocks', () => {
  const clocks = new AnimationClocks();
  assert.equal(clocks.adjust('satellite', -1e6).animationRate, 80);
  assert.equal(clocks.adjust('satellite', 1e6).animationRate, 0);
  assert.equal(clocks.adjust('satellite', -120).animationRate, 1);
  assert.throws(() => clocks.adjust('unknown', 120), TypeError);
  assert.throws(() => clocks.adjust('earth', NaN), TypeError);
  assert.throws(() => clocks.advance(Infinity), TypeError);
  assert.throws(() => clocks.advance(-1), TypeError);
  assert.deepEqual(
    clocks.snapshot().animationRates,
    Object.fromEntries(animationTargets.map((id) => [id, 1])),
  );
});
