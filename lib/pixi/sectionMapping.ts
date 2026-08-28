// Every theme's SCENES array is five tiers, ordered calmest to most
// intense (see modeEngine's Scene.enter thresholds: 0, .32, .54, .72,
// .87). This maps the plugin's automatable Section parameter (see
// PluginProcessor.cpp / SectionNames.h) onto that same 0-4 scale, so any
// theme can honour explicit song-structure automation with one shared
// table instead of five bespoke mappings.
//
// The mapping is a musical judgement call, not a technical one: Drop is
// the ceiling, Intro/Outro/Breakdown are the floor, Buildup sits just
// under Drop (rising tension, not there yet), Pre-Chorus/Post-Chorus
// sit under Chorus for the same reason. Adjust freely if a section
// should hit differently.
export const SECTION_TIER: Record<string, number> = {
    Intro: 0,
    Verse: 1,
    'Pre-Chorus': 2,
    Chorus: 3,
    'Post-Chorus': 2,
    Bridge: 1,
    Breakdown: 0,
    Buildup: 3,
    Drop: 4,
    Outro: 0
};

export function sectionTier(section: string | undefined, maxTier: number): number | null {
    if (!section) return null;
    const tier = SECTION_TIER[section];
    if (tier === undefined) return null;
    return Math.min(tier, maxTier);
}