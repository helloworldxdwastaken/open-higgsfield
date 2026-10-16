import { readdir, stat } from "fs/promises";
import path from "path";
import { userStorageRoot, USER_STORAGE_ID_PATTERN, USER_STORAGE_LIMIT_BYTES } from "@/lib/storage-paths";

export async function getUserStorageUsage(userId: string): Promise<number> {
    if (!USER_STORAGE_ID_PATTERN.test(userId)) return 0;
    let entries;
    try { entries = await readdir(userStorageRoot(userId), { withFileTypes: true }); }
    catch { return 0; }

    const sizes = await Promise.all(entries.map(async entry => {
        if (entry.isSymbolicLink()) return 0;
        const entryPath = path.join(userStorageRoot(userId), entry.name);
        if (entry.isFile()) return (await stat(entryPath, { bigint: false })).size;
        if (entry.isDirectory()) return getUserStorageUsageDirectory(entryPath);
        return 0;
    }));
    return sizes.reduce((total, size) => total + size, 0);
}

async function getUserStorageUsageDirectory(directory: string): Promise<number> {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch { return 0; }
    const sizes = await Promise.all(entries.map(async entry => {
        if (entry.isSymbolicLink()) return 0;
        const entryPath = path.join(directory, entry.name);
        if (entry.isFile()) return (await stat(entryPath)).size;
        if (entry.isDirectory()) return getUserStorageUsageDirectory(entryPath);
        return 0;
    }));
    return sizes.reduce((total, size) => total + size, 0);
}

const reservationQueues = new Map<string, Promise<unknown>>();
const g = globalThis as typeof globalThis & { __userStorageQueues?: Map<string, Promise<unknown>> };
if (!g.__userStorageQueues) g.__userStorageQueues = reservationQueues;
const globalQueues = g.__userStorageQueues;

export async function withUserStorageQuota<Value>(userId: string, incomingBytes: number, operation: () => Promise<Value>): Promise<Value> {
    if (!USER_STORAGE_ID_PATTERN.test(userId)) return operation();
    if (!Number.isSafeInteger(incomingBytes) || incomingBytes < 0) throw new Error("ERR_INVALID_STORAGE_SIZE");

    const previous = globalQueues.get(userId) ?? Promise.resolve();
    const result = previous.then(async () => {
        const currentUsage = await getUserStorageUsage(userId);
        if (currentUsage + incomingBytes > USER_STORAGE_LIMIT_BYTES) throw new Error("ERR_STORAGE_QUOTA_EXCEEDED");
        return operation();
    });
    globalQueues.set(userId, result.catch(() => {}));
    return result;
}
