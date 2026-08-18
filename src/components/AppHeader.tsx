import Link from "next/link";
import { Brand } from "./Brand";
import { AuthStatus } from "./AuthStatus";
import { AppIcon } from "./AppIcon";
import { SettingsPanel } from "./settings/SettingsPanel";

export function AppHeader() {
  return (
    <header className="app-header">
      <Brand />
      <nav className="header-nav" aria-label="Main navigation">
        <Link href="/dashboard">Library</Link>
        <Link href="/join">Join</Link>
        <SettingsPanel />
        <AuthStatus />
        <Link className="button button-primary button-small" href="/create"><AppIcon name="plus-lg" /> Create activity</Link>
      </nav>
    </header>
  );
}
