import type { Metadata } from "next";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import "./features.css";
import "./studio.css";
import "./smart-builder.css";
import "./memory-game.css";
import "./sentence-builder.css";
import "./arcade.css";
import "./space-blaster-rocket.css";
import "./boss-battle.css";
import "./ignis-boss.css";
import "./bubble-burst.css";
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

export const metadata: Metadata = {
  title: "ClassPlay — Playful English practice",
  description: "Create interactive classroom activities for English lessons.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
