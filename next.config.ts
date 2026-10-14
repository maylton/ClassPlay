import type { NextConfig } from "next";

// Conservative headers that cannot break scripts, styles, Supabase or Realtime.
// A full Content-Security-Policy (script/connect/img allow-lists) should first
// run as Content-Security-Policy-Report-Only; see docs/REMEDIATION_PLAN.md (4.3).
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera/microphone/location are never used; speech synthesis needs no permission.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
