// WebAudio bleeps, synthesized in the page: no audio files, no network. The
// context is created lazily on the first user gesture (browsers block sound
// before one) and every sound is a short oscillator envelope.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let lastStepAt = 0;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.4;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freqStart, freqEnd, duration, type, volume, delay = 0) {
    if (!ensure() || muted) return;
    if (context.state === 'suspended') void context.resume();
    const t0 = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  return {
    /** Call from a user gesture so later sounds are allowed. */
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (master !== null) master.gain.value = muted ? 0 : 0.4;
    },
    get muted() {
      return muted;
    },
    /** A soft footstep tick, throttled by the caller through `now`. */
    step(now, sneaking) {
      if (now - lastStepAt < (sneaking ? 0.42 : 0.3)) return;
      lastStepAt = now;
      tone(sneaking ? 140 : 180, 90, 0.07, 'triangle', sneaking ? 0.05 : 0.12);
    },
    /** A guard's footstep, quieter the farther away it is (0..1). */
    guardStep(closeness) {
      tone(120, 70, 0.08, 'sine', 0.03 + 0.1 * closeness);
    },
    pickup() {
      tone(880, 880, 0.09, 'sine', 0.22);
      tone(1318, 1318, 0.14, 'sine', 0.2, 0.08);
    },
    spotted() {
      tone(220, 520, 0.28, 'sawtooth', 0.16);
      tone(440, 660, 0.2, 'square', 0.07, 0.05);
    },
    caught() {
      tone(160, 38, 0.5, 'sine', 0.3);
      tone(90, 30, 0.4, 'triangle', 0.2, 0.05);
    },
    win() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((freq, i) => tone(freq, freq, 0.18, 'sine', 0.2, i * 0.11));
    },
    click() {
      tone(660, 660, 0.05, 'square', 0.08);
    },
  };
}
