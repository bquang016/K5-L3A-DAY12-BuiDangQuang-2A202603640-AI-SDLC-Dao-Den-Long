const PENTATONIC_HZ = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0];
const MUSIC_NOTES = [293.66, 392.0, 440.0, 493.88, 392.0, 329.63, 440.0, 587.33];

/**
 * Procedural Web Audio synthesizer for music ambience and full TICKET-02 SFX coverage.
 */
export class SoundEngine {
  constructor({ volume = 0.75 } = {}) {
    this.ctx = null;
    this.masterGain = null;
    this.volume = volume;
    this.muted = false;
    this._musicInterval = null;
    this._musicStep = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.muted ? 0 : this.volume;
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    this.setVolume(this.volume);
    return this.muted;
  }

  startMusic() {
    if (this._musicInterval) return;
    this.unlock();
    this._musicInterval = window.setInterval(() => {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const freq = MUSIC_NOTES[this._musicStep % MUSIC_NOTES.length];
      this._musicStep += 1;
      this._tone(freq * 0.5, { type: 'sine', gain: 0.035, duration: 1.4 });
      if (this._musicStep % 2 === 0) {
        this._tone(freq, { type: 'triangle', gain: 0.02, duration: 0.9, delay: 0.15 });
      }
    }, 1150);
  }

  stopMusic() {
    if (this._musicInterval) {
      window.clearInterval(this._musicInterval);
      this._musicInterval = null;
    }
  }

  _tone(freq, { type = 'sine', gain = 0.12, duration = 0.25, delay = 0, endFreq = null } = {}) {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx || !this.masterGain) return;

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
    amp.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playMotePickup(carried = 1) {
    const idx = Math.min(PENTATONIC_HZ.length - 1, Math.max(0, carried));
    this._tone(PENTATONIC_HZ[idx], { type: 'sine', gain: 0.12, duration: 0.25 });
  }

  playDeposit() {
    this._tone(392.0, { type: 'triangle', gain: 0.11, duration: 0.18 });
    this._tone(587.33, { type: 'sine', gain: 0.09, duration: 0.22, delay: 0.06 });
  }

  playLanternLit(litCount = 1) {
    const base = PENTATONIC_HZ[Math.min(4, Math.max(0, litCount - 1))];
    this._tone(base, { type: 'sine', gain: 0.15, duration: 0.7 });
    this._tone(base * 1.5, { type: 'triangle', gain: 0.09, duration: 0.65, delay: 0.08 });
    this._tone(base * 2, { type: 'sine', gain: 0.08, duration: 0.75, delay: 0.16 });
  }

  playPulse() {
    this._tone(293.66, { type: 'triangle', gain: 0.14, duration: 0.35, endFreq: 880 });
    this._tone(587.33, { type: 'sine', gain: 0.08, duration: 0.38, delay: 0.04, endFreq: 293.66 });
  }

  playJump() {
    this._tone(240, { type: 'sine', gain: 0.09, duration: 0.14, endFreq: 420 });
  }

  playJumpPad() {
    this._tone(293.66, { type: 'triangle', gain: 0.13, duration: 0.32, endFreq: 784 });
  }

  playDash() {
    this._tone(440, { type: 'triangle', gain: 0.1, duration: 0.16, endFreq: 196 });
  }

  playHit() {
    this._tone(125, { type: 'sine', gain: 0.18, duration: 0.3, endFreq: 48 });
    this._tone(90, { type: 'triangle', gain: 0.11, duration: 0.22, endFreq: 42 });
  }

  playShadeSpawn() {
    this._tone(146.83, { type: 'triangle', gain: 0.09, duration: 0.45, endFreq: 98 });
  }

  playCharmPickup() {
    this._tone(587.33, { type: 'sine', gain: 0.11, duration: 0.25 });
    this._tone(880.0, { type: 'sine', gain: 0.1, duration: 0.32, delay: 0.08 });
  }

  playDrifterSteal() {
    this._tone(659.25, { type: 'triangle', gain: 0.11, duration: 0.28, endFreq: 329.63 });
  }

  playWindGust() {
    this._tone(185, { type: 'sine', gain: 0.08, duration: 0.65, endFreq: 260 });
  }

  playCountdownTick() {
    this._tone(880, { type: 'sine', gain: 0.08, duration: 0.09 });
  }

  playWin() {
    [293.66, 392.0, 440.0, 587.33, 783.99].forEach((freq, i) => {
      this._tone(freq, { type: 'sine', gain: 0.13, duration: 0.45, delay: i * 0.1 });
    });
  }

  playLose() {
    [392.0, 329.63, 293.66, 220.0].forEach((freq, i) => {
      this._tone(freq, { type: 'triangle', gain: 0.11, duration: 0.4, delay: i * 0.12 });
    });
  }
}
