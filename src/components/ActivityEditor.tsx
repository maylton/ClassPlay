"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { ActivityImage } from "@/components/media/ActivityImage";
import { loadActivity, saveActivity } from "@/lib/repositories/activity-repository";
import { removeActivityImage, uploadActivityImage } from "@/lib/media";
import type { ActivityItem, ActivityKind, ActivitySet, GameType } from "@/lib/types";

const games: { id: GameType; icon: string; label: string; description: string }[] = [
  { id: "flashcards", icon: "card-text", label: "Flashcards", description: "Reveal prompt and answer" },
  { id: "memory", icon: "grid-3x3-gap", label: "Memory", description: "Find matching pairs" },
  { id: "matching", icon: "link-45deg", label: "Matching", description: "Connect prompts and answers" },
  { id: "sentence-builder", icon: "puzzle", label: "Sentence Builder", description: "Put chunks in order" },
  { id: "gap-fill", icon: "pencil-square", label: "Gap Fill", description: "Complete the sentence" },
  { id: "quiz", icon: "trophy", label: "Quiz", description: "Quick multiple choice" },
];

function createId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyItem(index: number): ActivityItem {
  return { id: createId(`item-${index}`), prompt: "", answer: "", hint: "", imageUrl: "", example: "", gapSentence: "", distractors: [], sentenceParts: [] };
}

