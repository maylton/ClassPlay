"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { ActivityImage } from "@/components/media/ActivityImage";
import {
  analyzeGameModes,
  deriveGapSentence,
  deriveSentenceParts,
  materializeItemsForMode,
  prepareActivityForSave,
  selectedModeNeeds,
  validateEnabledModes,
} from "@/lib/activity-intelligence";
import { GAME_MODE_CATALOG, GAME_MODE_ORDER } from "@/lib/game-catalog";
import { removeActivityImage, uploadActivityImage } from "@/lib/media";
import { loadActivity, saveActivity } from "@/lib/repositories/activity-repository";
import type { ActivityItem, ActivityKind, ActivitySet, GameType } from "@/lib/types";

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
  const [enabledGames, setEnabledGames] = useState<GameType[]>(activityId ? [] : []);
  const [items, setItems] = useState<ActivityItem[]>([emptyItem(1), emptyItem(2), emptyItem(3), emptyItem(4)]);
  const [createdAt, setCreatedAt] = useState(() => new Date().toISOString());
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(Boolean(activityId));
  const [dirty, setDirty] = useState(false);
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);
  const [advancedItems, setAdvancedItems] = useState<Set<string>>(() => new Set());
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

  const needs = useMemo(() => selectedModeNeeds(enabledGames), [enabledGames]);
  const compatibility = useMemo(() => analyzeGameModes(items, enabledGames), [items, enabledGames]);
  const availableVariants = compatibility.filter((entry) => entry.status === "recommended" || entry.status === "compatible");
  const recommendedVariants = compatibility.filter((entry) => entry.status === "recommended");

  const activityDraft = useMemo<ActivitySet>(() => prepareActivityForSave({
    id: draftId,
    title: title.trim(),
    description: description.trim() || "Interactive English classroom activity.",
    subject: "English",
    topic: topic.trim() || "English practice",
    level,
    grade,
    kind,
    visibility: "private",
    items,
    enabledGames,
    createdAt,
    updatedAt: new Date().toISOString(),
  }), [draftId, title, description, topic, level, grade, kind, items, enabledGames, createdAt]);

  const modeErrors = useMemo(() => validateEnabledModes(activityDraft.items, enabledGames), [activityDraft.items, enabledGames]);

  useEffect(() => {
    if (!activityId || !loadedRef.current || !dirty) return;
    if (!activityDraft.title || !activityDraft.enabledGames.length || modeErrors.length) return;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      void saveActivity(activityDraft).then((saved) => {
        setDraftId(saved.id);
        setItems(saved.items);
        setEnabledGames(saved.enabledGames);
        setSaveState("saved");
        setDirty(false);
      }).catch(() => setSaveState("error"));
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [activityId, activityDraft, dirty, modeErrors.length]);

  function changed(callback: () => void) {
    callback();
    if (loadedRef.current) { setDirty(true); setSaveState("idle"); }
  }

  function updateItem(index: number, patch: Partial<ActivityItem>) {
    changed(() => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)));
  }

  function toggleGame(game: GameType) {
    if (enabledGames.includes(game)) {
      changed(() => setEnabledGames((current) => current.filter((id) => id !== game)));
      return;
    }
    const analysis = compatibility.find((entry) => entry.mode === game);
    if (!analysis || !["recommended", "compatible"].includes(analysis.status)) return;
    changed(() => {
      setItems((current) => materializeItemsForMode(current, game));
      setEnabledGames((current) => [...current, game]);
    });
  }

  function toggleAdvanced(itemId: string) {
    setAdvancedItems((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
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
    if (!enabledGames.length) return setError("Choose at least one compatible game mode first.");
    if (modeErrors.length) return setError(modeErrors[0]);
    setSaveState("saving"); setError("");
    try {
      const saved = await saveActivity(activityDraft);
      setDraftId(saved.id); setItems(saved.items); setEnabledGames(saved.enabledGames); setSaveState("saved"); setDirty(false);
      router.push(`/play/${saved.id}`);
    } catch (cause) {
      setSaveState("error");
      setError(cause instanceof Error ? cause.message : "Could not save activity.");
    }
  }

  if (loading) return <main className="loading-screen">Loading activity editor…</main>;

  const contentFirst = enabledGames.length === 0;
  const promptLabel = contentFirst ? "Prompt / clue" : needs.gap ? needs.pair ? "Prompt / target expression" : "Target word / expression" : "Prompt / English";
  const showExample = contentFirst || needs.sentence || enabledGames.includes("flashcards");

  return (
    <main className="editor-main smart-editor">
      <section className="editor-heading">
        <div><span className="eyebrow">{activityId ? "Smart activity editor" : "Smart activity builder"}</span><h1>{activityId ? "Refine it. Reuse more." : "Add the language. Let ClassPlay choose what fits."}</h1><p>ClassPlay reads the structure of your content, adapts it when possible, and only unlocks game modes that make pedagogical sense.</p>{activityId && <span className={`autosave-status ${saveState}`}>{saveState === "saving" ? "● Saving…" : saveState === "saved" ? "✓ Saved to your library" : saveState === "error" ? "! Autosave issue" : dirty ? "● Unsaved changes" : "✓ Up to date"}</span>}</div>
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

        <section className="editor-panel editor-games-panel smart-modes-panel">
          <div className="panel-heading"><span>2</span><div><h2>Game compatibility</h2><p>Add your language below. Modes light up automatically when ClassPlay finds a clear way to use the content.</p></div></div>
          <div className="game-picker-grid">
            {GAME_MODE_ORDER.map((gameId) => {
              const game = GAME_MODE_CATALOG[gameId];
              const selected = enabledGames.includes(gameId);
              const analysis = compatibility.find((entry) => entry.mode === gameId);
              const recommended = !selected && analysis?.status === "recommended";
              const compatible = !selected && analysis?.status === "compatible";
              const unavailable = !selected && (analysis?.status === "unavailable" || analysis?.status === "needs-content");
              return (
                <button
                  key={gameId}
                  disabled={unavailable}
                  title={analysis?.reason}
                  style={unavailable ? { opacity: .42, filter: "grayscale(.72)", cursor: "not-allowed" } : undefined}
                  className={`game-picker ${selected ? "selected" : ""} ${recommended ? "compatible" : ""} ${compatible ? "compatible" : ""}`}
                  onClick={() => toggleGame(gameId)}
                >
                  <b><AppIcon name={game.icon} /></b>
                  <span>
                    <strong>{game.name}</strong>
                    <small>{game.editorDescription}</small>
                    {selected && <em className="game-picker-state">Selected</em>}
                    {recommended && <em className="game-picker-state ready"><AppIcon name="stars" /> Recommended</em>}
                    {compatible && <em className="game-picker-state ready"><AppIcon name="check2-circle" /> Compatible</em>}
                    {analysis?.status === "unavailable" && <em className="game-picker-state">Not a good fit</em>}
                    {analysis?.status === "needs-content" && <em className="game-picker-state">Waiting for content</em>}
                  </span>
                  <i>{selected ? <AppIcon name="check-lg" /> : unavailable ? <AppIcon name="lock" /> : <AppIcon name="plus-lg" />}</i>
                </button>
              );
            })}
          </div>
          {availableVariants.length > 0 && <div className="smart-ready-summary"><span><AppIcon name="lightning-charge" /></span><div><strong>{recommendedVariants.length ? `${recommendedVariants.length} recommended ${recommendedVariants.length === 1 ? "mode" : "modes"} found.` : `${availableVariants.length} compatible ${availableVariants.length === 1 ? "mode" : "modes"} found.`}</strong><p>Unavailable modes stay dimmed so students only get activities that fit the language you created.</p></div></div>}
        </section>

        <section className="editor-panel editor-content-panel smart-content-panel">
          <div className="panel-heading"><span>3</span><div><h2>Add your language</h2><p>{contentFirst ? "Start with the relationship you want students to learn. Game modes will unlock automatically." : "Only fields useful to your selected modes are emphasized."}</p></div></div>

          {contentFirst && <div className="smart-ready-summary"><span><AppIcon name="stars" /></span><div><strong>Content first, games second.</strong><p>Add at least two clear items. A definition and term, a situation and response, a sentence with a target, or a full example are enough for ClassPlay to start recommending modes.</p></div></div>}

          <div className="smart-field-legend">
            <span><b>Required</b> Content you provide</span>
            <span><b>Generated</b> Variants ClassPlay derives</span>
            <span><b>Advanced</b> Optional manual control</span>
          </div>
          <div className="item-list">
            {items.map((item, index) => {
              const gapPreview = deriveGapSentence(item);
              const chunksPreview = deriveSentenceParts(item);
              const advanced = advancedItems.has(item.id);
              return (
                <article className="item-editor smart-item-editor" key={item.id}>
                  <div className="item-number">{index + 1}</div>
                  <div className="item-editor-grid">
                    {(contentFirst || needs.pair || needs.gap) && <label className="field"><span>{promptLabel}</span><input value={item.prompt} onChange={(event) => updateItem(index, { prompt: event.target.value })} placeholder={contentFirst ? "e.g. A place where you borrow books" : needs.gap ? "wakes up" : "wake up"} />{needs.gap && <small className="field-help">For Gap Fill, use the word or expression that appears in the full sentence.</small>}</label>}
                    {(contentFirst || needs.pair) && <label className="field"><span>{contentFirst ? "Answer / target" : "Answer / Meaning"}</span><input value={item.answer} onChange={(event) => updateItem(index, { answer: event.target.value })} placeholder={contentFirst ? "e.g. library" : "acordar"} /></label>}

                    {showExample && <label className="field field-wide"><span>{needs.sentence ? "Full sentence" : "Full sentence / example (optional)"}</span><input value={item.example ?? ""} onChange={(event) => updateItem(index, { example: event.target.value })} placeholder="She wakes up at 6:30 every day." />{needs.sentence && <small className="field-help">This sentence can power Gap Fill, Sentence Builder and smart Matching transformations.</small>}</label>}

                    {needs.hint && <label className="field"><span>Hint (optional)</span><input value={item.hint ?? ""} onChange={(event) => updateItem(index, { hint: event.target.value })} placeholder="Short clue" /></label>}

                    {needs.image && <div className="field item-image-field"><span>Image (optional)</span><div className="image-upload-row">{item.imageUrl ? <div className="image-preview"><ActivityImage refValue={item.imageUrl} alt={item.prompt || `Item ${index + 1}`} /><button onClick={() => void removeImage(index)} aria-label="Remove image"><AppIcon name="x-lg" /></button></div> : <span className="image-placeholder"><AppIcon name="image" /></span>}<label className="button button-soft button-small upload-button">{uploadingItem === item.id ? "Uploading…" : item.imageUrl ? "Replace" : "Upload image"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploadingItem === item.id} onChange={(event) => void uploadImage(index, event.target.files?.[0])} /></label></div><small>Used by Flashcards · PNG, JPG, WebP or GIF</small></div>}
                  </div>

                  {(needs.gap || needs.builder) && <div className="generated-variants">
                    <div className="generated-heading"><span><AppIcon name="stars" /></span><div><strong>Generated variants</strong><small>Built from the content above. You can override them only if needed.</small></div></div>
                    <div className="generated-grid">
                      {needs.gap && <div className={`generated-card ${gapPreview ? "ready" : "waiting"}`}><small>GAP FILL</small><strong>{gapPreview || "Choose a target that appears in the full sentence."}</strong></div>}
                      {needs.builder && <div className={`generated-card ${chunksPreview.length > 1 ? "ready" : "waiting"}`}><small>SENTENCE BUILDER</small><div className="generated-chunks">{chunksPreview.length > 1 ? chunksPreview.map((part, partIndex) => <span key={`${part}-${partIndex}`}>{part}</span>) : <em>Add a full sentence to generate words.</em>}</div></div>}
                    </div>
                    <button type="button" className="smart-advanced-toggle" onClick={() => toggleAdvanced(item.id)}><AppIcon name={advanced ? "chevron-up" : "sliders"} /> {advanced ? "Hide advanced controls" : "Customize generated data"}</button>
                    {advanced && <div className="smart-advanced-fields">
                      {needs.gap && <><label className="field field-wide"><span>Custom gap sentence</span><input value={item.gapSentence ?? ""} onChange={(event) => updateItem(index, { gapSentence: event.target.value })} placeholder={gapPreview || "She _____ at 6:30 every day."} /><small className="field-help">Leave empty to keep automatic generation. Use _____ for the blank.</small></label><label className="field field-wide"><span>Extra gap distractors <em>(separate with |)</em></span><input value={(item.distractors ?? []).join(" | ")} onChange={(event) => updateItem(index, { distractors: event.target.value.split("|").map((part) => part.trim()).filter(Boolean) })} placeholder="wake up | waking up | woke up" /></label></>}
                      {needs.builder && <label className="field field-wide"><span>Custom sentence chunks <em>(separate with |)</em></span><input value={(item.sentenceParts ?? []).join(" | ")} onChange={(event) => updateItem(index, { sentenceParts: event.target.value.split("|").map((part) => part.trim()).filter(Boolean) })} placeholder={chunksPreview.join(" | ")} /><small className="field-help">Leave empty to let ClassPlay split the sentence automatically. The game itself uses individual words.</small></label>}
                    </div>}
                  </div>}

                  {items.length > 2 && <button className="remove-item" aria-label={`Remove item ${index + 1}`} onClick={() => changed(() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index)))}><AppIcon name="x-lg" /></button>}
                </article>
              );
            })}
          </div>
          {modeErrors.length > 0 && <div className="smart-mode-requirements"><strong><AppIcon name="info-circle" /> Review selected modes</strong>{modeErrors.map((message) => <span key={message}>{message}</span>)}</div>}
          <button className="button button-soft add-item-button" onClick={() => changed(() => setItems((current) => [...current, emptyItem(current.length + 1)]))}><AppIcon name="plus-lg" /> Add another item</button>
        </section>
      </div>
    </main>
  );
}
