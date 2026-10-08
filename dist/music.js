import * as THREE from 'three';

export function traceObstruction(listener, source, bodies) {
  const direction = source.clone().sub(listener),
    length = direction.length();
  if (length < 0.001) return { amount: 0, blockers: [] };
  direction.divideScalar(length);
  const blockers = [];
  let transmission = 1;
  for (const [id, body] of Object.entries(bodies)) {
    if (id === 'satellite') continue;
    const relative = body.group.position.clone().sub(listener),
      along = relative.dot(direction);
    const perpendicular = relative.addScaledVector(direction, -along).length();
    if (perpendicular >= body.radius) continue;
    const half = Math.sqrt(body.radius * body.radius - perpendicular * perpendicular);
    const thickness = Math.min(length, along + half) - Math.max(0, along - half);
    if (thickness <= 0) continue;
    const amount = Math.min(1, thickness / (body.radius * 1.4));
    transmission *= 1 - amount;
    blockers.push(id);
  }
  return { amount: 1 - transmission, blockers };
}

export class SatelliteMusic {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.tracks = [];
    this.index = 0;
    this.volume = 0.6;
    this.playing = false;
    this.context = null;
    this.obstruction = { amount: 0, blockers: [] };
    this.level = 0;
    this.error = null;
    this.distance = 0;
    this.lastSpatialUpdate = 0;
    this.command = 0;
    this.audio.addEventListener('ended', () =>
      this.skip(1).catch((error) => this.reportError(error)),
    );
    this.audio.addEventListener('error', () =>
      this.reportError(
        new Error('This music file could not be decoded. Use MP3, WAV, OGG, FLAC, or M4A.'),
      ),
    );
    this.refreshPlaylist().catch((error) => this.reportError(error));
  }
  reportError(error) {
    this.error = error.message;
    console.warn('Satellite music:', this.error);
  }
  async refreshPlaylist() {
    const response = await fetch('/api/music', { cache: 'no-store' });
    if (!response.ok) throw new Error('The local music service is unavailable. Restart PLansi_xi.');
    const { tracks } = await response.json();
    const current = this.tracks[this.index]?.id;
    this.tracks = tracks;
    this.index = Math.max(
      0,
      tracks.findIndex((track) => track.id === current),
    );
    return tracks;
  }
  ensureContext() {
    if (this.context) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContext({ latencyHint: 'interactive' });
    const context = this.context;
    this.source = context.createMediaElementSource(this.audio);
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.filter.Q.value = 0.5;
    this.obstacleGain = context.createGain();
    this.panner = context.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 30;
    this.panner.rolloffFactor = 0.22;
    this.panner.maxDistance = 2500;
    this.dry = context.createGain();
    this.dry.gain.value = 0.82;
    this.reverb = context.createConvolver();
    this.reverb.buffer = this.createImpulse(3.8);
    this.wet = context.createGain();
    this.wet.gain.value = 0.2;
    this.delay = context.createDelay(2);
    this.delay.delayTime.value = 0.43;
    this.echoFilter = context.createBiquadFilter();
    this.echoFilter.type = 'lowpass';
    this.echoFilter.frequency.value = 3500;
    this.feedback = context.createGain();
    this.feedback.gain.value = 0.26;
    this.echo = context.createGain();
    this.echo.gain.value = 0.12;
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -6;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 3;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.samples = new Float32Array(1024);
    this.source.connect(this.filter);
    this.filter.connect(this.obstacleGain);
    this.obstacleGain.connect(this.panner);
    this.panner.connect(this.dry).connect(this.master);
    this.panner.connect(this.reverb).connect(this.wet).connect(this.master);
    this.panner.connect(this.delay);
    this.delay.connect(this.echoFilter);
    this.echoFilter.connect(this.feedback).connect(this.delay);
    this.echoFilter.connect(this.echo).connect(this.master);
    this.master.connect(this.compressor).connect(this.analyser).connect(context.destination);
  }
  createImpulse(seconds) {
    const context = this.context,
      buffer = context.createBuffer(
        2,
        Math.floor(context.sampleRate * seconds),
        context.sampleRate,
      );
    let seed = 19473;
    const random = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return (seed / 4294967296) * 2 - 1;
    };
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] =
          random() * Math.pow(1 - t, 3.5) * Math.min(1, i / (context.sampleRate * 0.035)) * 0.45;
      }
      for (const time of [0.12, 0.29, 0.63, 1.03])
        data[Math.floor((time + channel * 0.013) * context.sampleRate)] += 0.14 * Math.exp(-time);
    }
    return buffer;
  }
  async play() {
    const command = ++this.command;
    this.ensureContext();
    const resume = this.context.resume();
    if (!this.tracks.length) await this.refreshPlaylist();
    if (command !== this.command) return;
    if (!this.tracks.length)
      throw new Error(
        'Add music files to the PLansi_xi Audio folder, then enter music mode again.',
      );
    const url = new URL(this.tracks[this.index].url, location.href).href;
    if (this.audio.src !== url) this.audio.src = url;
    await resume;
    if (command !== this.command) return;
    await this.audio.play();
    if (command !== this.command) {
      this.audio.pause();
      return;
    }
    this.playing = true;
    this.error = null;
    this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.035);
  }
  stop() {
    ++this.command;
    this.playing = false;
    this.audio.pause();
    this.audio.currentTime = 0;
    if (this.master) this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
  }
  async skip(direction) {
    if (direction !== 1 && direction !== -1) throw new TypeError('Choose next or previous.');
    const wasPlaying = this.playing;
    const command = this.command;
    await this.refreshPlaylist();
    if (command !== this.command) return;
    if (!this.tracks.length) return;
    this.stop();
    this.index = (this.index + direction + this.tracks.length) % this.tracks.length;
    this.audio.src = this.tracks[this.index].url;
    if (wasPlaying) await this.play();
  }
  adjustVolume(change) {
    if (!Number.isFinite(change)) throw new TypeError('Use a finite volume change.');
    this.volume = THREE.MathUtils.clamp(this.volume + change, 0, 1);
    if (this.master && this.playing)
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.03);
    return this.volume;
  }
  update(camera, source, bodies, now) {
    this.distance = camera.position.distanceTo(source);
    this.obstruction = traceObstruction(camera.position, source, bodies);
    if (!this.context || now - this.lastSpatialUpdate < 33) return;
    this.lastSpatialUpdate = now;
    const time = this.context.currentTime,
      listener = this.context.listener;
    const forward = camera.getWorldDirection(new THREE.Vector3()),
      up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    for (const [axis, value] of Object.entries({
      X: camera.position.x,
      Y: camera.position.y,
      Z: camera.position.z,
    }))
      listener[`position${axis}`].setTargetAtTime(value, time, 0.025);
    for (const axis of ['X', 'Y', 'Z']) {
      listener[`forward${axis}`].setTargetAtTime(forward[axis.toLowerCase()], time, 0.025);
      listener[`up${axis}`].setTargetAtTime(up[axis.toLowerCase()], time, 0.025);
      this.panner[`position${axis}`].setTargetAtTime(source[axis.toLowerCase()], time, 0.025);
    }
    this.filter.frequency.setTargetAtTime(
      20000 * Math.pow(650 / 20000, this.obstruction.amount),
      time,
      0.14,
    );
    this.obstacleGain.gain.setTargetAtTime(1 - this.obstruction.amount * 0.72, time, 0.14);
    this.analyser.getFloatTimeDomainData(this.samples);
    this.level = Math.sqrt(
      this.samples.reduce((sum, value) => sum + value * value, 0) / this.samples.length,
    );
  }
  getState() {
    return {
      playing: this.playing && !this.audio.paused,
      volume: this.volume,
      track: this.tracks[this.index]?.title ?? null,
      trackId: this.tracks[this.index]?.id ?? null,
      trackIndex: this.index,
      playlist: this.tracks.map((track) => track.title),
      currentTime: this.audio.currentTime,
      duration: Number.isFinite(this.audio.duration) ? this.audio.duration : null,
      context: this.context?.state ?? 'not-started',
      occlusion: this.obstruction.amount,
      blockers: this.obstruction.blockers,
      distance: this.distance,
      outputLevel: this.level,
      lowpassHz: this.filter?.frequency.value ?? 20000,
      error: this.error,
    };
  }
}
