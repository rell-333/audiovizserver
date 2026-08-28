import type { PluginPacket, VisualizerData } from './types';

// The raw analysis values from the plugin (bass/mid/treble/spectrum) are
// FFT magnitudes, their absolute scale depends on FFT size, windowing,
// and input level, not something themes should have to guess constants
// for. AutoGain tracks a rolling peak per value and normalizes against
// it, so "1.0" always roughly means "as loud as this band has recently
// gotten", regardless of the raw units. This also means themes stay
// visually engaging across quiet and loud parts of a set automatically.
export class AutoGain {
    peak: number;
    floor: number;
    attack: number;
    release: number;

    constructor(attack = 0.25, release = 0.02, floor = 1e-9) {
        this.peak = floor;
        this.floor = floor;
        this.attack = attack;
        this.release = release;
    }

    normalize(value: number): number {
        if (value > this.peak) this.peak += (value - this.peak) * this.attack;
        else this.peak += (value - this.peak) * this.release;
        if (this.peak < this.floor) this.peak = this.floor;
        return Math.min(1, value / this.peak);
    }
}

export interface GainTrackers {
    bass: AutoGain;
    mid: AutoGain;
    treble: AutoGain;
    spectrum: AutoGain;
}

// Creates a fresh set of gain trackers, one per band plus one shared for
// the spectrum. Call once per websocket connection lifetime (see
// app/page.tsx), not per packet.
export function createGainTrackers(): GainTrackers {
    return {
        bass: new AutoGain(),
        mid: new AutoGain(),
        treble: new AutoGain(),
        spectrum: new AutoGain()
    };
}

// Adds *Norm fields (0-1, self-scaling) onto a raw packet from the
// plugin, mutating and returning it as a full VisualizerData.
export function normalizePacket(raw: PluginPacket, gain: GainTrackers): VisualizerData {
    const data = raw as VisualizerData;

    data.bassNorm = gain.bass.normalize(data.bass || 0);
    data.midNorm = gain.mid.normalize(data.mid || 0);
    data.trebleNorm = gain.treble.normalize(data.treble || 0);

    const spectrum = data.spectrum || [];
    const spectrumPeak = spectrum.length ? Math.max(...spectrum) : 0;
    gain.spectrum.normalize(spectrumPeak);
    data.spectrumNorm = spectrum.map((v) => Math.min(1, v / gain.spectrum.peak));

    return data;
}