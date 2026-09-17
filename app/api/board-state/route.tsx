import { NextResponse } from "next/server";

/**
 * Server-backed operator control snapshot.
 *
 * The operator panel and the on-air board may run on different devices — the
 * truck control machine, a phone on the same network, or the viewer's own
 * browser. Same-browser channels (BroadcastChannel + localStorage) can't span
 * those, so the control state lives here and both sides poll it every few
 * seconds (instant cross-tab delivery is layered on top client-side).
 */

// Kept as a module-global (per server instance) like the scores route's
// lastGood cache: a dev-instance convenience, not durable storage.
let snapshot: BoardSnapshot | null = null;

export type BoardSnapshot = {
  sport?: string;
  /** Dates (YYYY-MM-DD) to show; empty array = today. */
  dates?: string[];
  paused?: boolean;
  stepTo?: number;
  /** School names to show; empty array = every school. */
  schools?: string[];
  /** Game ids to show; empty array = every game in the feed. */
  gameIds?: string[];
  /** Wall-clock publish time (ms). Lets a client ignore stale snapshots. */
  publishedAt: number;
};

const STATE_TTL_MS = 24 * 60 * 60 * 1000;

const STATE_KEYS = ["sport", "dates", "paused", "stepTo", "schools", "gameIds"] as const;
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const next: BoardSnapshot = { publishedAt: Date.now() };
  const typed: Record<string, string[] | string | number | boolean | undefined> = next as unknown as typeof typed;
  for (const key of STATE_KEYS) {
    const value = body[key];
    if (value === undefined || value === null) continue;
    // Type-check each field: a malformed publish must not poison the board.
    if (key === "sport" && typeof value === "string") typed[key] = value;
    else if ((key === "dates" || key === "schools" || key === "gameIds") && Array.isArray(value)) typed[key] = value.map(String).slice(0, 200);
    else if ((key === "paused" || key === "stepTo") && (typeof value === "number" || typeof value === "boolean")) typed[key] = value;
  }

  snapshot = next;
  return NextResponse.json({ ok: true, publishedAt: next.publishedAt });
}

export async function GET() {
  if (snapshot && Date.now() - snapshot.publishedAt < STATE_TTL_MS) {
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(null, { headers: { "Cache-Control": "no-store" } });
}
