"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase/client";

const BUCKET = "activity-media";
const STORAGE_PREFIX = `storage:${BUCKET}/`;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function isStoredMediaRef(value?: string) {
  return Boolean(value?.startsWith(STORAGE_PREFIX));
}

export async function uploadActivityImage(file: File, activityId: string, itemId: string): Promise<string> {
  if (!ACCEPTED.has(file.type)) throw new Error("Use a PNG, JPG, WebP or GIF image.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Images must be 5 MB or smaller.");

  const supabase = getBrowserSupabaseClient();
  if (!supabase) {
    if (file.size > 700 * 1024) throw new Error("In local mode, use an image under 700 KB or connect Supabase for larger files.");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read the image."));
      reader.readAsDataURL(file);
    });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in before uploading images.");
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${user.id}/${activityId}/${itemId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
  if (error) throw error;
  return `${STORAGE_PREFIX}${path}`;
}

export async function resolveActivityImageUrl(ref?: string): Promise<string | null> {
  if (!ref) return null;
  if (!isStoredMediaRef(ref)) return ref;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return null;
  const path = ref.slice(STORAGE_PREFIX.length);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 4 * 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export async function removeActivityImage(ref?: string) {
  if (!ref || !isStoredMediaRef(ref)) return;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;
  const path = ref.slice(STORAGE_PREFIX.length);
  await supabase.storage.from(BUCKET).remove([path]);
}
