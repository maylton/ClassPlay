import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// 4.3 — full CSP ships in report-only mode; the enforced policy stays conservative.
const config = await read("next.config.ts");
assert.match(config, /"Content-Security-Policy-Report-Only"/, "The full CSP must start in report-only mode");
assert.match(config, /report-uri \/api\/csp-report/, "Violations must be reported");
assert.match(config, /connect-src 'self' \$\{supabaseOrigin\} \$\{supabaseRealtime\}/, "Supabase REST and Realtime must be allowed");
assert.match(config, /key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"/, "The enforced CSP must not change");
const reportRoute = await read("src/app/api/csp-report/route.ts");
assert.match(reportRoute, /export async function POST/);
assert.match(reportRoute, /MAX_REPORT_BYTES/, "Oversized reports must be ignored");
assert.match(reportRoute, /status: 204/);

// 4.5 — data rights.
const account = await read("src/lib/repositories/account-repository.ts");
assert.match(account, /rpc\("export_my_data"\)/);
assert.ok(account.indexOf("storage.from(MEDIA_BUCKET).remove") < account.indexOf('rpc("delete_my_account")'), "Images are removed before the account is deleted");
assert.match(await read("src/components/AccountClient.tsx"), /confirmText !== CONFIRMATION/, "Deletion requires typing the confirmation word");
assert.match(await read("src/components/AuthStatus.tsx"), /href="\/account"/, "Teachers can reach Account & data");
assert.match(await read("src/components/classes/StudentHomeClient.tsx"), /href="\/account"/, "Students can reach Account & data");
assert.ok(existsSync(new URL("../src/app/account/page.tsx", import.meta.url)));
assert.ok(existsSync(new URL("../docs/PRIVACY_POLICY_DRAFT.md", import.meta.url)), "The privacy policy draft exists for review");
assert.ok(!existsSync(new URL("../src/app/privacy", import.meta.url)), "The draft policy must not be published before legal review");

// 5.7 — the browser stores the derived modes it computed.
assert.match(await read("src/lib/repositories/activity-repository.ts"), /derived_modes: getDerivedArcadeReadiness\(\{ items: activity\.items \}\)\.modes/);

console.log("Remediation phase 6 checks passed.");
