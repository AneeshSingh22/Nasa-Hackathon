/**
 * Sound effects, synthesised in the browser.
 *
 * A build phase where nothing makes a sound feels like a form. These are
 * short, procedural Web Audio cues — no sample files to download, license or
 * host, the same rule as the procedural geometry and textures.
 *
 * Audio is optional by construction: no AudioContext (tests, old browsers),
 * a context the browser has suspended until a user gesture, or the player
 * muting with V all fall back to silence. Nothing here ever throws.
 */

type Cue = 'clunk' | 'spend' | 'refund' | 'deny' | 'go' | 'nogo' | 'star' | 'select';

let context: AudioContext | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    if (!context) {
      const Constructor: typeof AudioContext | undefined =
        (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
      if (!Constructor) return null;
      context = new Constructor();
    }
    // Browsers start the context suspended until the page has had a gesture.
    if (context.state === 'suspended') void context.resume().catch(() => {});
    return context;
  } catch {
    return null;
  }
}

export function setSoundMuted(value: boolean): void {
  muted = value;
}

/** A single enveloped tone. */
function tone(
  ctx: AudioContext, frequency: number, start: number, duration: number,
  type: OscillatorType, peak: number, glideTo?: number,
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (glideTo) oscillator.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

/** A burst of filtered noise: the metal-on-metal part of a clunk. */
function noise(ctx: AudioContext, start: number, duration: number, peak: number, cutoff: number): void {
  const samples = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / samples);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const gain = ctx.createGain();
  gain.gain.value = peak;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
}

export function play(cue: Cue): void {
  const ctx = audio();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    switch (cue) {
      case 'clunk':
        // A heavy stage seating on its mount: a low thump and a metal ring.
        tone(ctx, 95, t, 0.35, 'sine', 0.5, 45);
        noise(ctx, t, 0.18, 0.35, 900);
        tone(ctx, 740, t + 0.02, 0.4, 'triangle', 0.05);
        break;
      case 'spend':
        tone(ctx, 660, t, 0.08, 'square', 0.06);
        tone(ctx, 440, t + 0.07, 0.12, 'square', 0.05);
        break;
      case 'refund':
        tone(ctx, 440, t, 0.08, 'square', 0.05);
        tone(ctx, 660, t + 0.07, 0.12, 'square', 0.05);
        break;
      case 'deny':
        tone(ctx, 150, t, 0.25, 'sawtooth', 0.12, 110);
        break;
      case 'select':
        tone(ctx, 880, t, 0.05, 'sine', 0.06);
        break;
      case 'go':
        for (const [i, f] of [523, 659, 784].entries()) tone(ctx, f, t + i * 0.09, 0.22, 'triangle', 0.12);
        break;
      case 'nogo':
        tone(ctx, 330, t, 0.18, 'triangle', 0.1);
        tone(ctx, 247, t + 0.16, 0.3, 'triangle', 0.1);
        break;
      case 'star':
        tone(ctx, 1047, t, 0.25, 'sine', 0.14);
        tone(ctx, 1568, t + 0.08, 0.35, 'sine', 0.1);
        break;
    }
  } catch {
    // A cue that fails to play is silence, never a broken game.
  }
}
