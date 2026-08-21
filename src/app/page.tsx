import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { Brand } from "@/components/Brand";
import { GAME_MODE_CATALOG, GAME_MODE_ORDER } from "@/lib/game-catalog";

export default function Home() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav">
        <Brand />
        <div className="landing-public-links">
          <Link href="/community">Community</Link>
          <Link href="/class/join">Join a class</Link>
          <Link className="button button-ghost" href="/dashboard">Teacher dashboard</Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><span className="status-dot" /> Built for the classroom</span>
          <h1>One activity.<br/><span>Many ways to play.</span></h1>
          <p>Create beautiful English activities once, then reuse the same content across different game modes — from flashcards and memory to quizzes and more.</p>
          <div className="hero-actions">
            <Link className="button button-primary button-large" href="/dashboard">Start teaching <AppIcon name="arrow-right" /></Link>
            <Link className="button button-soft button-large" href="/community"><AppIcon name="globe2" /> Play free activities</Link>
          </div>
          <div className="hero-note">Community games are free to play · Student accounts keep classes and homework connected</div>
        </div>
        <div className="hero-demo" aria-label="ClassPlay activity preview">
          <div className="demo-window">
            <div className="demo-topbar"><span/><span/><span/><b>ClassPlay</b></div>
            <div className="demo-progress"><span /></div>
            <div className="demo-content">
              <small>SENTENCE BUILDER</small>
              <h2>Put the sentence in order</h2>
              <div className="demo-answer"><span>She</span><span>has breakfast</span><span>before school</span></div>
              <div className="demo-chips"><span>before school</span><span>She</span><span>has breakfast</span></div>
              <button>Check answer</button>
            </div>
          </div>
        </div>
      </section>

      <section className="feature-section">
        <div className="section-heading"><span className="eyebrow">Activity engine</span><h2>Teach the same language in different ways.</h2></div>
        <div className="feature-grid">
          {GAME_MODE_ORDER.map((game) => {
            const info = GAME_MODE_CATALOG[game];
            return <article className="feature-card" key={game}><span className="feature-icon"><AppIcon name={info.icon} /></span><h3>{info.name}</h3><p>{info.landingDescription}</p></article>;
          })}
          <article className="feature-card"><span className="feature-icon"><AppIcon name="fire" /></span><h3>Dynamite</h3><p>Pass the fuse around the room in a fast-paced Live elimination game. Answer correctly before it blows — last player standing wins.</p></article>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-main">
          <section className="landing-footer-intro" aria-labelledby="footer-brand-title">
            <Link className="brand landing-footer-brand" href="/" aria-label="ClassPlay home">
              <span className="brand-mark">C</span>
              <span id="footer-brand-title">ClassPlay</span>
            </Link>
            <p>Playful English practice, built for teachers and made to keep students involved.</p>
            <a className="landing-footer-project" href="https://langspot.app" target="_blank" rel="noreferrer">A LangSpot project <AppIcon name="arrow-up-right" /></a>
          </section>

          <nav className="landing-footer-column" aria-label="Footer navigation">
            <h2>Explore</h2>
            <Link href="/community">Community activities</Link>
            <Link href="/class/join">Join a class</Link>
            <Link href="/dashboard">Teacher dashboard</Link>
          </nav>

          <section className="landing-footer-column landing-footer-contact" aria-labelledby="footer-contact-title">
            <h2 id="footer-contact-title">Contact</h2>
            <p>Questions, ideas or classroom feedback? Talk to us.</p>
            <a href="mailto:maylton.fernandes@gmail.com"><AppIcon name="envelope" /><span>maylton.fernandes@gmail.com</span></a>
            <a href="https://www.instagram.com/teacher.maylton/" target="_blank" rel="noreferrer"><AppIcon name="instagram" /><span>@teacher.maylton</span></a>
          </section>
        </div>

        <div className="landing-footer-bottom">
          <span>© {new Date().getFullYear()} ClassPlay</span>
          <span>One activity. Many ways to play.</span>
        </div>
      </footer>
    </main>
  );
}
