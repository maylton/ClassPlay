"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { GameIcon } from "@/components/GameIcon";
import { useResolvedImageUrl } from "@/hooks/useResolvedImageUrl";
import { GAME_MODE_CATALOG, GAME_MODE_ORDER } from "@/lib/game-catalog";
import { languageLabel } from "@/lib/languages";
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


  const filtersActive = Boolean(search || grade || level || mode);

  return (
    <div className="community-screen cp-community">
      <header className="cp-landing-nav">
        <Link className="brand" href="/" aria-label="ClassPlay home"><span className="brand-mark">C</span><span>ClassPlay</span></Link>
        <nav aria-label="Public navigation">
          <Link className="active" href="/community" aria-current="page">Community</Link>
          <Link href="/class/join">Join a class</Link>
          <Link href="/student">My classes</Link>
          <Link className="button button-soft button-small" href="/dashboard">Teacher workspace</Link>
        </nav>
      </header>

      <main className="cp-page">
        <div className="cp-page-head">
          <div>
            <span className="eyebrow">Community</span>
            <h1>Free games shared by teachers</h1>
            <p>Pick an activity, choose a game and play right away. No account needed.</p>
          </div>
        </div>

        <div className="cp-toolbar">
          <label className="cp-search"><AppIcon name="search" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search topic, activity or teacher" aria-label="Search activities" /></label>
          <select className="cp-select" value={grade} onChange={(event) => setGrade(event.target.value)} aria-label="Grade"><option value="">All grades</option>{grades.map((item) => <option value={item} key={item}>{item}</option>)}</select>
          <select className="cp-select" value={level} onChange={(event) => setLevel(event.target.value)} aria-label="Level"><option value="">All levels</option>{levels.map((item) => <option value={item} key={item}>{item}</option>)}</select>
          <select className="cp-select" value={mode} onChange={(event) => setMode(event.target.value as GameType | "")} aria-label="Game mode"><option value="">Any game mode</option>{GAME_MODE_ORDER.map((game) => <option value={game} key={game}>{GAME_MODE_CATALOG[game].name}</option>)}</select>
          {filtersActive && <button className="cp-link-button" onClick={() => { setSearch(""); setGrade(""); setLevel(""); setMode(""); }}>Clear filters</button>}
        </div>

        {teacherState.teacher && (
          <div className="cp-banner">
            <span className="cp-game-icon tone-mint"><AppIcon name="globe2" /></span>
            <div><b>Share your activities here</b><p>Publishing makes an activity discoverable while keeping its practice link and leaderboard.</p></div>
            <button className="button button-soft button-small" onClick={() => setManageOpen((value) => !value)}>{manageOpen ? "Close" : "Manage my activities"} <AppIcon name={manageOpen ? "chevron-up" : "chevron-down"} /></button>
          </div>
        )}

        {manageOpen && teacherState.teacher && (
          <section className="cp-rows" aria-label="My Library">
            {teacherState.library.map((activity) => {
              const published = teacherState.publishedIds.has(activity.id);
              return (
                <div className="cp-row" key={activity.id}>
                  <div><b>{activity.title}</b><small>{activity.topic} · {activity.grade} · {activity.enabledGames.length} modes</small></div>
                  {published
                    ? <button className="button button-soft button-small" disabled={workingId === activity.id} onClick={() => void remove(activity.id)}>{workingId === activity.id ? "Working…" : "Remove from Community"}</button>
                    : <button className="button button-primary button-small" disabled={workingId === activity.id} onClick={() => void publish(activity.id)}>{workingId === activity.id ? "Publishing…" : <><AppIcon name="globe2" /> Publish</>}</button>}
                </div>
              );
            })}
            {!teacherState.library.length && <p className="cp-muted-note">Create an activity in your Library first.</p>}
          </section>
        )}

        {notice && <div className="cp-banner"><AppIcon name="check2-circle" /> {notice}</div>}
        {error && <div className="alert-error">{error}</div>}

        <section className="cp-mode-group" aria-live="polite">
          <h2 className="cp-mode-group-title">{loading ? "Loading activities…" : `${filtered.length} ${filtered.length === 1 ? "activity" : "activities"}`}{!loading && filtersActive && <small>of {activities.length}</small>}</h2>
          {!loading && filtered.length > 0 && <div className="cp-card-grid">{filtered.map((activity) => <CommunityCard activity={activity} teacher={teacherState.teacher} ownActivity={teacherState.publishedIds.has(activity.activityId)} copying={copyingId === activity.activityId} onCopy={() => void copyToLibrary(activity)} key={activity.activityId} />)}</div>}
          {!loading && filtered.length === 0 && <div className="cp-empty"><span className="cp-game-icon tone-butter"><AppIcon name="search" /></span><b>No activities match those filters.</b><span>Try a different level, grade or game mode.</span></div>}
        </section>
      </main>
    </div>
  );
}

function CommunityCard({ activity, teacher, ownActivity, copying, onCopy }: { activity: CommunityActivity; teacher: boolean; ownActivity: boolean; copying: boolean; onCopy: () => void }) {
  const coverUrl = useResolvedImageUrl(activity.coverImageUrl);
  const shown = activity.gameModes.slice(0, 5);
  return (
    <article className="cp-activity-card">
      {coverUrl && <div className="cp-activity-cover" style={{ backgroundImage: `url("${coverUrl}")` }} aria-hidden="true" />}
      <div className="cp-activity-icons">
        {shown.map((game) => <GameIcon key={game} game={game} size="sm" />)}
        {activity.gameModes.length > shown.length && <span className="more">+{activity.gameModes.length - shown.length}</span>}
      </div>
      <h3>{activity.title}</h3>
      {activity.description && <p>{activity.description}</p>}
      <span className="cp-activity-meta">{[languageLabel(activity.targetLanguage), activity.level, activity.grade, `${activity.itemCount} items`].filter(Boolean).join(" · ")}</span>
      <span className="cp-author"><span>{activity.authorName.slice(0, 1).toUpperCase()}</span>Shared by {activity.authorName}{activity.aiGenerated && <span className="cp-tag" title="AI-generated content"><AppIcon name="stars" /> AI</span>}</span>
      <div className="cp-activity-actions">
        <Link className="button button-primary button-small" href={`/practice/${activity.activityId}`}><AppIcon name="play-fill" /> Play</Link>
        {teacher && !ownActivity && <button className="cp-link-button" disabled={copying} onClick={onCopy}>{copying ? "Adding…" : <><AppIcon name="copy" /> Add to Library</>}</button>}
      </div>
    </article>
  );
}
