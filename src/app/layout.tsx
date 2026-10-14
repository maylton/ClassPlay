import type { Metadata } from "next";
import { Montserrat, Poppins } from "next/font/google";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import "./features.css";
import "./studio.css";
import "./smart-builder.css";
import "./memory-game.css";
import "./memory-editor.css";
import "./sentence-builder.css";
import "./arcade.css";
import "./space-blaster-rocket.css";
import "./boss-battle.css";
import "./ignis-boss.css";
import "./bubble-burst.css";
// Grammar Runner is paused for now. Keep its stylesheet in the repository for a future revisit.
// import "./grammar-runner.css";
import "./phrase-forge.css";
import "./tower-stack.css";
import "./tower-stack-polish.css";
import "./word-hunt.css";
import "./word-hunt-difficulty.css";
import "./typing-rush.css";
import "./echo-chain.css";
import "./word-maze.css";
import "./dynamite.css";
import "./dynamite-fuse.css";
import "./wildcard-grid.css";
import "./leaderboard.css";
import "./classes.css";
import "./student-auth.css";
import "./community.css";
import "./community-actions.css";
import "./public-entry.css";
import "./account.css";
// Visual system (green, Poppins/Montserrat). Loaded last so it wins over legacy rules.
import "./theme.css";

// Self-hosted at build time by next/font: no runtime request to Google.
const display = Montserrat({ subsets: ["latin", "latin-ext"], weight: ["700", "800"], variable: "--font-display", display: "swap" });
const body = Poppins({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "ClassPlay — Playful English practice",
  description: "Create interactive classroom activities for English lessons.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
