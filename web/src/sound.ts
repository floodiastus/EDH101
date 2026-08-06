export type SoundEffect = "tap" | "select" | "pickup" | "cancel" | "pack" | "swipe-left" | "swipe-right" | "reveal" | "complete";

type AudioContextConstructor = typeof AudioContext;

export class SoundEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  private setup() {
    if (this.context) return this.context;
    const AudioContextClass = window.AudioContext
      || (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
    if (!AudioContextClass) return null;
    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    this.master.gain.value = 0.72;
    this.master.connect(this.context.destination);
    return this.context;
  }

  private tone(frequency: number, duration: number, volume: number, delay = 0, endFrequency = frequency, wave: OscillatorType = "sine") {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.012, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private noise(duration: number, volume: number, frequency: number, delay = 0, q = 0.7) {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const start = context.currentTime + delay;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      const envelope = Math.sin(Math.PI * index / data.length);
      data[index] = (Math.random() * 2 - 1) * envelope;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = q;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.025, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
  }

  play(effect: SoundEffect) {
    if (!this.enabled) return;
    const context = this.setup();
    if (!context) return;
    if (context.state === "suspended") void context.resume();

    switch (effect) {
      case "tap":
        this.tone(620, 0.045, 0.035, 0, 440, "square");
        break;
      case "select":
        this.tone(420, 0.055, 0.035, 0, 610, "triangle");
        this.tone(720, 0.05, 0.018, 0.035, 860, "sine");
        break;
      case "pickup":
        this.noise(0.06, 0.035, 1850);
        this.tone(150, 0.07, 0.03, 0, 210, "triangle");
        break;
      case "cancel":
        this.tone(230, 0.075, 0.035, 0, 155, "triangle");
        break;
      case "pack":
        this.noise(0.11, 0.07, 2200, 0);
        this.noise(0.13, 0.075, 3100, 0.13);
        this.noise(0.15, 0.08, 2600, 0.29);
        this.noise(0.56, 0.12, 4300, 0.43, 0.45);
        this.tone(92, 0.19, 0.09, 0.91, 58, "sine");
        break;
      case "swipe-left":
        this.noise(0.2, 0.07, 1250);
        this.tone(360, 0.22, 0.055, 0, 105, "sawtooth");
        this.tone(120, 0.09, 0.06, 0.14, 78, "triangle");
        break;
      case "swipe-right":
        this.noise(0.2, 0.065, 1800);
        this.tone(210, 0.22, 0.05, 0, 610, "sawtooth");
        this.tone(520, 0.13, 0.05, 0.12, 780, "triangle");
        break;
      case "reveal":
        this.noise(0.09, 0.045, 2800);
        this.tone(165, 0.08, 0.055, 0, 110, "triangle");
        this.tone(660, 0.16, 0.035, 0.055, 920, "sine");
        break;
      case "complete":
        this.tone(220, 0.3, 0.045, 0, 330, "triangle");
        this.tone(330, 0.34, 0.04, 0.07, 440, "triangle");
        this.tone(550, 0.42, 0.045, 0.14, 660, "sine");
        break;
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!this.master || !this.context) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(enabled ? 0.72 : 0.0001, this.context.currentTime, 0.015);
  }

  close() {
    if (this.context) void this.context.close();
    this.context = null;
    this.master = null;
  }
}
