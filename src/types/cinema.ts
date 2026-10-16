/** Owner-workspace Cinema projects. Multi-user workspace isolation is not enabled. */
export type CinemaAspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9";
export interface CinemaGeneration {
    requestId: string;
    fingerprint: string;
    state: "submitting" | "accepted" | "uncertain";
    createdAt: string;
    updatedAt: string;
    taskId?: string;
    error?: string;
}
export interface CinemaShot {
    id: string;
    title: string;
    prompt: string;
    seconds: number;
    camera: string;
    lens: string;
    lighting: string;
    notes: string;
    image?: CinemaGeneration;
    video?: CinemaGeneration;
}
export interface CinemaGenerationRecord extends CinemaGeneration {
    shotId: string;
    mediaType: "image" | "video";
}
export interface CinemaProject {
    id: string;
    title: string;
    brief: string;
    aspectRatio: CinemaAspectRatio;
    shots: CinemaShot[];
    /** Durable idempotency ledger; draft APIs never accept client edits to it. */
    generationHistory: CinemaGenerationRecord[];
    version: number;
    createdAt: string;
    updatedAt: string;
}
export interface CinemaProjectSummary {
    id: string;
    title: string;
    aspectRatio: CinemaAspectRatio;
    updatedAt: string;
    shotCount: number;
    seconds: number;
}
export interface CinemaPreset {
    id: string;
    title: string;
    description: string;
    brief: string;
    shots: Array<Pick<CinemaShot, "title" | "prompt" | "seconds" | "camera" | "lens" | "lighting" | "notes">>;
}
