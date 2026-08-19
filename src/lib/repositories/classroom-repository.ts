"use client";

import { ensureCloudActivity, listActivities, loadActivity } from "@/lib/repositories/activity-repository";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { ActivitySet, GameType } from "@/lib/types";

const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface ClassroomSummary {
  id: string;
  name: string;
  schoolYear: string;
  joinCode: string;
  joinEnabled: boolean;
  memberCount: number;
  assignmentCount: number;
  createdAt: string;
}

export interface ClassMemberRecord {
  id: string;
  classroomId: string;
  userId: string;
  displayName: string;
  active: boolean;
  joinedAt: string;
}

export interface AssignmentRecord {
  id: string;
  classroomId: string;
  activitySetId: string;
  title: string;
  instructions: string;
  gameType: GameType | null;
  dueAt: string | null;
  attemptsLimit: number | null;
  published: boolean;
  createdAt: string;
  activityTitle?: string;
  activityTopic?: string;
  attempts?: AssignmentAttemptRecord[];
}

export interface AssignmentAttemptRecord {
  id: string;
  assignmentId: string;
  memberId: string;
  gameType: GameType;
  score: number;
  correct: number;
  total: number;
  completedAt: string;
}

export interface TeacherClassDetail {
  classroom: ClassroomSummary;
  members: ClassMemberRecord[];
  assignments: AssignmentRecord[];
  activities: ActivitySet[];
}

export interface StudentClassSummary {
  memberId: string;
  classroomId: string;
  name: string;
  schoolYear: string;
  displayName: string;
  joinedAt: string;
}

export interface StudentAssignmentDetail {
  assignment: AssignmentRecord;
  member: ClassMemberRecord;
  activity: ActivitySet;
  attempts: AssignmentAttemptRecord[];
}

function clientOrThrow() {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) throw new Error("ClassPlay cloud setup is required for Classes.");
  return supabase;
}

async function currentUser() {
  const supabase = clientOrThrow();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

async function permanentTeacher() {
  const user = await currentUser();
  if (!user) throw new Error("Sign in as a teacher to manage classes.");
  if (Boolean((user as { is_anonymous?: boolean }).is_anonymous)) {
    throw new Error("Student sessions cannot manage teacher classes.");
  }
  return user;
}

export function generateClassJoinCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => JOIN_ALPHABET[byte % JOIN_ALPHABET.length]).join("");
}

function mapClassroom(row: Record<string, unknown>): ClassroomSummary {
  const memberCount = Array.isArray(row.class_members) ? Number((row.class_members[0] as { count?: number } | undefined)?.count ?? 0) : 0;
  const assignmentCount = Array.isArray(row.assignments) ? Number((row.assignments[0] as { count?: number } | undefined)?.count ?? 0) : 0;
  return {
    id: String(row.id),
    name: String(row.name),
    schoolYear: String(row.school_year ?? ""),
    joinCode: String(row.join_code ?? ""),
    joinEnabled: Boolean(row.join_enabled),
    memberCount,
    assignmentCount,
    createdAt: String(row.created_at ?? ""),
  };
}

function mapMember(row: Record<string, unknown>): ClassMemberRecord {
  return {
    id: String(row.id),
    classroomId: String(row.classroom_id),
    userId: String(row.user_id),
    displayName: String(row.display_name),
    active: Boolean(row.active),
    joinedAt: String(row.joined_at),
  };
}

function mapAttempt(row: Record<string, unknown>): AssignmentAttemptRecord {
  return {
    id: String(row.id),
    assignmentId: String(row.assignment_id),
    memberId: String(row.member_id),
    gameType: String(row.game_type) as GameType,
    score: Number(row.score ?? 0),
    correct: Number(row.correct ?? 0),
    total: Number(row.total ?? 0),
    completedAt: String(row.completed_at),
  };
}

