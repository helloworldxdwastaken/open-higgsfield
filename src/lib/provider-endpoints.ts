import { isIP } from "node:net";
import { refreshConnections } from "./connections";
export type LocalEngineName = "LM_STUDIO_URL" | "OLLAMA_URL" | "DRAW_THINGS_URL";
/** Intentional local engines only: literal private/tailnet/loopback addresses avoid DNS rebinding. */
export function validateLocalEngineUrl(value: string): URL {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error("ERR_INVALID_LOCAL_ENGINE_URL"); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("ERR_INVALID_LOCAL_ENGINE_URL");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    let permitted = host === "localhost" || host === "::1";
    if (isIP(host) === 4) {
        const [a, b] = host.split(".").map(Number);
        permitted = a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
    }
    if (!permitted) throw new Error("ERR_LOCAL_ENGINE_PRIVATE_HOST_REQUIRED");
    return url;
}
export function localEngineUrl(name: LocalEngineName, pathname: string): string {
    refreshConnections();
    const configured = process.env[name];
    if (!configured) throw new Error("ERR_LOCAL_ENGINE_NOT_CONFIGURED");
    if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("..") || pathname.includes("?")) throw new Error("ERR_INVALID_ENGINE_PATH");
    return new URL(pathname, validateLocalEngineUrl(configured)).href;
}
export function localEngineHeaders(name: LocalEngineName): Record<string, string> {
    refreshConnections();
    const token = name === "LM_STUDIO_URL" ? process.env.LM_STUDIO_API_KEY : undefined;
    return token ? { Authorization: `Bearer ${token}` } : {};
}
