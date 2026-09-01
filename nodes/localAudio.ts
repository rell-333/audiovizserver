import { defineNode } from '@/lib/editor/defineNode';
import * as source from '@/lib/editor/localAudioSource';
import { num } from '@/lib/editor/filterPass';

// Same output shape as the `audio` node (the live VST feed), so this
// drops straight into any patch in its place: unplug one, plug in the
// other, everything downstream keeps working.
//
// BPM can't be reliably detected from a raw audio file without real
// beat-tracking, a much bigger feature than this needs, so it's a
// manual param here instead, exactly like the plugin's own "Manual
// BPM" override for when it isn't hosted in a DAW. beatPhase is derived
// from that BPM against the file's actual playback time, so it stays
// correct through pause/seek rather than drifting like a free-running
// accumulator would.
//
// This reads source.getLastFrame() rather than calling getBands()/
// detectBeat() itself: the editor's render loop calls source.analyze()
// exactly once per rendered frame (see EditorPage) so that ctx.data -
// which most generator/effect nodes read directly for audio reactivity -
// and this node's own graph outputs are always looking at the same
// analysis, not two independently-sampled ones.
//
// Use the "load audio" control in the editor toolbar to pick a file
// (drag-and-drop onto the page works too) - there's nothing to wire up
// for that part, this node just reads whatever's currently loaded.
export default defineNode({
    type: 'localAudio',
    label: 'Local Audio File',
    category: 'source',
    description: 'Test without the VST: load a file from the toolbar, set BPM manually.',
    outputs: [
        { id: 'bass', label: 'Bass', kind: 'value' },
        { id: 'mid', label: 'Mid', kind: 'value' },
        { id: 'treble', label: 'Treble', kind: 'value' },
        { id: 'beat', label: 'Beat', kind: 'value' },
        { id: 'beatPhase', label: 'Beat Phase', kind: 'value' },
        { id: 'intensity', label: 'Intensity', kind: 'value' },
        { id: 'bpm', label: 'BPM', kind: 'value' }
    ],
    params: [
        { id: 'bpm', label: 'BPM (manual)', kind: 'number', min: 40, max: 220, step: 1, default: 120 }
    ],
    createRuntime() {
        return {
            evalValues({ params }) {
                const bpm = num(params, 'bpm', 120);
                source.setBpm(bpm); // takes effect from next frame's analyze() call

                const frame = source.getLastFrame();
                return {
                    bass: frame.bass,
                    mid: frame.mid,
                    treble: frame.treble,
                    beat: frame.beat ? 1 : 0,
                    beatPhase: frame.beatPhase,
                    intensity: frame.intensity,
                    bpm: frame.bpm
                };
            }
        };
    }
});