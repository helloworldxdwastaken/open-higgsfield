import catalog from "@/content/effect-presets.json";

export type EffectPreset = typeof catalog.presets[number];
export const EFFECT_PRESETS = catalog.presets;
export function getEffectPreset(id: string): EffectPreset | undefined {
  return /^[a-z0-9-]{1,80}$/.test(id) ? EFFECT_PRESETS.find(preset => preset.id === id) : undefined;
}
export function effectDraft(preset: EffectPreset, extra = "", intensity: "subtle" | "balanced" | "dramatic" = "balanced") {
  if (typeof extra !== "string" || extra.length > 500 || extra.includes("\0")) throw new Error("ERR_PRESET_DIRECTION");
  if (!["subtle", "balanced", "dramatic"].includes(intensity)) throw new Error("ERR_PRESET_DIRECTION");
  const prompt = preset.prompt + ` Effect intensity (prompt guidance): ${intensity}.` + (extra.trim() ? ` Additional direction: ${extra.trim()}` : "");
  if (prompt.length > 2000) throw new Error("ERR_PRESET_PROMPT_LIMIT");
  return { prompt, mediaType: preset.mediaType, requiredImages: preset.requiredImages };
}
