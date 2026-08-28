// The raw packet shape sent by the plugin over the websocket (see
// PluginProcessor.cpp).
export interface PluginPacket {
    bass: number;
    mid: number;
    treble: number;
    transient: number;
    beat: boolean;
    bpm: number;
    beatPhase: number; // 0-1, position within the current beat
    intensity: number;
    spectrum: number[];
    // The plugin's Section parameter (see PluginProcessor.cpp), automated
    // in Ableton to mark the song structure: "Intro", "Verse",
    // "Pre-Chorus", "Chorus", "Post-Chorus", "Bridge", "Breakdown",
    // "Buildup", "Drop", "Outro". A theme's auto director can key off this
    // directly instead of only inferring from audio energy.
    section: string;
}

// PluginPacket plus the auto-gain normalized fields added by
// normalizePacket() (see lib/autoGain.ts) before it reaches any theme.
export interface VisualizerData extends PluginPacket {
    bassNorm: number;
    midNorm: number;
    trebleNorm: number;
    spectrumNorm: number[];
}

// The shape every theme must implement. See themes/aurora.ts for an
// example, and themes/index.ts for how new themes get registered.
export interface VisualizerTheme {
    label: string;
    init(canvas: HTMLCanvasElement): void;
    update(data: VisualizerData, dt: number): void;
    draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void;

    // Optional. If present, key presses are forwarded here so a theme can
    // expose live-triggered effects (see themes/sunburst.ts). Only the
    // active theme receives keys.
    onKey?(key: string): void;

    // Optional. Shown in the on-screen help overlay when the theme has
    // key bindings, as [key, description] pairs.
    keyHelp?: Array<[string, string]>;
}