export function ActivityEditor({ activityId }: { activityId?: string }) {
  const router = useRouter();
  const [draftId, setDraftId] = useState(activityId ?? createId("activity"));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("A1–A2");
  const [grade, setGrade] = useState("7th grade");
  const [kind, setKind] = useState<ActivityKind>("mixed");
  const [enabledGames, setEnabledGames] = useState<GameType[]>(games.map((game) => game.id));
  const [items, setItems] = useState<ActivityItem[]>([emptyItem(1), emptyItem(2), emptyItem(3), emptyItem(4)]);
  const [createdAt, setCreatedAt] = useState(() => new Date().toISOString());
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(Boolean(activityId));
  const [dirty, setDirty] = useState(false);
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!activityId) { loadedRef.current = true; return; }
    void loadActivity(activityId).then((activity) => {
      if (!activity) { setError("Activity not found."); return; }
      setDraftId(activity.id);
      setTitle(activity.title);
      setDescription(activity.description);
      setTopic(activity.topic);
      setLevel(activity.level);
      setGrade(activity.grade);
      setKind(activity.kind);
      setEnabledGames(activity.enabledGames);
      setItems(activity.items);
      setCreatedAt(activity.createdAt);
      loadedRef.current = true;
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load activity.")).finally(() => setLoading(false));
  }, [activityId]);

  const activityDraft = useMemo<ActivitySet>(() => ({
    id: draftId,
    title: title.trim(),
    description: description.trim() || "Interactive English classroom activity.",
    subject: "English",
    topic: topic.trim() || "English practice",
    level,
    grade,
    kind,
    visibility: "private",
    items: items.filter((item) => item.prompt.trim() && item.answer.trim()),
    enabledGames,
    createdAt,
    updatedAt: new Date().toISOString(),
  }), [draftId, title, description, topic, level, grade, kind, items, enabledGames, createdAt]);

  useEffect(() => {
    if (!activityId || !loadedRef.current || !dirty) return;
    if (!activityDraft.title || activityDraft.items.length < 2 || activityDraft.enabledGames.length === 0) return;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      void saveActivity(activityDraft).then((saved) => {
        setDraftId(saved.id);
        setSaveState("saved");
        setDirty(false);
      }).catch(() => setSaveState("error"));
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [activityId, activityDraft, dirty]);

  function changed(callback: () => void) {
    callback();
    if (loadedRef.current) { setDirty(true); setSaveState("idle"); }
  }

  function updateItem(index: number, patch: Partial<ActivityItem>) {
    changed(() => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)));
  }

  function toggleGame(game: GameType) {
    changed(() => setEnabledGames((current) => current.includes(game) ? current.filter((id) => id !== game) : [...current, game]));
  }

  async function uploadImage(index: number, file?: File) {
    if (!file) return;
    const item = items[index];
    setUploadingItem(item.id); setError("");
    try {
      const ref = await uploadActivityImage(file, draftId, item.id);
      if (item.imageUrl) await removeActivityImage(item.imageUrl);
      updateItem(index, { imageUrl: ref });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload image.");
    } finally { setUploadingItem(null); }
  }

  async function removeImage(index: number) {
    const ref = items[index].imageUrl;
    await removeActivityImage(ref);
    updateItem(index, { imageUrl: "" });
  }

  async function submit() {
    if (!title.trim()) return setError("Give your activity a title.");
    if (activityDraft.items.length < 2) return setError("Add at least two complete prompt/answer items.");
    if (!enabledGames.length) return setError("Choose at least one game mode.");
    setSaveState("saving"); setError("");
    try {
      const saved = await saveActivity(activityDraft);
      setDraftId(saved.id); setSaveState("saved"); setDirty(false);
      router.push(`/play/${saved.id}`);
    } catch (cause) {
      setSaveState("error");
      setError(cause instanceof Error ? cause.message : "Could not save activity.");
    }
  }

  if (loading) return <main className="loading-screen">Loading activity editor…</main>;

  return (
    <main className="editor-main">
      <section className="editor-heading">
        <div><span className="eyebrow">{activityId ? "Activity editor" : "Activity builder"}</span><h1>{activityId ? "Refine it. Keep teaching." : "Create once. Play many ways."}</h1><p>Start with the language. ClassPlay turns it into different classroom interactions.</p>{activityId && <span className={`autosave-status ${saveState}`}>{saveState === "saving" ? "● Saving…" : saveState === "saved" ? "✓ Saved to your library" : saveState === "error" ? "! Autosave issue" : dirty ? "● Unsaved changes" : "✓ Up to date"}</span>}</div>
        <button className="button button-primary button-large" onClick={() => void submit()} disabled={saveState === "saving"}>Save & play <AppIcon name="arrow-right" /></button>
      </section>
      {error && <div className="alert-error">{error}</div>}

      <div className="editor-layout">
        <section className="editor-panel">
          <div className="panel-heading"><span>1</span><div><h2>Activity details</h2><p>Help yourself find this set later.</p></div></div>
          <div className="form-grid">
            <label className="field field-wide"><span>Title</span><input value={title} onChange={(event) => changed(() => setTitle(event.target.value))} placeholder="e.g. Present Simple — Daily Routine" /></label>
            <label className="field field-wide"><span>Description</span><textarea value={description} onChange={(event) => changed(() => setDescription(event.target.value))} placeholder="What will students practise?" rows={2} /></label>
            <label className="field"><span>Topic</span><input value={topic} onChange={(event) => changed(() => setTopic(event.target.value))} placeholder="Present Simple" /></label>
            <label className="field"><span>Level</span><select value={level} onChange={(event) => changed(() => setLevel(event.target.value))}><option>A1</option><option>A1–A2</option><option>A2</option><option>A2–B1</option><option>B1</option><option>B1–B2</option></select></label>
            <label className="field"><span>Grade</span><select value={grade} onChange={(event) => changed(() => setGrade(event.target.value))}><option>6th grade</option><option>7th grade</option><option>8th grade</option><option>9th grade</option><option>Private class</option></select></label>
            <label className="field"><span>Content type</span><select value={kind} onChange={(event) => changed(() => setKind(event.target.value as ActivityKind))}><option value="mixed">Mixed</option><option value="vocabulary">Vocabulary</option><option value="grammar">Grammar</option></select></label>
          </div>
        </section>

        <section className="editor-panel editor-games-panel">
          <div className="panel-heading"><span>2</span><div><h2>Choose game modes</h2><p>You can reuse the same content across all of them.</p></div></div>
          <div className="game-picker-grid">
            {games.map((game) => (
              <button key={game.id} className={`game-picker ${enabledGames.includes(game.id) ? "selected" : ""}`} onClick={() => toggleGame(game.id)}>
                <b><AppIcon name={game.icon} /></b><span><strong>{game.label}</strong><small>{game.description}</small></span><i>{enabledGames.includes(game.id) ? <AppIcon name="check-lg" /> : <AppIcon name="plus-lg" />}</i>
              </button>
            ))}
          </div>
        </section>

        <section className="editor-panel editor-content-panel">
          <div className="panel-heading"><span>3</span><div><h2>Add your language</h2><p>Prompt + answer power the core games. Images, examples and chunks make them richer.</p></div></div>
          <div className="item-list">
            {items.map((item, index) => (
              <article className="item-editor" key={item.id}>
                <div className="item-number">{index + 1}</div>
                <div className="item-editor-grid">
                  <label className="field"><span>Prompt / English</span><input value={item.prompt} onChange={(event) => updateItem(index, { prompt: event.target.value })} placeholder="wake up" /></label>
                  <label className="field"><span>Answer / Meaning</span><input value={item.answer} onChange={(event) => updateItem(index, { answer: event.target.value })} placeholder="acordar" /></label>
                  <label className="field"><span>Visual hint</span><input value={item.hint ?? ""} onChange={(event) => updateItem(index, { hint: event.target.value })} placeholder="🌅 or short clue" /></label>
                  <div className="field item-image-field"><span>Image</span><div className="image-upload-row">{item.imageUrl ? <div className="image-preview"><ActivityImage refValue={item.imageUrl} alt={item.prompt || `Item ${index + 1}`} /><button onClick={() => void removeImage(index)} aria-label="Remove image"><AppIcon name="x-lg" /></button></div> : <span className="image-placeholder"><AppIcon name="image" /></span>}<label className="button button-soft button-small upload-button">{uploadingItem === item.id ? "Uploading…" : item.imageUrl ? "Replace" : "Upload image"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploadingItem === item.id} onChange={(event) => void uploadImage(index, event.target.files?.[0])} /></label></div><small>PNG, JPG, WebP or GIF · max 5 MB</small></div>
                  <label className="field field-wide"><span>Example sentence</span><input value={item.example ?? ""} onChange={(event) => updateItem(index, { example: event.target.value })} placeholder="She wakes up at 6:30 every day." /></label>
                  <label className="field field-wide"><span>Gap sentence</span><input value={item.gapSentence ?? ""} onChange={(event) => updateItem(index, { gapSentence: event.target.value })} placeholder="She _____ at 6:30 every day." /></label>
                  <label className="field field-wide"><span>Sentence chunks <em>(separate with |)</em></span><input value={(item.sentenceParts ?? []).join(" | ")} onChange={(event) => updateItem(index, { sentenceParts: event.target.value.split("|").map((part) => part.trim()).filter(Boolean) })} placeholder="She | wakes up | at 6:30 | every day" /></label>
                  <label className="field field-wide"><span>Gap distractors <em>(separate with |)</em></span><input value={(item.distractors ?? []).join(" | ")} onChange={(event) => updateItem(index, { distractors: event.target.value.split("|").map((part) => part.trim()).filter(Boolean) })} placeholder="wake up | waking up | woke up" /></label>
                </div>
                {items.length > 2 && <button className="remove-item" aria-label={`Remove item ${index + 1}`} onClick={() => changed(() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index)))}><AppIcon name="x-lg" /></button>}
              </article>
            ))}
          </div>
          <button className="button button-soft add-item-button" onClick={() => changed(() => setItems((current) => [...current, emptyItem(current.length + 1)]))}><AppIcon name="plus-lg" /> Add another item</button>
        </section>
      </div>
    </main>
  );
}
