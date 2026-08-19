"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { GAME_MODE_CATALOG, GAME_MODE_ORDER } from "@/lib/game-catalog";
import { copyCommunityActivityToLibrary } from "@/lib/repositories/community-library-repository";
import {
  emptyCommunityTeacherState,
  listCommunityActivities,
  loadCommunityTeacherState,
  publishActivityToCommunity,
  removeActivityFromCommunity,
  type CommunityActivity,
  type CommunityTeacherState,
} from "@/lib/repositories/community-repository";
import type { GameType } from "@/lib/types";

export function CommunityClient() {
  const [activities, setActivities] = useState<CommunityActivity[]>([]);
  const [teacherState, setTeacherState] = useState<CommunityTeacherState>(() => emptyCommunityTeacherState());
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("");
  const [level, setLevel] = useState("");
  const [mode, setMode] = useState<GameType | "">("");
  const [manageOpen, setManageOpen] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    const catalog = await listCommunityActivities();
    setActivities(catalog);
    try {
      setTeacherState(await loadCommunityTeacherState());
    } catch {
      // Teacher tools are optional to the public catalog. A transient auth/tool
      // failure must never make public activities disappear for visitors.
      setTeacherState(emptyCommunityTeacherState());
    }
  }

  useEffect(() => {
    let active = true;

    void listCommunityActivities()
      .then((catalog) => { if (active) setActivities(catalog); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load Community."); })
      .finally(() => { if (active) setLoading(false); });

    void loadCommunityTeacherState()
      .then((teacher) => { if (active) setTeacherState(teacher); })
      .catch(() => { if (active) setTeacherState(emptyCommunityTeacherState()); });

    return () => { active = false; };
  }, []);

  const grades = useMemo(() => Array.from(new Set(activities.map((activity) => activity.grade))).sort(), [activities]);
  const levels = useMemo(() => Array.from(new Set(activities.map((activity) => activity.level))).sort(), [activities]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activities.filter((activity) => {
      if (query && !`${activity.title} ${activity.description} ${activity.topic} ${activity.authorName}`.toLowerCase().includes(query)) return false;
      if (grade && activity.grade !== grade) return false;
      if (level && activity.level !== level) return false;
      if (mode && !activity.gameModes.includes(mode)) return false;
      return true;
    });
  }, [activities, grade, level, mode, search]);

  async function publish(activityId: string) {
    const activity = teacherState.library.find((item) => item.id === activityId);
    if (!activity) return;
    setWorkingId(activityId); setError(""); setNotice("");
    try {
      await publishActivityToCommunity(activity);
      await refresh();
      setNotice(`${activity.title} is now discoverable in Community.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not publish this activity.");
    } finally { setWorkingId(null); }
  }

  async function remove(activityId: string) {
    setWorkingId(activityId); setError(""); setNotice("");
    try {
      await removeActivityFromCommunity(activityId);
      await refresh();
      setNotice("Activity removed from Community. Its direct practice link still works.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove this activity from Community.");
    } finally { setWorkingId(null); }
  }

  async function copyToLibrary(activity: CommunityActivity) {
    setCopyingId(activity.activityId); setError(""); setNotice("");
    try {
      const copy = await copyCommunityActivityToLibrary(activity.activityId);
      await refresh();
      setNotice(`${copy.title} was added to your Library. Your copy can be edited without changing the Community original.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this activity to your Library.");
    } finally { setCopyingId(null); }
  }

  return (
    <main className="community-screen">
      <header className="community-header">
        <Link href="/" className="community-brand"><b>C</b><span>ClassPlay</span></Link>
        <nav><Link className="active" href="/community">Community</Link><Link href="/class/join">Join class</Link><Link href="/student">Student</Link><Link href="/dashboard">Teacher workspace</Link></nav>
      </header>

      <section className="community-hero">
        <div><span className="eyebrow">ClassPlay Community</span><h1>Find something.<br /><em>Start playing.</em></h1><p>Free English activities shared by teachers. Choose a set, pick a game mode, and play instantly.</p></div>
        <div className="community-hero-art" aria-hidden="true"><span><AppIcon name="controller" /></span><b>FREE TO PLAY</b><i><AppIcon name="stars" /></i></div>
      </section>

      <section className="community-toolbar">
        <label className="community-search"><AppIcon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search topic, activity or teacher…" /></label>
        <select value={grade} onChange={(event) => setGrade(event.target.value)}><option value="">All grades</option>{grades.map((item) => <option value={item} key={item}>{item}</option>)}</select>
        <select value={level} onChange={(event) => setLevel(event.target.value)}><option value="">All levels</option>{levels.map((item) => <option value={item} key={item}>{item}</option>)}</select>
        <select value={mode} onChange={(event) => setMode(event.target.value as GameType | "")}><option value="">Any game mode</option>{GAME_MODE_ORDER.map((game) => <option value={game} key={game}>{GAME_MODE_CATALOG[game].name}</option>)}</select>
        {(search || grade || level || mode) && <button className="community-clear" onClick={() => { setSearch(""); setGrade(""); setLevel(""); setMode(""); }}>Clear filters</button>}
      </section>

      {teacherState.teacher && (
        <section className="community-teacher-panel">
          <div><span><AppIcon name="globe2" /></span><div><small>TEACHER TOOLS</small><strong>Share your Library with the Community.</strong><p>Publishing makes an activity discoverable here while keeping the same practice link and leaderboard.</p></div></div>
          <button className="button button-dark" onClick={() => setManageOpen((value) => !value)}>{manageOpen ? "Close manager" : "Manage my activities"} <AppIcon name={manageOpen ? "chevron-up" : "chevron-down"} /></button>
        </section>
      )}

      {manageOpen && teacherState.teacher && (
        <section className="community-publish-panel">
          <div className="community-section-title"><div><span className="eyebrow">My Library</span><h2>Choose what the Community can discover.</h2></div><span>{teacherState.library.length} activities</span></div>
          <div className="community-publish-list">
            {teacherState.library.map((activity) => {
              const published = teacherState.publishedIds.has(activity.id);
              return <article key={activity.id}><div><strong>{activity.title}</strong><span>{activity.topic} · {activity.grade} · {activity.enabledGames.length} modes</span></div>{published ? <button className="button button-soft button-small" disabled={workingId === activity.id} onClick={() => void remove(activity.id)}>{workingId === activity.id ? "Working…" : "Remove from Community"}</button> : <button className="button button-primary button-small" disabled={workingId === activity.id} onClick={() => void publish(activity.id)}>{workingId === activity.id ? "Publishing…" : <>Publish <AppIcon name="globe2" /></>}</button>}</article>;
            })}
            {!teacherState.library.length && <div className="community-empty compact">Create an activity in your Library first.</div>}
          </div>
        </section>
      )}

      {notice && <div className="community-notice"><AppIcon name="check2-circle" /> {notice}</div>}
      {error && <div className="community-error"><AppIcon name="exclamation-triangle" /> {error}</div>}

      <section className="community-catalog">
        <div className="community-section-title"><div><span className="eyebrow">Explore</span><h2>{loading ? "Loading activities…" : `${filtered.length} activities ready to play`}</h2></div>{!loading && <span>{activities.length} shared total</span>}</div>
        {!loading && filtered.length > 0 && <div className="community-grid">{filtered.map((activity) => <CommunityCard activity={activity} teacher={teacherState.teacher} ownActivity={teacherState.publishedIds.has(activity.activityId)} copying={copyingId === activity.activityId} onCopy={() => void copyToLibrary(activity)} key={activity.activityId} />)}</div>}
        {!loading && filtered.length === 0 && <div className="community-empty"><span><AppIcon name="search" /></span><h3>No activities match those filters.</h3><p>Try a different level, grade or game mode.</p></div>}
      </section>
    </main>
  );
}

function CommunityCard({ activity, teacher, ownActivity, copying, onCopy }: { activity: CommunityActivity; teacher: boolean; ownActivity: boolean; copying: boolean; onCopy: () => void }) {
  return (
    <article className="community-card">
      <div className={`community-cover ${activity.coverImageUrl ? "has-image" : ""}`} style={activity.coverImageUrl ? { backgroundImage: `linear-gradient(180deg, rgba(27,20,73,.04), rgba(27,20,73,.76)), url("${activity.coverImageUrl}")` } : undefined}>
        <span className="community-kind">{activity.kind}</span>
        {!activity.coverImageUrl && <span className="community-cover-icon"><AppIcon name={activity.kind === "vocabulary" ? "type" : activity.kind === "grammar" ? "braces" : "layers"} /></span>}
        <div><small>{activity.topic}</small><strong>{activity.grade}</strong></div>
      </div>
      <div className="community-card-body">
        <div className="community-card-meta"><span>{activity.level}</span><span>{activity.itemCount} items</span>{activity.aiGenerated && <span title="AI-generated content"><AppIcon name="stars" /> AI</span>}</div>
        <h3>{activity.title}</h3>
        <p>{activity.description}</p>
        <div className="community-author"><span>{activity.authorName.slice(0, 1).toUpperCase()}</span><div><small>Shared by</small><strong>{activity.authorName}</strong></div></div>
        <div className="community-game-tags">{activity.gameModes.slice(0, 4).map((game) => <span key={game}><AppIcon name={GAME_MODE_CATALOG[game].icon} /> {GAME_MODE_CATALOG[game].shortName}</span>)}{activity.gameModes.length > 4 && <span>+{activity.gameModes.length - 4}</span>}</div>
        <div className="community-card-actions"><Link className="button button-primary community-play" href={`/practice/${activity.activityId}`}><AppIcon name="play-fill" /> Play free</Link>{teacher && !ownActivity && <button className="button button-soft community-copy" disabled={copying} onClick={onCopy}>{copying ? "Adding…" : <><AppIcon name="copy" /> Add to Library</>}</button>}</div>
      </div>
    </article>
  );
}
