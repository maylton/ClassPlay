"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase/client";

const MEDIA_BUCKET = "activity-media";

function clientOrThrow() {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) throw new Error("ClassPlay cloud setup is required for account tools.");
  return supabase;
}

function friendly(error: { code?: string; message: string }) {
  return error.code === "PGRST202" ? new Error("This feature is being enabled. Please try again later.") : new Error(error.message);
}

export async function currentAccountEmail() {
  const supabase = clientOrThrow();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user.email ?? null;
}

/** Everything ClassPlay stores about the signed-in user, as a downloadable JSON file. */
export async function downloadMyData() {
  const supabase = clientOrThrow();
  const { data, error } = await supabase.rpc("export_my_data");
  if (error) throw friendly(error);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `classplay-my-data-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Lists every file under a storage folder (uploads are nested owner/activity/item/file). */
async function listFolder(prefix: string, depth = 0): Promise<string[]> {
  const supabase = clientOrThrow();
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(prefix, { limit: 1000 });
  if (error || !data) return [];
  const nested = await Promise.all(data.map(async (entry) => {
    const path = `${prefix}/${entry.name}`;
    // Folders have no id in Storage listings.
    if (entry.id === null && depth < 4) return listFolder(path, depth + 1);
    return [path];
  }));
  return nested.flat();
}

/**
 * Deletes the signed-in account and everything it owns. Uploaded images are
 * removed through the Storage API first (the database cannot delete files).
 */
export async function deleteMyAccount() {
  const supabase = clientOrThrow();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to delete your account.");

  const files = await listFolder(user.id);
  for (let index = 0; index < files.length; index += 100) {
    await supabase.storage.from(MEDIA_BUCKET).remove(files.slice(index, index + 100));
  }

  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw friendly(error);
  await supabase.auth.signOut();
}
