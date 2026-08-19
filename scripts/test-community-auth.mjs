import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/0010_community_and_student_accounts.sql");
const joinFix = read("supabase/migrations/0011_fix_student_class_join_conflict.sql");
const studentRepo = read("src/lib/repositories/student-account-repository.ts");
const joinClient = read("src/components/classes/JoinClassClient.tsx");
const serverAuth = read("src/lib/supabase/auth.ts");
const communityRepo = read("src/lib/repositories/community-repository.ts");
const communityClient = read("src/components/community/CommunityClient.tsx");
const header = read("src/components/AppHeader.tsx");

assert.match(migration, /create table public\.student_profiles/, "v0.5 must persist student role/username separately from editable auth metadata");
assert.match(migration, /unique \(username_key\)/, "student usernames must be case-insensitively unique");
assert.match(migration, /register_student_profile/, "student profile creation must be server validated");
assert.match(migration, /join_classroom_account/, "permanent accounts must join through an authenticated class-code RPC");
assert.match(migration, /revoke execute on function public\.join_classroom\(text, text\) from authenticated/, "legacy anonymous join RPC must no longer be available to v0.5 students");
assert.match(migration, /private\.is_student_account/, "student vs teacher authorization must be database backed");
assert.match(migration, /teacher activity sets insert/, "student accounts must be restricted from teacher authoring writes");
assert.match(migration, /teacher classrooms insert guard/, "student accounts must be restricted from creating classes");
assert.match(joinFix, /on conflict on constraint class_members_classroom_id_user_id_key/, "class join upsert must target the unique membership constraint without PL/pgSQL ambiguity");

assert.match(studentRepo, /auth\.signUp\(/, "first-time students must create a permanent Supabase account");
assert.match(studentRepo, /auth\.signInWithPassword\(/, "returning students must sign in with email/password");
assert.doesNotMatch(studentRepo, /signInAnonymously/, "v0.5 student account flow must not use anonymous auth");
assert.match(studentRepo, /register_student_profile/, "the client must register a server-validated username");
assert.match(studentRepo, /join_classroom_account/, "the client must use the permanent-account class join RPC");
assert.match(studentRepo, /password\.length < 8/, "student signup should require at least 8 characters client-side");

assert.match(joinClient, /Username/, "first-time student UI must request a username");
assert.match(joinClient, /Email/, "student account UI must request email");
assert.match(joinClient, /Password/, "student account UI must request password");
assert.match(joinClient, /Class key \(optional\)/, "returning students must be able to sign in without a class key");
assert.match(joinClient, /completeStudentSignup/, "email-confirmation callback must resume class onboarding");

assert.match(serverAuth, /student_profiles/, "teacher route guards must recognize student accounts server-side");
assert.match(serverAuth, /redirect\("\/student"\)/, "student accounts must be redirected out of teacher workspaces");

assert.match(migration, /create table public\.community_listings/, "Community discovery must be stored independently from activity visibility");
assert.match(migration, /publish_community_activity/, "teachers need an explicit Community publish RPC");
assert.match(migration, /remove_community_activity/, "teachers need an explicit Community removal RPC");
assert.match(migration, /create view public\.community_catalog\s+with \(security_invoker = true\)/s, "Community catalog view must respect underlying RLS");
assert.match(communityRepo, /from\("community_catalog"\)/, "Community listing must load through the safe public catalog view");
assert.match(communityRepo, /auth\.getSession\(\)/, "public Community auth detection must tolerate a missing session");
assert.match(communityRepo, /if \(!session\?\.user\) return emptyCommunityTeacherState\(\)/, "missing auth must resolve to the normal public visitor state");
assert.doesNotMatch(communityRepo, /auth\.getUser\(\)/, "public Community loading must not throw AuthSessionMissingError for anonymous visitors");
assert.match(communityRepo, /publish_community_activity/, "Community repository must publish through the RPC");
assert.match(communityRepo, /remove_community_activity/, "Community repository must remove listings without disabling practice links");
assert.match(communityClient, /void listCommunityActivities\(\)/, "public catalog loading must run independently of teacher auth state");
assert.match(communityClient, /void loadCommunityTeacherState\(\)/, "teacher tools may load alongside the public catalog without gating it");
assert.doesNotMatch(communityClient, /Promise\.all\(\[listCommunityActivities\(\), loadCommunityTeacherState\(\)\]\)/, "public catalog must not fail just because teacher auth state is unavailable");
assert.match(communityClient, /\/practice\/\$\{activity\.activityId\}/, "Community Play must reuse the persistent practice/leaderboard route");
assert.match(communityClient, /All grades/, "Community catalog must expose grade filtering");
assert.match(communityClient, /All levels/, "Community catalog must expose level filtering");
assert.match(communityClient, /Any game mode/, "Community catalog must expose game-mode filtering");
assert.match(header, /href="\/community"/, "teacher workspace navigation must expose Community");

console.log("Community + permanent student account contracts: OK");
