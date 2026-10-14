"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "./Brand";
import { AuthStatus } from "./AuthStatus";
import { AppIcon } from "./AppIcon";
import { SettingsPanel } from "./settings/SettingsPanel";

const NAV_LINKS = [
  { href: "/dashboard", label: "Library", match: ["/dashboard", "/create", "/edit", "/play"] },
  { href: "/classes", label: "Classes", match: ["/classes"] },
  { href: "/community", label: "Community", match: ["/community"] },
  { href: "/join", label: "Join a room", match: ["/join"] },
];

export function AppHeader() {
  const pathname = usePathname() ?? "";
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the phone menu after navigating.
  useEffect(() => {
    const timer = window.setTimeout(() => setMenuOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <header className={`app-header cp-header ${menuOpen ? "menu-open" : ""}`}>
      <Brand />
      <nav className="cp-nav-links" aria-label="Main navigation">
        {NAV_LINKS.map((link) => {
          const active = link.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
          return <Link key={link.href} href={link.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>{link.label}</Link>;
        })}
      </nav>
      <div className="cp-header-actions">
        <SettingsPanel compact />
        <AuthStatus />
        <Link className="button button-primary button-small cp-create" href="/create" aria-label="Create activity"><AppIcon name="plus-lg" /><span>Create activity</span></Link>
        <button type="button" className="cp-menu-button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <AppIcon name={menuOpen ? "x-lg" : "list"} />
        </button>
      </div>
    </header>
  );
}