function mapAssignment(row: Record<string, unknown>): AssignmentRecord {
  const activity = Array.isArray(row.activity_sets) ? row.activity_sets[0] as Record<string, unknown> | undefined : row.activity_sets as Record<string, unknown> | null | undefined;
  return {
    id: String(row.id),
    classroomId: String(row.classroom_id),
    activitySetId: String(row.activity_set_id),
    title: String(row.title),
    instructions: String(row.instructions ?? ""),
    gameType: row.game_type ? String(row.game_type) as GameType : null,
    dueAt: row.due_at ? String(row.due_at) : null,
    attemptsLimit: row.attempts_limit == null ? null : Number(row.attempts_limit),
    published: Boolean(row.published),
    createdAt: String(row.created_at),
    activityTitle: activity?.title ? String(activity.title) : undefined,
    activityTopic: activity?.topic ? String(activity.topic) : undefined,
    attempts: Array.isArray(row.assignment_attempts)
      ? (row.assignment_attempts as Record<string, unknown>[]).map(mapAttempt)
      : undefined,
  };
}

export async function listTeacherClassrooms(): Promise<ClassroomSummary[]> {
  await permanentTeacher();
  const supabase = clientOrThrow();
  const { data, error } = await supabase
    .from("classrooms")
    .select("id,name,school_year,join_code,join_enabled,created_at,class_members(count),assignments(count)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapClassroom(row as unknown as Record<string, unknown>));
}

export async function createClassroom(name: string, schoolYear: string): Promise<ClassroomSummary> {
  const user = await permanentTeacher();
  const supabase = clientOrThrow();
  const cleanName = name.trim().replace(/\s+/g, " ");
  const cleanYear = schoolYear.trim();
  if (!cleanName) throw new Error("Enter a class name.");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const joinCode = generateClassJoinCode();
    const { data, error } = await supabase
      .from("classrooms")
      .insert({ owner_id: user.id, name: cleanName, school_year: cleanYear || String(new Date().getFullYear()), join_code: joinCode })
      .select("id,name,school_year,join_code,join_enabled,created_at")
      .single();
    if (!error && data) return mapClassroom(data as unknown as Record<string, unknown>);
    if (error?.code !== "23505") throw error;
  }
  throw new Error("Could not generate a unique class code. Try again.");
}

export async function loadTeacherClassroom(classroomId: string): Promise<TeacherClassDetail> {
  await permanentTeacher();
  const supabase = clientOrThrow();
  const [classResult, membersResult, assignmentsResult, activities] = await Promise.all([
    supabase.from("classrooms").select("id,name,school_year,join_code,join_enabled,created_at").eq("id", classroomId).single(),
    supabase.from("class_members").select("id,classroom_id,user_id,display_name,active,joined_at").eq("classroom_id", classroomId).order("display_name"),
    supabase.from("assignments").select("id,classroom_id,activity_set_id,title,instructions,game_type,due_at,attempts_limit,published,created_at,activity_sets(title,topic),assignment_attempts(id,assignment_id,member_id,game_type,score,correct,total,completed_at)").eq("classroom_id", classroomId).order("created_at", { ascending: false }),
    listActivities(),
  ]);
  if (classResult.error) throw classResult.error;
  if (membersResult.error) throw membersResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;

  const members = (membersResult.data ?? []).map((row) => mapMember(row as unknown as Record<string, unknown>));
  const assignments = (assignmentsResult.data ?? []).map((row) => mapAssignment(row as unknown as Record<string, unknown>));
  return {
    classroom: { ...mapClassroom(classResult.data as unknown as Record<string, unknown>), memberCount: members.filter((member) => member.active).length, assignmentCount: assignments.length },
    members,
    assignments,
    activities,
  };
}

export async function setClassJoining(classroomId: string, enabled: boolean) {
  await permanentTeacher();
  const supabase = clientOrThrow();
  const { error } = await supabase.from("classrooms").update({ join_enabled: enabled, updated_at: new Date().toISOString() }).eq("id", classroomId);
  if (error) throw error;
}

