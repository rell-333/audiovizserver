import { approach, decay } from '../smoothing';
import { sectionTier } from './sectionMapping';
import type { VisualizerData } from '../types';

// The toggleable-mode system, the beat clock and the energy director,
// extracted so every theme doesn't reimplement them. Sunburst grew all
// of this organically; everything here is that logic, generalised over
// whatever "mods" shape a given theme wants.

export interface ModeCtx {
    data: VisualizerData;
    dt: number;
    beatTick: boolean;
    beatIndex: number;
    energy: number;
}

export interface ActiveMode {
    elapsed: number;
    state: Record<string, number>;
}

export interface ModeDef<M> {
    key: string;
    id: string;
    name: string;
    apply(m: ActiveMode, mods: M, c: ModeCtx): void;
}

export interface Scene {
    name: string;
    enter: number;
    modes: string[];
}

export interface ModeEngineOptions<M> {
    modes: ModeDef<M>[];
    scenes: Scene[];
    freshMods: () => M;
    hysteresis?: number;
    minDwell?: number;
    // If true, the director starts running immediately with no keypress
    // needed. Without this, every mode and every scene only ever turns on
    // if the person already knows to press 'a' or a mode key first - the
    // theme's actual show was invisible by default, which is why "boring"
    // kept coming back despite adding more modes each time. Themes should
    // set this true unless they have a specific reason not to.
    autoStartOn?: boolean;
}

export interface ModeEngineFrame<M> {
    mods: M;
    beatTick: boolean;
    beatIndex: number;
    energy: number;
}

export function createModeEngine<M>(options: ModeEngineOptions<M>) {
    const { modes, scenes, freshMods } = options;
    const hysteresis = options.hysteresis ?? 0.06;
    const minDwell = options.minDwell ?? 6;

    const active = new Map<string, { def: ModeDef<M>; mode: ActiveMode }>();
    let energy = 0;
    let prevBeatPhase = 0;
    let beatIndex = 0;
    let autoOn = options.autoStartOn ?? false;
    let autoScene = 0;
    let autoDwell = options.autoStartOn ? -1 : 0; // see frame(): -1 forces the first scene on immediately

    // Section-following: only kicks in once we've actually seen the
    // plugin's Section parameter move at least once. It defaults to
    // "Intro" and stays there forever for anyone who never automates it,
    // so treating every packet as a real cue would trap those people on
    // the calmest scene permanently. The first observed *change* is what
    // proves someone is actually driving it.
    let lastSection: string | undefined;
    let sectionEngaged = false;
    let hintText = '';
    let hintTimer = 0;

    function flash(text: string) {
        hintText = text;
        hintTimer = 1.6;
    }

    function toggle(def: ModeDef<M>, on?: boolean) {
        const isOn = active.has(def.id);
        const want = on === undefined ? !isOn : on;
        if (want && !isOn) active.set(def.id, { def, mode: { elapsed: 0, state: {} } });
        else if (!want && isOn) active.delete(def.id);
    }

    function applyScene(index: number) {
        const scene = scenes[index];
        for (const def of modes) toggle(def, scene.modes.includes(def.id));
        flash(`auto: ${scene.name}`);
    }

    return {
        keyHelp(extra: Array<[string, string]> = []): Array<[string, string]> {
            return [
                ...modes.map((m) => [m.key, m.name] as [string, string]),
                ['a', 'AUTO (energy)'],
                ['0', 'all off'],
                ...extra
            ];
        },

        // Returns true if the key was handled as a mode toggle or director
        // command, so themes can fall through to their own extra keys.
        onKey(key: string): boolean {
            const def = modes.find((m) => m.key === key);
            if (def) {
                autoOn = false;
                toggle(def);
                flash(`${def.name} ${active.has(def.id) ? 'on' : 'off'}`);
                return true;
            }
            if (key === 'a' || key === 'A') {
                autoOn = !autoOn;
                if (autoOn) {
                    autoDwell = minDwell;
                    applyScene(autoScene);
                } else flash('auto off');
                return true;
            }
            if (key === '0') {
                autoOn = false;
                active.clear();
                flash('all off');
                return true;
            }
            return false;
        },

        flash,

        frame(data: VisualizerData, dt: number): ModeEngineFrame<M> {
            // Section energy: slow on purpose, so it tracks the arrangement
            // rather than individual hits.
            const instant = (data.bassNorm + data.midNorm + data.trebleNorm) / 3;
            energy = approach(energy, instant * (0.5 + data.intensity * 0.7), 0.5, dt);

            let beatTick = false;
            if (data.beatPhase < prevBeatPhase) {
                beatTick = true;
                beatIndex++;
            }
            prevBeatPhase = data.beatPhase;

            if (autoDwell < 0) {
                // First frame with autoStartOn: apply scene 0 right away so
                // there's something running the instant the theme opens,
                // rather than minDwell seconds of the bare resting state first.
                autoDwell = 0;
                applyScene(autoScene);
            }

            // Detect the first real move away from the default, this is what
            // proves the person is actually driving Section from Ableton
            // rather than it just sitting at its default value.
            if (lastSection !== undefined && data.section !== lastSection) {
                sectionEngaged = true;
                // Driving Section from Ableton is a clear enough signal of
                // intent that it shouldn't also require a separate 'a' keypress
                // to actually take effect - the first real change turns the
                // director on for you.
                autoOn = true;
            }
            lastSection = data.section;

            autoDwell += dt;

            if (autoOn && sectionEngaged) {
                // Authored automation wins outright, and applies the instant a
                // new value is seen, no dwell or hysteresis: those exist to
                // smooth out noisy energy readings, but a hand-drawn cue point
                // is deliberate, so honouring it a beat late would feel wrong.
                const target = sectionTier(data.section, scenes.length - 1);
                if (target !== null && target !== autoScene) {
                    autoScene = target;
                    autoDwell = 0;
                    applyScene(autoScene);
                }
            } else if (autoOn && autoDwell >= minDwell) {
                let target = autoScene;
                if (autoScene < scenes.length - 1 && energy >= scenes[autoScene + 1].enter) target = autoScene + 1;
                else if (autoScene > 0 && energy < scenes[autoScene].enter - hysteresis) target = autoScene - 1;
                if (target !== autoScene) {
                    autoScene = target;
                    autoDwell = 0;
                    applyScene(autoScene);
                }
            }

            const ctx: ModeCtx = { data, dt, beatTick, beatIndex, energy };
            const mods = freshMods();
            for (const entry of active.values()) {
                entry.mode.elapsed += dt;
                entry.def.apply(entry.mode, mods, ctx);
            }

            hintTimer = decay(hintTimer, 1, dt);
            return { mods, beatTick, beatIndex, energy };
        },

        status(): { labels: string[]; hint: string } {
            const labels: string[] = [];
            if (autoOn) {
                const source = sectionEngaged ? 'section' : 'energy';
                labels.push(`AUTO (${source}) ${scenes[autoScene].name}`);
            }
            for (const entry of active.values()) labels.push(entry.def.name);
            return { labels, hint: hintTimer > 0.01 ? hintText : '' };
        },

        reset() {
            active.clear();
            autoOn = options.autoStartOn ?? false;
            autoScene = 0;
            autoDwell = options.autoStartOn ? -1 : 0;
            energy = 0;
            beatIndex = 0;
            prevBeatPhase = 0;
            lastSection = undefined;
            sectionEngaged = false;
            hintText = '';
            hintTimer = 0;
        }
    };
}