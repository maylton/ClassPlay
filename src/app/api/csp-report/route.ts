import { NextResponse } from "next/server";

const MAX_REPORT_BYTES = 8_000;

/**
 * Receives Content-Security-Policy-Report-Only violations and writes a compact
 * line to the server log (Vercel → Logs, search "csp-violation"). Nothing is
 * stored; oversized or malformed bodies are ignored.
 */
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > MAX_REPORT_BYTES) return new NextResponse(null, { status: 204 });
    const body = JSON.parse(text) as { "csp-report"?: Record<string, unknown> };
    const report = body["csp-report"] ?? {};
    console.warn("csp-violation", JSON.stringify({
      directive: report["effective-directive"] ?? report["violated-directive"],
      blocked: report["blocked-uri"],
      page: typeof report["document-uri"] === "string" ? report["document-uri"].split("?")[0] : undefined,
      source: report["source-file"],
    }));
  } catch {
    // Ignore malformed reports.
  }
  return new NextResponse(null, { status: 204 });
}
