// STRIKE PROTOCOL — synthesized WebAudio SFX (no audio files)
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
  }
  _noiseBuffer(dur) {
    const sr = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  _noise(dur, filterFreq, type, gain, decay) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur);
    const f = this.ctx.createBiquadFilter();
    f.type = type || 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur);
  }
  _tone(freq, dur, type, gain, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur);
  }
  shoot(kind) {
    switch (kind) {
      case 'pistol':
        this._noise(0.14, 3200, 'lowpass', 0.5, 0.12);
        this._tone(190, 0.09, 'square', 0.25, 60); break;
      case 'rifle':
        this._noise(0.11, 3800, 'lowpass', 0.45, 0.1);
        this._tone(230, 0.07, 'sawtooth', 0.2, 70); break;
      case 'shotgun':
        this._noise(0.3, 1800, 'lowpass', 0.8, 0.28);
        this._tone(110, 0.22, 'square', 0.35, 40); break;
      case 'sniper':
        this._noise(0.4, 2400, 'lowpass', 0.7, 0.38);
        this._tone(320, 0.25, 'sawtooth', 0.25, 50); break;
      case 'enemy':
        this._noise(0.12, 2200, 'lowpass', 0.28, 0.1);
        this._tone(160, 0.08, 'square', 0.14, 55); break;
      case 'bossgun':
        this._noise(0.16, 1500, 'lowpass', 0.6, 0.15);
        this._tone(95, 0.14, 'sawtooth', 0.3, 35); break;
    }
  }
  dryFire() { this._tone(1400, 0.05, 'square', 0.12); }
  reload() {
    this._tone(500, 0.05, 'square', 0.15);
    setTimeout(() => this._tone(700, 0.05, 'square', 0.15), 140);
    setTimeout(() => this._tone(950, 0.07, 'square', 0.18), 320);
  }
  hit(head) { this._tone(head ? 1500 : 1100, 0.06, 'square', 0.16); }
  kill() { this._tone(660, 0.07, 'square', 0.2); setTimeout(() => this._tone(990, 0.09, 'square', 0.2), 70); }
  hurt() { this._noise(0.2, 500, 'lowpass', 0.6, 0.18); this._tone(90, 0.18, 'sine', 0.4, 45); }
  pickup(kind) {
    if (kind === 'health') { this._tone(520, 0.09, 'sine', 0.25); setTimeout(() => this._tone(780, 0.12, 'sine', 0.25), 90); }
    else if (kind === 'armor') { this._tone(392, 0.09, 'sine', 0.25); setTimeout(() => this._tone(587, 0.12, 'sine', 0.25), 90); }
    else { this._tone(440, 0.07, 'square', 0.18); setTimeout(() => this._tone(660, 0.07, 'square', 0.18), 80); }
  }
  boom(big) {
    this._noise(big ? 1.1 : 0.6, 700, 'lowpass', 0.9, big ? 1.0 : 0.55);
    this._tone(60, big ? 0.9 : 0.5, 'sine', 0.6, 28);
  }
  uiClick() { this._tone(880, 0.05, 'square', 0.12); }
  step() { this._noise(0.05, 900, 'lowpass', 0.08, 0.05); }
  sting(win) {
    const seq = win ? [392, 523, 659, 784] : [330, 262, 196, 131];
    seq.forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 'triangle', 0.28), i * 150));
  }
  bossRoar() {
    this._noise(0.8, 400, 'lowpass', 0.7, 0.75);
    this._tone(70, 0.7, 'sawtooth', 0.4, 40);
  }
}
