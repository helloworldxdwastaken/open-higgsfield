import { localEngineHeaders, localEngineUrl } from "@/lib/provider-endpoints";

export type DirectorEngine = "ollama" | "lm-studio";

export async function createShotPlan(engine: DirectorEngine, model: string, brief: string) {
    if (!["ollama", "lm-studio"].includes(engine) || !model || model.length > 200 || !brief.trim() || brief.length > 12000) {
        throw new Error("ERR_INVALID_DIRECTOR_REQUEST");
    }
    const connection = engine === "ollama" ? "OLLAMA_URL" : "LM_STUDIO_URL";
    const system = "You are a film director planning an AI production. Return a concise, practical shot plan with numbered shots, duration, framing, camera movement, image prompt, video prompt, sound and continuity notes. Adapt to the user's brief. You only plan; never claim to have generated images, video or audio. Do not invent model capabilities or costs.";
    const messages = [{ role: "system", content: system }, { role: "user", content: brief.trim() }];
    const headers = { ...localEngineHeaders(connection), "Content-Type": "application/json" };
    const endpoint = engine === "ollama" ? "/api/chat" : "/v1/chat/completions";
    const response = await fetch(localEngineUrl(connection, endpoint), {
        method: "POST", headers, redirect: "error", signal: AbortSignal.timeout(180000),
        body: JSON.stringify(engine === "ollama"
            ? { model, messages, stream: false, keep_alive: "2m", options: { num_predict: 1800, temperature: 0.6 } }
            : { model, messages, stream: false, max_tokens: 1800, temperature: 0.6 }),
    });
    if (!response.ok) throw new Error(`ERR_DIRECTOR_PROVIDER: ${response.status}`);
    const length = Number(response.headers.get("content-length") || "0");
    if (length > 262144) throw new Error("ERR_DIRECTOR_RESPONSE_TOO_LARGE");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("ERR_EMPTY_DIRECTOR_RESPONSE");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 262144) throw new Error("ERR_DIRECTOR_RESPONSE_TOO_LARGE");
            chunks.push(value);
        }
    } finally { await reader.cancel().catch(() => {}); }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("ERR_INVALID_DIRECTOR_RESPONSE"); }
    const text = engine === "ollama" ? data.message?.content : data.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("ERR_EMPTY_DIRECTOR_RESPONSE");
    return { engine, model, plan: text, generatedMedia: false };
}
