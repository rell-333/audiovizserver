// Lets you test the editor without the VST plugin: load a local audio
// file, play it, and get real bass/mid/treble/beat analysis from the
// Web Audio API instead of the websocket feed. BPM can't be detected
// from a raw file without real beat-tracking (a much bigger feature),
// so it's set manually here - same as the plugin's own "Manual BPM"
// override for when it isn't hosted in a DAW.
//
// A plain module singleton, like lib/pixiHost.ts: one AudioContext for
// the whole tab, created lazily on first file load, never torn down
// while the page lives.

let audioCtx: AudioContext | null = null;
let element: HTMLAudioElement | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let freqData: Uint8Array | null = null;

let fileName: string | null = null;
let bpm = 120;
let objectUrl: string | null = null;

// Rolling-average beat detector, the same "sound energy" approach used
// in the plugin's AnalysisEngine: a beat is a frame whose bass energy
// spikes well above the recent local average.
const HISTORY_SIZE = 43; // ~1 second at ~43 frames/sec
const energyHistory = new Array<number>(HISTORY_SIZE).fill(0);
let historyIndex = 0;
let historyFilled = false;
let framesSinceLastBeat = 999;

// Minimum frames between detections. Without this, a single loud
// transient can trigger on several consecutive frames while it's above
// the rolling average (verified: this alone caused 2x over-detection
// against a synthetic 128bpm kick in testing). 8 frames is ~180ms at a
// ~45fps analysis rate, comfortably under the beat interval even at a
// fast 200bpm (300ms/beat).
const MIN_GAP_FRAMES = 8;

const listeners = new Set<() => void>();
function notify() {
    for (const fn of listeners) fn();
}
export function subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function ensureContext() {
    if (audioCtx) return;
    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.4;
    freqData = new Uint8Array(analyser.frequencyBinCount);
}

export async function loadFile(file: File): Promise<void> {
    ensureContext();

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);

    if (!element) {
        element = new Audio();
        element.loop = true;
    }
    element.src = objectUrl;
    fileName = file.name;

    // A MediaElementAudioSourceNode can only ever be created once per
    // element, so it's created the first time and reused for every
    // subsequent file, just swapping element.src.
    if (!sourceNode && audioCtx && analyser) {
        sourceNode = audioCtx.createMediaElementSource(element);
        sourceNode.connect(analyser);
        analyser.connect(audioCtx.destination);
    }

    if (audioCtx?.state === 'suspended') await audioCtx.resume();
    await element.play();
    notify();
}

export function togglePlay(): void {
    if (!element) return;
    if (element.paused) void element.play();
    else element.pause();
    notify();
}

export function isLoaded(): boolean {
    return element !== null;
}
export function isPlaying(): boolean {
    return element !== null && !element.paused;
}
export function getFileName(): string | null {
    return fileName;
}
export function getBpm(): number {
    return bpm;
}
export function setBpm(v: number): void {
    bpm = v;
}
export function getCurrentTime(): number {
    return element?.currentTime ?? 0;
}

export interface Bands {
    bass: number;
    mid: number;
    treble: number;
    spectrum: number[];
}

const EMPTY_BANDS: Bands = { bass: 0, mid: 0, treble: 0, spectrum: [] };

function getBands(): Bands {
    if (!analyser || !freqData || !audioCtx) return EMPTY_BANDS;
    analyser.getByteFrequencyData(freqData as Uint8Array<ArrayBuffer>);

    const nyquist = audioCtx.sampleRate / 2;
    const binHz = nyquist / freqData.length;

    let bassSum = 0, bassN = 0;
    let midSum = 0, midN = 0;
    let trebleSum = 0, trebleN = 0;
    const spectrum: number[] = [];
    const spectrumStep = Math.max(1, Math.floor(freqData.length / 64));

    for (let i = 0; i < freqData.length; i++) {
        const v = freqData[i] / 255;
        const freq = i * binHz;
        if (freq < 250) { bassSum += v; bassN++; }
        else if (freq < 4000) { midSum += v; midN++; }
        else { trebleSum += v; trebleN++; }
        if (i % spectrumStep === 0) spectrum.push(v);
    }

    return {
        bass: bassN ? bassSum / bassN : 0,
        mid: midN ? midSum / midN : 0,
        treble: trebleN ? trebleSum / trebleN : 0,
        spectrum
    };
}

// Rolling-average onset detector. Not exported: it has internal state
// (the energy history + frame-gap cooldown) that only makes sense
// sampled exactly once per rendered frame. Call it twice in the same
// frame - once for a graph output, once for anything else - and the
// second call sees a history that's already been advanced by the
// first, corrupting the average and the gap timer. analyze() below is
// the only thing that may call this.
function detectBeat(bassEnergy: number): boolean {
    energyHistory[historyIndex] = bassEnergy;
    historyIndex = (historyIndex + 1) % HISTORY_SIZE;
    if (historyIndex === 0) historyFilled = true;
    framesSinceLastBeat++;

    const count = historyFilled ? HISTORY_SIZE : historyIndex;
    if (count < 5) return false;

    let avg = 0;
    for (let i = 0; i < count; i++) avg += energyHistory[i];
    avg /= count;

    const fire = bassEnergy > 0.03 && bassEnergy > avg * 1.3 && framesSinceLastBeat >= MIN_GAP_FRAMES;
    if (fire) framesSinceLastBeat = 0;
    return fire;
}

export interface AnalysisFrame {
    bass: number;
    mid: number;
    treble: number;
    beat: boolean;
    beatPhase: number;
    bpm: number;
    intensity: number;
    spectrum: number[];
}

const EMPTY_FRAME: AnalysisFrame = {
    bass: 0, mid: 0, treble: 0, beat: false, beatPhase: 0, bpm: 120, intensity: 0, spectrum: []
};
let lastFrame: AnalysisFrame = EMPTY_FRAME;

// The single per-frame analysis entry point. Called once per rendered
// frame (from the editor's render loop, before the node graph runs),
// this is the only thing that touches detectBeat(). Everything else -
// the localAudio node's graph outputs, ctx.data for every generator
// that reads bass/beat directly - reads the cached result from
// getLastFrame() instead of re-deriving it, so they can never disagree
// about whether "this" frame had a beat.
export function analyze(): AnalysisFrame {
    const { bass, mid, treble, spectrum } = getBands();
    const beat = detectBeat(bass);
    const beatPhase = ((getCurrentTime() * bpm) / 60) % 1;
    const intensity = Math.min(1, ((bass + mid + treble) / 3) * 1.4);
    lastFrame = { bass, mid, treble, beat, beatPhase, bpm, intensity, spectrum };
    return lastFrame;
}

export function getLastFrame(): AnalysisFrame {
    return lastFrame;
}