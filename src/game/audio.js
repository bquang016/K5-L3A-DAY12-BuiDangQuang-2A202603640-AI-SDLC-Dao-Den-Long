const PENTATONIC_HZ = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0];

/**
 * Procedural Web Audio synthesizer using a warm Vietnamese pentatonic scale.
 * Requires zero external audio files.
 */
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  _tone(freq, { type = 'sine', gain = 0.12, duration = 0.25, delay = 0, endFreq = null } = {}) {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(gain, now + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(amp);
    amp.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playMotePickup(carried = 1) {
    const idx = Math.min(PENTATONIC_HZ.length - 1, Math.max(0, carried));
    this._tone(PENTATONIC_HZ[idx], { type: 'sine', gain: 0.11, duration: 0.28 });
    this._tone(PENTATONIC_HZ[idx] * 1.5, { type: 'triangle', gain: 0.04, duration: 0.2, delay: 0.03 });
  }

  playDeposit() {
    this._tone(392.0, { type: 'triangle', gain: 0.1, duration: 0.18 });
    this._tone(587.33, { type: 'sine', gain: 0.09, duration: 0.22, delay: 0.06 });
  }

  playLanternLit(litCount = 1) {
    const base = PENTATONIC_HZ[Math.min(4, Math.max(0, litCount - 1))];
    this._tone(base, { type: 'sine', gain: 0.14, duration: 0.7 });
    this._tone(base * 1.5, { type: 'triangle', gain: 0.09, duration: 0.65, delay: 0.08 });
    this._tone(base * 2, { type: 'sine', gain: 0.07, duration: 0.75, delay: 0.16 });
  }

  playPulse() {
    this._tone(293.66, { type: 'triangle', gain: 0.12, duration: 0.35, endFreq: 783.99 });
    this._tone(587.33, { type: 'sine', gain: 0.08, duration: 0.4, delay: 0.05, endFreq: 293.66 });
  }

  playHit() {
    this._tone(125, { type: 'sine', gain: 0.18, duration: 0.3, endFreq: 48 });
    this._tone(90, { type: 'triangle', gain: 0.1, duration: 0.22, endFreq: 42 });
  }

  playWin() {
    [293.66, 392.0, 440.0, 587.33, 783.99].forEach((freq, i) => {
      this._tone(freq, { type: 'sine', gain: 0.12, duration: 0.45, delay: i * 0.1 });
    });
  }

  playLose() {
    [392.0, 329.63, 293.66, 220.0].forEach((freq, i) => {
      this._tone(freq, { type: 'triangle', gain: 0.1, duration: 0.4, delay: i * 0.12 });
    });
  }
}
