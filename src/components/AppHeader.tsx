import Link from "next/link";
import { Brand } from "./Brand";

export function AppHeader() {
  return <header className="app-header"><Brand /><nav className="header-nav" aria-label="Main navigation"><Link href="/dashboard">Library</Link><Link className="button button-primary button-small" href="/create">+ Create activity</Link></nav></header>;
}
