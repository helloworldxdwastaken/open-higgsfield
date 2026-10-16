import path from "node:path";

export const STORAGE_ROOT = process.env.OPEN_HIGGSFIELD_STORAGE_DIR
    ? path.resolve(process.env.OPEN_HIGGSFIELD_STORAGE_DIR)
    : process.env.VERCEL
        ? path.join("/tmp", "open-higgsfield")
        : process.cwd();

export const USER_STORAGE_ID_PATTERN = /^[a-f0-9]{16,64}$/i;

export function userStorageRoot(userId: string): string {
    if (!USER_STORAGE_ID_PATTERN.test(userId)) throw new Error("INVALID_STORAGE_USER");
    return path.join(STORAGE_ROOT, "users", userId);
}

export function userUploadsDir(userId: string): string {
    return path.join(userStorageRoot(userId), "uploads");
}

export function userDownloadsDir(userId: string): string {
    return path.join(userStorageRoot(userId), "downloads");
}
