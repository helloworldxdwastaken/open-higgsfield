export interface RecipeDraft { prompt: string; mediaType: "image" | "video"; requiredImages: number }
export function parseRecipeDraft(value: unknown): RecipeDraft | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const input = value as Record<string, unknown>;
    const references = input.requiredImages ?? 0;
    if (typeof input.prompt !== "string" || input.prompt.length > 2000 || input.prompt.includes("\0") || !["image", "video"].includes(input.mediaType as string) || !Number.isInteger(references) || Number(references) < 0 || Number(references) > 3) return;
    return { prompt: input.prompt, mediaType: input.mediaType as RecipeDraft["mediaType"], requiredImages: Number(references) };
}