export async function removeClassMember(memberId: string) {
  await permanentTeacher();
  const supabase = clientOrThrow();
  const { error } = await supabase.from("class_members").update({ active: false }).eq("id", memberId);
  if (error) throw error;
}

export async function createAssignment(input: {
  classroomId: string;
  activity: ActivitySet;
  title: string;
  instructions?: string;
  gameType?: GameType | null;
  dueAt?: string | null;
  attemptsLimit?: number | null;
}) {
  await permanentTeacher();
  const cloudActivity = await ensureCloudActivity(input.activity);
  const supabase = clientOrThrow();
  const { data, error } = await supabase
    .from("assignments")
    .insert({
      classroom_id: input.classroomId,
      activity_set_id: cloudActivity.id,
      title: input.title.trim() || cloudActivity.title,
      instructions: input.instructions?.trim() ?? "",
      game_type: input.gameType ?? null,
      due_at: input.dueAt || null,
      attempts_limit: input.attemptsLimit ?? null,
      published: true,
    })
    .select("id,classroom_id,activity_set_id,title,instructions,game_type,due_at,attempts_limit,published,created_at")
    .single();
  if (error) throw error;
  return mapAssignment(data as unknown as Record<string, unknown>);
}

export async function deleteAssignment(assignmentId: string) {
  await permanentTeacher();
  const supabase = clientOrThrow();
  const { error } = await supabase.from("assignments").delete().eq("id", assignmentId);
  if (error) throw error;
}

export async function ensureStudentSession() {
  const supabase = clientOrThrow();
  const { data: existing } = await supabase.auth.getUser();
  if (existing.user) return existing.user;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    if (/anonymous/i.test(error.message) && /disabled|not enabled|provider/i.test(error.message)) {
      throw new Error("Student access needs Anonymous Sign-Ins enabled in the ClassPlay Supabase Auth settings.");
    }
    throw error;
  }
  if (!data.user) throw new Error("Could not create a student session.");
  return data.user;
}

export async function joinClassroom(joinCode: string, displayName: string): Promise<StudentClassSummary> {
  await ensureStudentSession();
  const supabase = clientOrThrow();
  const { data, error } = await supabase.rpc("join_classroom", {
    p_join_code: joinCode.trim().toUpperCase(),
    p_display_name: displayName.trim(),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
  if (!row) throw new Error("Could not join this class.");
  return {
    memberId: String(row.member_id),
    classroomId: String(row.classroom_id),
    name: String(row.classroom_name),
    schoolYear: String(row.school_year),
    displayName: String(row.display_name),
    joinedAt: new Date().toISOString(),
  };
}

export async function listStudentClassrooms(): Promise<StudentClassSummary[]> {
  const user = await currentUser();
  if (!user) return [];
  const supabase = clientOrThrow();
  const { data, error } = await supabase
    .from("class_members")
    .select("id,classroom_id,display_name,joined_at,classrooms(id,name,school_year)")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("joined_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).flatMap((raw) => {
    const row = raw as unknown as Record<string, unknown>;
    const classroom = Array.isArray(row.classrooms) ? row.classrooms[0] as Record<string, unknown> | undefined : row.classrooms as Record<string, unknown> | null | undefined;
    if (!classroom) return [];
    return [{
      memberId: String(row.id),
      classroomId: String(row.classroom_id),
      name: String(classroom.name),
      schoolYear: String(classroom.school_year),
      displayName: String(row.display_name),
      joinedAt: String(row.joined_at),
    }];
  });
}

export async function loadStudentClass(classroomId: string) {
  const user = await currentUser();
  if (!user) throw new Error("Open your class link again to join.");
  const supabase = clientOrThrow();
  const { data: memberData, error: memberError } = await supabase
    .from("class_members")
    .select("id,classroom_id,user_id,display_name,active,joined_at")
    .eq("classroom_id", classroomId)
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!memberData) throw new Error("You are not enrolled in this class.");

  const { data: classData, error: classError } = await supabase.from("classrooms").select("id,name,school_year").eq("id", classroomId).single();
  if (classError) throw classError;
  const { data: assignmentsData, error: assignmentsError } = await supabase
    .from("assignments")
    .select("id,classroom_id,activity_set_id,title,instructions,game_type,due_at,attempts_limit,published,created_at,activity_sets(title,topic),assignment_attempts(id,assignment_id,member_id,game_type,score,correct,total,completed_at)")
    .eq("classroom_id", classroomId)
    .eq("published", true)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (assignmentsError) throw assignmentsError;

  return {
    member: mapMember(memberData as unknown as Record<string, unknown>),
    classroom: { id: String(classData.id), name: String(classData.name), schoolYear: String(classData.school_year) },
    assignments: (assignmentsData ?? []).map((row) => mapAssignment(row as unknown as Record<string, unknown>)),
  };
}

