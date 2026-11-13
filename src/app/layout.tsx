import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { PwaRegister } from "@/components/pitwall/PwaRegister";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "F1 Pit Wall — Save Analyzer",
  description:
    "Local-first F1 Manager save analyzer. Parse your .sav in the browser, read team/season/race metadata. Generated locally — no data leaves your device.",
  keywords: ["F1 Manager", "save analyzer", "pit wall", "local-first"],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/pitwall-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/pitwall-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/pitwall-icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Pit Wall",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#070b11",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <PwaRegister />
      </body>
    </html>
  );
}
