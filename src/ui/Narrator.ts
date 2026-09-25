/**
 * The flight director's voice.
 *
 * Uses the Web Speech API, which ships in every current browser and costs
 * nothing in bundle size — no audio files to record, host or localise. The
 * tradeoff is that the available voices vary by platform, so we pick the best
 * English voice on offer and fall back to the default.
 *
 * Speech is a courtesy, never a requirement: every line is also written to the
 * on-screen dialogue panel, and the whole thing degrades to silent text if the
 * API is missing, the player mutes it, or no voices are installed.
 */

export type Priority = 'normal' | 'urgent';

interface QueuedLine {
  text: string;
  priority: Priority;
}

/** Voice names that tend to sound like a controller rather than a robot. */
const PREFERRED_VOICES = [
  'Google UK English Female',
  'Microsoft Sonia Online (Natural) - English (United Kingdom)',
  'Microsoft Aria Online (Natural) - English (United States)',
  'Samantha',
  'Google US English',
];

export class Narrator {
  private synth: SpeechSynthesis | null;
  private voice: SpeechSynthesisVoice | null = null;
  private queue: QueuedLine[] = [];
  private speaking = false;
  private enabled = true;

  /** Called with each line so the UI can display it alongside the audio. */
  onLine: ((text: string) => void) | null = null;
  /** Called when the mute state changes, so the button can re-label itself. */
  onEnabledChange: ((enabled: boolean) => void) | null = null;

  constructor() {
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : null;

    if (this.synth) {
      // Voices load asynchronously in most browsers, and getVoices() returns
      // an empty array until they do.
      this.pickVoice();
      this.synth.addEventListener('voiceschanged', () => this.pickVoice());
    }
  }

  get available(): boolean {
    return this.synth !== null;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  private pickVoice(): void {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    if (voices.length === 0) return;

    for (const name of PREFERRED_VOICES) {
      const match = voices.find((v) => v.name === name);
      if (match) {
        this.voice = match;
        return;
      }
    }
    this.voice = voices.find((v) => v.lang.startsWith('en')) ?? voices[0] ?? null;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
    this.onEnabledChange?.(enabled);
  }

  toggle(): void {
    this.setEnabled(!this.enabled);
  }

  /**
   * Speak a line and show it on screen.
   *
   * An urgent line cuts off whatever is currently speaking — when the vehicle
   * is failing, the player needs to hear about it now, not after the previous
   * sentence finishes.
   */
  say(text: string, priority: Priority = 'normal'): void {
    this.onLine?.(text);

    if (!this.synth || !this.enabled) return;

    if (priority === 'urgent') {
      this.queue = [];
      this.synth.cancel();
      this.speaking = false;
    }

    this.queue.push({ text, priority });
    if (!this.speaking) this.next();
  }

  private next(): void {
    if (!this.synth || !this.enabled) return;

    const line = this.queue.shift();
    if (!line) {
      this.speaking = false;
      return;
    }

    this.speaking = true;
    const utterance = new SpeechSynthesisUtterance(line.text);
    if (this.voice) utterance.voice = this.voice;
    // Slightly quick and a little low: a controller reading telemetry, not an
    // audiobook. Urgent lines get faster and louder.
    utterance.rate = line.priority === 'urgent' ? 1.18 : 1.02;
    utterance.pitch = 0.95;
    utterance.volume = line.priority === 'urgent' ? 1 : 0.85;

    utterance.addEventListener('end', () => this.next());
    // If synthesis errors (some platforms throw on very long strings), do not
    // strand the queue.
    utterance.addEventListener('error', () => this.next());

    this.synth.speak(utterance);
  }

  stop(): void {
    this.queue = [];
    this.speaking = false;
    this.synth?.cancel();
  }
}
