"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, Copy, Download, Plus, Search, Sparkles, Star, Trash2 } from "lucide-react";
import { recipeFields, renderRecipe, validateRecipe, type RecipeInput, type SkillRecipe, SKILL_SOURCES } from "@/lib/skill-catalog";
import styles from "./skills.module.css";

type Catalog = { revision: number; recipes: SkillRecipe[]; favorites: string[]; sources: typeof SKILL_SOURCES };
type Filter = "all" | "image" | "video" | "favorites" | "mine" | "sources";
const blank: RecipeInput = { name: "", description: "", mediaType: "image", template: "Create an image of {{subject}}. Setting: {{setting}}. Visual direction: {{style}}." };
const errorText: Record<string, string> = { ERR_SKILLS_CONFLICT: "This library changed in another tab. Refresh the library, then try again; your editor is kept open.", ERR_SKILLS_VALIDATION: "Check the recipe name and template. Variables use {{lowercase_names}}; up to eight are supported.", ERR_SKILLS_STORAGE: "The library could not be read or saved. Existing data has not been reset.", ERR_SKILLS_NOT_FOUND: "That recipe was removed in another tab. Refresh the library.", ERR_SKILLS_LIMIT: "The library has reached its 200 custom recipe limit." };

export function SkillsWorkspace() {
    const locale = useLocale(); const prefix = `/${locale}`;
    const router = useRouter();
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
    const [error, setError] = useState(""); const [notice, setNotice] = useState("");
    const [filter, setFilter] = useState<Filter>("all"); const [query, setQuery] = useState("");
    const [selected, setSelected] = useState<SkillRecipe | null>(null); const [values, setValues] = useState<Record<string, string>>({});
    const [draft, setDraft] = useState<RecipeInput | null>(null); const [editingId, setEditingId] = useState<string>();
    const [deleteId, setDeleteId] = useState<string | null>(null); const locked = useRef(false);
    const editorRef = useRef<HTMLElement>(null);
    async function refresh(signal?: AbortSignal) {
        setLoading(true); setError("");
        try { const response = await fetch("/api/skills", { signal }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setCatalog(data); }
        catch (err) { if (!signal?.aborted) setError(errorText[err instanceof Error ? err.message : ""] || "Could not load the library. Check your connection and retry."); }
        finally { if (!signal?.aborted) setLoading(false); }
    }
    useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, []);
    async function mutate(input: Record<string, unknown>) {
        if (!catalog || locked.current) return false;
        locked.current = true; setBusy(true); setError(""); setNotice("");
        try {
            const response = await fetch("/api/skills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, revision: catalog.revision }) });
            const data = await response.json(); if (!response.ok) throw new Error(data.error);
            setCatalog(data); return true;
        } catch (err) { setError(errorText[err instanceof Error ? err.message : ""] || "The change was not saved. Retry when connected."); return false; }
        finally { locked.current = false; setBusy(false); }
    }
    const recipes = useMemo(() => (catalog?.recipes || []).filter(item => {
        if (filter === "sources") return false;
        if (filter === "image" || filter === "video") { if (item.mediaType !== filter) return false; }
        if (filter === "mine" && item.origin !== "custom") return false;
        if (filter === "favorites" && !catalog?.favorites.includes(item.id)) return false;
        return `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase());
    }), [catalog, filter, query]);
    const sources = (filter === "sources" ? catalog?.sources || [] : []).filter(item => `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
    const fields = selected ? recipeFields(selected.template) : [];
    let preview = "";
    if (selected) { try { preview = renderRecipe(selected.template, values); } catch { /* The input form explains missing/oversized values. */ } }
    function focusEditor() { requestAnimationFrame(() => { editorRef.current?.scrollIntoView({ behavior: "instant", block: "start" }); editorRef.current?.focus(); }); }
    function selectRecipe(recipe: SkillRecipe) { setSelected(recipe); setDraft(null); setValues({}); setNotice(""); setError(""); focusEditor(); }
    function editRecipe(recipe?: SkillRecipe) {
        setSelected(null); setDraft(recipe ? { name: recipe.name, description: recipe.description, mediaType: recipe.mediaType, template: recipe.template } : { ...blank });
        setEditingId(recipe?.origin === "custom" ? recipe.id : undefined); setError(""); setNotice(""); focusEditor();
    }
    function download(recipe: SkillRecipe) {
        const blob = new Blob([JSON.stringify({ format: "highfield-prompt-recipe", schemaVersion: 1, recipe: { name: recipe.name, description: recipe.description, mediaType: recipe.mediaType, template: recipe.template } }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "highfield-recipe.json"; anchor.click(); URL.revokeObjectURL(url);
    }
    function openDraft() {
        if (!selected || !preview) return;
        try {
            // Session-only handoff: no prompt or private subject in the URL, no automatic generation.
            sessionStorage.setItem("highfield:recipe-draft", JSON.stringify({ prompt: preview, mediaType: selected.mediaType }));
            router.push(`${prefix}?mode=${selected.mediaType}&recipeDraft=1`);
        } catch { setError("Your browser blocked draft storage. Copy the prompt and paste it into the studio instead."); }
    }
    return <main className={styles.workspace}>
        <a className={styles.skip} href="#skills-content">Skip to skills</a>
        <header className={styles.header}><Link className={styles.brand} href={prefix}>Highfield<span>✳</span></Link><nav aria-label="Studio navigation"><Link href={prefix}>Explore</Link><Link href={`${prefix}?mode=image`}>Image</Link><Link href={`${prefix}?mode=video`}>Video</Link><Link href={`${prefix}/skills`} aria-current="page">Skills</Link><Link href={`${prefix}/director`}>Director</Link></nav><Link className={styles.connection} href={`${prefix}/connections`}>Connections <ArrowUpRight size={14} /></Link></header>
        <div id="skills-content" className={styles.content}>
            <div className={styles.intro}><div><p className={styles.eyebrow}>YOUR CREATIVE PLAYBOOK</p><h1>Make a good idea<br /><span>repeatable.</span></h1><p>Pick a recipe. Make it yours. Choose the engine when you’re ready.</p></div><button className={styles.primary} onClick={() => editRecipe()}><Plus size={17} />Create recipe</button></div>
            <div className={styles.toolbar}><div className={styles.filters} aria-label="Skill filters">{([['all', 'All recipes'], ['image', 'Image'], ['video', 'Video'], ['favorites', 'Favorites'], ['mine', 'My recipes'], ['sources', 'Open-source skills']] as const).map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div><label className={styles.search}><Search size={16} /><span className={styles.srOnly}>Search skills</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find your next idea" maxLength={100} /></label></div>
            <div className={styles.status} aria-live="polite">{loading ? "Loading your library…" : catalog ? `${filter === "sources" ? sources.length : recipes.length} ${filter === "sources" ? "licensed source references" : "recipes"} · shared owner workspace` : "Library unavailable"}<button onClick={() => void refresh()} disabled={loading || busy}>Refresh library</button></div>
            {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
            {draft && <section ref={editorRef} tabIndex={-1} className={styles.editor} aria-labelledby="recipe-editor-title"><div className={styles.editorHeading}><h2 id="recipe-editor-title">{editingId ? "Edit your recipe" : "A new recipe"}</h2><button onClick={() => setDraft(null)} disabled={busy}><ArrowLeft size={15} />Close editor</button></div><form onSubmit={async event => { event.preventDefault(); try { const valid = validateRecipe(draft); if (await mutate({ action: "save", ...(editingId ? { id: editingId } : {}), recipe: valid })) { setDraft(null); setFilter("mine"); setQuery(""); setNotice("Recipe saved to your library."); } } catch { setError(errorText.ERR_SKILLS_VALIDATION); } }}><div className={styles.formRow}><label>Name<input required maxLength={80} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label>Output<select value={draft.mediaType} onChange={event => setDraft({ ...draft, mediaType: event.target.value as "image" | "video" })}><option value="image">Image</option><option value="video">Video</option></select></label></div><label>Description<input maxLength={240} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label><label>Prompt template<textarea required minLength={10} maxLength={1600} rows={6} value={draft.template} onChange={event => setDraft({ ...draft, template: event.target.value })} /></label><p>Use variables such as <code>{"{{subject}}"}</code> and <code>{"{{setting}}"}</code>. Templates are text only; scripts and tools are never executed.</p><button className={styles.primary} disabled={busy || !catalog}>{busy ? "Saving…" : "Save recipe"}<Check size={16} /></button></form></section>}
            {selected && <section ref={editorRef} tabIndex={-1} className={styles.editor} aria-labelledby="recipe-use-title"><div className={styles.editorHeading}><div><p className={styles.eyebrow}>RECIPE / VERSION {selected.version}</p><h2 id="recipe-use-title">{selected.name}</h2></div><button onClick={() => setSelected(null)}><ArrowLeft size={15} />Back to library</button></div><div className={styles.useGrid}><div className={styles.inputStack}>{fields.map(key => <label key={key}>{key.replaceAll("_", " ")}<textarea rows={3} maxLength={500} value={values[key] || ""} onChange={event => setValues({ ...values, [key]: event.target.value })} placeholder={key === "subject" ? "What are we making?" : key === "setting" ? "The place, audience or story…" : "Your art direction…"} /></label>)}<p>Attach any reference media in the studio. These prompts do not train identities or guarantee an effect.</p></div><div className={styles.preview}><span className={styles.eyebrow}>REVIEW YOUR PROMPT</span><p>{preview || "Fill every variable to preview your prompt. The final prompt must fit the studio’s 2,000-character limit."}</p><div className={styles.previewActions}><button className={styles.primary} disabled={!preview} onClick={openDraft}>Open {selected.mediaType} draft<ArrowUpRight size={16} /></button><button disabled={!preview} onClick={async () => { try { await navigator.clipboard.writeText(preview); setNotice("Prompt copied."); } catch { setError("Clipboard unavailable. Select the preview text to copy it."); } }}><Copy size={15} />Copy</button></div><small>Preparing prompts is free. Generation uses your selected engine and may incur provider charges. Nothing is submitted automatically.</small></div></div></section>}
            {!loading && catalog && filter === "sources" && <aside className={styles.sourceNote}><Sparkles size={18} /><div><strong>Open source does not mean hosted generation is free.</strong><p>These eight MIT-licensed skills are source references, not native Highfield runners. Their original CLI, model access and scripts have separate requirements. View or adapt the source; no installer is executed here.</p></div></aside>}
            <section className={styles.grid} aria-label={filter === "sources" ? "Open-source skill references" : "Prompt recipes"}>
                {recipes.map((recipe, index) => <article key={recipe.id} className={styles.card}><button className={`${styles.art} ${styles[`art${index % 6}`]}`} onClick={() => selectRecipe(recipe)} aria-label={`Use ${recipe.name}`}><span>{recipe.mediaType === "video" ? "MOTION" : "STILL"}</span><i aria-hidden="true" /><b aria-hidden="true">{String(index + 1).padStart(2, "0")}</b><ArrowUpRight size={24} /></button><div className={styles.cardBody}><div className={styles.cardMeta}><span>{recipe.origin === "custom" ? "YOUR RECIPE" : "HIGHFIELD ORIGINAL"} · V{recipe.version}</span><button disabled={busy} aria-label={`Favorite ${recipe.name}`} aria-pressed={catalog?.favorites.includes(recipe.id) || false} onClick={() => void mutate({ action: "favorite", id: recipe.id, favorite: !catalog?.favorites.includes(recipe.id) })}><Star size={16} fill={catalog?.favorites.includes(recipe.id) ? "currentColor" : "none"} /></button></div><h2><button onClick={() => selectRecipe(recipe)}>{recipe.name}</button></h2><p>{recipe.description || "Your reusable prompt recipe."}</p><div className={styles.cardActions}><button onClick={() => editRecipe(recipe)}>{recipe.origin === "custom" ? "Edit" : "Remix"}</button><button aria-label={`Export ${recipe.name}`} onClick={() => download(recipe)}><Download size={15} /></button>{recipe.origin === "custom" && <button aria-label={`Delete ${recipe.name}`} disabled={busy} onClick={() => setDeleteId(recipe.id)}><Trash2 size={15} /></button>}</div>{deleteId === recipe.id && <div className={styles.deleteConfirm}><p>Delete this recipe? This cannot be undone.</p><button disabled={busy} onClick={async () => { if (await mutate({ action: "remove", id: recipe.id })) { setDeleteId(null); if (selected?.id === recipe.id) setSelected(null); setNotice("Recipe deleted."); } }}>Confirm delete</button><button onClick={() => setDeleteId(null)} disabled={busy}>Keep recipe</button></div>}</div></article>)}
                {sources.map(source => <article key={source.id} className={`${styles.card} ${styles.sourceCard}`}><span className={styles.eyebrow}>MIT / SOURCE REFERENCE</span><h2>{source.name}</h2><p>{source.description}</p><span className={styles.dependency}>Requires original hosted services / dependencies</span><a href={source.url} target="_blank" rel="noopener noreferrer">View licensed source<ArrowUpRight size={16} /></a></article>)}
            </section>
            {!loading && catalog && recipes.length === 0 && sources.length === 0 && <div className={styles.empty}><Search size={25} /><h2>{filter === "mine" ? "Your playbook starts here." : "No matches yet."}</h2><p>{filter === "mine" ? "Create a recipe or remix one of the originals." : "Try a different search or filter."}</p><button onClick={() => { setFilter("all"); setQuery(""); }}>Browse all recipes</button></div>}
            <footer className={styles.footer}><span>Highfield · independently authored prompt recipes</span><a href="https://github.com/higgsfield-ai/skills" target="_blank" rel="noopener noreferrer">Higgsfield skill source · MIT<ArrowUpRight size={12} /></a></footer>
        </div>
    </main>;
}
