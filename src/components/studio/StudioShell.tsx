"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpRight, ChevronRight, Film, Grid2X2, Image as ImageIcon, Layers3, SlidersHorizontal, Sparkles, Video, X } from "lucide-react";
import { CommandBar } from "@/components/command-bar/CommandBar";
import { ResultsGrid } from "@/components/tasks/ResultsGrid";
import { IMAGE_CAPABILITIES } from "@/models/capabilities/image";
import { VIDEO_CAPABILITIES } from "@/models/capabilities/video";
import { FeatureArt } from "@/components/highfield/FeatureArt";
import { StudioDialog, type DialogContent } from "@/components/highfield/StudioDialog";
import "@/components/highfield/highfield.css";

type MediaMode = "video" | "image";
type StudioView = "explore" | "create" | "library";
type Workflow = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  art: "cinema" | "motion" | "swap" | "katana" | "canvas" | "ads";
  modelId?: string;
  status: string;
  detail: string;
};

const workflows: Workflow[] = [
  { id: "cinema", title: "Cinema Studio", eyebrow: "EVERY FRAME, INTENTIONAL", description: "From an idea to a cinematic shot.", art: "cinema", modelId: "higgsfield__cinema-studio-4.0", status: "Optional Higgsfield API", detail: "Generate a shot with the Cinema Studio 4.0 API. Choose the model's supported duration, resolution and aspect ratio in the video composer. This endpoint requires your Higgsfield API key and provider credits; a multi-shot timeline editor is not included yet." },
  { id: "motion", title: "Motion Transfer", eyebrow: "GENJUTSU", description: "A reference motion. A new perspective.", art: "motion", modelId: "higgsfield__genjutsu-motion-transfer", status: "Optional Higgsfield API", detail: "Use Genjutsu Motion Transfer with a source video and reference images. The video composer exposes the inputs supported by the connected endpoint. Generation runs on Higgsfield and requires its API key and credits; local Genjutsu model weights are not available here." },
  { id: "swap", title: "Object Swap", eyebrow: "GENJUTSU", description: "Reimagine the subject inside your shot.", art: "swap", modelId: "higgsfield__genjutsu-object-swap", status: "Optional Higgsfield API", detail: "Use Genjutsu Object Swap with a source video and reference images. This is a direct connection to the optional Higgsfield API and requires its API key and credits. Add your key in Connections before submitting a generation." },
  { id: "katana", title: "Katana", eyebrow: "REFERENCE TO RECREATION", description: "The edit is the reference.", art: "katana", status: "Workflow not connected", detail: "A complete reference-edit workflow needs shot analysis, replacement-shot generation and a renderer. That orchestration has not been implemented in Highfield yet. You can create individual replacement shots in the video studio and connect a planning model from Providers." },
  { id: "canvas", title: "Canvas", eyebrow: "CONNECT YOUR IDEAS", description: "A space for the bigger picture.", art: "canvas", status: "Workflow not connected", detail: "An executable node canvas requires saved boards, typed connections and a durable workflow runner. Those features are not connected yet. Image and video jobs currently run in their dedicated studios and appear in your Library." },
  { id: "ads", title: "Ads Studio", eyebrow: "MAKE THE NEXT VARIATION", description: "One product. More possibilities.", art: "ads", status: "Workflow not connected", detail: "Brand libraries, ad variants and batch video editing are not implemented yet. You can make individual product visuals with a connected image model. Highfield does not currently provide Higgsfield's Ad Multiplier workflow." },
];

