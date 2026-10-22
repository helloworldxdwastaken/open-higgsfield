import { StudioShell } from "@/components/studio/StudioShell";
export default async function StudioPage({ searchParams }: { searchParams: Promise<{ mode?: string; view?: string }> }) {
  const params = await searchParams;
  return <StudioShell initialMode={params.mode === "video" ? "video" : "image"} initialView={params.view === "library" ? "library" : params.mode === "video" || params.mode === "image" ? "create" : "explore"} />;
}
