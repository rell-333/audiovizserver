// Converts the plugin's continuous beatPhase (0-1, position within the
// current beat, see PluginProcessor.cpp) into a bright pulse that snaps
// right on the beat and decays smoothly until the next one. This is what
// gives themes a steady, musical throb locked to tempo, rather than the
// jitter you'd get from amplitude alone.
//
// Higher `sharpness` = a tighter, snappier flash; lower = a slower, more
// ambient swell. Themes typically want 4-6.
export function beatPulse(phase: number | null | undefined, sharpness = 3): number {
    return Math.pow(1 - (phase == null ? 1 : phase), sharpness);
}