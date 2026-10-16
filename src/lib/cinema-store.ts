import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CinemaAspectRatio, CinemaGeneration, CinemaGenerationRecord, CinemaProject, CinemaProjectSummary, CinemaShot } from "@/types/cinema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RATIOS: CinemaAspectRatio[] = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const MAX_STORE_BYTES = 50 * 1024 * 1024;
const globalStore = globalThis as typeof globalThis & { __highfieldCinemaQueues?: Map<string, Promise<void>> };
if (!globalStore.__highfieldCinemaQueues) globalStore.__highfieldCinemaQueues = new Map();
const queues = globalStore.__highfieldCinemaQueues;

function invalid(): never { throw new Error("ERR_CINEMA_VALIDATION"); }
function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
    return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, allowed: string[]) {
    if (Object.keys(value).some(key => !allowed.includes(key))) invalid();
}
function text(value: unknown, maximum: number): string {
    if (typeof value !== "string" || value.length > maximum || value.includes("\0")) invalid();
    return value;
}
function uuid(value: unknown): string {
    if (typeof value !== "string" || !UUID.test(value)) invalid();
    return value.toLowerCase();
}
function version(value: unknown): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value >= Number.MAX_SAFE_INTEGER) invalid();
    return value;
}
function timestamp(value: unknown): string {
    if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) invalid();
    return value;
}
function aspectRatio(value: unknown): CinemaAspectRatio {
    if (!RATIOS.includes(value as CinemaAspectRatio)) invalid();
    return value as CinemaAspectRatio;
}
function generation(value: unknown): CinemaGeneration {
    const input = record(value);
    fields(input, ["requestId", "fingerprint", "state", "createdAt", "updatedAt", "taskId", "error"]);
    if (typeof input.fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(input.fingerprint)) invalid();
    if (!["submitting", "accepted", "uncertain"].includes(input.state as string)) invalid();
    const output: CinemaGeneration = {
        requestId: uuid(input.requestId), fingerprint: input.fingerprint, state: input.state as CinemaGeneration["state"],
        createdAt: timestamp(input.createdAt), updatedAt: timestamp(input.updatedAt),
    };
    if (input.taskId !== undefined) {
        if (typeof input.taskId !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(input.taskId)) invalid();
        output.taskId = input.taskId;
    }
    if (input.error !== undefined) {
        if (typeof input.error !== "string" || input.error.length > 200 || !/^ERR_[A-Z0-9_]+$/.test(input.error)) invalid();
        output.error = input.error;
    }
    return output;
}
function history(value: unknown): CinemaGenerationRecord[] {
    if (!Array.isArray(value) || value.length > 256) invalid();
    const ids = new Set<string>();
    return value.map(raw => {
        const input = record(raw);
        const { shotId, mediaType, ...job } = input;
        if (mediaType !== "image" && mediaType !== "video") invalid();
        const valid = generation(job);
        if (ids.has(valid.requestId)) invalid();
        ids.add(valid.requestId);
        return { ...valid, shotId: uuid(shotId), mediaType };
    });
}
function shot(value: unknown, trusted: boolean): CinemaShot {
    const input = record(value);
    fields(input, ["id", "title", "prompt", "seconds", "camera", "lens", "lighting", "notes", "image", "video"]);
    if (typeof input.seconds !== "number" || !Number.isInteger(input.seconds) || input.seconds < 1 || input.seconds > 30) invalid();
    const output: CinemaShot = {
        id: uuid(input.id), title: text(input.title, 120), prompt: text(input.prompt, 4000), seconds: input.seconds,
        camera: text(input.camera, 160), lens: text(input.lens, 160), lighting: text(input.lighting, 160), notes: text(input.notes, 2000),
    };
    if (trusted && input.image !== undefined) output.image = generation(input.image);
    if (trusted && input.video !== undefined) output.video = generation(input.video);
    return output;
}
function shots(value: unknown, trusted: boolean): CinemaShot[] {
    if (!Array.isArray(value) || value.length > 24) invalid();
    const ids = new Set<string>();
    return value.map(input => {
        const valid = shot(input, trusted);
        if (ids.has(valid.id)) invalid();
        ids.add(valid.id);
        return valid;
    });
}
function project(value: unknown): CinemaProject {
    const input = record(value);
    fields(input, ["id", "userId", "title", "brief", "aspectRatio", "shots", "generationHistory", "version", "createdAt", "updatedAt"]);
    return {
        id: uuid(input.id), userId: typeof input.userId === "string" && input.userId ? text(input.userId, 128) : "", title: text(input.title, 120), brief: text(input.brief, 12000), aspectRatio: aspectRatio(input.aspectRatio),
        shots: shots(input.shots, true), generationHistory: history(input.generationHistory), version: version(input.version),
        createdAt: timestamp(input.createdAt), updatedAt: timestamp(input.updatedAt),
    };
}
function storage() {
    const directory = path.resolve(process.env.STUDIO_SETTINGS_DIR || path.join(process.cwd(), "private-settings"));
    return { directory, file: path.join(directory, "cinema-projects.json") };
}
async function serialized<T>(operation: (location: ReturnType<typeof storage>) => Promise<T>): Promise<T> {
    const location = storage();
    const previous = queues.get(location.file) || Promise.resolve();
    const current = previous.then(() => operation(location));
    queues.set(location.file, current.then(() => undefined, () => undefined));
    return current;
}
async function privateDirectory(directory: string) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("ERR_CINEMA_STORAGE");
    await fs.chmod(directory, 0o700);
}
async function read(location: ReturnType<typeof storage>): Promise<CinemaProject[]> {
    try {
        await privateDirectory(location.directory);
        const handle = await fs.open(location.file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        try {
            const stat = await handle.stat();
            if (!stat.isFile() || stat.size > MAX_STORE_BYTES) throw new Error("ERR_CINEMA_STORAGE");
            await handle.chmod(0o600);
            const parsed = record(JSON.parse(await handle.readFile("utf8")));
            fields(parsed, ["schemaVersion", "projects"]);
            if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.projects) || parsed.projects.length > 50) invalid();
            const ids = new Set<string>();
            return parsed.projects.map(raw => {
                const valid = project(raw);
                if (ids.has(valid.id)) invalid();
                ids.add(valid.id);
                return valid;
            });
        } finally { await handle.close(); }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw new Error("ERR_CINEMA_STORAGE");
    }
}
async function write(location: ReturnType<typeof storage>, projects: CinemaProject[]): Promise<void> {
    const temporary = `${location.file}.${randomUUID()}.tmp`;
    try {
        await privateDirectory(location.directory);
        const body = JSON.stringify({ schemaVersion: 1, projects });
        if (Buffer.byteLength(body) > MAX_STORE_BYTES) throw new Error("ERR_CINEMA_STORAGE");
        const handle = await fs.open(temporary, "wx", 0o600);
        try { await handle.writeFile(body, "utf8"); await handle.sync(); }
        finally { await handle.close(); }
        await fs.rename(temporary, location.file);
    } catch { throw new Error("ERR_CINEMA_STORAGE"); }
    finally { await fs.unlink(temporary).catch(() => {}); }
}
function busyJob(job: CinemaGeneration | undefined): boolean {
    return job?.state === "submitting" || job?.state === "uncertain";
}
function busyShot(project: CinemaProject, id: string): boolean {
    const old = project.shots.find(shot => shot.id === id);
    return busyJob(old?.image) || busyJob(old?.video) || project.generationHistory.some(item => item.shotId === id && busyJob(item));
}
function assertDraftCompatible(previous: CinemaProject, next: CinemaProject) {
    // The idempotency ledger is append/update only, including after a shot is removed.
    for (const original of previous.generationHistory) {
        const saved = next.generationHistory.find(entry => entry.requestId === original.requestId);
        if (!saved || saved.shotId !== original.shotId || saved.mediaType !== original.mediaType || saved.fingerprint !== original.fingerprint || saved.createdAt !== original.createdAt) invalid();
    }
    const protectedFields: Array<keyof CinemaShot> = ["prompt", "seconds", "camera", "lens", "lighting", "notes"];
    for (const old of previous.shots) {
        if (!busyShot(previous, old.id)) continue;
        const updated = next.shots.find(item => item.id === old.id);
        if (!updated || previous.aspectRatio !== next.aspectRatio || protectedFields.some(field => old[field] !== updated[field])) throw new Error("ERR_CINEMA_BUSY");
    }
}
function checkVersion(current: CinemaProject, expected: number | undefined) {
    if (expected !== undefined && version(expected) !== current.version) throw new Error("ERR_CINEMA_VERSION_CONFLICT");
}
function find(projects: CinemaProject[], id: string): CinemaProject {
    const found = projects.find(entry => entry.id === uuid(id));
    if (!found) throw new Error("ERR_CINEMA_NOT_FOUND");
    return found;
}
function copy<T>(value: T): T { return structuredClone(value); }

