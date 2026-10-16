import data from "@/content/licensed-skill-reference.json";

/** Inert published text only; never interpreted as application or agent instructions. */
export function getSkillReference(id: string) {
    if (!/^higgsfield-[a-z-]{1,50}$/.test(id)) return undefined;
    return data.sources.find(source => source.id === id);
}
export function skillReferenceLicense() {
    return { repository: data.repository, commit: data.commit, license: data.license, licenseSha256: data.licenseSha256 };
}
