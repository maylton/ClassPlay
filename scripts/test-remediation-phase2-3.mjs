import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function compile(path) {
  const source = (await read(path)).replace(/^import type .*\n/gm, "");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const { createCoalescedTask, liveQuestionKey, newlyEliminated } = await compile("src/lib/live/live-sync.ts");

// A deterministic clock + scheduler so the coalescing rules can be checked exactly.
function fakeTimers() {
  let now = 0;
  const queue = [];
  return {
    now: () => now,
    schedule: (callback, delayMs) => { const timer = { at: now + delayMs, callback }; queue.push(timer); return timer; },
    cancel: (timer) => { const index = queue.indexOf(timer); if (index >= 0) queue.splice(index, 1); },
    async advance(ms) {
      const until = now + ms;
      for (;;) {
        queue.sort((a, b) => a.at - b.at);
        const next = queue[0];
        if (!next || next.at > until) break;
        queue.shift();
        now = next.at;
        next.callback();
        await new Promise((resolve) => setImmediate(resolve));
      }
      now = until;
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

// 3.x — a burst of forged broadcasts produces one fetch per interval, never overlapping.
{
  const timers = fakeTimers();
  let runs = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  let release;
  const task = async () => {
    runs += 1; concurrent += 1; maxConcurrent = Math.max(maxConcurrent, concurrent);
    await new Promise((resolve) => { release = resolve; });
    concurrent -= 1;
  };
  const sync = createCoalescedTask(task, 300, timers);
  for (let i = 0; i < 50; i += 1) sync.trigger();
  await timers.advance(0);
  assert.equal(runs, 1, "The first hint runs immediately");
  for (let i = 0; i < 50; i += 1) sync.trigger();
  release(); await timers.advance(0);
  assert.equal(runs, 1, "Hints during a run wait for the minimum interval");
  await timers.advance(300);
  assert.equal(runs, 2, "One trailing run covers every hint received meanwhile");
  release(); await timers.advance(1000);
  assert.equal(runs, 2, "No extra runs without new hints");
  assert.equal(maxConcurrent, 1, "Runs never overlap");
  sync.stop(); sync.trigger(); await timers.advance(1000);
  assert.equal(runs, 2, "A stopped task ignores hints");
}

// A failing task does not wedge the queue.
{
  const timers = fakeTimers();
  let runs = 0;
  const sync = createCoalescedTask(async () => { runs += 1; throw new Error("network"); }, 100, timers);
  sync.trigger(); await timers.advance(0);
  sync.trigger(); await timers.advance(100);
  assert.equal(runs, 2);
}

assert.equal(liveQuestionKey(null), "");
assert.notEqual(
  liveQuestionKey({ itemId: "a", index: 0, dynamiteTurnId: "t1" }),
  liveQuestionKey({ itemId: "a", index: 0, dynamiteTurnId: "t2" }),
  "A new Dynamite turn on the same item is a new question",
);
assert.equal(
  liveQuestionKey({ itemId: "a", index: 0, dynamiteTurnId: "t1", passedBy: "p" }),
  liveQuestionKey({ itemId: "a", index: 0, dynamiteTurnId: "t1" }),
  "In-turn updates keep the same question",
);
assert.deepEqual(newlyEliminated(null, ["a"]), [], "The first snapshot never shows an explosion");
assert.deepEqual(newlyEliminated(["a"], ["a", "b"]), ["b"]);

// 3.1 — phones only treat host broadcasts as hints.
const student = await read("src/components/live/StudentJoinClient.tsx");
assert.match(student, /HOST_HINT_EVENTS/, "Students must subscribe to host events as hints");
assert.match(student, /createCoalescedTask\(hydrate/, "Hints must coalesce into authoritative snapshots");
assert.doesNotMatch(student, /payload\.(question|correctAnswer|leaderboard|settings|state|playerName|wildcardGridState|dynamiteWinner)/, "Broadcast payloads must never drive the student screen");
assert.match(student, /snapshot\.leaderboard/, "The final ranking must come from the resume RPC");

// 3.2 / Dynamite ordering — the host persists before it announces.
const host = await read("src/components/live/HostRoomClient.tsx");
assert.match(host, /createCoalescedTask\(refresh, HOST_REFRESH_MIN_INTERVAL_MS\)/);
assert.doesNotMatch(host, /\(\) => void refresh\(\)\)/, "Realtime events must not trigger one refresh each");
const explode = host.slice(host.indexOf("const explodeDynamite"), host.indexOf("const explodeDynamite") + 2600);
const afterWinnerCheck = explode.slice(explode.indexOf("if (eliminated.winnerId)"));
const winnerBranch = afterWinnerCheck.slice(0, afterWinnerCheck.indexOf("return;"));
const nextTurnBranch = afterWinnerCheck.slice(afterWinnerCheck.indexOf("return;"));
for (const [label, branch] of [["winner", winnerBranch], ["next turn", nextTurnBranch]]) {
  const saved = branch.indexOf("updateHostSession");
  const announced = branch.indexOf('send("dynamite-explosion"');
  assert.ok(saved >= 0 && announced > saved, `The explosion is saved before it is announced (${label} branch)`);
}

// 2.x — client wiring.
const leaderboardRepo = await read("src/lib/repositories/leaderboard-repository.ts");
assert.match(leaderboardRepo, /export async function deletePracticeScore/);
assert.match(await read("src/components/GameHub.tsx"), /LeaderboardModerationPanel/);
const classroomRepo = await read("src/lib/repositories/classroom-repository.ts");
assert.match(classroomRepo, /export async function readmitClassMember/);
assert.match(classroomRepo, /submittedLate: row\.submitted_late === true/);
assert.match(await read("src/components/classes/ClassDetailClient.tsx"), /readmitMember/);
assert.doesNotMatch(await read("src/components/DashboardClient.tsx"), /find\(\(item\) => item\.imageUrl\)\?\.imageUrl;\s*\n\s*\n?\s*return \(/, "Dashboard previews must be resolved, not raw storage refs");

console.log("Remediation phase 2 + 3 checks passed.");
