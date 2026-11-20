/**
 * Música ambiental generada en el navegador (Web Audio): acordes, bajo y un arpegio suave.
 * No usa pistas externas, así que el vídeo no tiene problemas de derechos de autor.
 */
const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** Progresión i–VI–III–VII en La menor (Am, F, C, G), notas MIDI. */
export const PROGRESSION: number[][] = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];

export interface MusicHandle {
  stop(): void;
}

/** Programa toda la pieza (dura `seconds`) y la envía a los destinos indicados. */
export function playMusic(ctx: AudioContext, destinations: AudioNode[], seconds: number, bpm = 76): MusicHandle {
  const t0 = ctx.currentTime + 0.1;
  const master = ctx.createGain();
  // entrada y salida suaves
  master.gain.setValueAtTime(0, t0);
  master.gain.linearRampToValueAtTime(0.55, t0 + 3);
  master.gain.setValueAtTime(0.55, t0 + Math.max(3, seconds - 4));
  master.gain.linearRampToValueAtTime(0, t0 + seconds);
  destinations.forEach((d) => master.connect(d));

  // eco para dar amplitud
  const delay = ctx.createDelay(1);
  delay.delayTime.value = (60 / bpm) * 0.75;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  delay.connect(feedback).connect(delay);
  delay.connect(master);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 1100;
  lowpass.Q.value = 0.4;
  lowpass.connect(master);

  const beat = 60 / bpm;
  const bar = beat * 4;
  const nodes: OscillatorNode[] = [];
  const voice = (type: OscillatorType, freq: number, start: number, dur: number, peak: number, out: AudioNode, attack = 0.02, detune = 0) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.setTargetAtTime(0, start + dur - Math.min(dur * 0.5, 1.2), 0.35);
    o.connect(g).connect(out);
    o.start(start);
    o.stop(start + dur + 1.5);
    nodes.push(o);
  };

  for (let b = 0, t = t0; t < t0 + seconds; b++, t += bar * 2) {
    const chord = PROGRESSION[b % PROGRESSION.length];
    // colchón: cada nota con dos osciladores ligeramente desafinados
    chord.forEach((n) => {
      voice('sawtooth', NOTE(n), t, bar * 2, 0.045, lowpass, 1.4, -7);
      voice('sawtooth', NOTE(n), t, bar * 2, 0.045, lowpass, 1.4, 7);
    });
    voice('sine', NOTE(chord[0] - 12), t, bar * 2, 0.16, master, 0.3);
    // arpegio en corcheas a partir del segundo ciclo
    if (b >= 1) {
      for (let i = 0; i < 16; i++) {
        const n = chord[i % 3] + (i % 6 < 3 ? 12 : 24);
        voice('triangle', NOTE(n), t + i * (beat / 2), beat * 0.45, 0.05, delay, 0.01);
        voice('triangle', NOTE(n), t + i * (beat / 2), beat * 0.45, 0.04, master, 0.01);
      }
    }
  }

  return {
    stop() {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0, now, 0.3);
      setTimeout(() => nodes.forEach((o) => { try { o.stop(); } catch { /* ya parado */ } }), 1500);
    },
  };
}
