import { z } from "zod";

export const recipeInput = z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(240),
    mediaType: z.enum(["image", "video"]),
    template: z.string().trim().min(10).max(1600),
}).strict();
export type RecipeInput = z.infer<typeof recipeInput>;
export type SkillRecipe = RecipeInput & { id: string; version: number; origin: "highfield" | "custom" };

export const BUILTIN_RECIPES: SkillRecipe[] = [
    { id: "product-editorial", version: 1, origin: "highfield", name: "Product editorial", description: "A considered product portrait. Shape, material and light first.", mediaType: "image", template: "Create an editorial product photograph of {{subject}}. Setting: {{setting}}. Art direction: {{style}}. Give the product a clear silhouette, believable materials and controlled reflections. Use one motivated key light, grounded shadows and restrained styling. Keep the composition uncluttered. Do not invent logos, packaging claims or product features. If a product reference is attached, preserve its actual proportions, markings and design." },
    { id: "thumbnail-story", version: 1, origin: "highfield", name: "Thumbnail / cover", description: "One focal point. A clear story, even at a small size.", mediaType: "image", template: "Design a compelling thumbnail about {{subject}}. Visual direction: {{style}}. Main story or contrast: {{setting}}. Use one unmistakable focal subject, a readable silhouette and clear foreground/background separation. Compose for readability at small size, with deliberate negative space for a headline added in an editor. Avoid tiny decorative detail, misleading claims, watermarks and invented text. Do not assume the model will reproduce exact typography." },
    { id: "campaign-keyvisual", version: 1, origin: "highfield", name: "Campaign key visual", description: "Build the visual idea before multiplying the campaign.", mediaType: "image", template: "Create a campaign key visual for {{subject}}. Campaign idea and audience: {{setting}}. Brand art direction: {{style}}. Build one coherent visual metaphor with a clear hierarchy and room for separately typeset copy. Use believable product details and no unverified endorsements, benefits, certifications or logos. Preserve attached brand/product references when the selected model supports them. Deliver a finished image, not a collage of ads." },
    { id: "character-reference", version: 1, origin: "highfield", name: "Character reference", description: "Establish a fictional persona for later reference-based shots.", mediaType: "image", template: "Create a clear reference portrait of a fictional adult character: {{subject}}. Wardrobe and environment: {{setting}}. Visual treatment: {{style}}. Use readable facial features, consistent anatomy, neutral framing and unobstructed details that can serve as references for later images. No text labels or collage. This is a reference image, not identity training; later consistency depends on the selected model and attached references." },
    { id: "cinematic-reveal", version: 1, origin: "highfield", name: "Cinematic reveal", description: "A single deliberate shot with a beginning and a reveal.", mediaType: "video", template: "Single continuous cinematic shot of {{subject}}. Environment and action: {{setting}}. Lighting and visual direction: {{style}}. Begin with an intriguing detail, move the camera slowly to reveal the subject, then hold a stable final composition. Keep object identity, lighting direction and spatial relationships consistent. Avoid abrupt cuts, changing text and unnecessary camera shake. Use the duration, aspect ratio and reference inputs explicitly selected in the studio; camera motion is a prompt instruction, not a guaranteed physical control." },
    { id: "environment-frame", version: 1, origin: "highfield", name: "World / establishing frame", description: "Give the scene a place, a scale and an atmosphere.", mediaType: "image", template: "Create an establishing frame of {{subject}}. Location, time and story context: {{setting}}. Art direction: {{style}}. Show a coherent sense of scale, a readable foreground/midground/background and one strong compositional anchor. Use plausible atmospheric depth and a motivated lighting source. Avoid unrelated landmarks, arbitrary text and visual clutter. This image will be used as a scene reference for a later shot." },
];

const SOURCE_COMMIT = "f83af0bc1d937c8119099a11f8ebbf5e6fb99819";
export const SKILL_SOURCES = [
    ["generate", "Generation", "Model selection and media generation procedures."],
    ["soul-id", "Soul ID", "Hosted character training and identity workflows."],
    ["product-photoshoot", "Product photoshoot", "Product reference and art-direction procedures."],
    ["brandkit", "Brand kit", "Brand identity and brandbook source material."],
    ["marketplace-cards", "Marketplace cards", "Product presentation and listing visuals."],
    ["video-explainer", "Video explainer", "Narrated explanatory video procedures."],
    ["websites", "Websites / games", "Website, 3D and interactive project procedures."],
    ["youtube-thumbnail", "YouTube thumbnail", "Thumbnail and cover design procedures."],
].map(([slug, name, description]) => ({
    id: `source-${slug}`, name, description, license: "MIT", execution: "external-reference" as const,
    url: `https://github.com/higgsfield-ai/skills/blob/${SOURCE_COMMIT}/higgsfield-${slug}/SKILL.md`,
}));

// Templates are inert text. No code evaluation, nested interpolation or tool execution.
export function recipeFields(template: string): string[] {
    const matches = [...template.matchAll(/\{\{([a-z][a-z0-9_]{0,23})\}\}/g)];
    const remainder = template.replace(/\{\{([a-z][a-z0-9_]{0,23})\}\}/g, "");
    const fields = [...new Set(matches.map(match => match[1]))];
    if (remainder.includes("{") || remainder.includes("}") || fields.length > 8 || fields.some(key => ["constructor", "prototype", "__proto__"].includes(key))) throw new Error("ERR_SKILLS_VALIDATION");
    return fields;
}
export function validateRecipe(input: unknown): RecipeInput {
    const parsed = recipeInput.safeParse(input);
    if (!parsed.success || Object.values(parsed.data).some(value => value.includes("\0"))) throw new Error("ERR_SKILLS_VALIDATION");
    recipeFields(parsed.data.template);
    return parsed.data;
}
export function renderRecipe(template: string, values: Record<string, string>): string {
    for (const key of recipeFields(template)) {
        if (!Object.hasOwn(values, key) || typeof values[key] !== "string" || !values[key].trim() || values[key].length > 500 || values[key].includes("\0")) throw new Error("ERR_SKILLS_INPUT");
    }
    const prompt = template.replace(/\{\{([a-z][a-z0-9_]{0,23})\}\}/g, (_, key: string) => values[key].trim());
    if (prompt.length > 2000) throw new Error("ERR_SKILLS_PROMPT_LIMIT");
    return prompt;
}
