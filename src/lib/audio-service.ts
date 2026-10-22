import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { audioDirectory, audioMediaPath, publicAudioJob, publicVoice, readAudioStore, withAudioStore, type StoredAudioJob, type StoredVoice } from "@/lib/audio-store";
import { withUserStorageQuota } from "@/lib/user-storage";
import type { AudioDashboard, AudioPreset } from "@/types/audio";

const LANGUAGES = new Set(["en", "zh", "ja", "ko", "de", "fr", "ru", "pt", "es", "it", "he", "ar", "da", "el", "fi", "hi", "ms", "nl", "no", "pl", "sv", "sw", "tr"]);
const MAX_MEDIA = 50 * 1024 * 1024;
const workers = globalThis as typeof globalThis & { __audioWorkers?: Map<string, Promise<void>> };
const active = workers.__audioWorkers ??= new Map();

async function engine(endpoint: string, init?: RequestInit): Promise<Response> {
    const base = process.env.HIGHFIELD_VOICEBOX_URL;
    if (!base) throw new Error("ERR_AUDIO_ENGINE_OFFLINE");
    try {
        const response = await fetch(new URL(endpoint, base), { ...init, cache: "no-store", signal: AbortSignal.timeout(init?.method && init.method !== "GET" ? 240_000 : 10_000), headers: { Accept: "application/json", Origin: process.env.STUDIO_PUBLIC_ORIGIN || new URL(base).origin, ...init?.headers } });
        if (response.status === 404 && init?.method === "DELETE") return response;
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(response.status === 400 || response.status === 422 ? "ERR_AUDIO_INPUT" : "ERR_AUDIO_ENGINE");
        }
        return response;
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("ERR_AUDIO_")) throw error;
        throw new Error("ERR_AUDIO_ENGINE_OFFLINE");
    }
}
async function engineJson(endpoint: string, body?: unknown, method = "POST") {
    return (await engine(endpoint, body === undefined ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
}
async function boundedBytes(response: Response): Promise<Buffer> {
    if (Number(response.headers.get("content-length") || 0) > MAX_MEDIA) throw new Error("ERR_AUDIO_FILE_LIMIT");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("ERR_AUDIO_ENGINE");
    const parts: Uint8Array[] = []; let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            length += value.length;
            if (length > MAX_MEDIA) throw new Error("ERR_AUDIO_FILE_LIMIT");
            parts.push(value);
        }
    } finally { await reader.cancel().catch(() => {}); }
    return Buffer.concat(parts, length);
}
function language(value: unknown, detect = false): string {
    if (detect && (!value || value === "auto")) return "auto";
    if (typeof value !== "string" || !LANGUAGES.has(value)) throw new Error("ERR_AUDIO_INPUT");
    return value;
}
function text(value: unknown, maximum: number, optional = false): string {
    if (optional && !value) return "";
    if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) throw new Error("ERR_AUDIO_INPUT");
    return value.trim();
}
function requestId(value: unknown): string {
    if (typeof value !== "string" || !/^[a-f0-9-]{36}$/i.test(value)) throw new Error("ERR_AUDIO_INPUT");
    return value;
}
export async function audioEngines(): Promise<AudioDashboard["engines"]> {
    try {
        const data = await engineJson("/models/status");
        const models: { model_name: string; downloaded?: boolean; is_downloaded?: boolean }[] = data.models ?? [];
        const ready = (id: string) => models.some(m => m.model_name === id && (m.downloaded || m.is_downloaded));
        return { online: true, speech: ready("kokoro"), cloning: ready("chatterbox-tts"), transcription: ready("whisper-base") };
    } catch { return { online: false, speech: false, cloning: false, transcription: false }; }
}
export async function audioPresets(): Promise<AudioPreset[]> {
    try {
        const data = await engineJson("/profiles/presets/kokoro");
        return (data.voices ?? []).map((v: { voice_id: string; name: string; gender: string; language: string }) => ({ id: v.voice_id, name: v.name, gender: v.gender, language: v.language }));
    } catch { return []; }
}
async function saveMedia(userId: string, id: string, bytes: Buffer, extension = "wav") {
    await withUserStorageQuota(userId, bytes.length, async () => {
        await mkdir(path.join(audioDirectory(userId), "media"), { recursive: true, mode: 0o700 });
        await writeFile(audioMediaPath(userId, id, extension), bytes, { mode: 0o600, flag: "wx" });
    });
}
async function changeSpeed(bytes: Buffer, speed: number): Promise<Buffer> {
    if (speed === 1) return bytes;
    return new Promise((resolve, reject) => {
        const process = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-filter:a", `atempo=${speed}`, "-f", "wav", "pipe:1"], { stdio: ["pipe", "pipe", "ignore"] });
        const parts: Buffer[] = []; let length = 0;
        const timer = setTimeout(() => { process.kill(); reject(new Error("ERR_AUDIO_ENGINE")); }, 30_000);
        process.on("error", () => { clearTimeout(timer); reject(new Error("ERR_AUDIO_ENGINE")); });
        process.stdout.on("data", (chunk: Buffer) => { length += chunk.length; if (length > MAX_MEDIA) { process.kill(); reject(new Error("ERR_AUDIO_FILE_LIMIT")); } else parts.push(chunk); });
        process.on("close", code => { clearTimeout(timer); if (code === 0) resolve(Buffer.concat(parts)); else reject(new Error("ERR_AUDIO_ENGINE")); });
        process.stdin.on("error", () => {});
        process.stdin.end(bytes);
    });
}
async function failJob(userId: string, id: string, error: unknown) {
    await withAudioStore(userId, async store => {
        const job = store.jobs.find(j => j.id === id);
        if (job && job.status === "processing") { job.status = "failed"; job.error = error instanceof Error && error.message === "ERR_STORAGE_QUOTA_EXCEEDED" ? "Your workspace storage is full." : "The audio engine could not finish this request. Please try again."; }
    });
}
async function refreshSpeechJob(userId: string, job: StoredAudioJob): Promise<void> {
    if (!job.backendId) return;
    const result = await engineJson(`/history/${encodeURIComponent(job.backendId)}`);
    if (result.status === "failed") { await failJob(userId, job.id, null); return; }
    if (result.status !== "completed") return;
    const bytes = await changeSpeed(await boundedBytes(await engine(`/audio/${encodeURIComponent(job.backendId)}`)), job.speed);
    try { await saveMedia(userId, job.id, bytes); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    await withAudioStore(userId, async store => {
        const current = store.jobs.find(j => j.id === job.id);
        if (current) { current.status = "completed"; current.duration = Number(result.duration || 0) / job.speed; }
    });
}
function runWorker(key: string, task: () => Promise<void>): Promise<void> {
    const previous = active.get(key); if (previous) return previous;
    const promise = task().finally(() => active.delete(key));
    active.set(key, promise); return promise;
}
export async function getAudioDashboard(userId: string): Promise<AudioDashboard> {
    let store = await readAudioStore(userId);
    await Promise.all(store.jobs.filter(j => j.kind === "speech" && j.status === "processing" && j.backendId).slice(0, 10).map(job => runWorker(`${userId}:${job.id}`, async () => {
        try { await refreshSpeechJob(userId, job); } catch { /* Keep a recoverable job when the engine is temporarily offline. */ }
    })));
    // A stopped process cannot resume a synchronous transcription. Preserve its input and expose a clear failed state.
    for (const job of store.jobs.filter(j => j.status === "processing" && Date.now() - Date.parse(j.createdAt) > 20 * 60_000)) {
        if (!active.has(`${userId}:${job.id}`)) await failJob(userId, job.id, null);
    }
    store = await readAudioStore(userId);
    const [presets, engines] = await Promise.all([audioPresets(), audioEngines()]);
    return { voices: store.voices.filter(voice => !voice.previewOnly).map(publicVoice), jobs: [...store.jobs].reverse().filter(job => !job.preview).map(publicAudioJob), presets, engines };
}
export async function generateAudio(userId: string, input: Record<string, unknown>, preview = false) {
    const content = text(input.text, 5000); const lang = language(input.language);
    const key = requestId(input.requestId); const speed = Number(input.speed ?? 1);
    if (!Number.isFinite(speed) || speed < 0.7 || speed > 1.2) throw new Error("ERR_AUDIO_INPUT");
    const ready = await audioEngines();
    return withAudioStore(userId, async store => {
        const previous = store.jobs.find(j => j.requestId === key); if (previous) return publicAudioJob(previous);
        if (store.jobs.filter(j => j.status === "processing").length >= 3) throw new Error("ERR_AUDIO_BUSY");
        if (store.jobs.length >= 2000) throw new Error("ERR_AUDIO_LIBRARY_LIMIT");
        let voice = store.voices.find(v => v.id === input.voiceId);
        if (!voice && typeof input.presetId === "string") {
            const preset = (await audioPresets()).find(p => p.id === input.presetId);
            if (!preset || preset.language !== lang || !ready.speech) throw new Error("ERR_AUDIO_INPUT");
            voice = store.voices.find(v => v.presetId === preset.id);
            if (!voice) {
                const result = await engineJson("/profiles", { name: preset.name, language: lang, voice_type: "preset", preset_engine: "kokoro", preset_voice_id: preset.id, default_engine: "kokoro" });
                voice = { id: randomUUID(), backendId: result.id, name: preset.name, description: "Local preset voice", language: lang, type: "preset", presetId: preset.id, createdAt: new Date().toISOString(), previewOnly: preview };
                store.voices.push(voice);
            }
        }
        if (!voice) throw new Error("ERR_AUDIO_NOT_FOUND");
        if (!preview) voice.previewOnly = false;
        if (voice.type === "cloned" && !ready.cloning) throw new Error("ERR_AUDIO_MODEL_NOT_READY");
        if (voice.type === "preset" && !ready.speech) throw new Error("ERR_AUDIO_MODEL_NOT_READY");
        if (voice.type === "preset" && voice.language !== lang) throw new Error("ERR_AUDIO_INPUT");
        const result = await engineJson("/generate", { profile_id: voice.backendId, text: content, language: lang, engine: voice.type === "cloned" ? "chatterbox" : "kokoro", normalize: input.normalize !== false });
        const job: StoredAudioJob = { id: randomUUID(), backendId: result.id, requestId: key, voiceId: voice.id, kind: "speech", name: content.slice(0, 70), text: content, voiceName: voice.name, status: "processing", duration: 0, speed, createdAt: new Date().toISOString(), ...(preview ? { preview: true } : {}) };
        store.jobs.push(job);
        return publicAudioJob(job);
    });
}
export async function getAudioJob(userId: string, id: string) {
    let job = (await readAudioStore(userId)).jobs.find(j => j.id === id);
    if (!job) throw new Error("ERR_AUDIO_NOT_FOUND");
    if (job.kind === "speech" && job.status === "processing") {
        const current = job;
        await runWorker(`${userId}:${id}`, async () => { await refreshSpeechJob(userId, current); });
        job = (await readAudioStore(userId)).jobs.find(j => j.id === id)!;
    }
    return publicAudioJob(job);
}
export async function previewAudio(userId: string, input: Record<string, unknown>) {
    if (typeof input.voiceId === "string") {
        const voice = (await readAudioStore(userId)).voices.find(v => v.id === input.voiceId);
        if (!voice) throw new Error("ERR_AUDIO_NOT_FOUND");
        if (voice.type === "cloned") return { url: `/api/audio/${voice.id}/media?kind=voice` };
        input = { presetId: voice.presetId };
    }
    const preset = (await audioPresets()).find(p => p.id === input.presetId);
    if (!preset) throw new Error("ERR_AUDIO_NOT_FOUND");
    const digest = createHash("sha256").update(`preview-v1:${preset.id}`).digest("hex");
    const key = `${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20,32)}`;
    const previous = (await readAudioStore(userId)).jobs.find(j => j.requestId === key);
    if (previous?.status === "failed") await deleteAudio(userId, previous.id, "job");
    const samples: Record<string, string> = { en: `Hi, I'm ${preset.name}. Every story begins with a voice. This is a preview of mine.`, es: "Hola, esta es una muestra de mi voz. Cada historia comienza con una voz.", fr: "Bonjour, voici un aperçu de ma voix. Chaque histoire commence par une voix.", it: "Ciao, questa è un'anteprima della mia voce. Ogni storia inizia con una voce.", pt: "Olá, esta é uma amostra da minha voz. Toda história começa com uma voz.", ja: "こんにちは。これは私の声のサンプルです。", zh: "你好，这是我的声音示例。每一个故事都从声音开始。", hi: "नमस्ते, यह मेरी आवाज़ का एक नमूना है।" };
    const job = await generateAudio(userId, { presetId: preset.id, text: samples[preset.language] || samples.en, language: preset.language, speed: 1, requestId: key }, true);
    return { job };
}
export async function createAudioVoice(userId: string, form: FormData) {
    const name = text(form.get("name"), 100); const description = text(form.get("description"), 500, true);
    const lang = language(form.get("language")); const referenceText = text(form.get("referenceText"), 1000, true);
    if (form.get("consent") !== "true") throw new Error("ERR_AUDIO_CONSENT");
    const file = audioFile(form);
    if (!(await audioEngines()).cloning) throw new Error("ERR_AUDIO_MODEL_NOT_READY");
    return withAudioStore(userId, async store => {
        if (store.voices.length >= 200) throw new Error("ERR_AUDIO_LIBRARY_LIMIT");
        const id = randomUUID(); const extension = file.name.split(".").pop()!.toLowerCase();
        const result = await engineJson("/profiles", { name, description, language: lang, voice_type: "cloned", default_engine: "chatterbox" });
        try {
            const sample = new FormData(); sample.set("file", file); sample.set("reference_text", referenceText || "Voice reference sample.");
            const uploaded = await (await engine(`/profiles/${encodeURIComponent(result.id)}/samples`, { method: "POST", body: sample })).json();
            await saveMedia(userId, id, Buffer.from(await file.arrayBuffer()), extension);
            const voice: StoredVoice = { id, backendId: result.id, sampleId: uploaded.id, sampleExtension: extension, name, description, language: lang, type: "cloned", createdAt: new Date().toISOString() };
            store.voices.push(voice); return publicVoice(voice);
        } catch (error) {
            await engine(`/profiles/${encodeURIComponent(result.id)}`, { method: "DELETE" }).catch(() => {});
            await unlink(audioMediaPath(userId, id, extension)).catch(() => {});
            throw error;
        }
    });
}
export function audioFile(form: FormData): File {
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 25 * 1024 * 1024 || !/\.(wav|mp3|m4a|ogg|flac|aac|webm|opus)$/i.test(file.name)) throw new Error("ERR_AUDIO_FILE");
    return file;
}
export async function transcribeAudio(userId: string, form: FormData) {
    const file = audioFile(form); const lang = language(form.get("language"), true); const key = requestId(form.get("requestId"));
    if (!(await audioEngines()).transcription) throw new Error("ERR_AUDIO_MODEL_NOT_READY");
    const job = await withAudioStore(userId, async store => {
        const previous = store.jobs.find(j => j.requestId === key); if (previous) return previous;
        if (store.jobs.filter(j => j.status === "processing").length >= 3) throw new Error("ERR_AUDIO_BUSY");
        if (store.jobs.length >= 2000) throw new Error("ERR_AUDIO_LIBRARY_LIMIT");
        const id = randomUUID(); const extension = file.name.split(".").pop()!.toLowerCase();
        await saveMedia(userId, id, Buffer.from(await file.arrayBuffer()), extension);
        const job: StoredAudioJob = { id, kind: "transcript", requestId: key, name: file.name.slice(0, 180), text: "", voiceName: "", status: "processing", duration: 0, speed: 1, sourceExtension: extension, createdAt: new Date().toISOString() };
        store.jobs.push(job); return job;
    });
    if (job.status !== "processing") return publicAudioJob(job);
    await runWorker(`${userId}:${job.id}`, async () => {
        try {
            const upload = new FormData(); upload.set("file", file); upload.set("model", "base"); if (lang !== "auto") upload.set("language", lang);
            const result = await (await engine("/transcribe", { method: "POST", body: upload })).json();
            await withAudioStore(userId, async store => { const current = store.jobs.find(j => j.id === job.id); if (current) { current.status = "completed"; current.text = String(result.text ?? "").slice(0, 100000); current.duration = Number(result.duration || 0); } });
        } catch (error) { await failJob(userId, job.id, error); }
    });
    return publicAudioJob((await readAudioStore(userId)).jobs.find(j => j.id === job.id)!);
}
export async function audioMedia(userId: string, id: string, kind: string) {
    const store = await readAudioStore(userId);
    if (kind === "voice") {
        const voice = store.voices.find(v => v.id === id);
        if (!voice?.sampleId) throw new Error("ERR_AUDIO_NOT_FOUND");
        if (voice.sampleExtension) return { bytes: await readFile(audioMediaPath(userId, id, voice.sampleExtension)), extension: voice.sampleExtension };
        return { bytes: await boundedBytes(await engine(`/samples/${encodeURIComponent(voice.sampleId)}`)), extension: "wav" };
    }
    const job = store.jobs.find(j => j.id === id);
    if (!job || (job.kind === "speech" && job.status !== "completed")) throw new Error("ERR_AUDIO_NOT_FOUND");
    const extension = job.sourceExtension || "wav";
    try { return { bytes: await readFile(audioMediaPath(userId, id, extension)), extension }; }
    catch { throw new Error("ERR_AUDIO_NOT_FOUND"); }
}
export async function deleteAudio(userId: string, id: string, kind: string) {
    return withAudioStore(userId, async store => {
        if (kind === "voice") {
            const voice = store.voices.find(v => v.id === id); if (!voice) throw new Error("ERR_AUDIO_NOT_FOUND");
            if (store.jobs.some(j => j.voiceId === id && j.status === "processing")) throw new Error("ERR_AUDIO_BUSY");
            // Materialize completed jobs before deleting their upstream profile and samples.
            await engine(`/profiles/${encodeURIComponent(voice.backendId)}`, { method: "DELETE" });
            if (voice.sampleExtension) await unlink(audioMediaPath(userId, id, voice.sampleExtension)).catch(error => { if (error.code !== "ENOENT") throw error; });
            store.voices = store.voices.filter(v => v.id !== id);
        } else {
            const job = store.jobs.find(j => j.id === id); if (!job) throw new Error("ERR_AUDIO_NOT_FOUND");
            if (job.status === "processing") throw new Error("ERR_AUDIO_BUSY");
            if (job.backendId) await engine(`/history/${encodeURIComponent(job.backendId)}`, { method: "DELETE" });
            await unlink(audioMediaPath(userId, id, job.sourceExtension || "wav")).catch(error => { if (error.code !== "ENOENT") throw error; });
            store.jobs = store.jobs.filter(j => j.id !== id);
        }
    });
}
export async function editTranscript(userId: string, id: string, value: unknown) {
    const content = text(value, 100000);
    return withAudioStore(userId, async store => {
        const job = store.jobs.find(j => j.id === id && j.kind === "transcript" && j.status === "completed");
        if (!job) throw new Error("ERR_AUDIO_NOT_FOUND");
        job.text = content; return publicAudioJob(job);
    });
}
