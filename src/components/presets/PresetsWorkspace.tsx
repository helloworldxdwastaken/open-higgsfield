"use client";
/* eslint-disable @next/next/no-img-element -- Owner-protected cached third-party examples must not use a public image optimizer. */
import { TopBar } from "@/components/highfield/TopBar";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { ArrowUpRight, ImageIcon, Sparkles, Video, X } from "lucide-react";
import { EFFECT_PRESETS, effectDraft, type EffectPreset } from "@/lib/effect-presets";
import styles from "./presets.module.css";

function Example({ preset, eager = false }: { preset: EffectPreset; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className={styles.missing}><ImageIcon size={24}/><span>Example unavailable</span></div> : <img src={`/api/presets/preview/${preset.id}`} alt={`${preset.name} public Higgsfield example`} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)}/>;
}

export function PresetsWorkspace() {
  const locale = useLocale(); const router = useRouter(); const prefix = `/${locale}`;
  const [selected, setSelected] = useState<EffectPreset | null>(null);
  const [extra, setExtra] = useState(""); const [intensity, setIntensity] = useState<"subtle" | "balanced" | "dramatic">("balanced");
  const [error, setError] = useState(""); const dialog = useRef<HTMLDialogElement>(null); const returnFocus = useRef<HTMLElement | null>(null);
  const visible = EFFECT_PRESETS;
  useEffect(() => {
    const element = dialog.current;
    if (selected && element && !element.open) element.showModal();
    return () => { element?.close(); };
  }, [selected]);
  function choose(preset: EffectPreset, trigger: HTMLElement) { returnFocus.current = trigger; setSelected(preset); setExtra(""); setIntensity("balanced"); setError(""); }
  function close() { setSelected(null); requestAnimationFrame(() => returnFocus.current?.focus()); }
  function usePreset() {
    if (!selected) return;
    try {
      sessionStorage.setItem("highfield:recipe-draft", JSON.stringify(effectDraft(selected, extra, intensity)));
      router.push(`${prefix}?mode=${selected.mediaType}&recipeDraft=1`);
    } catch { setError("The browser could not prepare this draft. Enable session storage or copy the reviewed prompt into the studio."); }
  }
  return <main className={styles.page}>
    <a className={styles.skip} href="#preset-gallery">Skip to presets</a>
    <TopBar active="effects" />
    <div className={styles.content}>
      <div className={styles.heading}><h1>Visual Effects</h1></div>
      <div className={styles.chips} role="list" aria-label="All effects">{EFFECT_PRESETS.map(preset => <button key={preset.id} role="listitem" className={styles.chip} onClick={e => choose(preset, e.currentTarget)}>{preset.name}</button>)}</div>
      <aside className={styles.note}><Sparkles size={17}/><p><strong>Highfield prompt versions.</strong> The pictures are Higgsfield’s public examples, not your results. These drafts are independently written interpretations—not their private preset workflows. Results depend on the model you choose. <Link href={`${prefix}/connections`}>Add provider keys ↗</Link></p></aside>
      <section id="preset-gallery" className={styles.grid} aria-label="Effect preset gallery">{visible.map((preset, index) => <button key={preset.id} className={styles.card} aria-label={`Preview ${preset.name}`} onClick={event => choose(preset, event.currentTarget)}><div className={styles.art}><Example preset={preset} eager={index < 4}/><span className={styles.example}>SOURCE EXAMPLE</span><span className={styles.use}><ArrowUpRight size={19}/></span><div className={styles.overlay}/><div className={styles.title}><span>{preset.mediaType === "image" ? <ImageIcon size={12}/> : <Video size={12}/>} {preset.mediaType === "image" ? "IMAGE PROMPT" : "VIDEO PROMPT"}</span><h2>{preset.name}</h2></div></div></button>)}</section>
      
      <div className={styles.bottom}><div><h2>Need an image recipe or storyboard?</h2><p>Your prompt library and saved Cinema starters are ready too.</p></div><Link href={`${prefix}/skills`}>Prompt recipes<ArrowUpRight size={15}/></Link><Link href={`${prefix}/cinema`}>Cinema starters<ArrowUpRight size={15}/></Link></div>
      <footer className={styles.footer}><span>Public showcase artwork belongs to its respective owners. Cached examples are separate from generated media.</span><a href="https://higgsfield.ai/effects" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Original Higgsfield catalog ↗</a></footer>
    </div>
    {selected && <dialog ref={dialog} className={styles.dialog} aria-labelledby="preset-title" onCancel={event => { event.preventDefault(); close(); }}>
      <button className={styles.close} aria-label="Close preset" onClick={close}><X size={20}/></button>
      <div className={styles.modalGrid}><div className={styles.modalArt}><Example preset={selected} eager/><span className={styles.example}>HIGGSFIELD SOURCE EXAMPLE</span></div><div className={styles.modalBody}>
        <p className={styles.eyebrow}>{selected.mediaType === "image" ? "SINGLE-FRAME STYLE INTERPRETATION" : "VIDEO PROMPT INTERPRETATION"}</p><h2 id="preset-title">{selected.name}</h2><p className={styles.direction}>{selected.direction}</p>
        <div className={styles.requirements}><strong>Your input</strong><span>1 image reference · a compatible {selected.mediaType} model</span><span>Upload your own photo in the studio. The example is never sent as your generation input.</span></div>
        <label className={styles.field}>Prompt intensity<select value={intensity} onChange={event => setIntensity(event.target.value as typeof intensity)}><option value="subtle">Subtle</option><option value="balanced">Balanced</option><option value="dramatic">Dramatic</option></select><small>Art direction only—not a guaranteed model control.</small></label>
        <label className={styles.field}>Additional direction<textarea rows={3} maxLength={500} value={extra} onChange={event => setExtra(event.target.value)} placeholder="Optional mood, setting or details…"/></label>
        <details className={styles.prompt}><summary>Review the full prompt</summary><pre>{effectDraft(selected, extra, intensity).prompt}</pre></details>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <button className={styles.primary} onClick={usePreset}>Use {selected.mediaType} draft<ArrowUpRight size={16}/></button><p className={styles.cost}>Preparing a draft is free. Generation runs only when you press Generate and may use provider credits.</p>
        <a className={styles.original} href={selected.originalPresetUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open the original hosted Higgsfield preset ↗</a>
      </div></div>
    </dialog>}
  </main>;
}
