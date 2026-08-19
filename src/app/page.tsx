import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { Brand } from "@/components/Brand";
import { GAME_MODE_CATALOG, GAME_MODE_ORDER } from "@/lib/game-catalog";

export default function Home() {
  return <main className="landing-shell">
    <nav className="landing-nav"><Brand /><Link className="button button-ghost" href="/dashboard">Open dashboard</Link></nav>
    <section className="hero"><div className="hero-copy"><span className="eyebrow"><span className="status-dot" /> Built for the classroom</span><h1>One activity.<br/><span>Many ways to play.</span></h1><p>Create beautiful English activities once, then reuse the same content across different game modes — from flashcards and memory to quizzes and more.</p><div className="hero-actions"><Link className="button button-primary button-large" href="/dashboard">Start teaching <AppIcon name="arrow-right" /></Link><Link className="button button-soft button-large" href="/play/daily-routine-present-simple">Try demo</Link></div><div className="hero-note">No account required for local play · Teacher accounts unlock cloud and live rooms</div></div>
      <div className="hero-demo" aria-label="ClassPlay activity preview"><div className="demo-window"><div className="demo-topbar"><span/><span/><span/><b>ClassPlay</b></div><div className="demo-progress"><span /></div><div className="demo-content"><small>SENTENCE BUILDER</small><h2>Put the sentence in order</h2><div className="demo-answer"><span>She</span><span>has breakfast</span><span>before school</span></div><div className="demo-chips"><span>before school</span><span>She</span><span>has breakfast</span></div><button>Check answer</button></div></div></div></section>
    <section className="feature-section"><div className="section-heading"><span className="eyebrow">Activity engine</span><h2>Teach the same language in different ways.</h2></div><div className="feature-grid">{GAME_MODE_ORDER.map((game) => { const info = GAME_MODE_CATALOG[game]; return <article className="feature-card" key={game}><span className="feature-icon"><AppIcon name={info.icon} /></span><h3>{info.name}</h3><p>{info.landingDescription}</p></article>; })}</div></section>
  </main>;
}
