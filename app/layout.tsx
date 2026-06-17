import type { Metadata } from "next";
import { Geist, Geist_Mono, Orbitron } from "next/font/google";
import { TopBar } from "@/components/TopBar";
import { PlayerProvider } from "@/components/PlayerProvider";
import { OnionIdGate } from "@/components/OnionIdGate";
import { ShaderBackground } from "@/components/ShaderBackground";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "OnionDAO Arcade",
  description: "Local arcade minigames with leaderboards",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark h-full ${geistSans.variable} ${geistMono.variable} ${orbitron.variable}`}
    >
      <body className="arcade-bg relative flex min-h-full flex-col text-[var(--text)]">
        <ShaderBackground />
        <div
          aria-hidden
          className="scanlines pointer-events-none fixed inset-0 z-50 opacity-30 mix-blend-overlay"
        />
        <PlayerProvider>
          <TopBar />
          {children}
          <OnionIdGate />
        </PlayerProvider>
      </body>
    </html>
  );
}
