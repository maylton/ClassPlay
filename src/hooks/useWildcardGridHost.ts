"use client";

import { useCallback, useState } from "react";
import {
  buildLiveQuestion,
  continueWildcardGridResult,
  createWildcardGridState,
  liveModeQuestionCount,
  publicLiveQuestion,
  resolveWildcardGrid,
  resolveWildcardGridTie,
  scoreWildcardGridAnswer,
  selectWildcardGridTile,
} from "@/lib/live/live-engine";
import { finalizeLiveSession, updateHostSession } from "@/lib/live/room-service";
import { resolveActivityImageUrl } from "@/lib/media";
import type { ActivitySet, ClassroomSettings, GameSession, Team, WildcardGridState } from "@/lib/types";

function publicWildcardSettings(settings: ClassroomSettings): ClassroomSettings {
  const state = settings.wildcardGridState;
  if (!state) return settings;
  return {
    ...settings,
    wildcardGridState: {
      ...state,
      tiles: state.tiles.map((tile) => ({ ...tile, wildcard: null })),
      pendingWildcard: state.phase === "wildcard" ? state.pendingWildcard ?? null : null,
    },
  };
}

export function useWildcardGridHost({
  activity,
  session,
  teams,
  refresh,
  send,
  setError,
}: {
  activity: ActivitySet | null;
  session: GameSession | null;
  teams: Team[];
  refresh: () => Promise<void>;
  send: (event: string, payload: Record<string, unknown>) => Promise<void>;
  setError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const state = session?.settings.wildcardGridState ?? null;
  const questionSource = session?.settings.wildcardGridSource ?? "smart";

  const persist = useCallback(async (nextState: WildcardGridState, questionMode: "keep" | "clear" = "keep") => {
    if (!session) return;
    const settings: ClassroomSettings = { ...session.settings, wildcardGridState: nextState };
    const patch: Parameters<typeof updateHostSession>[1] = { settings };
    if (questionMode === "clear") {
      patch.current_question = null;
      patch.round_started_at = null;
    }
    await updateHostSession(session.id, patch);
    await send("wildcard-grid", {
      state: "playing",
      settings: publicWildcardSettings(settings),
      question: questionMode === "clear" ? null : session.currentQuestion ? publicLiveQuestion(session.currentQuestion as ReturnType<typeof buildLiveQuestion>) : null,
    });
    await refresh();
  }, [refresh, send, session]);

  const start = useCallback(async () => {
    if (!activity || !session) return;
    const size = session.settings.wildcardGridSize ?? 12;
    if (teams.length < 2 || teams.length > 4) return setError("Wildcard Grid supports two to four teams.");
    const teamRefs = teams.map((team) => ({ id: team.id, name: team.name, color: team.color }));
    const questionCount = liveModeQuestionCount(activity, "wildcard-grid", questionSource);
    setBusy(true); setError("");
    try {
      const nextState = createWildcardGridState(teamRefs, questionCount, size, session.settings.wildcardGridIntensity ?? "balanced");
      const settings: ClassroomSettings = { ...session.settings, wildcardGridState: nextState, timerEnabled: false, leaderboardEnabled: false };
      await updateHostSession(session.id, { state: "playing", settings, current_question: null, round_started_at: null });
      await send("wildcard-grid", { state: "playing", settings: publicWildcardSettings(settings), question: null });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start Wildcard Grid.");
    } finally { setBusy(false); }
  }, [activity, questionSource, refresh, send, session, setError, teams]);

  const selectTile = useCallback(async (tileNumber: number) => {
    if (!activity || !session || !state) return;
    setBusy(true); setError("");
    try {
      const nextState = selectWildcardGridTile(state, tileNumber);
      const tile = nextState.tiles.find((candidate) => candidate.number === tileNumber);
      if (!tile) throw new Error("Could not find that Wildcard Grid tile.");
      const hostQuestion = buildLiveQuestion(activity, tile.questionIndex, "wildcard-grid", questionSource);
      if (hostQuestion.imageUrl) hostQuestion.imageUrl = (await resolveActivityImageUrl(hostQuestion.imageUrl)) ?? hostQuestion.imageUrl;
      hostQuestion.startedAt = new Date().toISOString();
      hostQuestion.wildcardTileNumber = tileNumber;
      hostQuestion.wildcardActiveTeamId = nextState.activeTeamId;
      const settings: ClassroomSettings = { ...session.settings, wildcardGridState: nextState };
      await updateHostSession(session.id, {
        state: "playing",
        current_item_index: tile.questionIndex,
        current_question: hostQuestion,
        round_started_at: null,
        settings,
      });
      await send("wildcard-grid", { state: "playing", settings: publicWildcardSettings(settings), question: publicLiveQuestion(hostQuestion) });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open this tile.");
    } finally { setBusy(false); }
  }, [activity, questionSource, refresh, send, session, setError, state]);

  const markAnswer = useCallback(async (correct: boolean) => {
    if (!state) return;
    setBusy(true); setError("");
    try { await persist(scoreWildcardGridAnswer(state, correct)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not score this answer."); }
    finally { setBusy(false); }
  }, [persist, setError, state]);

  const continueResult = useCallback(async () => {
    if (!state) return;
    setBusy(true); setError("");
    try {
      const next = continueWildcardGridResult(state);
      await persist(next, next.phase === "wildcard" ? "keep" : "clear");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not continue Wildcard Grid."); }
    finally { setBusy(false); }
  }, [persist, setError, state]);

  const resolveWildcard = useCallback(async (targetTeamId?: string) => {
    if (!state) return;
    setBusy(true); setError("");
    try { await persist(resolveWildcardGrid(state, targetTeamId), "clear"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resolve this Wildcard."); }
    finally { setBusy(false); }
  }, [persist, setError, state]);

  const chooseTieWinner = useCallback(async (teamId: string) => {
    if (!state) return;
    setBusy(true); setError("");
    try { await persist(resolveWildcardGridTie(state, teamId), "clear"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resolve the tie."); }
    finally { setBusy(false); }
  }, [persist, setError, state]);

  const finish = useCallback(async () => {
    if (!session) return;
    setBusy(true); setError("");
    try {
      const grid = session.settings.wildcardGridState;
      const leaderboard = grid
        ? [...grid.teams].map((team) => ({ id: team.id, name: team.name, score: grid.teamScores[team.id] ?? 0 })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        : [];
      const publicGrid = grid ? publicWildcardSettings({ ...session.settings, wildcardGridState: grid }).wildcardGridState ?? null : null;
      await finalizeLiveSession(session.id);
      await send("final", { state: "final_results", leaderboardKind: "team", leaderboard, wildcardGridState: publicGrid });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not finish Wildcard Grid.");
    } finally { setBusy(false); }
  }, [refresh, send, session, setError]);

  return { state, busy, start, selectTile, markAnswer, continueResult, resolveWildcard, chooseTieWinner, finish };
}
