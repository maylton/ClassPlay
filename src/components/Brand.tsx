import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link className="brand" href="/dashboard" aria-label="ClassPlay dashboard"><span className="brand-mark">C</span>{!compact && <span>ClassPlay</span>}</Link>;
}
