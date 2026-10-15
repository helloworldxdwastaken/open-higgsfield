import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Highfield - Image & Video Studio",
        short_name: "Highfield",
        description: "Open-source multi-provider AI image and video generation studio.",
        start_url: "/",
        display: "standalone",
        background_color: "#060606",
        theme_color: "#d5ff47",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    };
}