export async function loadStudentAssignment(assignmentId: string): Promise<StudentAssignmentDetail> {
  const user = await currentUser();
  if (!user) throw new Error("Join the class before opening this assignment.");
  const supabase = clientOrThrow();
  const { data: assignmentData, error: assignmentError } = await supabase
    .from("assignments")
    .select("id,classroom_id,activity_set_id,title,instructions,game_type,due_at,attempts_limit,published,created_at,activity_sets(title,topic)")
    .eq("id", assignmentId)
    .eq("published", true)
    .maybeSingle();
  if (assignmentError) throw assignmentError;
  if (!assignmentData) throw new Error("Assignment not found or no longer available.");

  const assignment = mapAssignment(assignmentData as unknown as Record<string, unknown>);
  const { data: memberData, error: memberError } = await supabase
    .from("class_members")
    .select("id,classroom_id,user_id,display_name,active,joined_at")
    .eq("classroom_id", assignment.classroomId)
    .eq("user_id", user.id)
    .eq("active", true)
    .single();
  if (memberError) throw memberError;

  const { data: attemptsData, error: attemptsError } = await supabase
    .from("assignment_attempts")
    .select("id,assignment_id,member_id,game_type,score,correct,total,completed_at")
    .eq("assignment_id", assignmentId)
    .eq("member_id", memberData.id)
    .order("completed_at", { ascending: false });
  if (attemptsError) throw attemptsError;

  const activity = await loadActivity(assignment.activitySetId);
  if (!activity) throw new Error("The activity for this assignment is unavailable.");
  return {
    assignment,
    member: mapMember(memberData as unknown as Record<string, unknown>),
    activity,
    attempts: (attemptsData ?? []).map((row) => mapAttempt(row as unknown as Record<string, unknown>)),
  };
}

export async function submitAssignmentAttempt(input: {
  assignment: AssignmentRecord;
  member: ClassMemberRecord;
  game: GameType;
  score: number;
  correct: number;
  total: number;
}): Promise<AssignmentAttemptRecord> {
  const user = await currentUser();
  if (!user || input.member.userId !== user.id) throw new Error("Student session mismatch.");
  const supabase = clientOrThrow();

  if (input.assignment.attemptsLimit) {
    const { count, error: countError } = await supabase
      .from("assignment_attempts")
      .select("id", { head: true, count: "exact" })
      .eq("assignment_id", input.assignment.id)
      .eq("member_id", input.member.id);
    if (countError) throw countError;
    if ((count ?? 0) >= input.assignment.attemptsLimit) throw new Error("You have used all attempts for this assignment.");
  }

  const { data, error } = await supabase
    .from("assignment_attempts")
    .insert({
      assignment_id: input.assignment.id,
      member_id: input.member.id,
      game_type: input.game,
      score: Math.max(0, Math.round(input.score)),
      correct: Math.max(0, Math.round(input.correct)),
      total: Math.max(0, Math.round(input.total)),
    })
    .select("id,assignment_id,member_id,game_type,score,correct,total,completed_at")
    .single();
  if (error) throw error;
  return mapAttempt(data as unknown as Record<string, unknown>);
}
