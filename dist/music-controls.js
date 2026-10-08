// A hidden input mode: short clicks act on release, while a hold consumes the
// click so changing tracks can never also start/stop or navigate the camera.
export class MusicControls {
  constructor(canvas, music, onMode = () => {}) {
    this.canvas = canvas;
    this.music = music;
    this.onMode = onMode;
    this.open = false;
    this.enabled = true;
    this.press = null;
    const consume = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button === 1) {
          consume(event);
          this.toggle();
          return;
        }
        if (!this.open || ![0, 2].includes(event.button)) return;
        consume(event);
        this.cancel();
        const press = { button: event.button, pointerId: event.pointerId, held: false };
        this.press = press;
        canvas.setPointerCapture?.(event.pointerId);
        press.timer = setTimeout(() => {
          if (this.press !== press) return;
          press.held = true;
          this.invoke(() => music.skip(press.button === 0 ? 1 : -1));
        }, 650);
      },
      { capture: true },
    );
    canvas.addEventListener(
      'pointerup',
      (event) => {
        if (event.button === 1) {
          consume(event);
          return;
        }
        if (!this.open || ![0, 2].includes(event.button)) return;
        consume(event);
        const press = this.press;
        if (!press || press.pointerId !== event.pointerId || press.button !== event.button) return;
        this.cancel();
        if (!press.held) this.invoke(() => (press.button === 0 ? music.play() : music.stop()));
      },
      { capture: true },
    );
    canvas.addEventListener('pointercancel', () => this.cancel(), { capture: true });
    canvas.addEventListener(
      'pointermove',
      (event) => {
        if (this.open) event.stopImmediatePropagation();
      },
      { capture: true },
    );
    canvas.addEventListener(
      'auxclick',
      (event) => {
        if (event.button === 1 || this.open) consume(event);
      },
      { capture: true },
    );
    canvas.addEventListener(
      'contextmenu',
      (event) => {
        if (this.open) consume(event);
      },
      { capture: true },
    );
    canvas.addEventListener(
      'wheel',
      (event) => {
        if (!this.open) return;
        consume(event);
        const delta =
          event.deltaY *
          (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
        music.adjustVolume(-delta / 2400);
      },
      { capture: true, passive: false },
    );
    (canvas.ownerDocument ?? canvas).addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (event.key.toLowerCase() === 'm') {
        consume(event);
        this.toggle();
        return;
      }
      if (!this.open) return;
      consume(event);
      if (event.key === 'Escape') this.toggle();
      if (event.code === 'Space')
        this.invoke(() => (music.getState().playing ? music.stop() : music.play()));
      if (event.key === 'ArrowRight') this.invoke(() => music.skip(1));
      if (event.key === 'ArrowLeft') this.invoke(() => music.skip(-1));
      if (event.key === 'ArrowUp') music.adjustVolume(0.05);
      if (event.key === 'ArrowDown') music.adjustVolume(-0.05);
    });
  }
  invoke(action) {
    try {
      Promise.resolve(action()).catch((error) => this.music.reportError(error));
    } catch (error) {
      this.music.reportError(error);
    }
  }
  cancel() {
    if (this.press) {
      clearTimeout(this.press.timer);
      const id = this.press.pointerId;
      this.press = null;
      if (this.canvas.hasPointerCapture?.(id)) this.canvas.releasePointerCapture(id);
    }
  }
  toggle() {
    if (!this.enabled) return this.open;
    this.cancel();
    this.open = !this.open;
    this.canvas.style.cursor = this.open ? 'default' : 'grab';
    this.onMode(this.open);
    if (this.open) this.invoke(() => this.music.refreshPlaylist());
    return this.open;
  }
}
