import { defineNode } from '@/lib/editor/defineNode';
import { SECTION_TIER } from '@/lib/pixi/sectionMapping';

// The Section parameter you automate in Ableton, as a patchable value.
// `tier` is the 0-4 intensity ranking; the per-section outputs are gates
// you can wire straight into a blend or a gate node.
export default defineNode({
  type: 'section',
  label: 'Section',
  category: 'source',
  description: 'Song section automated from the DAW.',
  outputs: [
    { id: 'tier', label: 'Tier (0-4)', kind: 'value' },
    { id: 'isDrop', label: 'Is Drop', kind: 'value' },
    { id: 'isChorus', label: 'Is Chorus', kind: 'value' },
    { id: 'isBuildup', label: 'Is Buildup', kind: 'value' },
    { id: 'isQuiet', label: 'Is Quiet', kind: 'value' }
  ],
  createRuntime() {
    return {
      evalValues({ ctx }) {
        const s = ctx.data.section ?? 'Intro';
        const tier = SECTION_TIER[s] ?? 0;
        return {
          tier,
          isDrop: s === 'Drop' ? 1 : 0,
          isChorus: s === 'Chorus' ? 1 : 0,
          isBuildup: s === 'Buildup' ? 1 : 0,
          isQuiet: s === 'Intro' || s === 'Outro' || s === 'Breakdown' ? 1 : 0
        };
      }
    };
  }
});
