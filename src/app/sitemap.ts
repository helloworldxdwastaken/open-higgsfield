import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
    const origin = process.env.STUDIO_PUBLIC_ORIGIN;
    return origin ? [{ url: new URL("/en", origin).href, changeFrequency: "weekly", priority: 1 }] : [];
}
