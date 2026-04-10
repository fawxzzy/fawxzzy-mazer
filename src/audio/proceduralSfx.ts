import Phaser from 'phaser';

export type SfxEvent = 'confirm' | 'cancel' | 'move' | 'blocked' | 'pause' | 'win';

interface ToneParams {
  frequency: number;
  gain: number;
  duration: number;
  type?: OscillatorType;
  attack?: number;
  release?: number;
  detune?: number;
  when?: number;
  endFrequency?: number;
  filterType?: BiquadFilterType;
  filterFrequency?: number;
  filterQ?: number;
}

interface NoiseParams {
  gain: number;
  duration: number;
  when: number;
  attack?: number;
  release?: number;
  filterType: BiquadFilterType;
  filterFrequency: number;
  filterQ?: number;
}

const DEFAULT_ATTACK = 0.003;
const DEFAULT_RELEASE = 0.08;
const SILENT_LEVEL = 0.0001;

class ProceduralSfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  public attach(scene: Phaser.Scene): void {
    if (typeof window === 'undefined' || !window.AudioContext) {
      return;
    }

    scene.input.once('pointerdown', () => {
      void this.resume();
    });
    scene.input.keyboard?.once('keydown', () => {
      void this.resume();
    });
  }

  public async resume(): Promise<void> {
    const context = this.ensureContext();
    if (!context || context.state !== 'suspended') {
      return;
    }

    await context.resume();
  }

  public play(event: SfxEvent): void {
    const context = this.ensureContext();
    if (!context || context.state !== 'running' || this.muted) {
      return;
    }

    const now = context.currentTime;
    switch (event) {
      case 'confirm':
        this.tone({
          frequency: 208,
          endFrequency: 220,
          gain: 0.034,
          duration: 0.048,
          type: 'triangle',
          when: now,
          release: 0.07,
          filterType: 'lowpass',
          filterFrequency: 1280
        });
        this.tone({
          frequency: 312,
          endFrequency: 349,
          gain: 0.028,
          duration: 0.1,
          type: 'sine',
          when: now + 0.026,
          attack: 0.006,
          release: 0.12,
          filterType: 'lowpass',
          filterFrequency: 1680
        });
        this.noiseBurst({
          when: now + 0.01,
          gain: 0.004,
          duration: 0.022,
          filterType: 'bandpass',
          filterFrequency: 1180,
          filterQ: 0.8
        });
        break;
      case 'cancel':
        this.tone({
          frequency: 220,
          endFrequency: 196,
          gain: 0.03,
          duration: 0.068,
          type: 'triangle',
          when: now,
          release: 0.09,
          filterType: 'lowpass',
          filterFrequency: 1080
        });
        this.tone({
          frequency: 165,
          endFrequency: 147,
          gain: 0.026,
          duration: 0.118,
          type: 'sine',
          when: now + 0.02,
          attack: 0.005,
          release: 0.14,
          filterType: 'lowpass',
          filterFrequency: 760
        });
        break;
      case 'move':
        this.tone({
          frequency: 144,
          endFrequency: 136,
          gain: 0.018,
          duration: 0.03,
          type: 'triangle',
          when: now,
          detune: this.randomSpread(9),
          release: 0.045,
          filterType: 'lowpass',
          filterFrequency: 920
        });
        this.noiseBurst({
          when: now,
          gain: 0.0038,
          duration: 0.016,
          filterType: 'highpass',
          filterFrequency: 840,
          filterQ: 0.7
        });
        break;
      case 'blocked':
        this.tone({
          frequency: 118,
          endFrequency: 82,
          gain: 0.028,
          duration: 0.05,
          type: 'triangle',
          when: now,
          detune: this.randomSpread(14),
          release: 0.1,
          filterType: 'lowpass',
          filterFrequency: 560
        });
        this.tone({
          frequency: 73,
          gain: 0.017,
          duration: 0.08,
          type: 'sine',
          when: now + 0.008,
          release: 0.12,
          filterType: 'lowpass',
          filterFrequency: 240
        });
        this.noiseBurst({
          when: now,
          gain: 0.008,
          duration: 0.026,
          filterType: 'bandpass',
          filterFrequency: 1820,
          filterQ: 0.9
        });
        break;
      case 'pause':
        this.tone({
          frequency: 247,
          endFrequency: 233,
          gain: 0.026,
          duration: 0.07,
          type: 'triangle',
          when: now,
          release: 0.08,
          filterType: 'lowpass',
          filterFrequency: 980
        });
        this.tone({
          frequency: 185,
          endFrequency: 165,
          gain: 0.024,
          duration: 0.12,
          type: 'sine',
          when: now + 0.045,
          attack: 0.01,
          release: 0.16,
          filterType: 'lowpass',
          filterFrequency: 760
        });
        break;
      case 'win':
        this.tone({
          frequency: 98,
          gain: 0.015,
          duration: 0.22,
          type: 'sine',
          when: now,
          attack: 0.01,
          release: 0.18,
          filterType: 'lowpass',
          filterFrequency: 280
        });
        this.tone({
          frequency: 196,
          endFrequency: 208,
          gain: 0.025,
          duration: 0.09,
          type: 'triangle',
          when: now,
          release: 0.11,
          filterType: 'lowpass',
          filterFrequency: 1240
        });
        this.tone({
          frequency: 247,
          gain: 0.023,
          duration: 0.11,
          type: 'triangle',
          when: now + 0.075,
          release: 0.14,
          filterType: 'lowpass',
          filterFrequency: 1460
        });
        this.tone({
          frequency: 294,
          gain: 0.022,
          duration: 0.19,
          type: 'sine',
          when: now + 0.155,
          attack: 0.012,
          release: 0.24,
          filterType: 'lowpass',
          filterFrequency: 1640
        });
        this.noiseBurst({
          when: now + 0.07,
          gain: 0.003,
          duration: 0.026,
          filterType: 'bandpass',
          filterFrequency: 940,
          filterQ: 0.6
        });
        break;
      default:
        break;
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setValueAtTime(muted ? 0 : 0.48, this.context.currentTime);
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined' || !window.AudioContext) {
      return null;
    }

    if (!this.context) {
      this.context = new window.AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.48;

      const highpass = this.context.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 60;
      highpass.Q.value = 0.6;

      const lowpass = this.context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 2200;
      lowpass.Q.value = 0.65;

      this.master.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(this.context.destination);
    }

    return this.context;
  }

  private tone(params: ToneParams): void {
    if (!this.context || !this.master) {
      return;
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = params.filterType ? this.context.createBiquadFilter() : null;

    oscillator.type = params.type ?? 'triangle';
    oscillator.frequency.setValueAtTime(params.frequency, params.when ?? this.context.currentTime);
    if (params.endFrequency !== undefined) {
      oscillator.frequency.linearRampToValueAtTime(params.endFrequency, (params.when ?? this.context.currentTime) + params.duration);
    }
    oscillator.detune.value = params.detune ?? 0;

    const start = params.when ?? this.context.currentTime;
    const attack = params.attack ?? DEFAULT_ATTACK;
    const release = params.release ?? DEFAULT_RELEASE;
    const end = start + params.duration;

    gain.gain.setValueAtTime(SILENT_LEVEL, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, params.gain), start + attack);
    gain.gain.exponentialRampToValueAtTime(SILENT_LEVEL, end + release);

    if (filter) {
      filter.type = params.filterType!;
      filter.frequency.setValueAtTime(params.filterFrequency ?? 1200, start);
      filter.Q.value = params.filterQ ?? 0.7;
      oscillator.connect(filter);
      filter.connect(gain);
    } else {
      oscillator.connect(gain);
    }

    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(end + release + 0.01);
  }

  private noiseBurst(params: NoiseParams): void {
    if (!this.context || !this.master) {
      return;
    }

    const sampleRate = this.context.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * params.duration));
    const buffer = this.context.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const filter = this.context.createBiquadFilter();
    filter.type = params.filterType;
    filter.frequency.value = params.filterFrequency;
    filter.Q.value = params.filterQ ?? 0.8;

    const gain = this.context.createGain();
    const attack = params.attack ?? 0.004;
    const release = params.release ?? 0.03;
    gain.gain.setValueAtTime(SILENT_LEVEL, params.when);
    gain.gain.exponentialRampToValueAtTime(params.gain, params.when + attack);
    gain.gain.exponentialRampToValueAtTime(SILENT_LEVEL, params.when + params.duration + release);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    source.start(params.when);
    source.stop(params.when + params.duration + release + 0.01);
  }

  private randomSpread(amount: number): number {
    return (Math.random() * 2 - 1) * amount;
  }
}

const proceduralSfx = new ProceduralSfx();

export const attachSfxInputUnlock = (scene: Phaser.Scene): void => {
  proceduralSfx.attach(scene);
};

export const playSfx = (event: SfxEvent): void => {
  proceduralSfx.play(event);
};

export const setSfxMuted = (muted: boolean): void => {
  proceduralSfx.setMuted(muted);
};
