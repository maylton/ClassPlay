import assert from "node:assert/strict";
import fs from "node:fs";

const studentJoin = fs.readFileSync(new URL("../src/components/live/StudentJoinClient.tsx", import.meta.url), "utf8");

assert.match(
  studentJoin,
  /const currentCode = normalizeRoomCode\(code\);[\s\S]*saved\.roomCode === currentCode/,
  "Stored live credentials must be matched against the room code currently shown/typed, not the code that originally opened the page.",
);
assert.doesNotMatch(
  studentJoin,
  /saved\.roomCode === normalizeRoomCode\(initialCode\)/,
  "The initial invite/QR code must not permanently block credentials for a later room on the same page.",
);

const joinResultIndex = studentJoin.indexOf("setJoinResult(result);");
const credentialWriteIndex = studentJoin.indexOf("writeCredentials(saved);");
assert.ok(joinResultIndex >= 0 && credentialWriteIndex >= 0 && joinResultIndex < credentialWriteIndex,
  "The new room join snapshot must be stored before credentials trigger the live-room render.");

const leaveResultIndex = studentJoin.indexOf("setJoinResult(null);");
const credentialClearIndex = studentJoin.indexOf("writeCredentials(null);");
assert.ok(leaveResultIndex >= 0 && credentialClearIndex >= 0 && leaveResultIndex < credentialClearIndex,
  "Leaving a finished room must clear the previous join snapshot before credentials are removed.");

console.log("Live second-room rejoin regression tests passed.");