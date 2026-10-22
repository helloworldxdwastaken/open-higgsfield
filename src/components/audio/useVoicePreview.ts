"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioJob } from "@/types/audio";

export function useVoicePreview(onError: (message: string) => void) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [state, setState] = useState<{ id: string | null; loading: boolean; playing: boolean }>({ id: null, loading: false, playing: false });
    const sequence = useRef(0); const currentId = useRef<string | null>(null); const cache = useRef(new Map<string, string>());
    const stop = useCallback(() => { sequence.current++; audioRef.current?.pause(); currentId.current = null; setState({ id: null, loading: false, playing: false }); }, []);
    const invalidate = useCallback(() => { sequence.current++; }, []);
    useEffect(() => {
        const player = audioRef.current!;
        const started = () => setState({ id: currentId.current, loading: false, playing: true });
        const stopped = () => setState(current => ({ ...current, playing: false }));
        player.addEventListener("play", started); player.addEventListener("pause", stopped); player.addEventListener("ended", stopped);
        return () => { invalidate(); player.pause(); player.removeEventListener("play", started); player.removeEventListener("pause", stopped); player.removeEventListener("ended", stopped); };
    }, [invalidate]);
    const play = useCallback(async (id: string) => {
        const player = audioRef.current!;
        if (currentId.current === id && !player.paused) { player.pause(); return; }
        player.pause(); currentId.current = id; const request = ++sequence.current;
        setState({ id, loading: true, playing: false });
        try {
            let url = cache.current.get(id);
            if (!url) {
                const response = await fetch("/api/audio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", ...(id.startsWith("preset:") ? { presetId: id.slice(7) } : { voiceId: id }) }) });
                const result = await response.json(); if (!response.ok) throw new Error(result.error || "The voice preview could not be prepared.");
                if (result.url) url = result.url;
                else {
                    let job: AudioJob = result.job;
                    const deadline = Date.now() + 180_000;
                    while (job.status === "processing" && Date.now() < deadline && sequence.current === request) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        const response = await fetch(`/api/audio/${job.id}`, { cache: "no-store" });
                        const data = await response.json(); if (!response.ok) throw new Error(data.error || "The voice preview could not be loaded.");
                        job = data.job;
                    }
                    if (sequence.current !== request) return;
                    if (job.status !== "completed") throw new Error(job.error || "This voice preview is still processing. Please try again shortly.");
                    url = `/api/audio/${job.id}/media`;
                }
                cache.current.set(id, url!);
            }
            if (sequence.current !== request) return;
            if (player.getAttribute("src") !== url) player.src = url!;
            await player.play();
            setState({ id, loading: false, playing: true });
        } catch (error) {
            if (sequence.current !== request) return;
            setState({ id, loading: false, playing: false });
            onError((error as Error).message === "play() failed because the user didn't interact with the document first." ? "Your preview is ready. Press play to listen." : (error as Error).message);
        }
    }, [onError]);
    return { audioRef, state, play, stop };
}

export type VoicePreview = ReturnType<typeof useVoicePreview>;
