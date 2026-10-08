// Asynchronous GPU timings: never wait for a query or call gl.finish().
export class GpuTimer {
  constructor(gl) {
    this.gl = gl;
    this.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.pending = [];
    this.active = null;
    this.lastMs = null;
    this.sampleTime = -Infinity;
    this.frames = 0;
  }

  begin(now) {
    if (!this.extension || this.gl.isContextLost()) return;
    const gl = this.gl,
      ext = this.extension;
    if (this.pending.length && gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      this.clear();
      return;
    }
    while (
      this.pending.length &&
      gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)
    ) {
      const query = this.pending.shift();
      this.lastMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      this.sampleTime = now;
      gl.deleteQuery(query);
    }
    if (++this.frames % 6 !== 0 || this.pending.length >= 4) return;
    const query = gl.createQuery();
    if (!query) return;
    this.active = query;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  }

  end() {
    if (!this.active) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  value(now) {
    return now - this.sampleTime < 2000 ? this.lastMs : null;
  }

  clear() {
    if (!this.gl.isContextLost()) {
      if (this.active) this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
      for (const query of [...this.pending, this.active].filter(Boolean))
        this.gl.deleteQuery(query);
    }
    this.pending = [];
    this.active = null;
    this.lastMs = null;
    this.sampleTime = -Infinity;
  }
}
