"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpRight, AudioLines, ChevronRight, Code2, Film, Grid2X2, Image as ImageIcon, Layers3, Sparkles, Video, X } from "lucide-react";
import { CommandBar } from "@/components/command-bar/CommandBar";
import { ResultsGrid } from "@/components/tasks/ResultsGrid";
import { VIDEO_CAPABILITIES } from "@/models/capabilities/video";
import { IMAGE_CAPABILITIES } from "@/models/capabilities/image";
import { FeatureArt } from "@/components/highfield/FeatureArt";
import { StudioDialog, type DialogContent } from "@/components/highfield/StudioDialog";
import { TopBar } from "@/components/highfield/TopBar";
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
  feature?: "influencer_generation" | "supercomputer_generation" | "katana_generation" | "genjutsu_motion_transfer" | "genjutsu_object_swap" | "ads_generation";
  media?: MediaMode;
  status: string;
  detail: string;
};

const workflows: Workflow[] = [
  { id: "cinema", title: "Cinema Studio", eyebrow: "EVERY FRAME, INTENTIONAL", description: "From an idea to a cinematic shot.", art: "cinema", modelId: "higgsfield__cinema-studio-4.0", status: "Optional Higgsfield API", detail: "Generate a shot with the Cinema Studio 4.0 API. Choose the model's supported duration, resolution and aspect ratio in the video composer. This endpoint requires your Higgsfield API key and provider credits; a multi-shot timeline editor is not included yet." },
  { id: "motion", title: "Motion Transfer", eyebrow: "GENJUTSU", description: "A reference motion. A new perspective.", art: "motion", modelId: "higgsfield__genjutsu-motion-transfer", feature: "genjutsu_motion_transfer", status: "Reference API", detail: "Open the video composer with the Motion Transfer model selected in the admin console. Attach a source video and reference images when prompted, then submit through the connected Genjutsu endpoint." },
  { id: "swap", title: "Object Swap", eyebrow: "GENJUTSU", description: "Reimagine the subject inside your shot.", art: "swap", modelId: "higgsfield__genjutsu-object-swap", feature: "genjutsu_object_swap", status: "Reference API", detail: "Open the video composer with the Object Swap model selected in the admin console. Attach a source video and reference images when prompted, then submit through the connected Genjutsu endpoint." },
  { id: "katana", title: "Katana", eyebrow: "REFERENCE TO RECREATION", description: "Guide a new video take from your source reference.", art: "katana", feature: "katana_generation", status: "Reference video workflow", detail: "Open the video composer with the Katana reference model selected in the admin console. Attach your source take or motion reference when the selected model supports it; the resulting job stays isolated to your workspace." },
  { id: "canvas", title: "Canvas", eyebrow: "CONNECT YOUR IDEAS", description: "A space for the bigger picture.", art: "canvas", status: "Workflow not connected", detail: "An executable node canvas requires saved boards, typed connections and a durable workflow runner. Those features are not connected yet. Image and video jobs currently run in their dedicated studios and appear in your Library." },
  { id: "ads", title: "Ads Studio", eyebrow: "MAKE THE NEXT VARIATION", description: "Create one product or campaign visual.", art: "ads", feature: "ads_generation", media: "image", status: "Image workflow", detail: "Open the image composer with the Ads Studio model selected in the admin console. Describe the product, audience and art direction; the job uses the composer's selected image engine." },
  { id: "influencer", title: "Influencer", eyebrow: "CHARACTER FORWARD", description: "Create social-ready character video.", art: "motion", feature: "influencer_generation", status: "Video workflow", detail: "Open the video composer with the Influencer model selected in the admin console. Attachment and control options follow that model's capabilities." },
  { id: "supercomputer", title: "Supercomputer", eyebrow: "HEAVY VIDEO TASKS", description: "Run demanding generative video work.", art: "katana", feature: "supercomputer_generation", status: "Video workflow", detail: "Open the video composer with the Supercomputer model selected in the admin console. The selected provider handles the video job and stored output remains user-isolated." },
];

