"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { StudentClassSummary } from "./classroom-repository";

export interface StudentProfile {
  userId: string;
  username: string;
  email?: string;
}

export interface StudentAuthState {
  signedIn: boolean;
  email?: string;
  profile: StudentProfile | null;
}

function clientOrThrow() {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) throw new Error("ClassPlay cloud setup is required for student accounts.");
  return supabase;
}

function mapJoinedClass(row: Record<string, unknown>): StudentClassSummary {
  return {
    memberId: String(row.member_id),
    classroomId: String(row.classroom_id),
    name: String(row.classroom_name),
    schoolYear: String(row.school_year),
    displayName: String(row.display_name),
    joinedAt: new Date().toISOString(),
  };
}

export async function getStudentAuthState(): Promise<StudentAuthState> {
  const supabase = clientOrThrow();

  // A shared class link is commonly opened by a student who has never signed in.
  // That is a normal visitor state, not an auth failure. getUser() may return an
  // AuthSessionMissingError when no session exists, so resolve the local browser
  // session first and only query student data when there is an authenticated user.
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.user) return { signedIn: false, profile: null };

  const user = session.user;
  const { data, error } = await supabase
    .from("student_profiles")
    .select("user_id,username")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;

  return {
    signedIn: true,
    email: user.email ?? undefined,
    profile: data ? { userId: String(data.user_id), username: String(data.username), email: user.email ?? undefined } : null,
  };
}

export async function registerStudentProfile(username: string): Promise<StudentProfile> {
  const supabase = clientOrThrow();
  const cleanUsername = username.trim();
  const { data, error } = await supabase.rpc("register_student_profile", { p_username: cleanUsername });
  if (error) throw error;
  if (!data) throw new Error("Could not create the student profile.");
  const row = data as unknown as Record<string, unknown>;
  const { data: { user } } = await supabase.auth.getUser();
  return { userId: String(row.user_id), username: String(row.username), email: user?.email ?? undefined };
}

export async function joinClassroomWithAccount(joinCode: string): Promise<StudentClassSummary> {
  const supabase = clientOrThrow();
  const cleanCode = joinCode.trim().toUpperCase();
  if (cleanCode.length !== 6) throw new Error("Enter the six-character class key.");
  const { data, error } = await supabase.rpc("join_classroom_account", { p_join_code: cleanCode });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
  if (!row) throw new Error("Could not join this class.");
  return mapJoinedClass(row);
}

export async function createStudentAccount(input: {
  email: string;
  password: string;
  username: string;
  joinCode: string;
}): Promise<{ status: "joined"; classroom: StudentClassSummary } | { status: "confirm-email" }> {
  const supabase = clientOrThrow();
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim();
  const joinCode = input.joinCode.trim().toUpperCase();
  if (input.password.length < 8) throw new Error("Use a password with at least 8 characters.");
  if (!username) throw new Error("Choose a username.");
  if (joinCode.length !== 6) throw new Error("Enter the six-character class key.");

  const next = `/class/join?complete=1&code=${encodeURIComponent(joinCode)}&username=${encodeURIComponent(username)}`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { display_name: username, account_intent: "student" },
      emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) throw error;

  if (!data.session) return { status: "confirm-email" };
  await registerStudentProfile(username);
  return { status: "joined", classroom: await joinClassroomWithAccount(joinCode) };
}

export async function completeStudentSignup(joinCode: string, username: string): Promise<StudentClassSummary> {
  const state = await getStudentAuthState();
  if (!state.signedIn) throw new Error("Confirm your email first, then open the ClassPlay link again.");
  if (!state.profile) await registerStudentProfile(username);
  return joinClassroomWithAccount(joinCode);
}

export async function signInStudent(input: { email: string; password: string; joinCode?: string }): Promise<StudentClassSummary | null> {
  const supabase = clientOrThrow();
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email.trim().toLowerCase(),
    password: input.password,
  });
  if (error) throw error;

  const state = await getStudentAuthState();
  if (!state.profile) {
    await supabase.auth.signOut();
    throw new Error("This is not a student account. Use the teacher sign-in if this account belongs to a teacher.");
  }
  return input.joinCode?.trim() ? joinClassroomWithAccount(input.joinCode) : null;
}

export async function requestStudentPasswordReset(email: string) {
  const supabase = clientOrThrow();
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/student/update-password")}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
  if (error) throw error;
}

export async function updateStudentPassword(password: string) {
  if (password.length < 8) throw new Error("Use a password with at least 8 characters.");
  const supabase = clientOrThrow();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Open the password-reset link from your email first.");
  const { data: profile, error: profileError } = await supabase.from("student_profiles").select("user_id").eq("user_id", user.id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error("This reset link is not connected to a student account.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOutStudent() {
  const supabase = clientOrThrow();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
