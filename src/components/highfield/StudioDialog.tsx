"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";

export type DialogContent = {
  title: string;
  eyebrow: string;
  status: string;
  description: string;
  endpoint?: string;
  actionLabel: string;
  actionHref?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  links?: { label: string; href: string }[];
};

export function StudioDialog({ content, onClose }: { content: DialogContent; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialogRef.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return <dialog ref={dialogRef} className="hf-dialog" aria-labelledby="hf-dialog-title" aria-describedby="hf-dialog-description" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <div className="hf-dialog-content"><button className="hf-dialog-close" aria-label="Close dialog" onClick={onClose}><X size={19} /></button><span className="hf-eyebrow">{content.eyebrow}</span><h2 id="hf-dialog-title">{content.title}</h2><span className="hf-dialog-status">{content.status}</span><p id="hf-dialog-description">{content.description}</p>{content.endpoint && <div className="hf-dialog-endpoint"><span>MCP endpoint · HTTP POST</span><code>{content.endpoint}</code></div>}{content.links && <div className="hf-dialog-links">{content.links.map(link => <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}<ArrowUpRight size={14} /></a>)}</div>}<div className="hf-dialog-actions">{content.actionHref ? <Link className="hf-dialog-primary" href={content.actionHref}>{content.actionLabel}<ArrowUpRight size={15} /></Link> : <button className="hf-dialog-primary" onClick={content.onAction}>{content.actionLabel}<ArrowUpRight size={15} /></button>}{content.secondaryHref && <Link className="hf-dialog-secondary" href={content.secondaryHref}>{content.secondaryLabel}</Link>}</div></div>
  </dialog>;
}
