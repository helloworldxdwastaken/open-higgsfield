"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale } from "next-intl";
import { Layers3, SlidersHorizontal, Sparkles, X } from "lucide-react";

type TopBarActive = "explore" | "image" | "video" | "effects" | "cinema" | "skills";

interface TopBarProps {
  active?: TopBarActive;
  audioStudioUrl?: string;
  onMcpClick?: () => void;
  onAudioClick?: () => void;
}

export function TopBar({ active, audioStudioUrl, onMcpClick, onAudioClick }: TopBarProps) {
  const locale = useLocale();
  const prefix = `/${locale}`;
  const [promoVisible, setPromoVisible] = useState(true);
  return (
    <>
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
          <Link href={prefix} className={active === "explore" ? "is-active" : ""} aria-current={active === "explore" ? "page" : undefined}>Explore</Link>
          <Link href={`${prefix}/?mode=image&view=create`} className={active === "image" ? "is-active" : ""} aria-current={active === "image" ? "page" : undefined}>Image</Link>
          <Link href={`${prefix}/?mode=video&view=create`} className={active === "video" ? "is-active" : ""} aria-current={active === "video" ? "page" : undefined}>Video</Link>
          {audioStudioUrl ? <a href={audioStudioUrl}>Audio<External /></a> : <button onClick={onAudioClick}>Audio</button>}
          <button onClick={onMcpClick}>MCP</button>
          <Link href={`${prefix}/providers`}>API</Link>
          <Link href={`${prefix}/presets`} className={active === "effects" ? "is-active" : ""} aria-current={active === "effects" ? "page" : undefined}>Effects</Link>
          <Link href={`${prefix}/cinema`} className={active === "cinema" ? "is-active" : ""} aria-current={active === "cinema" ? "page" : undefined}>Cinema Studio<span className="hf-nav-new">New</span></Link>
          <Link href={`${prefix}/skills`} className={`hf-nav-secondary ${active === "skills" ? "is-active" : ""}`} aria-current={active === "skills" ? "page" : undefined}>Skills</Link>
          <Link href={`${prefix}/director`} className="hf-nav-secondary">Director</Link>
        </nav>
        <div className="hf-header-actions">
          <Link href={`${prefix}/providers`} className="hf-pill"><Layers3 size={14} /><span>Providers</span></Link>
          <Link href={`${prefix}/connections`} className="hf-pill hf-pill-accent"><SlidersHorizontal size={14} /><span>Connections</span></Link>
        </div>
      </header>
    </>
  );
}

function External() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="hf-nav-external" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