export function StudioShell({ initialMode = "image", initialView = "explore", audioStudioUrl }: { initialMode?: MediaMode; initialView?: StudioView; audioStudioUrl?: string }) {
   const locale = useLocale();
   const router = useRouter();
  const [mode, setMode] = useState<MediaMode>(initialMode);
  const [view, setView] = useState<StudioView>(initialView);
  const [dialog, setDialog] = useState<DialogContent | null>(null);
  const [promoVisible, setPromoVisible] = useState(true);
  const [studioBannerVisible, setStudioBannerVisible] = useState(true);
  const [modelSelection, setModelSelection] = useState<{ modelId: string; revision: number } | null>(null);
  const imageCount = Object.keys(IMAGE_CAPABILITIES).length;
  const videoCount = Object.keys(VIDEO_CAPABILITIES).length;
  const prefix = `/${locale}`;

  useEffect(() => {
    if (view !== "create" || !modelSelection) return;
    window.dispatchEvent(new CustomEvent("highfield:select-model", { detail: { mediaType: "video", modelId: modelSelection.modelId } }));
  }, [modelSelection, view]);

  function navigate(nextView: StudioView, nextMode = mode) {
    setView(nextView);
    setMode(nextMode);
    setModelSelection(null);
    const url = new URL(window.location.href);
    if (nextView === "create" || nextView === "library") url.searchParams.set("mode", nextMode);
    else url.searchParams.delete("mode");
    if (nextView === "library") url.searchParams.set("view", "library");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  }

   function openWorkflow(workflow: Workflow) {
     if (workflow.id === "cinema") { router.push(`${prefix}/cinema`); return; }
    const modelAvailable = workflow.modelId && Boolean(VIDEO_CAPABILITIES[workflow.modelId]);
    setDialog({
      title: workflow.title,
      eyebrow: workflow.eyebrow,
      status: modelAvailable ? workflow.status : workflow.modelId ? "API adapter not connected" : workflow.status,
      description: workflow.detail,
      actionLabel: modelAvailable ? "Open video studio" : "Explore providers",
      actionHref: modelAvailable ? undefined : `${prefix}/providers`,
      onAction: modelAvailable ? () => {
        navigate("create", "video");
        setModelSelection(previous => ({ modelId: workflow.modelId!, revision: (previous?.revision ?? 0) + 1 }));
        setDialog(null);
      } : undefined,
      secondaryHref: `${prefix}/connections`,
      secondaryLabel: "Connections",
      links: workflow.id === "cinema" || workflow.id === "katana" ? [{ label: "Plan shots with Director", href: `${prefix}/director` }] : undefined,
    });
  }

  function openAudio() {
    setDialog({ title: "Your audio studio", eyebrow: "AUDIO", status: "Audio studio not configured", description: "Connect your Voicebox deployment to open voice creation, profiles and narration from Highfield. The server's HIGHFIELD_AUDIO_URL setting supplies this destination.", actionLabel: "View connections", actionHref: `${prefix}/connections` });
  }

  function openApi() {
    setDialog({ title: "Build on your studio", eyebrow: "MCP / API", status: "Read-only MCP · REST generation routes", description: "Highfield exposes model discovery and job history through its authenticated read-only MCP endpoint. Generation uses the existing REST routes; MCP generation tools are not available yet. Director can plan shots with your configured local planning model.", endpoint: `${window.location.origin}/api/mcp`, actionLabel: "Explore providers", actionHref: `${prefix}/providers`, links: [{ label: "Image model catalog", href: "/api/image-models" }, { label: "Video model catalog", href: "/api/models" }, { label: "Director", href: `${prefix}/director` }] });
  }

  return (
    <div className={`hf-shell hf-view-${view}`}>
      <a className="hf-skip" href="#highfield-workspace">Skip to workspace</a>
      {promoVisible && (
        <div className="hf-promobar" role="region" aria-label="Announcement">
          <span className="hf-promobar-copy"><Sparkles size={15} aria-hidden="true" />Self-hosted creative studio — your models, your providers, your library.</span>
          <Link href={`${prefix}/connections`} className="hf-promobar-cta">Connect providers</Link>
          <button className="hf-promobar-close" aria-label="Dismiss announcement" onClick={() => setPromoVisible(false)}><X size={15} /></button>
        </div>
      )}
      <header className="hf-header">
        <Link href={prefix} className="hf-brand" aria-label="Highfield home"><span className="hf-brand-mark" aria-hidden="true"><i /><i /><i /></span></Link>
        <nav className="hf-primary-nav" aria-label="Studio navigation">
          <button className={view === "explore" ? "is-active" : ""} onClick={() => navigate("explore")} aria-current={view === "explore" ? "page" : undefined}>Explore</button>
          <button className={view === "create" && mode === "image" ? "is-active" : ""} onClick={() => navigate("create", "image")} aria-current={view === "create" && mode === "image" ? "page" : undefined}>Image</button>
          <button className={view === "create" && mode === "video" ? "is-active" : ""} onClick={() => navigate("create", "video")} aria-current={view === "create" && mode === "video" ? "page" : undefined}>Video</button>
          {audioStudioUrl ? <a href={audioStudioUrl}>Audio<ArrowUpRight size={11} className="hf-nav-external" /></a> : <button onClick={openAudio}>Audio</button>}
          <button onClick={openApi}>MCP</button>
          <Link href={`${prefix}/providers`}>API</Link>
          <Link href={`${prefix}/presets`}>Effects</Link>
          <Link href={`${prefix}/cinema`}>Cinema Studio<span className="hf-nav-new">New</span></Link>
          <Link href={`${prefix}/skills`} className="hf-nav-secondary">Skills</Link>
          <Link href={`${prefix}/director`} className="hf-nav-secondary">Director</Link>
        </nav>
        <div className="hf-header-actions">
          <Link href={`${prefix}/providers`} className="hf-pill"><Layers3 size={14} /><span>Providers</span></Link>
          <Link href={`${prefix}/connections`} className="hf-pill hf-pill-accent"><SlidersHorizontal size={14} /><span>Connections</span></Link>
        </div>
      </header>
      <main id="highfield-workspace" className="hf-main" tabIndex={-1}>
        {view === "explore" ? (
          <div className="hf-explore">
            <div className="hf-explore-intro"><div><span className="hf-eyebrow">THE CREATIVE POSSIBILITIES</span><h1>What will you make?</h1></div><span className="hf-own-studio"><span />Your models. Your studio.</span></div>
            <section className="hf-feature-grid" aria-label="Featured creative studios">{workflows.slice(0, 3).map((workflow, index) => <button key={workflow.id} className={`hf-feature hf-feature-${workflow.art} ${index === 0 ? "hf-feature-large" : ""}`} onClick={() => openWorkflow(workflow)}><FeatureArt kind={workflow.art} /><span className="hf-feature-topline"><span>{workflow.eyebrow}</span><ArrowUpRight size={19} /></span><span className="hf-feature-copy"><span className="hf-feature-status">API CONNECTION</span><strong>{workflow.title}</strong><span>{workflow.description}</span></span></button>)}</section>
            <section className="hf-create-section" aria-labelledby="hf-create-title"><div className="hf-section-heading"><h2 id="hf-create-title">Start creating</h2><span>One workspace. The engines you choose.</span></div><div className="hf-creation-grid"><button className="hf-create-card" onClick={() => navigate("create", "image")}><span className="hf-create-icon"><ImageIcon size={22} /></span><span><strong>Create image</strong><span>{imageCount} curated models · references & edits</span></span><ArrowUpRight size={18} /></button><button className="hf-create-card" onClick={() => navigate("create", "video")}><span className="hf-create-icon"><Film size={22} /></span><span><strong>Create video</strong><span>{videoCount} curated models · motion & scenes</span></span><ArrowUpRight size={18} /></button><Link className="hf-create-card" href={`${prefix}/providers`}><span className="hf-create-icon"><Layers3 size={22} /></span><span><strong>Connect an engine</strong><span>Discover cloud & local connections</span></span><ArrowUpRight size={18} /></Link></div></section>
            <section className="hf-workflow-section" aria-labelledby="hf-workflows-title"><div className="hf-section-heading"><h2 id="hf-workflows-title">More ways to create</h2><span>Explore each workflow and its availability</span></div><div className="hf-workflow-grid">{workflows.slice(3).map(workflow => <button key={workflow.id} className={`hf-workflow-card hf-workflow-${workflow.art}`} onClick={() => openWorkflow(workflow)}><div className="hf-workflow-art"><FeatureArt kind={workflow.art} /><span className="hf-workflow-badge">Not connected</span></div><div className="hf-workflow-copy"><div><strong>{workflow.title}</strong><p>{workflow.description}</p></div><ChevronRight size={18} /></div></button>)}</div></section>
            <aside className="hf-provider-banner"><div className="hf-banner-symbol"><Sparkles size={24} /></div><div><strong>A studio that works your way.</strong><p>Connect direct providers, discover models and keep your generations in one library.</p></div><Link href={`${prefix}/connections`}>Manage connections<ArrowUpRight size={15} /></Link></aside>
            <footer className="hf-footer"><span>Highfield · Open-source creative studio</span><a href="https://github.com/helloworldxdwastaken/open-higgsfield" target="_blank" rel="noopener noreferrer">Fork of Open-Higgsfield<ArrowUpRight size={12} /></a></footer>
          </div>
        ) : (
          <div className="hf-studio-workspace">
            {view === "create" && studioBannerVisible && (
              <div className="hf-studio-banner" role="region" aria-label="Feature announcement">
                <div className="hf-studio-banner-copy"><span>Bring your stories to life</span><span>Create cinematic shots from prompts</span></div>
                <button className="hf-studio-banner-cta" onClick={() => { router.push(`${prefix}/cinema`); }}>Open Cinema Studio</button>
                <button className="hf-studio-banner-close" aria-label="Dismiss banner" onClick={() => setStudioBannerVisible(false)}><X size={14} /></button>
              </div>
            )}
            {view === "library" ? (
              <div className="hf-workspace-heading"><div><span className="hf-eyebrow">YOUR CREATIVE ARCHIVE</span><h1>Your library</h1></div><div className="hf-workspace-controls"><div className="hf-library-tabs" aria-label="Library media type"><button className={mode === "image" ? "is-active" : ""} onClick={() => navigate("library", "image")} aria-pressed={mode === "image"}><ImageIcon size={14} />Images</button><button className={mode === "video" ? "is-active" : ""} onClick={() => navigate("library", "video")} aria-pressed={mode === "video"}><Video size={14} />Videos</button></div></div></div>
            ) : (
              <div className="hf-workspace-heading hf-workspace-heading-compact"><div className="hf-workspace-controls"><button className="hf-subtle-button" onClick={() => navigate("library")}><Grid2X2 size={14} />View library<ChevronRight size={13} /></button></div></div>
            )}
            <div className="hf-results-region"><ResultsGrid mode={mode} /></div>
            {view === "library" && <div className="hf-library-footer"><ArrowDownToLine size={14} /><span>Completed generations can be previewed and downloaded from their cards.</span><button onClick={() => navigate("create")}>Create {mode}<ArrowUpRight size={14} /></button></div>}
          </div>
        )}
      </main>
      {view === "create" && <div className="hf-composer"><CommandBar mode={mode} onModeChange={nextMode => navigate("create", nextMode)} /></div>}
      {dialog && <StudioDialog content={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
