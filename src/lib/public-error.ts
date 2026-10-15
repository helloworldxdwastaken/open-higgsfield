export function publicErrorMessage(error: unknown, fallback = "ERR_GENERATION_FAILED"): string {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    // Provider details and filesystem errors can contain credentials, signed URLs
    // or machine paths. Return only the stable identifier, never its detail suffix.
    const code = message.match(/^(ERR_[A-Z0-9_]{1,96})(?:: [\s\S]*)?$/)?.[1];
    return code || (/^ERR_[A-Z0-9_]{1,96}$/.test(fallback) ? fallback : "ERR_GENERATION_FAILED");
}
