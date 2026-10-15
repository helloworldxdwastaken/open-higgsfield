import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const CONNECTION_FIELDS = [
  { name: "HF_CREDENTIALS", label: "Higgsfield API key (paste the complete copied key)", url: "https://open.higgsfield.ai/api-keys" },
  { name: "OPENROUTER_API_KEY", label: "OpenRouter API key", url: "https://openrouter.ai/settings/keys" },
  { name: "LM_STUDIO_URL", label: "LM Studio local server URL", url: "https://lmstudio.ai/docs/developer" },
  { name: "LM_STUDIO_API_KEY", label: "LM Studio token (if enabled)", url: "https://lmstudio.ai/docs/developer" },
  { name: "OLLAMA_URL", label: "Ollama local server URL", url: "https://docs.ollama.com/api" },
  { name: "DRAW_THINGS_URL", label: "Draw Things local HTTP server URL", url: "https://drawthings.ai" },
  {
    "name": "FREEPIK_API_KEY",
    "label": "Freepik API key",
    "url": "https://www.freepik.com/api"
  },
  {
    "name": "GEMINI_API_KEY",
    "label": "Google AI Studio API key",
    "url": "https://aistudio.google.com/apikey"
  },
  {
    "name": "GOOGLE_CLOUD_PROJECT",
    "label": "Vertex AI project ID",
    "url": "https://console.cloud.google.com/"
  },
  {
    "name": "GOOGLE_CLOUD_LOCATION",
    "label": "Vertex AI location",
    "url": "https://console.cloud.google.com/"
  },
  {
    "name": "GOOGLE_SERVICE_ACCOUNT_JSON",
    "label": "Google service account JSON",
    "url": "https://console.cloud.google.com/iam-admin/serviceaccounts"
  },
  {
    "name": "AI_GATEWAY_API_KEY",
    "label": "Vercel AI Gateway key",
    "url": "https://vercel.com/ai-gateway"
  },
  {
    "name": "CLOUDINARY_URL",
    "label": "Cloudinary URL for reference uploads",
    "url": "https://console.cloudinary.com/"
  }
];
const allowed = new Set(CONNECTION_FIELDS.map(field => field.name));
function settingsPath() {
  const root = process.env.STUDIO_SETTINGS_DIR || path.join(process.cwd(), "private-settings");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  return path.join(root, "provider-credentials.json");
}
function readSaved(): Record<string, string> {
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    return Object.fromEntries(Object.entries(data).filter(([key, value]) => allowed.has(key) && typeof value === "string")) as Record<string, string>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("Unable to read provider settings.");
  }
}
export function refreshConnections() {
  const saved = readSaved();
  for (const [key, value] of Object.entries(saved)) process.env[key] = value;
}
export function connectionStatus() {
  refreshConnections();
  return CONNECTION_FIELDS.map(field => ({ ...field, configured: Boolean(process.env[field.name]?.trim()) }));
}
export function saveConnections(values: Record<string, string>, remove: string[] = []) {
  if (!values || typeof values !== "object" || Array.isArray(values) || !Array.isArray(remove)) throw new Error("Invalid settings.");
  for (const [key, value] of Object.entries(values)) {
    if (!allowed.has(key) || typeof value !== "string" || value.length > 32768 || value.includes("\0")) throw new Error("Invalid provider field.");
    if (value.trim() && ["LM_STUDIO_URL", "OLLAMA_URL", "DRAW_THINGS_URL"].includes(key)) {
      // Only origin-only private IP/loopback addresses are accepted. Do not permit arbitrary proxies.
      let url: URL; try { url = new URL(value.trim()); } catch { throw new Error("Invalid local engine URL."); }
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const parts = host.split(".").map(Number);
      const [a,b] = parts;
      const ipv4 = parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255);
      const privateHost = host === "localhost" || host === "::1" || (ipv4 && (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)));
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !privateHost) throw new Error("Use an origin-only private engine URL.");
    }
    if (value.trim() && ["HF_CREDENTIALS", "OPENROUTER_API_KEY", "LM_STUDIO_API_KEY"].includes(key) && /[\s\r\n]/.test(value.trim())) throw new Error("Invalid provider credential.");
    if (value.trim() && key === "GOOGLE_SERVICE_ACCOUNT_JSON") {
      let credentials;
      try { credentials = JSON.parse(value); } catch { throw new Error("Service account must be valid JSON."); }
      if (credentials.type !== "service_account" || typeof credentials.client_email !== "string" || typeof credentials.private_key !== "string" || (credentials.token_uri && credentials.token_uri !== "https://oauth2.googleapis.com/token")) throw new Error("Invalid Google service account.");
    }
    if (value.trim() && key.endsWith("REGION") && !/^[a-z0-9-]{2,40}$/.test(value.trim())) throw new Error("Invalid region.");
    if (value.trim() && key === "CLOUDINARY_URL") {
      try { if (new URL(value.trim()).protocol !== "cloudinary:") throw new Error(); } catch { throw new Error("Use a cloudinary:// URL."); }
    }
  }
  if (remove.some(key => typeof key !== "string" || !allowed.has(key))) throw new Error("Invalid provider field.");
  const saved = readSaved();
  for (const [key, value] of Object.entries(values)) if (value.trim()) saved[key] = value.trim();
  for (const key of remove) saved[key] = "";
  const target = settingsPath();
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(saved), { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return connectionStatus();
}
