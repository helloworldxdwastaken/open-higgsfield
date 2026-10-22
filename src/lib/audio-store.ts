import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { userStorageRoot } from "@/lib/storage-paths";
import type { AudioJob, AudioVoice } from "@/types/audio";

export type StoredVoice = AudioVoice & { backendId: string; sampleId?: string; sampleExtension?: string; presetId?: string; previewOnly?: boolean };
export type StoredAudioJob = AudioJob & { backendId?: string; requestId: string; voiceId?: string; speed: number; sourceExtension?: string; preview?: boolean };
export type AudioStore = { version: 1; voices: StoredVoice[]; jobs: StoredAudioJob[] };
const shared = globalThis as typeof globalThis & { __audioQueues?: Map<string, Promise<unknown>> };
const queues = shared.__audioQueues ??= new Map();

export function audioDirectory(userId: string): string { return path.join(userStorageRoot(userId), "audio"); }
export function audioMediaPath(userId: string, id: string, extension = "wav"): string {
    if (!/^[a-f0-9-]{36}$/.test(id) || !/^(wav|mp3|m4a|ogg|flac|aac|webm|opus)$/.test(extension)) throw new Error("ERR_AUDIO_NOT_FOUND");
    return path.join(audioDirectory(userId), "media", `${id}.${extension}`);
}
export async function readAudioStore(userId: string): Promise<AudioStore> {
    try {
        const value = JSON.parse(await readFile(path.join(audioDirectory(userId), "library.json"), "utf8"));
        if (value.version !== 1 || !Array.isArray(value.voices) || !Array.isArray(value.jobs)) throw new Error("ERR_AUDIO_STORAGE");
        return value;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, voices: [], jobs: [] };
        throw error;
    }
}
export async function withAudioStore<T>(userId: string, operation: (store: AudioStore) => Promise<T>): Promise<T> {
    const previous = queues.get(userId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
        const store = await readAudioStore(userId);
        const result = await operation(store);
        const directory = audioDirectory(userId);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporary = path.join(directory, `.library-${randomUUID()}.tmp`);
        await writeFile(temporary, JSON.stringify(store), { mode: 0o600 });
        await rename(temporary, path.join(directory, "library.json"));
        return result;
    });
    queues.set(userId, current);
    try { return await current; }
    finally { if (queues.get(userId) === current) queues.delete(userId); }
}
export function publicVoice(voice: StoredVoice): AudioVoice {
    const { id, name, description, language, type, createdAt } = voice;
    return { id, name, description, language, type, createdAt };
}
export function publicAudioJob(job: StoredAudioJob): AudioJob {
    const { id, kind, name, text, voiceName, status, duration, createdAt, error } = job;
    return { id, kind, name, text, voiceName, status, duration, createdAt, ...(error ? { error } : {}) };
}
