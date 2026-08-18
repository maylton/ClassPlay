"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { resolveActivityImageUrl } from "@/lib/media";

export function ActivityImage({ refValue, alt, className }: { refValue?: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void resolveActivityImageUrl(refValue).then((url) => active && setSrc(url));
    return () => { active = false; };
  }, [refValue]);

  if (!src) return null;
  return <img src={src} alt={alt} className={className} />;
}
