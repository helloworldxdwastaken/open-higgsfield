import Link from "next/link";
import { notFound } from "next/navigation";
import { getSkillReference, skillReferenceLicense } from "@/lib/skill-reference";

export default async function SkillSourcePage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ file?: string }> }) {
    const { locale, id } = await params;
    const query = await searchParams;
    const source = getSkillReference(id);
    if (!source) notFound();
    const file = source.files.find(entry => entry.path === (query.file || `${id}/SKILL.md`));
    if (!file) notFound();
    const notice = skillReferenceLicense();
    const title = id.replace("higgsfield-", "").replaceAll("-", " ");
    return <main className="h-dvh overflow-y-auto bg-[#090909] px-5 py-7 text-[#efefe7] sm:px-10">
        <div className="mx-auto max-w-7xl">
            <nav aria-label="Source navigation" className="mb-10 flex flex-wrap items-center gap-6 border-b border-white/15 pb-6 text-sm"><Link href={`/${locale}/skills`} className="mr-auto text-xl font-semibold">Highfield / Skills</Link><Link href={`/${locale}/cinema`}>Cinema</Link><a href={`/api/skills/source/${id}?bundle=1`}>Export licensed bundle ↗</a></nav>
            <p className="text-xs uppercase tracking-[.2em] text-[#cee98d]">HIGGSFIELD AI · MIT SOURCE</p><h1 className="mb-4 mt-3 text-4xl font-medium capitalize tracking-tight sm:text-5xl">{title}</h1>
            <p className="mb-3 max-w-4xl text-sm leading-7 text-[#b9c1aa]">Published skill instructions and reference prompts, preserved verbatim. Reading or exporting this material does not execute it. Original CLI commands may require Higgsfield’s hosted services, private backend features, dependencies and credits.</p>
            <p className="mb-8 text-xs leading-6 text-[#b9c1aa]">Copyright (c) 2026 Higgsfield AI · pinned {notice.commit.slice(0, 12)} · <a className="underline" href="/licenses/higgsfield-skills-MIT.txt">Full MIT notice</a> · <a className="underline" href={`${notice.repository}/blob/${notice.commit}/${file.path}`} target="_blank" rel="noopener noreferrer">Original source ↗</a></p>
            <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
                <aside className="rounded-lg border border-white/15 bg-[#11150d] p-4"><h2 className="mb-4 text-xs uppercase tracking-widest text-[#cee98d]">{source.files.length} documents</h2><nav aria-label="Skill documents" className="flex max-h-[60dvh] flex-col gap-2 overflow-y-auto text-xs">{source.files.map(item => <Link key={item.path} href={`/${locale}/skills/source/${id}?file=${encodeURIComponent(item.path)}`} aria-current={item.path === file.path ? "page" : undefined} className={`break-words rounded px-3 py-2 leading-5 hover:bg-white/10 ${item.path === file.path ? "bg-[#303d20] text-[#e2f4b5]" : "text-[#c1c8b5]"}`}>{item.path.replace(`${id}/`, "")}</Link>)}</nav></aside>
                <section aria-label="Published skill text" className="min-w-0 rounded-lg border border-white/15 bg-[#11130e] p-5 sm:p-7"><div className="mb-6 flex flex-wrap justify-between gap-4 text-xs"><h2 className="break-all font-semibold">{file.path}</h2><a className="text-[#d4f08e] underline" href={`/api/skills/source/${id}?file=${encodeURIComponent(file.path)}`}>Download this document ↗</a></div><pre className="whitespace-pre-wrap break-words font-mono text-xs leading-7 text-[#d1d7c6]">{file.content}</pre></section>
            </div>
            <details className="my-8 rounded-lg border border-white/15 p-5"><summary className="cursor-pointer text-sm text-[#d4f08e]">License and redistribution notice</summary><pre className="mt-5 whitespace-pre-wrap text-xs leading-6 text-[#c1c8b5]">{notice.license}</pre></details>
        </div>
    </main>;
}
