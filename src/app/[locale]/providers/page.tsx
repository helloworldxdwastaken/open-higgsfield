"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Circle, Cpu, ImageIcon, Loader2, RefreshCw, Video } from "lucide-react";
import type { MediaCatalogModel } from "@/lib/provider-catalog";
import styles from "./providers.module.css";
type Discovery = { engine: string; capability?: string; ready?: boolean; models: Array<{ id: string; name: string; loaded?: boolean; type?: string; supportsPlanning?: boolean }> };
export default function ProvidersPage() {
    const locale = useLocale();
    const [engine, setEngine] = useState<"openrouter" | "drawthings">("openrouter");
    const [kind, setKind] = useState<"image" | "video">("image");
    const [models, setModels] = useState<MediaCatalogModel[]>([]);
    const [modelId, setModelId] = useState("");
    const [configured, setConfigured] = useState<Record<string, boolean>>({});
    const [discovery, setDiscovery] = useState<Record<string, Discovery>>({});
    const [discoveryErrors, setDiscoveryErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState("");
    const [message, setMessage] = useState("");
    const [taskId, setTaskId] = useState("");
    const [prompt, setPrompt] = useState("");
    const [duration, setDuration] = useState("");
    const [resolution, setResolution] = useState("");
    const [aspectRatio, setAspectRatio] = useState("");
    const [references, setReferences] = useState("");
    const [firstFrameUrl, setFirstFrameUrl] = useState("");
    const [lastFrameUrl, setLastFrameUrl] = useState("");
    const model = models.find(entry => entry.id === modelId);
    useEffect(() => { fetch("/api/connections", { cache: "no-store" }).then(r => r.json()).then(data => setConfigured(Object.fromEntries((data.fields || []).map((f: { name: string; configured: boolean }) => [f.name, f.configured])))).catch(() => {}); }, []);
    async function loadCatalog(nextKind = kind) {
        setBusy("catalog"); setMessage(""); setModels([]); setModelId(""); setDuration(""); setResolution(""); setAspectRatio(""); setReferences(""); setFirstFrameUrl(""); setLastFrameUrl("");
        try {
            const response = await fetch(`/api/providers/catalog?engine=openrouter&kind=${nextKind}`, { cache: "no-store" });
            const data = await response.json(); if (!response.ok) throw new Error(data.error);
            setModels(data.models); setModelId(data.models[0]?.id || "");
            setMessage(`${data.models.length} ${nextKind} generation models discovered.`);
        } catch (error) { setMessage(error instanceof Error ? error.message : "Catalog unavailable."); }
        finally { setBusy(""); }
    }
    async function discover(name: string) {
        setBusy(name); setDiscoveryErrors(previous => ({ ...previous, [name]: "" }));
        try {
            const response = await fetch(`/api/providers/catalog?engine=${name}`, { cache: "no-store" });
            const data = await response.json(); if (!response.ok) throw new Error(data.error);
            setDiscovery(previous => ({ ...previous, [name]: data }));
        } catch (error) { setDiscoveryErrors(previous => ({ ...previous, [name]: error instanceof Error ? error.message : "Engine unavailable." })); }
        finally { setBusy(""); }
    }
    async function generate(event: React.FormEvent) {
        event.preventDefault(); setBusy("generate"); setMessage(""); setTaskId("");
        try {
            const response = await fetch("/api/providers/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engine, kind: engine === "drawthings" ? "image" : kind, modelId, prompt, duration, resolution, aspectRatio, firstFrameUrl, lastFrameUrl, referenceUrls: references.split(/\n/).map(value => value.trim()).filter(Boolean) }) });
            const data = await response.json(); if (!response.ok) throw new Error(data.error);
            setTaskId(data.task_id); setMessage("Generation submitted. Its status and saved output are in your library.");
        } catch (error) { setMessage(error instanceof Error ? error.message : "Generation could not be submitted."); }
        finally { setBusy(""); }
    }
    const canGenerate = Boolean(prompt.trim()) && (engine === "openrouter" ? configured.OPENROUTER_API_KEY && model && !model.sourceVideoWorkflow && !model.vectorOnly && references.split(/\n/).filter(value => value.trim()).length >= model.minReferences : discovery.drawthings?.ready && !discoveryErrors.drawthings);
    return <main className={styles.page}><div className={styles.wrap}>
        <nav className={styles.navigation}><Link href={`/${locale}`}><ArrowLeft size={15}/> Highfield</Link><div><Link href={`/${locale}/director`}>Director</Link><Link href={`/${locale}/connections`}>Connections <ArrowUpRight size={14}/></Link></div></nav>
        <header className={styles.header}><span className={styles.eyebrow}>ENGINES / YOUR CHOICE</span><h1>A studio without<br/><em>a single supplier.</em></h1><p>Discover live image and video models, or connect your own local engines. Every output joins the same private library.</p></header>
        <div className={styles.layout}><section className={styles.composer}>
            <div className={styles.sectionTitle}><span>01 / CREATE</span><span className={styles.badge}>{engine === "openrouter" ? "CLOUD · API CREDITS" : "LOCAL · SELECTED MODEL"}</span></div>
            <div className={styles.tabs}><button type="button" aria-pressed={engine === "openrouter"} onClick={() => { setEngine("openrouter"); setReferences(""); }}>OpenRouter</button><button type="button" aria-pressed={engine === "drawthings"} onClick={() => { setEngine("drawthings"); setReferences(""); }}>Draw Things</button></div>
            {engine === "openrouter" ? <>
                <div className={styles.catalogControls}><div className={styles.mediaTabs}><button type="button" aria-pressed={kind === "image"} disabled={Boolean(busy)} onClick={() => { setKind("image"); void loadCatalog("image"); }}><ImageIcon size={15}/> Image</button><button type="button" aria-pressed={kind === "video"} disabled={Boolean(busy)} onClick={() => { setKind("video"); void loadCatalog("video"); }}><Video size={15}/> Video</button></div><button className={styles.refresh} type="button" disabled={Boolean(busy)} onClick={() => void loadCatalog()}><RefreshCw size={14}/> Discover models</button></div>
                {!configured.OPENROUTER_API_KEY && <p className={styles.note}>Add your OpenRouter key in <Link href={`/${locale}/connections`}>Connections</Link> before generating. Discovery is free.</p>}
            </> : <p className={styles.note}>Uses the image model and generation settings currently selected in your Draw Things app. Start its HTTP server and discover it below. This connection does not provide HTTP video generation.</p>}
            <form onSubmit={generate} className={styles.form}>
                {engine === "openrouter" && <label>Generation model<select value={modelId} disabled={!models.length || Boolean(busy)} onChange={event => { setModelId(event.target.value); setDuration(""); setResolution(""); setAspectRatio(""); setReferences(""); setFirstFrameUrl(""); setLastFrameUrl(""); }}><option value="">{models.length ? "Choose a model" : "Discover the live catalog first"}</option>{models.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>}
                {model && engine === "openrouter" && <p className={styles.modelId}>{model.id}</p>}
                {engine === "openrouter" && model?.vectorOnly && <p className={styles.note}>This model produces SVG vectors. It stays in the catalog; secure vector export is not implemented in this image studio yet.</p>}
                {engine === "openrouter" && model?.sourceVideoWorkflow && <p className={styles.note}>This model edits or upscales an existing video. It stays in the catalog; its source-video workflow is not implemented in this studio yet.</p>}
                <label>Your prompt<textarea value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={10000} rows={5} placeholder="Describe the scene, light, subject and motion…" required/></label>
                {engine === "openrouter" && model && <div className={styles.options}>{[{ label: "Duration", options: model.durations, value: duration, set: setDuration }, { label: "Resolution", options: model.resolutions, value: resolution, set: setResolution }, { label: "Aspect ratio", options: model.ratios, value: aspectRatio, set: setAspectRatio }].filter(field => field.options.length).map(field => <label key={field.label}>{field.label}<select value={field.value} onChange={event => field.set(event.target.value)}><option value="">Provider default</option>{field.options.map(value => <option key={value} value={value}>{value}</option>)}</select></label>)}</div>}
                {engine === "openrouter" && model?.acceptsImages && <label>Reference image URLs<textarea rows={2} value={references} onChange={event => setReferences(event.target.value)} placeholder="One public HTTPS image URL per line (up to 8)"/><small>References guide content and style. At least {model.minReferences} references required by this model.</small></label>}
                {engine === "openrouter" && model?.frameTypes.map(frame => <label key={frame}>{frame === "first_frame" ? "First frame image URL" : "Last frame image URL"}<input type="url" value={frame === "first_frame" ? firstFrameUrl : lastFrameUrl} onChange={event => frame === "first_frame" ? setFirstFrameUrl(event.target.value) : setLastFrameUrl(event.target.value)} placeholder="Public HTTPS image URL (optional)"/></label>)}
                <footer className={styles.formFooter}><span>{engine === "openrouter" ? "Uses your chosen provider’s credits." : "One local image job at a time."}</span><button type="submit" disabled={!canGenerate || Boolean(busy)}>{busy === "generate" ? <Loader2 size={16} className={styles.spin}/> : <ArrowUpRight size={16}/>} Generate {engine === "drawthings" ? "image" : kind}</button></footer>
            </form>
            <div role="status" className={styles.message}>{message}{taskId && <Link href={`/${locale}?view=library&mode=${engine === "drawthings" ? "image" : kind}`}>Open library · {taskId} <ArrowUpRight size={13}/></Link>}</div>
        </section><aside className={styles.local}><div className={styles.sectionTitle}><span>02 / LOCAL ENGINES</span><Cpu size={17}/></div><p className={styles.localIntro}>Your hardware, connected privately. Discovery lists installed and loaded models separately and does not load a model.</p>
            {[{ id: "lmstudio", name: "LM Studio", field: "LM_STUDIO_URL", role: "Planning & compatible vision" }, { id: "ollama", name: "Ollama", field: "OLLAMA_URL", role: "Planning & compatible vision" }, { id: "drawthings", name: "Draw Things", field: "DRAW_THINGS_URL", role: "Local HTTP image generation" }].map(item => <article className={styles.engine} key={item.id}><header><h2>{item.name}</h2>{configured[item.field] ? <CheckCircle2 size={15}/> : <Circle size={15}/>}</header><p>{item.role}</p><button type="button" disabled={!configured[item.field] || Boolean(busy)} onClick={() => void discover(item.id)}>{busy === item.id ? "Discovering…" : configured[item.field] ? "Discover engine" : "Configure connection"}<ArrowUpRight size={13}/></button>{discoveryErrors[item.id] && <p role="status" className={styles.error}>{discoveryErrors[item.id]}</p>}{discovery[item.id]?.models.map(entry => <div className={styles.localModel} key={entry.id}><span>{entry.name}</span><small>{entry.type === "embedding" ? "Embedding · " : ""}{entry.loaded ? "Loaded" : "Installed"}</small></div>)}{discovery[item.id]?.ready && !discovery[item.id]?.models.length && <p className={styles.note}>HTTP server ready; selected model name unavailable.</p>}</article>)}
            <p className={styles.note}>Ollama’s experimental macOS image feature requires a verified image model and is not exposed as a generic image or video engine here.</p><Link className={styles.director} href={`/${locale}/director`}>Plan a shot with Director <ArrowUpRight size={15}/></Link>
        </aside></div>
    </div></main>;
}
