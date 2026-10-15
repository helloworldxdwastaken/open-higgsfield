"use client";

import Link from "next/link";
import { useState } from "react";

export default function DirectorPage() {
    const [engine, setEngine] = useState("ollama");
    const [model, setModel] = useState("");
    const [brief, setBrief] = useState("");
    const [plan, setPlan] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const field = "w-full rounded-xl border border-white/15 bg-white/5 p-3 text-white outline-none focus:border-lime-300";
    async function submit(event: React.FormEvent) {
        event.preventDefault(); setBusy(true); setError(""); setCopied(false);
        try {
            const response = await fetch("/api/director", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engine, model, brief }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Unable to create a plan.");
            setPlan(data.plan);
        } catch (err) { setError(err instanceof Error ? err.message : "Unable to create a plan."); }
        finally { setBusy(false); }
    }
    return <main className="min-h-screen bg-[#080808] px-5 py-8 text-white sm:px-10">
        <div className="mx-auto max-w-6xl">
            <nav className="mb-12 flex flex-wrap items-center gap-5 text-sm"><Link className="mr-auto text-xl font-bold tracking-tight" href="/en">HIGHFIELD<span className="text-lime-300">✳</span></Link><Link href="/en/providers">Engines</Link><Link href="/en/connections">Connections</Link><Link href="/en?mode=video">Create video ↗</Link></nav>
            <p className="text-xs uppercase tracking-[0.25em] text-lime-300">Director / Local intelligence</p>
            <h1 className="mb-3 mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">Start with the shot.</h1>
            <p className="mb-10 max-w-xl text-white/60">Turn your idea into a shot plan with a model on your own machine. Take its prompts into the image and video studio when you’re ready.</p>
            <div className="grid gap-8 lg:grid-cols-2">
                <form onSubmit={submit} className="space-y-5">
                    <label className="block space-y-2"><span className="text-sm">Planning engine</span><select className={field} value={engine} onChange={e => setEngine(e.target.value)}><option value="ollama" className="bg-black">Ollama</option><option value="lm-studio" className="bg-black">LM Studio</option></select></label>
                    <label className="block space-y-2"><span className="text-sm">Model identifier</span><input className={field} required maxLength={200} placeholder="Choose an installed model from Engines" value={model} onChange={e => setModel(e.target.value)} /></label>
                    <label className="block space-y-2"><span className="text-sm">Your brief</span><textarea className={`${field} min-h-48`} required maxLength={12000} placeholder="A 15-second product film. Three shots, warm morning light, a slow final reveal…" value={brief} onChange={e => setBrief(e.target.value)} /></label>
                    <button disabled={busy} className="rounded-full bg-lime-300 px-6 py-3 font-semibold text-black disabled:opacity-50">{busy ? "Planning your shots…" : "Create shot plan ↗"}</button>
                    <p className="text-xs text-white/45">Connect the engine in Connections first. This creates a plan; media generation starts in the studio.</p>
                    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
                </form>
                <section className="min-h-96 rounded-2xl border border-white/10 bg-white/[0.025] p-6" aria-label="Shot plan" aria-live="polite">
                    <div className="mb-6 flex items-center justify-between"><h2 className="text-sm uppercase tracking-widest text-white/50">Your shot plan</h2>{plan && <button className="text-sm text-lime-300" onClick={async () => { try { await navigator.clipboard.writeText(plan); setCopied(true); } catch { setError("Select the plan text to copy it."); } }}>{copied ? "Copied" : "Copy plan"}</button>}</div>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-white/80">{plan || "Your scene, framing, camera movement, generation prompts and sound notes will appear here."}</p>
                </section>
            </div>
        </div>
    </main>;
}
