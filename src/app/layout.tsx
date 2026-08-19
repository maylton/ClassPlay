import type { Metadata } from "next";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import "./v02.css";
import "./identity.css";

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
