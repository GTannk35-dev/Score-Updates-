import { NextResponse } from "next/server";
import { parseScoreCards } from "@/lib/parse-scorecards";
import { isBig9School, normalizeSchool, schoolColor, schoolLogo, shortSchoolName } from "@/lib/teams";
import { findSport, sourceUrlFor } from "@/lib/sports";
import type { Game, ScoresPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Last successful non-empty payload per sport, served when the live source is unreachable. */
const lastGood = new Map<string, ScoresPayload>();

const sampleGames: Game[] = [
  { id: "sample-1", away: { name: "Mankato West", shortName: "Mankato West", score: 21, record: "3–1" }, home: { name: "Owatonna", shortName: "Owatonna", score: 28, record: "4–0" }, status: "LIVE", detail: "Q4  •  02:18", venue: "Owatonna, MN", date: "Friday, September 12", updatedAt: new Date().toISOString() },
  { id: "sample-2", away: { name: "Austin", shortName: "Austin", score: 14, record: "2–2" }, home: { name: "Rochester Mayo", shortName: "Rochester Mayo", score: 35, record: "4–0" }, status: "FINAL", detail: "FINAL", venue: "Rochester, MN", date: "Friday, September 12", updatedAt: new Date().toISOString() },
  { id: "sample-3", away: { name: "Northfield", shortName: "Northfield", record: "1–2" }, home: { name: "Faribault", shortName: "Faribault", record: "2–1" }, status: "UPCOMING", detail: "FRI 7:00 PM", venue: "Faribault, MN", date: "Friday, September 19", updatedAt: new Date().toISOString() },
  { id: "sample-4", away: { name: "Red Wing", shortName: "Red Wing", score: 7, record: "1–3" }, home: { name: "Winona", shortName: "Winona", score: 10, record: "3–1" }, status: "HALFTIME", detail: "HALFTIME", venue: "Winona, MN", date: "Friday, September 12", updatedAt: new Date().toISOString() },
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "Today" in Minnesota (America/Chicago), so evening broadcasts don't roll to tomorrow. */
function todayInCentral(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
  return parts.slice(0, 10); // en-CA yields YYYY-MM-DD
}

/**
 * minnesota-scores.net takes the date as a PATH segment
 * (/scoreboard/2026-09-15). Its ?filter-game-date= query param is ignored by
 * the server, so a query-param URL always returns today's page.
 */
function scoreboardUrlFor(sportId: string, date: string): string {
  return `${sourceUrlFor(findSport(sportId))}/${date}`;
}

async function fetchGamesForDate(sportId: string, date: string, now: Date): Promise<{ games: Game[]; sourceUrl: string }> {
  const sourceUrl = scoreboardUrlFor(sportId, date);
  const response = await fetch(sourceUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
    headers: { "User-Agent": "LMR-Media-Big9-Scoreboard/1.0", Accept: "text/html" },
  });
  if (!response.ok) throw new Error(`Source returned ${response.status} for ${date}`);
  const html = await response.text();
  const games = parseScoreCards(html, {
    date,
    sourceUrl,
    isTracked: isBig9School,
    displayName: normalizeSchool,
    shortName: shortSchoolName,
    logo: schoolLogo,
    color: schoolColor,
    now,
  });
  return { games, sourceUrl };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sport = findSport(params.get("sport")).id;
  const now = new Date();
  const dates = [...new Set(params.getAll("date").filter((value) => ISO_DATE_RE.test(value)))];
  if (!dates.length) dates.push(todayInCentral());
  dates.sort();

  const results = await Promise.allSettled(dates.map((date) => fetchGamesForDate(sport, date, now)));
  const fulfilled = results.filter((entry): entry is PromiseFulfilledResult<{ games: Game[]; sourceUrl: string }> => entry.status === "fulfilled");
  const failed = results.length - fulfilled.length;
  const games = fulfilled.flatMap((entry) => entry.value.games).sort((a, b) => a.date.localeCompare(b.date));
  const sourceUrl = fulfilled[0]?.value.sourceUrl ?? scoreboardUrlFor(sport, dates[0]);

  // Live data (even partial) wins; only an empty successful sweep returns [].
  if (games.length) {
    const payload: ScoresPayload = { games, fetchedAt: now.toISOString(), source: "live", sourceUrl, sport };
    lastGood.set(sport, payload);
    return NextResponse.json(failed ? { ...payload, stale: true, error: `${failed} of ${results.length} date feeds unavailable` } : payload, { headers: { "Cache-Control": "s-maxage=45, stale-while-revalidate=120" } });
  }
  if (!failed) {
    const empty: ScoresPayload = { games: [], fetchedAt: now.toISOString(), source: "live", sourceUrl, sport };
    return NextResponse.json(empty, { headers: { "Cache-Control": "s-maxage=45, stale-while-revalidate=120" } });
  }

  // Every date feed failed: fall back to this sport's last good data, else the demo board.
  const cached = lastGood.get(sport);
  if (cached) return NextResponse.json({ ...cached, source: "cache", stale: true, error: "Live source temporarily unavailable" }, { headers: { "Cache-Control": "no-store" } });
  const demo: ScoresPayload = { games: sampleGames, fetchedAt: now.toISOString(), source: "demo", sourceUrl, sport, stale: true, error: "Live source unavailable — showing demo scores" };
  return NextResponse.json(demo, { headers: { "Cache-Control": "no-store" } });
}
