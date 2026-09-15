import { NextResponse } from "next/server";
import { isBig9School, normalizeSchool, shortSchoolName } from "@/lib/teams";
import { findSport, sourceUrlFor } from "@/lib/sports";
import type { Game, GameStatus, ScoresPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

let lastGood: ScoresPayload | null = null;

const sampleGames: Game[] = [
  { id: "sample-1", away: { name: "Mankato West", shortName: "Mankato West", score: 21, record: "3–1" }, home: { name: "Owatonna", shortName: "Owatonna", score: 28, record: "4–0" }, status: "LIVE", detail: "Q4  •  02:18", venue: "Owatonna, MN", date: "Friday, September 12", updatedAt: new Date().toISOString() },
  { id: "sample-2", away: { name: "Austin", shortName: "Austin", score: 14, record: "2–2" }, home: { name: "Rochester Mayo", shortName: "Rochester Mayo", score: 35, record: "4–0" }, status: "FINAL", detail: "FINAL", venue: "Rochester, MN", date: "Friday, September 12", updatedAt: new Date().toISOString() },
  { id: "sample-3", away: { name: "Northfield", shortName: "Northfield", score: undefined, record: "1–2" }, home: { name: "Faribault", shortName: "Faribault", score: undefined, record: "2–1" }, status: "UPCOMING", detail: "FRI 7:00 PM", venue: "Faribault, MN", date: "Friday, September 19", updatedAt: new Date().toISOString() },
  { id: "sample-4", away: { name: "Red Wing", shortName: "Red Wing", score: 7, record: "1–3" }, home: { name: "Winona", shortName: "Winona", score: 10, record: "3–1" }, status: "HALFTIME", detail: "HALFTIME", venue: "Winona, MN", date: "Friday, September 12", updatedAt: new Date().toISOString() },
];

function cleanText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "–")
    .replace(/\s+/g, " ")
    .trim();
}

function statusFromText(text: string): GameStatus {
  const upper = text.toUpperCase();
  if (/FINAL|F\s*\/\s*T|COMPLETED/.test(upper)) return "FINAL";
  if (/HALFTIME|HALF TIME/.test(upper)) return "HALFTIME";
  if (/DELAY|POSTPON/.test(upper)) return "DELAYED";
  if (/Q[1-4]|\bLIVE\b|\d{1,2}:\d{2}/.test(upper)) return "LIVE";
  return "UPCOMING";
}

function formatSourceDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return new Date().toLocaleDateString("en-US");
  return parsed.toLocaleDateString("en-US");
}

function parseGames(html: string, requestedDate: string, sourceUrl: string): Game[] {
  const games: Game[] = [];
  const blocks = html.match(/<(?:article|div|li|tr)[^>]+class=["'][^"']*(?:score|game|board|contest)[^"']*["'][^>]*>[\s\S]*?<\/(?:article|div|li|tr)>/gi) ?? [];
  const candidates = blocks.length ? blocks : [html];
  candidates.forEach((block, index) => {
    const text = cleanText(block);
    const names = Array.from(new Set((text.match(/[A-Z][A-Za-z.'’ -]{2,40}/g) ?? []).map((name) => normalizeSchool(name)).filter(isBig9School)));
    if (names.length < 1) return;
    const teams = names.slice(0, 2);
    if (teams.length < 2) return;
    const scoreMatches = text.match(/\b\d{1,2}\b/g) ?? [];
    const scores = scoreMatches.slice(-2).map(Number);
    const status = statusFromText(text);
    games.push({
      id: `live-${index}-${teams.join("-")}`,
      away: { name: teams[0], shortName: shortSchoolName(teams[0]), score: scores[0] },
      home: { name: teams[1], shortName: shortSchoolName(teams[1]), score: scores[1] },
      status,
      detail: status === "UPCOMING" ? text.match(/\d{1,2}:\d{2}\s*(?:AM|PM)?/i)?.[0] ?? "SCHEDULED" : text.match(/(?:Q[1-4]|FINAL|HALFTIME)[^|]*/i)?.[0]?.trim() ?? status,
      date: requestedDate,
      updatedAt: new Date().toISOString(),
      sourceUrl,
    });
  });
  return games;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const date = params.get("date") || new Date().toISOString().slice(0, 10);
  const sport = findSport(params.get("sport")).id;
  const sourceDate = formatSourceDate(date);
  const sourceUrl = sourceUrlFor(findSport(sport));
  const upstream = `${sourceUrl}?filter-game-date=${encodeURIComponent(sourceDate)}`;
  try {
    const response = await fetch(upstream, { cache: "no-store", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "LMR-Media-Big9-Scoreboard/1.0" } });
    if (!response.ok) throw new Error(`Source returned ${response.status}`);
    const games = parseGames(await response.text(), date, sourceUrl);
    if (games.length) {
      lastGood = { games, fetchedAt: new Date().toISOString(), source: "live", sourceUrl: upstream, sport };
      return NextResponse.json(lastGood, { headers: { "Cache-Control": "s-maxage=45, stale-while-revalidate=120" } });
    }
    const empty: ScoresPayload = { games: [], fetchedAt: new Date().toISOString(), source: "live", sourceUrl: upstream, sport };
    return NextResponse.json(empty, { headers: { "Cache-Control": "s-maxage=45, stale-while-revalidate=120" } });
  } catch (error) {
    if (lastGood?.sport === sport) return NextResponse.json({ ...lastGood, source: "cache", stale: true, error: "Live source temporarily unavailable" });
    return NextResponse.json({ games: sampleGames, fetchedAt: new Date().toISOString(), source: "demo", sourceUrl: upstream, stale: true, sport, error: error instanceof Error ? error.message : "Live source unavailable" });
  }
}
