import type { SoundType } from '../components/SettingsModal';

// WebAudio is cheaper and more predictable than shipping MP3s: we synthesize
// each variant from a handful of oscillators. All patterns use a shared
// AudioContext so rapid plays don't stack contexts (each new context steals
// device audio output on some browsers).
let sharedCtx: AudioContext | null = null;
const getCtx = (): AudioContext | null => {
    try {
        const AC: any = (typeof window !== 'undefined')
            ? ((window as any).AudioContext || (window as any).webkitAudioContext)
            : null;
        if (!AC) return null;
        if (!sharedCtx) sharedCtx = new AC();
        // iOS / some browsers start suspended until a user gesture — resume
        // lazily; if it fails we silently skip audio.
        if (sharedCtx && sharedCtx.state === 'suspended') {
            sharedCtx.resume().catch(() => { /* ignored */ });
        }
        return sharedCtx;
    } catch {
        return null;
    }
};

interface ToneSpec {
    freq: number;
    durationMs: number;
    offsetMs?: number;
    volume?: number;
    type?: OscillatorType;
}

const scheduleTone = (ctx: AudioContext, spec: ToneSpec) => {
    const now = ctx.currentTime + (spec.offsetMs || 0) / 1000;
    const dur = spec.durationMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = spec.freq;
    osc.type = spec.type || 'sine';
    // Envelope to avoid click artifacts at start/end.
    const peak = spec.volume ?? 0.15;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
};

const PATTERNS: Record<Exclude<SoundType, 'none'>, ToneSpec[]> = {
    beep: [
        { freq: 660, durationMs: 160 },
        { freq: 880, durationMs: 160, offsetMs: 200 },
    ],
    chime: [
        { freq: 523.25, durationMs: 420, volume: 0.12, type: 'triangle' },
        { freq: 659.25, durationMs: 480, offsetMs: 80, volume: 0.1, type: 'triangle' },
    ],
    bell: [
        { freq: 880, durationMs: 700, volume: 0.18, type: 'triangle' },
        { freq: 1760, durationMs: 500, offsetMs: 10, volume: 0.05, type: 'sine' },
    ],
    alarm: [
        { freq: 1047, durationMs: 140 },
        { freq: 784, durationMs: 140, offsetMs: 180 },
        { freq: 1047, durationMs: 140, offsetMs: 360 },
        { freq: 784, durationMs: 140, offsetMs: 540 },
    ],
    ding: [
        { freq: 1760, durationMs: 260, volume: 0.18, type: 'triangle' },
    ],
    triad: [
        { freq: 523.25, durationMs: 160 },
        { freq: 659.25, durationMs: 160, offsetMs: 180 },
        { freq: 783.99, durationMs: 260, offsetMs: 360 },
    ],
};

export const playSound = (sound: SoundType | undefined | null) => {
    if (!sound || sound === 'none') return;
    const pattern = PATTERNS[sound as Exclude<SoundType, 'none'>];
    if (!pattern) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
        pattern.forEach(spec => scheduleTone(ctx, spec));
    } catch { /* ignored */ }
};
