import { defineNode } from '@/lib/editor/defineNode';

// The live feed from the plugin. Everything downstream ultimately hangs
// off this.
export default defineNode({
  type: 'audio',
  label: 'Audio Analysis',
  category: 'source',
  description: 'Live bands, beat and tempo from the VST.',
  outputs: [
    { id: 'bass', label: 'Bass', kind: 'value' },
    { id: 'mid', label: 'Mid', kind: 'value' },
    { id: 'treble', label: 'Treble', kind: 'value' },
    { id: 'beat', label: 'Beat', kind: 'value' },
    { id: 'beatPhase', label: 'Beat Phase', kind: 'value' },
    { id: 'intensity', label: 'Intensity', kind: 'value' },
    { id: 'bpm', label: 'BPM', kind: 'value' }
  ],
  createRuntime() {
    return {
      evalValues({ ctx }) {
        const d = ctx.data;
        return {
          bass: d.bassNorm,
          mid: d.midNorm,
          treble: d.trebleNorm,
          beat: d.beat ? 1 : 0,
          beatPhase: d.beatPhase,
          intensity: d.intensity,
          bpm: d.bpm
        };
      }
    };
  }
});