export async function listCinemaProjects(userId: string): Promise<CinemaProjectSummary[]> {
    if (!userId || userId.length > 128) invalid();
    return serialized(async location => (await read(location)).filter(entry => entry.userId === userId).map(entry => ({
        id: entry.id, title: entry.title, aspectRatio: entry.aspectRatio, updatedAt: entry.updatedAt,
        shotCount: entry.shots.length, seconds: entry.shots.reduce((total, shot) => total + shot.seconds, 0),
    })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}
export async function getCinemaProject(id: string, userId: string): Promise<CinemaProject | undefined> {
    id = uuid(id);
    if (!userId || userId.length > 128) invalid();
    return serialized(async location => (await read(location)).find(entry => entry.id === id && entry.userId === userId));
}
export async function createCinemaProject(input: { title?: string; brief?: string; aspectRatio?: CinemaAspectRatio }, userId: string): Promise<CinemaProject> {
    if (!userId || userId.length > 128) invalid();
    const values = record(input);
    fields(values, ["title", "brief", "aspectRatio"]);
    const title = values.title === undefined ? "Untitled project" : text(values.title, 120).trim() || "Untitled project";
    const brief = values.brief === undefined ? "" : text(values.brief, 12000);
    const ratio = values.aspectRatio === undefined ? "16:9" : aspectRatio(values.aspectRatio);
    return serialized(async location => {
        const projects = await read(location);
        if (projects.length >= 50) throw new Error("ERR_CINEMA_LIMIT");
        const now = new Date().toISOString();
        const created: CinemaProject = { id: randomUUID(), userId, title, brief, aspectRatio: ratio, shots: [], generationHistory: [], version: 1, createdAt: now, updatedAt: now };
        await write(location, [...projects, created]);
        return copy(created);
    });
}
export async function mutateCinemaProject(id: string, expectedVersion: number | undefined, transform: (project: CinemaProject) => CinemaProject, userId: string): Promise<CinemaProject> {
    id = uuid(id);
    if (expectedVersion !== undefined) version(expectedVersion);
    if (typeof transform !== "function") invalid();
    return serialized(async location => {
        const projects = await read(location);
        const previous = find(projects.filter(entry => entry.userId === userId), id);
        checkVersion(previous, expectedVersion);
        const transformed = project(transform(copy(previous)));
        if (transformed.id !== previous.id || transformed.createdAt !== previous.createdAt || transformed.version !== previous.version) invalid();
        assertDraftCompatible(previous, transformed);
        const next = { ...transformed, version: previous.version + 1, updatedAt: new Date().toISOString() };
        await write(location, projects.map(entry => entry.id === id ? next : entry));
        return copy(next);
    });
}
export async function updateCinemaProject(id: string, expectedVersion: number, input: { title: string; brief: string; aspectRatio: CinemaAspectRatio; shots: CinemaShot[] }, userId: string): Promise<CinemaProject> {
    version(expectedVersion);
    const values = record(input);
    // Draft callers can round-trip a returned project; all server-owned values are ignored.
    fields(values, ["userId", "title", "brief", "aspectRatio", "shots", "generationHistory", "id", "version", "createdAt", "updatedAt"]);
    const title = text(values.title, 120);
    const brief = text(values.brief, 12000);
    const ratio = aspectRatio(values.aspectRatio);
    const drafts = shots(values.shots, false);
    return mutateCinemaProject(id, expectedVersion, previous => ({
        ...previous, title, brief, aspectRatio: ratio,
        shots: drafts.map(draft => {
            const saved = previous.shots.find(entry => entry.id === draft.id);
            return { ...draft, ...(saved?.image ? { image: saved.image } : {}), ...(saved?.video ? { video: saved.video } : {}) };
        }),
    }), userId);
}
export async function deleteCinemaProject(id: string, expectedVersion: number, userId: string): Promise<void> {
    id = uuid(id); version(expectedVersion);
    await serialized(async location => {
        const projects = await read(location);
        const current = find(projects.filter(entry => entry.userId === userId), id);
        checkVersion(current, expectedVersion);
        if (current.shots.some(shot => busyJob(shot.image) || busyJob(shot.video)) || current.generationHistory.some(busyJob)) throw new Error("ERR_CINEMA_BUSY");
        await write(location, projects.filter(entry => entry.id !== id));
    });
}
