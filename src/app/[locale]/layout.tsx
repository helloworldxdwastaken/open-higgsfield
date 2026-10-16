import type { Metadata } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/app/globals.css";

const inter = localFont({
    src: "../../fonts/InterVariable.woff2",
    variable: "--font-inter",
    weight: "400 800",
    display: "swap",
});

const spaceGrotesk = localFont({
    src: "../../fonts/SpaceGroteskVariable.woff2",
    variable: "--font-space-grotesk",
    weight: "500 700",
    display: "swap",
});

export const metadata: Metadata = {
    metadataBase: new URL(process.env.STUDIO_PUBLIC_ORIGIN || "http://localhost:3000"),
    title: {
        default: "Highfield — Your creative studio",
        template: "%s | Highfield",
    },
    description: "An open-source creative studio for image, video and connected media engines. Choose your models, connect your providers and keep your work together.",
    keywords: [
        "AI image generator",
        "AI video generator",
        "open source AI studio",
        "Higgsfield alternative",
        "open source Higgsfield",
        "Open-Higgsfield",
        "Gemini image generation",
        "Veo video generation",
        "Vertex AI",
        "Vercel AI Gateway",
        "Freepik API",
        "Flux image generator",
        "Kling video generator",
    ],
    authors: [{ name: "TechBe", url: "https://techbe.me" }],
    creator: "TechBe",
    applicationName: "Highfield",
    alternates: {
        canonical: "/",
        languages: {
            "en": "/en",
            "pt-BR": "/pt-BR",
        },
    },
    openGraph: {
        type: "website",
        url: "/",
        siteName: "Highfield",
        title: "Highfield — Your creative studio",
        description: "Generate AI images and videos across multiple providers from one free, self-hostable studio.",
    },
    twitter: {
        card: "summary_large_image",
        title: "Highfield — Your creative studio",
        description: "Generate AI images and videos across multiple providers from one free, self-hostable studio.",
    },
    icons: { icon: "/icon.svg" },
};

export default async function LocaleLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const messages = await getMessages();

    return (
        <html lang={locale} className="dark">
            <body className={`${inter.variable} ${spaceGrotesk.variable}`}>
                <NextIntlClientProvider messages={messages}>
                    <TooltipProvider>{children}</TooltipProvider>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
