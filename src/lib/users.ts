import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getSql } from "@/lib/database-client";
import { readdir, stat } from "fs/promises";
import path from "path";
import { userStorageRoot } from "@/lib/storage-paths";

const scrypt = promisify(scryptCb) as (p: string | Buffer, s: string | Buffer, k: number) => Promise<Buffer>;

let schemaPromise: Promise<void> | null = null;

export type PlatformUser = {
    id: string;
    email: string;
    role: "admin" | "user";
    active: boolean;
    created_at: string;
};

export type SessionUser = PlatformUser & { sessionId: string };


async function directorySize(directory: string): Promise<number> {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch { return 0; }
    const sizes = await Promise.all(entries.map(async entry => {
        if (entry.isSymbolicLink()) return 0;
        const entryPath = path.join(directory, entry.name);
        if (entry.isFile()) return (await stat(entryPath)).size;
        if (entry.isDirectory()) return directorySize(entryPath);
        return 0;
    }));
    return sizes.reduce((total, size) => total + size, 0);
}

async function ensureSchema(): Promise<void> {
    if (!schemaPromise) {
        schemaPromise = (async () => {
            const sql = getSql();
            await sql`
                DO $$
                BEGIN
                    CREATE TABLE platform_users (
                        id TEXT PRIMARY KEY,
                        email TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL,
                        role TEXT NOT NULL DEFAULT 'user',
                        active BOOLEAN NOT NULL DEFAULT true,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                EXCEPTION WHEN duplicate_table THEN NULL; END
                $$`;
            await sql`
                DO $$
                BEGIN
                    CREATE TABLE platform_sessions (
                        token TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        expires_at TIMESTAMPTZ NOT NULL
                    );
                EXCEPTION WHEN duplicate_table THEN NULL; END
                $$`;
        })();
    }
    await schemaPromise;
}

export async function countUsers(): Promise<number> {
    await ensureSchema();
    const rows = await getSql()`SELECT COUNT(*)::int AS count FROM platform_users`;
    return Number(rows[0]?.count ?? 0);
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derived = await scrypt(password, salt, 64);
    return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const [scheme, salt, hash] = stored.split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const derived = await scrypt(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export async function createUser(email: string, password: string, role: "admin" | "user" = "user"): Promise<PlatformUser> {
    await ensureSchema();
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("INVALID_EMAIL");
    if (password.length < 8) throw new Error("WEAK_PASSWORD");
    const passwordHash = await hashPassword(password);
    const id = randomBytes(16).toString("hex");
    const rows = await getSql()`
        INSERT INTO platform_users (id, email, password_hash, role)
        VALUES (${id}, ${normalized}, ${passwordHash}, ${role})
        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
        RETURNING id, email, role, active, created_at`;
    return rows[0] as PlatformUser;
}

export async function getUserByEmail(email: string): Promise<(PlatformUser & { password_hash: string }) | null> {
    await ensureSchema();
    const rows = await getSql()`SELECT id, email, password_hash, role, active, created_at FROM platform_users WHERE email = ${email.trim().toLowerCase()}`;
    return (rows[0] as (PlatformUser & { password_hash: string }) | undefined) ?? null;
}

export async function listUsers(): Promise<Array<PlatformUser & { storage_used: number }>> {
    await ensureSchema();
    const rows = await getSql()`
        SELECT u.id, u.email, u.role, u.active, u.created_at,
               0 AS storage_used
        FROM platform_users u
        LEFT JOIN generation_tasks t ON t.user_id = u.id
        GROUP BY u.id
        ORDER BY u.created_at ASC`;
    return Promise.all((rows as PlatformUser[]).map(async row => ({
        ...row,
        storage_used: await directorySize(userStorageRoot(row.id)),
    })));
}

export async function setUserActive(userId: string, active: boolean): Promise<void> {
    await ensureSchema();
    await getSql()`UPDATE platform_users SET active = ${active} WHERE id = ${userId}`;
}

export const SESSION_COOKIE = "hf_session";
const SESSION_TTL_DAYS = 30;

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
    await ensureSchema();
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    await getSql()`INSERT INTO platform_sessions (token, user_id, expires_at) VALUES (${token}, ${userId}, ${expiresAt})`;
    return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
    await ensureSchema();
    await getSql()`DELETE FROM platform_sessions WHERE token = ${token}`;
}

export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
    if (!token) return null;
    await ensureSchema();
    const rows = await getSql()`
        SELECT u.id, u.email, u.role, u.active, u.created_at, s.token AS session_id, s.expires_at
        FROM platform_sessions s
        JOIN platform_users u ON u.id = s.user_id
        WHERE s.token = ${token}`;
    const row = rows[0] as (Omit<PlatformUser, "created_at"> & { created_at: string; session_id: string; expires_at: string }) | undefined;
    if (!row) return null;
    if (!row.active || new Date(row.expires_at).getTime() < Date.now()) return null;
    return { id: row.id, email: row.email, role: row.role as "admin" | "user", active: row.active, created_at: row.created_at, sessionId: row.session_id };
}

export async function getRequestSessionUser(request: Request): Promise<SessionUser | null> {
    return getSessionUser(readSessionCookie(request.headers.get("cookie")));
}

export function readSessionCookie(cookieHeader: string | null): string | undefined {
    if (!cookieHeader) return undefined;
    const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
    return match?.[1];
}
