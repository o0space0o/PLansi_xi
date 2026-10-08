// Independent clocks keep a wheel adjustment local to the pointed object.
// A child's orbit still follows its parent's position when the parent moves.
export const animationTargets = [
  'background',
  'earth',
  'moon',
  'kepler',
  'aurelia',
  'satellite',
  'blackhole',
  'galaxy',
  'nebula',
  'gas',
];

export class AnimationClocks {
  constructor(daysPerSecond = 0.05) {
    this.daysPerSecond = daysPerSecond;
    this.rates = Object.fromEntries(animationTargets.map((id) => [id, 1]));
    this.times = Object.fromEntries(animationTargets.map((id) => [id, 0]));
  }

  validateTarget(id) {
    if (!animationTargets.includes(id)) throw new TypeError('Unknown animation target.');
  }

  advance(seconds, targets = animationTargets) {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new TypeError('Use a positive finite time step.');
    for (const id of targets) {
      this.validateTarget(id);
      this.times[id] += seconds * this.rates[id];
    }
  }

  daysFor(id, secondsAhead = 0) {
    this.validateTarget(id);
    return (this.times[id] + secondsAhead * this.rates[id]) * this.daysPerSecond;
  }

  adjust(id, wheelDelta) {
    this.validateTarget(id);
    if (!Number.isFinite(wheelDelta)) throw new TypeError('Use a finite wheel delta.');
    const previous = this.rates[id];
    const rate =
      previous === 0 && wheelDelta < 0 ? 1 : Math.min(80, previous * Math.exp(-wheelDelta * 0.003));
    this.rates[id] = rate < 0.035 ? 0 : rate;
    return {
      target: id,
      animationRate: this.rates[id],
      daysPerSecond: id === 'background' ? null : this.rates[id] * this.daysPerSecond,
    };
  }

  snapshot() {
    return {
      animationRates: { ...this.rates },
      bodyDays: Object.fromEntries(
        animationTargets.filter((id) => id !== 'background').map((id) => [id, this.daysFor(id)]),
      ),
      skyTime: this.times.background,
    };
  }
}
