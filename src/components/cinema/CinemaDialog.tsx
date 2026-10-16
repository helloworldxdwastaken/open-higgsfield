"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import styles from "@/app/[locale]/cinema/cinema.module.css";

export function CinemaDialog({ title, eyebrow, children, onClose, locked = false }: { title: string; eyebrow?: string; children: React.ReactNode; onClose: () => void; locked?: boolean }) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    useEffect(() => { const element = ref.current; element?.showModal(); return () => element?.close(); }, []);
    return <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!locked) onClose(); }} onClick={event => {
        if (locked || event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}><div className={styles.dialogInner}><button type="button" className={styles.closeButton} aria-label="Close dialog" onClick={onClose} disabled={locked}><X size={17} /></button>{eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}<h2 id={titleId}>{title}</h2>{children}</div></dialog>;
}
