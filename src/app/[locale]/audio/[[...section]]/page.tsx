import type { Metadata } from "next";
import { AudioWorkspace } from "@/components/audio/AudioWorkspace";
export const metadata: Metadata = { title: "VoiceLab" };
export default function AudioPage() { return <AudioWorkspace />; }
