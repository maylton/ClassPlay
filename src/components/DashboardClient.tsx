"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getProfile, saveProfile } from "@/lib/storage";
import {
  cloneActivity,
  getMigratableLocalActivities,
  listActivities,
  migrateLocalActivitiesToCloud,
  removeActivity,
} from "@/lib/repositories/activity-repository";
import { resolveActivityImageUrl } from "@/lib/media";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { ActivitySet, TeacherProfile } from "@/lib/types";
import { AppIcon } from "./AppIcon";
import { GameIcon } from "./GameIcon";

type Filter = "all" | "vocabulary" | "grammar" | "mixed" | "shared";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "vocabulary", label: "Vocabulary" },
  { id: "grammar", label: "Grammar" },
  { id: "mixed", label: "Mixed" },
  { id: "shared", label: "Practice link on" },
];

const SAMPLE_ID = "daily-routine-present-simple";

export function DashboardClient() {
  const [activities, setActivities] = useState<ActivitySet[]>([]);
  const [profile, setProfile] = useState<TeacherProfile>({ name: "Teacher" });
  const [editingName, setEditingName] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cloud, setCloud] = useState(false);
  const [localImportCount, setLocalImportCount] = useState(0);
  const [importMessage, setImportMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = async () => {
    try {
      setError("");
      setActivities(await listActivities());
      setLocalImportCount(getMigratableLocalActivities().length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load activities.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      const supabase = getBrowserSupabaseClient();
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCloud(true);
          const { data } = await supabase.from("profiles").select("display_name, school_name, avatar_url").eq("id", user.id).maybeSingle();
          setProfile({ name: data?.display_name || user.user_metadata?.display_name || "Teacher", school: data?.school_name ?? undefined, avatarUrl: data?.avatar_url ?? undefined, email: user.email, id: user.id });
        } else setProfile(getProfile());
      } else setProfile(getProfile());
      await refresh();
    })();
  }, []);

  const totalGames = useMemo(() => activities.reduce((sum, activity) => sum + activity.enabledGames.length, 0), [activities]);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  // Cloud images are stored as private `storage:` refs; CSS needs a signed URL.
  useEffect(() => {
    let active = true;
    void Promise.all(activities.map(async (activity) => {
      const ref = activity.items.find((item) => item.imageUrl)?.imageUrl;
      const url = ref ? await resolveActivityImageUrl(ref) : null;
      return [activity.id, url] as const;
    })).then((entries) => {
      if (active) setPreviews(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))));
    });
    return () => { active = false; };
  }, [activities]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return activities.filter((activity) => {
      if (filter === "shared" && activity.visibility !== "unlisted") return false;
      if (filter !== "all" && filter !== "shared" && activity.kind !== filter) return false;
      if (!needle) return true;
      return [activity.title, activity.topic, activity.description, activity.grade, activity.level].some((value) => value?.toLocaleLowerCase().includes(needle));
    });
  }, [activities, filter, query]);

  async function handleDuplicate(id: string) {
    try { await cloneActivity(id); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not duplicate activity."); }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this activity set? This cannot be undone.")) return;
    try { await removeActivity(id); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete activity."); }
  }

  async function updateName(name: string) {
    const next = { ...profile, name: name.trim() || "Teacher" };
    setProfile(next);
    if (cloud) {
      const supabase = getBrowserSupabaseClient();
      if (supabase && profile.id) await supabase.from("profiles").update({ display_name: next.name }).eq("id", profile.id);
    } else saveProfile(next);
    setEditingName(false);
  }

  async function importLocal() {
    setImportMessage("Importing…");
    try {
      const report = await migrateLocalActivitiesToCloud();
      setImportMessage(`${report.imported} imported · ${report.skipped} already synced${report.failed ? ` · ${report.failed} failed` : ""}`);
      await refresh();
    } catch (cause) {
      setImportMessage(cause instanceof Error ? cause.message : "Import failed.");
    }
  }

  return (
    <main className="cp-page cp-library">
      <div className="cp-page-head">
        <div>
          {editingName ? (
            <form className="cp-inline-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void updateName(String(form.get("name") ?? "")); }}>
              <input name="name" defaultValue={profile.name} autoFocus aria-label="Your name" />
              <button className="button button-primary button-small">Save</button>
              <button type="button" className="cp-link-button" onClick={() => setEditingName(false)}>Cancel</button>
            </form>
          ) : (
            <p className="cp-greeting">Hi, {profile.name} <button type="button" className="cp-link-button" onClick={() => setEditingName(true)} aria-label="Edit your name"><AppIcon name="pencil" /></button></p>
          )}
          <h1>My library</h1>
          <p>{loading ? "Loading…" : `${activities.length} ${activities.length === 1 ? "activity" : "activities"} · ${totalGames} game modes ready`}</p>
        </div>
      </div>

      {cloud && localImportCount > 0 && (
        <div className="cp-banner">
          <span className="cp-game-icon tone-mint"><AppIcon name="cloud-arrow-up" /></span>
          <div><b>Bring your local activities to the cloud</b><p>{localImportCount} {localImportCount === 1 ? "activity is" : "activities are"} saved only in this browser. Duplicates are skipped.</p>{importMessage && <small>{importMessage}</small>}</div>
          <button className="button button-primary button-small" onClick={() => void importLocal()}>Import</button>
        </div>
      )}
      {error && <div className="alert-error">{error}</div>}

      <div className="cp-toolbar">
        <label className="cp-search"><AppIcon name="search" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activities" aria-label="Search activities" /></label>
        <div className="cp-chips" role="group" aria-label="Filter activities">
          {FILTERS.map((option) => <button key={option.id} type="button" className="cp-chip" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}</button>)}
        </div>
      </div>

      <div className="cp-card-grid">
        {visible.map((activity) => {
          const cover = previews[activity.id];
          const shown = activity.enabledGames.slice(0, 5);
          return (
            <article className="cp-activity-card" key={activity.id}>
              {cover && <div className="cp-activity-cover" style={{ backgroundImage: `url("${cover}")` }} aria-hidden="true" />}
              <div className="cp-activity-icons">
                {shown.map((game) => <GameIcon key={game} game={game} size="sm" />)}
                {activity.enabledGames.length > shown.length && <span className="more">+{activity.enabledGames.length - shown.length}</span>}
              </div>
              <h3>{activity.title}</h3>
              {activity.description && <p>{activity.description}</p>}
              <span className="cp-activity-meta">{[activity.topic, activity.grade, `${activity.items.length} items`, activity.level].filter(Boolean).join(" · ")}</span>
              {activity.visibility === "unlisted" && <div><span className="cp-tag green"><AppIcon name="link-45deg" /> Practice link on</span></div>}
              <div className="cp-activity-actions">
                <Link className="button button-primary button-small" href={`/play/${activity.id}`}><AppIcon name="play-fill" /> Play</Link>
                <Link className="cp-link-button" href={`/edit/${activity.id}`}>Edit</Link>
                <button className="cp-link-button" onClick={() => void handleDuplicate(activity.id)}>Duplicate</button>
                <span className="spacer" />
                {activity.id !== SAMPLE_ID && <button className="cp-link-button danger" onClick={() => void handleDelete(activity.id)} aria-label={`Delete ${activity.title}`}><AppIcon name="trash3" /></button>}
              </div>
            </article>
          );
        })}
        <Link className="cp-new-card" href="/create">
          <span className="plus"><AppIcon name="plus-lg" /></span>
          <b>New activity</b>
          <span>Add your language. Games unlock on their own.</span>
        </Link>
      </div>

      {!loading && activities.length > 0 && visible.length === 0 && (
        <div className="cp-empty"><span className="cp-game-icon tone-butter"><AppIcon name="search" /></span><b>No activities match.</b><button className="cp-link-button" onClick={() => { setQuery(""); setFilter("all"); }}>Clear search and filters</button></div>
      )}
    </main>
  );
}
