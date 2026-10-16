import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { BUILTIN_RECIPES, recipeInput, validateRecipe, type SkillRecipe } from "@/lib/skill-catalog";

const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1);
const storedRecipe = recipeInput.extend({ id: z.string().uuid(), version: revision, origin: z.literal("custom") }).strict();
const librarySchema = z.object({ schemaVersion: z.literal(1), revision, recipes: z.array(storedRecipe).max(200), favorites: z.array(z.string().max(80)).max(206) }).strict();
export type SkillLibrary = { schemaVersion: 1; revision: number; recipes: SkillRecipe[]; favorites: string[] };
const mutation = z.discriminatedUnion("action", [
    z.object({ action: z.literal("save"), revision, id: z.string().uuid().optional(), recipe: recipeInput }).strict(),
    z.object({ action: z.literal("remove"), revision, id: z.string().uuid() }).strict(),
    z.object({ action: z.literal("favorite"), revision, id: z.string().min(1).max(80), favorite: z.boolean() }).strict(),
]);
const globals = globalThis as typeof globalThis & { __highfieldSkillQueues?: Map<string, Promise<void>> };
const queues = globals.__highfieldSkillQueues ??= new Map();
function location() {
    const directory = path.resolve(process.env.STUDIO_SETTINGS_DIR || path.join(process.cwd(), "private-settings"));
    return { directory, file: path.join(directory, "skill-library.json") };
}
async function serialized<T>(operation: (target: ReturnType<typeof location>) => Promise<T>): Promise<T> {
    const target = location();
    const current = (queues.get(target.file) || Promise.resolve()).then(() => operation(target));
    queues.set(target.file, current.then(() => undefined, () => undefined));
    return current;
}
async function privateDirectory(directory: string) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("ERR_SKILLS_STORAGE");
    await fs.chmod(directory, 0o700);
}
async function read(target: ReturnType<typeof location>): Promise<SkillLibrary> {
    try {
        await privateDirectory(target.directory);
        const handle = await fs.open(target.file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        try {
            const stat = await handle.stat();
            if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error("ERR_SKILLS_STORAGE");
            await handle.chmod(0o600);
            const parsed = librarySchema.parse(JSON.parse(await handle.readFile("utf8")));
            const ids = new Set(BUILTIN_RECIPES.map(item => item.id));
            for (const item of parsed.recipes) {
                validateRecipe({ name: item.name, description: item.description, mediaType: item.mediaType, template: item.template });
                if (ids.has(item.id)) throw new Error("ERR_SKILLS_STORAGE");
                ids.add(item.id);
            }
            if (new Set(parsed.favorites).size !== parsed.favorites.length || parsed.favorites.some(id => !ids.has(id))) throw new Error("ERR_SKILLS_STORAGE");
            return parsed;
        } finally { await handle.close(); }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, revision: 1, recipes: [], favorites: [] };
        throw new Error("ERR_SKILLS_STORAGE");
    }
}
async function write(target: ReturnType<typeof location>, library: SkillLibrary) {
    const temporary = `${target.file}.${randomUUID()}.tmp`;
    try {
        const body = JSON.stringify(librarySchema.parse(library));
        if (Buffer.byteLength(body) > 1024 * 1024) throw new Error("ERR_SKILLS_STORAGE");
        const handle = await fs.open(temporary, "wx", 0o600);
        try { await handle.writeFile(body); await handle.sync(); } finally { await handle.close(); }
        await fs.rename(temporary, target.file);
    } catch { throw new Error("ERR_SKILLS_STORAGE"); }
    finally { await fs.unlink(temporary).catch(() => {}); }
}
export async function readSkillLibrary(): Promise<SkillLibrary> { return serialized(read); }
export async function mutateSkillLibrary(value: unknown): Promise<SkillLibrary> {
    const parsed = mutation.safeParse(value);
    if (!parsed.success) throw new Error("ERR_SKILLS_VALIDATION");
    const input = parsed.data;
    if (input.action === "save") validateRecipe(input.recipe);
    return serialized(async target => {
        const library = await read(target);
        if (input.revision !== library.revision) throw new Error("ERR_SKILLS_CONFLICT");
        if (input.action === "save") {
            const previous = input.id ? library.recipes.find(item => item.id === input.id) : undefined;
            if (input.id && !previous) throw new Error("ERR_SKILLS_NOT_FOUND");
            if (!previous && library.recipes.length >= 200) throw new Error("ERR_SKILLS_LIMIT");
            const item: SkillRecipe = { ...input.recipe, id: previous?.id || randomUUID(), origin: "custom", version: (previous?.version || 0) + 1 };
            library.recipes = previous ? library.recipes.map(entry => entry.id === item.id ? item : entry) : [...library.recipes, item];
        } else if (input.action === "remove") {
            if (!library.recipes.some(item => item.id === input.id)) throw new Error("ERR_SKILLS_NOT_FOUND");
            library.recipes = library.recipes.filter(item => item.id !== input.id);
            library.favorites = library.favorites.filter(id => id !== input.id);
        } else {
            if (![...BUILTIN_RECIPES, ...library.recipes].some(item => item.id === input.id)) throw new Error("ERR_SKILLS_NOT_FOUND");
            library.favorites = library.favorites.filter(id => id !== input.id);
            if (input.favorite) library.favorites.push(input.id);
        }
        library.revision++;
        await write(target, library);
        return structuredClone(library);
    });
}
