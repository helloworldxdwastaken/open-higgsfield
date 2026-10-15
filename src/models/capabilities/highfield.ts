import type { ModelCapabilities } from "./types";
const base: Omit<ModelCapabilities, "id" | "label" | "family" | "variant" | "group"> = {
    provider: "higgsfield", provider_mode: "video", prompt_required: false, prompt_max: 10000,
    duration: false, aspect_ratio: false, size: false,
    resolution_variant: { options: ["720p", "480p", "1080p"], default: "720p" },
    negative_prompt: false, cfg_scale: false, style: false, shot_type: false, prompt_expansion: false, elements: false,
    media_slots: [
        { id: "source_video", label: "Source video (4–30 seconds)", kind: "video", required: true, description: "At least 409,600 pixels per frame. Longer videos are trimmed by Higgsfield." },
        { id: "reference_image", label: "Reference image 1 (required)", kind: "image", required: true },
        ...Array.from({ length: 7 }, (_, i) => ({ id: `reference_image_${i + 2}`, label: `Reference image ${i + 2} (optional)`, kind: "image" as const })),
    ], custom_fields: [],
};
export const HIGHFIELD_VIDEO_CAPABILITIES: Record<string, ModelCapabilities> = {
    "higgsfield__genjutsu-motion-transfer": {
        ...base, id: "higgsfield__genjutsu-motion-transfer", label: "Genjutsu Motion Transfer", family: "Genjutsu", variant: "Motion Transfer", group: "Higgsfield API",
        provider_model_id: "higgsfield/genjutsu/motion-transfer/v1.0",
    },
    "higgsfield__genjutsu-object-swap": {
        ...base, id: "higgsfield__genjutsu-object-swap", label: "Genjutsu Object Swap", family: "Genjutsu", variant: "Object Swap", group: "Higgsfield API",
        provider_model_id: "higgsfield/genjutsu/object-swap/v1.0",
    },
    "higgsfield__cinema-studio-4.0": {
        ...base, id: "higgsfield__cinema-studio-4.0", label: "Cinema Studio 4.0", family: "Cinema Studio", variant: "4.0", group: "Higgsfield API",
        provider_model_id: "higgsfield/cinema-studio/4.0", prompt_required: true,
        duration: { options: ["5", "4", "6", "8", "10", "15", "20", "30"], default: "5" },
        aspect_ratio: { options: [["16:9", "16:9"]], default: ["16:9", "16:9"] },
        resolution_variant: { options: ["720p", "480p"], default: "720p" }, media_slots: [],
        custom_fields: [{ id: "generate_audio", label: "Generate audio", type: "checkbox", default: true }],
    },
};
