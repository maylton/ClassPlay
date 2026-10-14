"use client";

import { useEffect, useState } from "react";
import { resolveActivityImageUrl } from "@/lib/media";

/** Turns a stored `storage:` image reference into a signed URL usable in CSS or <img>. */
export function useResolvedImageUrl(ref?: string) {
  const [resolved, setResolved] = useState<{ ref?: string; url: string | null }>({ url: null });

  useEffect(() => {
    let active = true;
    void resolveActivityImageUrl(ref).then((url) => { if (active) setResolved({ ref, url }); });
    return () => { active = false; };
  }, [ref]);

  return resolved.ref === ref ? resolved.url : null;
}
