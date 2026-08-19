import type { Metadata } from "next";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import "./features.css";
import "./studio.css";
import "./smart-builder.css";
import "./memory-game.css";

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
