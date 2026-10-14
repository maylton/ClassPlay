import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { GameIcon, ToneIcon } from "@/components/GameIcon";
import { GAME_MODE_CATALOG, GAME_MODE_ORDER } from "@/lib/game-catalog";

export default function Home() {
  return (
    <div className="cp-landing">
      <header className="cp-landing-nav">
        <Link className="brand" href="/" aria-label="ClassPlay home"><span className="brand-mark">C</span><span>ClassPlay</span></Link>
        <nav aria-label="Public navigation">
          <Link href="/community">Community</Link>
          <Link href="/class/join">Join a class</Link>
          <Link className="button button-soft button-small" href="/dashboard">Teacher sign in</Link>
        </nav>
      </header>

      <main>
        <section className="cp-hero">
          <div className="cp-hero-copy">
            <span className="eyebrow">For language teachers</span>
            <h1>One activity. <span className="cp-highlight">Many ways to play.</span></h1>
            <p>Add your vocabulary or sentences once. ClassPlay turns them into flashcards, quizzes, memory, arcade games and live class challenges.</p>
            <div className="cp-hero-actions">
              <Link className="button button-primary button-large" href="/dashboard">Start teaching <AppIcon name="arrow-right" /></Link>
              <Link className="button button-soft button-large" href="/community"><AppIcon name="controller" /> Play free games</Link>
            </div>
            <small>Free Community games · Students join with a code, no account needed</small>
          </div>

          <div className="cp-hero-demo" aria-label="Example: a ClassPlay quiz question">
            <div className="cp-demo-progress"><span>Question 3 of 8</span><span className="cp-demo-bar"><i /></span></div>
            <div className="cp-demo-prompt"><small>What does it mean?</small><strong>brush my teeth</strong></div>
            <div className="cp-demo-answers">
              <span><b>A</b>ir para a escola</span>
              <span className="wrong"><b>B</b>almoçar</span>
              <span className="correct"><b>C</b>escovar os dentes</span>
              <span><b>D</b>jogar</span>
            </div>
            <p className="cp-demo-feedback"><AppIcon name="stars" /> Nice! +130 points</p>
          </div>
        </section>

        <section className="cp-section" aria-labelledby="games-title">
          <div className="cp-section-head">
            <span className="eyebrow">Game modes</span>
            <h2 id="games-title">Same content, a different game every class.</h2>
          </div>
          <div className="cp-game-list">
            {GAME_MODE_ORDER.map((game) => (
              <article className="cp-game-list-item" key={game}>
                <GameIcon game={game} />
                <div><h3>{GAME_MODE_CATALOG[game].name}</h3><p>{GAME_MODE_CATALOG[game].landingDescription}</p></div>
              </article>
            ))}
            <article className="cp-game-list-item">
              <ToneIcon icon="fire" tone="pink" />
              <div><h3>Dynamite</h3><p>A live game for the whole room: answer before the fuse runs out. Last player standing wins.</p></div>
            </article>
          </div>
        </section>

        <section className="cp-section" aria-labelledby="how-title">
          <div className="cp-section-head">
            <span className="eyebrow">How it works</span>
            <h2 id="how-title">From your lesson to a game in three steps.</h2>
          </div>
          <ol className="cp-steps">
            <li><b>Add your language</b><span>Words, meanings, example sentences or gaps. Images are optional.</span></li>
            <li><b>ClassPlay picks the games</b><span>Only the game modes that fit your content are unlocked.</span></li>
            <li><b>Play or share</b><span>Project it in class, start a live room with phones, or send a practice link.</span></li>
          </ol>
        </section>
      </main>

      <footer className="cp-footer">
        <div className="cp-footer-main">
          <div className="cp-footer-brand">
            <Link className="brand" href="/" aria-label="ClassPlay home"><span className="brand-mark">C</span><span>ClassPlay</span></Link>
            <p>Playful language practice, built for teachers.</p>
            <a href="https://langspot.app" target="_blank" rel="noreferrer">A LangSpot project <AppIcon name="arrow-up-right" /></a>
          </div>
          <nav aria-label="Footer navigation">
            <h2>Explore</h2>
            <Link href="/community">Community activities</Link>
            <Link href="/class/join">Join a class</Link>
            <Link href="/dashboard">Teacher dashboard</Link>
          </nav>
          <div>
            <h2>Contact</h2>
            <a href="mailto:maylton.fernandes@gmail.com"><AppIcon name="envelope" /> maylton.fernandes@gmail.com</a>
            <a href="https://www.instagram.com/teacher.maylton/" target="_blank" rel="noreferrer"><AppIcon name="instagram" /> @teacher.maylton</a>
          </div>
        </div>
        <div className="cp-footer-bottom"><span>© {new Date().getFullYear()} ClassPlay</span><span>One activity. Many ways to play.</span></div>
      </footer>
    </div>
  );
}