export function StudioShell({ initialMode = "image", initialView = "explore" }: { initialMode?: MediaMode; initialView?: StudioView }) {
   const locale = useLocale();
   const router = useRouter();
  const [mode, setMode] = useState<MediaMode>(initialMode);
  const [view, setView] = useState<StudioView>(initialView);
  const [dialog, setDialog] = useState<DialogContent | null>(null);
  const [studioBannerVisible, setStudioBannerVisible] = useState(true);
  const [videoTab, setVideoTab] = useState<"create" | "motion">("create");
  const [modelSelection, setModelSelection] = useState<{ modelId: string; revision: number } | null>(null);
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

  function selectVideoTab(next: "create" | "motion") {
    setVideoTab(next);
    const modelId = next === "motion" ? "higgsfield__genjutsu-motion-transfer" : Object.keys(VIDEO_CAPABILITIES)[0];
    if (modelId && VIDEO_CAPABILITIES[modelId]) window.dispatchEvent(new CustomEvent("highfield:select-model", { detail: { mediaType: "video", modelId } }));
  }

  function openHowItWorks() {
    setDialog({ title: "Video workflow", eyebrow: "HOW IT WORKS", status: "Guided overview", description: "Add references, choose a preset, describe the motion and generate. Preset and model availability follows your connected providers; unavailable workflows are labelled rather than simulated.", actionLabel: "Open connections", actionHref: `${prefix}/connections` });
  }

   function openWorkflow(workflow: Workflow) {
     if (workflow.id === "cinema") { router.push(`${prefix}/cinema`); return; }
    if (workflow.feature) {
      const workflowMode = workflow.media ?? "video";
      if (workflowMode === "image") {
        sessionStorage.setItem("highfield:recipe-draft", JSON.stringify({
          prompt: "Create one polished ad visual for the described product or campaign. Add the subject, audience and visual direction. Preserve any attached product reference. Use one clear focal idea, believable product details and controlled lighting. Do not invent logos, certifications or claims.",
          mediaType: "image",
          requiredImages: 0,
        }));
      }
      navigate("create", workflowMode);
      void (async () => {
        let modelId = workflow.modelId || (workflowMode === "image" ? Object.keys(IMAGE_CAPABILITIES)[0] : Object.keys(VIDEO_CAPABILITIES)[0]);
        try {
          const response = await fetch("/api/model-defaults", { cache: "no-store" });
          if (response.ok) {
            const data = await response.json() as { settings?: Record<string, string | null> };
            modelId = data.settings?.[workflow.feature!] || modelId;
          }
        } catch { modelId = workflow.modelId || (workflowMode === "image" ? Object.keys(IMAGE_CAPABILITIES)[0] : Object.keys(VIDEO_CAPABILITIES)[0]); }
        const modelAvailable = workflowMode === "image" ? Object.hasOwn(IMAGE_CAPABILITIES, modelId) : Object.hasOwn(VIDEO_CAPABILITIES, modelId);
        if (modelAvailable) {
          window.dispatchEvent(new CustomEvent("highfield:select-model", { detail: { mediaType: workflowMode, modelId, workflowFeature: workflow.feature } }));
        }
      })();
      return;
    }
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


  function openApi() {
    setDialog({ title: "Build on your studio", eyebrow: "MCP / API", status: "Read-only MCP · REST generation routes", description: "Highfield exposes model discovery and job history through its authenticated read-only MCP endpoint. Generation uses the existing REST routes; MCP generation tools are not available yet. Director can plan shots with your configured local planning model.", endpoint: `${window.location.origin}/api/mcp`, actionLabel: "Explore providers", actionHref: `${prefix}/providers`, links: [{ label: "Image model catalog", href: "/api/image-models" }, { label: "Video model catalog", href: "/api/models" }, { label: "Director", href: `${prefix}/director` }] });
  }

  return (
    <div className={`hf-shell hf-view-${view}`}>
      <a className="hf-skip" href="#highfield-workspace">Skip to workspace</a>
      <TopBar active={view === "explore" ? "explore" : mode === "image" ? "image" : "video"} onMcpClick={openApi} />
      <main id="highfield-workspace" className="hf-main" tabIndex={-1}>
        {view === "explore" ? (
          <div className="hf-explore">
            <section className="hf-hero-grid" aria-label="Featured studios">{workflows.slice(0, 3).map(workflow => (
              <button key={workflow.id} className="hf-hero-card" onClick={() => openWorkflow(workflow)}>
                <div className="hf-hero-art"><FeatureArt kind={workflow.art} /><span className="hf-hero-badge">{workflow.modelId ? "API CONNECTION" : "NOT CONNECTED"}</span></div>
                <strong>{workflow.title}</strong>
                <span>{workflow.description}</span>
              </button>
            ))}</section>
            <section className="hf-feature-cards" aria-label="Studio features">
              <button className="hf-feature-card" onClick={() => { router.push(`${prefix}/cinema`); }}><div className="hf-feature-card-top"><span className="hf-feature-card-icon"><Film size={17} /></span><span className="hf-feature-card-badge">New</span></div><strong>Cinema Studio 4.0</strong><span>Create cinematic scenes effortlessly with saved projects and shot planning.</span></button>
              <button className="hf-feature-card" onClick={() => openWorkflow(workflows[1])}><div className="hf-feature-card-top"><span className="hf-feature-card-icon"><Video size={17} /></span><span className="hf-feature-card-badge">API</span></div><strong>Genjutsu Motion Transfer</strong><span>One video in. A new perspective out, with the same motion.</span></button>
              <button className="hf-feature-card" onClick={() => openWorkflow(workflows[2])}><div className="hf-feature-card-top"><span className="hf-feature-card-icon"><Layers3 size={17} /></span><span className="hf-feature-card-badge">API</span></div><strong>Genjutsu Object Swap</strong><span>Reimagine the subject inside your shot with a direct API call.</span></button>
              <button className="hf-feature-card" onClick={() => openWorkflow(workflows[7])}><div className="hf-feature-card-top"><span className="hf-feature-card-icon"><Video size={17} /></span><span className="hf-feature-card-badge">Model</span></div><strong>Influencer</strong><span>Create social-ready character video with the admin-selected model.</span></button>
              <button className="hf-feature-card" onClick={() => openWorkflow(workflows[8])}><div className="hf-feature-card-top"><span className="hf-feature-card-icon"><Video size={17} /></span><span className="hf-feature-card-badge">Model</span></div><strong>Supercomputer</strong><span>Run demanding generative video work with the admin-selected model.</span></button>
              <button className="hf-feature-card" onClick={openApi}><div className="hf-feature-card-top"><span className="hf-feature-card-icon"><Code2 size={17} /></span></div><strong>MCP for local agents</strong><span>Read-only tools for model discovery and job history, exposed at /api/mcp.</span></button>
              <button className="hf-feature-card" onClick={() => { router.push(`${prefix}/audio`); }}><div className="hf-feature-card-top"><span className="hf-feature-card-icon"><AudioLines size={17} /></span></div><strong>VoiceLab audio</strong><span>Create speech, clone voices and transcribe recordings in the integrated audio workspace.</span></button>
              <button className="hf-feature-card" onClick={() => { router.push(`${prefix}/presets`); }}><div className="hf-feature-card-top"><span className="hf-feature-card-icon"><Sparkles size={17} /></span><span className="hf-feature-card-badge">New</span></div><strong>Visual Effects</strong><span>45 effect drafts with curated prompt interpretations and public examples.</span></button>
            </section>
            <aside className="hf-provider-banner"><div className="hf-banner-symbol"><Sparkles size={24} /></div><div><strong>A studio that works your way.</strong><p>Connect direct providers, discover models and keep your generations in one library.</p></div><Link href={`${prefix}/connections`}>Manage connections<ArrowUpRight size={15} /></Link></aside>
            <footer className="hf-footer"><span>Highfield · Open-source creative studio</span><a href="https://github.com/helloworldxdwastaken/open-higgsfield" target="_blank" rel="noopener noreferrer">Fork of Open-Higgsfield<ArrowUpRight size={12} /></a></footer></div>
        ) : (
          <div className={`hf-studio-workspace ${view === "create" && mode === "video" ? "hf-video-mode" : ""}`}>
            {view === "library" ? (
              <>
                <div className="hf-workspace-heading"><div><span className="hf-eyebrow">YOUR CREATIVE ARCHIVE</span><h1>Your library</h1></div><div className="hf-workspace-controls"><div className="hf-library-tabs" aria-label="Library media type"><button className={mode === "image" ? "is-active" : ""} onClick={() => navigate("library", "image")} aria-pressed={mode === "image"}><ImageIcon size={14} />Images</button><button className={mode === "video" ? "is-active" : ""} onClick={() => navigate("library", "video")} aria-pressed={mode === "video"}><Video size={14} />Videos</button></div></div></div>
                <div className="hf-results-region"><ResultsGrid mode={mode} /></div>
                <div className="hf-library-footer"><ArrowDownToLine size={14} /><span>Completed generations can be previewed and downloaded from their cards.</span><button onClick={() => navigate("create")}>Create {mode}<ArrowUpRight size={14} /></button></div>
              </>
            ) : mode === "video" ? (
              <div className="hf-video-layout">
                <aside className="hf-video-panel" aria-label="Video composer">
                  <div className="hf-video-tabs" role="tablist" aria-label="Video workspace modes">
                    <button role="tab" aria-selected={videoTab === "create"} className={videoTab === "create" ? "is-active" : ""} onClick={() => selectVideoTab("create")}>Create Video</button>
                    <button role="tab" aria-selected={false} disabled title="Edit Video is not implemented yet">Edit Video</button>
                    <button role="tab" aria-selected={videoTab === "motion"} className={videoTab === "motion" ? "is-active" : ""} onClick={() => selectVideoTab("motion")}>Motion Control</button>
                  </div>
                  <CommandBar mode="video" onModeChange={nextMode => navigate("create", nextMode)} variant="panel" />
                </aside>
                <div className="hf-video-main">
                  {studioBannerVisible && (
              <div className="hf-studio-banner" role="region" aria-label="Feature announcement">
                <div className="hf-studio-banner-copy"><span>Bring your stories to life</span><span>Create cinematic shots from prompts</span></div>
                <button className="hf-studio-banner-cta" onClick={() => { router.push(`${prefix}/cinema`); }}>Open Cinema Studio</button>
                <button className="hf-studio-banner-close" aria-label="Dismiss banner" onClick={() => setStudioBannerVisible(false)}><X size={14} /></button>
              </div>
            )}
                  <div className="hf-video-main-top">
                    <button className="hf-subtle-button" onClick={() => document.getElementById("highfield-results")?.scrollIntoView({ behavior: "smooth" })}>History</button>
                    <button className="hf-subtle-button" onClick={openHowItWorks}>How it works</button>
                  </div>
                  <div id="highfield-results" className="hf-results-region"><ResultsGrid mode="video" /></div>
                </div>
              </div>
            ) : (
              <>
                {studioBannerVisible && (
              <div className="hf-studio-banner" role="region" aria-label="Feature announcement">
                <div className="hf-studio-banner-copy"><span>Bring your stories to life</span><span>Create cinematic shots from prompts</span></div>
                <button className="hf-studio-banner-cta" onClick={() => { router.push(`${prefix}/cinema`); }}>Open Cinema Studio</button>
                <button className="hf-studio-banner-close" aria-label="Dismiss banner" onClick={() => setStudioBannerVisible(false)}><X size={14} /></button>
              </div>
            )}
                <div className="hf-workspace-heading hf-workspace-heading-compact"><div className="hf-workspace-controls"><button className="hf-subtle-button" onClick={() => navigate("library")}><Grid2X2 size={14} />View library<ChevronRight size={13} /></button></div></div>
                <div className="hf-results-region"><ResultsGrid mode={mode} /></div>
              </>
            )}
          </div>
        )}
      </main>
      {view === "create" && mode === "image" && <div className="hf-composer"><CommandBar mode={mode} onModeChange={nextMode => navigate("create", nextMode)} /></div>}
      {dialog && <StudioDialog content={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
