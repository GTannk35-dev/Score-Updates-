import type { Game, GameStatus, Team } from "./types";

/**
 * Parser for minnesota-scores.net scoreboard pages.
 *
 * Every game on those pages is a `.score-card` block preceded by a
 * `<!-- GameId: N -->` comment, structured as table rows:
 *
 *   <tr><td colspan="2">Time: 7:00 PM</td></tr>
 *   <tr><td colspan="2">@Paul Giel Field</td></tr>   ("@" = venue, first team below is away)
 *   <tr><td><a ...>Away School</a></td><td class="text-right">2</td></tr>
 *   <tr><td><a ...>Home School</a></td><td class="text-right">3</td></tr>
 *   <tr><td colspan="2"><strong>Final</strong></td></tr>  (or clock, or blank)
 *
 * The parser is dependency-free (callbacks inject team classification) so it
 * can be verified directly against saved HTML with plain Node.
 */

export type ScoreCardOptions = {
  /** ISO date (YYYY-MM-DD) the page was fetched for; stamped onto each game. */
  date: string;
  /** Scoreboard page URL the HTML came from; stamped onto each game. */
  sourceUrl: string;
  /** True if the raw school name belongs to a tracked school (e.g. Big 9). */
  isTracked(rawName: string): boolean;
  /** Canonical display name for a raw school name. */
  displayName(rawName: string): string;
  /** Short display name for a canonical school name. */
  shortName(name: string): string;
  /** Local logo path for a canonical school name, if any. */
  logo?(name: string): string | undefined;
  /** Accent color for a canonical school name, if any. */
  color?(name: string): string | undefined;
  /** Clock override (defaults to real time); used by tests. */
  now?: Date;
};

const CARD_RE = /<!--\s*GameId:\s*(\d+)\s*-->\s*<div class="score-card">([\s\S]*?)<\/table>\s*<\/div>/g;
const ROW_RE = /<tr>[\s\S]*?<\/tr>/g;
/** Two-cell row: team name cell followed by a right-aligned score cell (may be empty). */
const TEAM_ROW_RE = /<td[^>]*>\s*((?:(?!<\/td>)[\s\S])*?)\s*<\/td>\s*<td[^>]*class="text-right"[^>]*>\s*(\d*)\s*<\/td>/i;

function stripTags(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/&ndash;|&mdash;/gi, "–")
    .replace(/\s+/g, " ")
    .trim();
}

/** "7:00 PM" -> { hours: 19, minutes: 0 }, or null when unparseable. */
function parseTime(value: string): { hours: number; minutes: number } | null {
  const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/**
 * Central-Time offset (minutes) for a given calendar date, so an evening game
 * on a DST-boundary day is still classified correctly. Noon UTC is always
 * daytime in Chicago, safely clear of the 2 AM transition.
 */
function centralOffsetMinutes(dateISO: string): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", timeZoneName: "longOffset" }).format(new Date(`${dateISO}T12:00:00Z`));
    const match = formatted.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (!match) return -300;
    const sign = match[1] === "-" ? -1 : 1;
    return sign * (Number(match[2]) * 60 + Number(match[3]));
  } catch {
    return -300; // CDT fallback if Intl lacks longOffset support
  }
}

/** True while the scheduled start time is still in the future (Central Time). */
function isUpcoming(dateISO: string, timeText: string, now: Date): boolean {
  const time = parseTime(timeText);
  if (!time) return true; // unknown/TBD start: treat as not yet underway
  const offset = centralOffsetMinutes(dateISO);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const offsetString = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  const gameTime = new Date(`${dateISO}T${String(time.hours).padStart(2, "0")}:${String(time.minutes).padStart(2, "0")}:00${offsetString}`);
  if (Number.isNaN(gameTime.getTime())) return true;
  return now < gameTime;
}

function classifyStatus(statusText: string, dateISO: string, timeText: string, now: Date): { status: GameStatus; detail: string } {
  const upper = statusText.toUpperCase();
  if (/^FINAL/.test(upper)) return { status: "FINAL", detail: upper };
  if (/POSTPON|SUSPEND|DELAY|CANCEL|PPD/.test(upper)) return { status: "DELAYED", detail: upper };
  if (/HALFTIME/.test(upper)) return { status: "HALFTIME", detail: "HALFTIME" };
  if (/\d{1,2}:\d{2}/.test(upper) || /(HALF|PERIOD|\.OT)/.test(upper) || /\bOT\b|\b2OT\b/.test(upper)) return { status: "LIVE", detail: upper };
  if (isUpcoming(dateISO, timeText, now)) return { status: "UPCOMING", detail: timeText ? timeText.toUpperCase() : "SCHEDULED" };
  return { status: "LIVE", detail: "IN PROGRESS" };
}

export function parseScoreCards(html: string, options: ScoreCardOptions): Game[] {
  const now = options.now ?? new Date();
  const games: Game[] = [];
  const seenIds = new Set<string>();

  for (const card of html.matchAll(CARD_RE)) {
    const gameId = card[1];
    const block = card[2];
    const rows = block.match(ROW_RE) ?? [];

    let timeText = "";
    let venue = "";
    let statusText = "";
    const teams: { name: string; score: number | undefined }[] = [];

    for (const row of rows) {
      const teamMatch = row.match(TEAM_ROW_RE);
      if (teamMatch) {
        teams.push({ name: stripTags(teamMatch[1]), score: teamMatch[2] === "" ? undefined : Number(teamMatch[2]) });
        continue;
      }
      const text = stripTags(row);
      if (!text) continue;
      if (/^Time:/i.test(text)) { timeText = text.replace(/^Time:\s*/i, "").trim(); continue; }
      if (/^@/.test(text)) { venue = text.slice(1).trim(); continue; }
      statusText = text; // last trailing row (Final, clock, forfeit note…)
    }

    if (teams.length < 2) continue;
    const [awayRaw, homeRaw] = teams;
    if (!options.isTracked(awayRaw.name) && !options.isTracked(homeRaw.name)) continue;

    const awayName = options.displayName(awayRaw.name);
    const homeName = options.displayName(homeRaw.name);
    const { status, detail } = classifyStatus(statusText, options.date, timeText, now);
    const noScoreYet = status === "UPCOMING" || status === "DELAYED";

    const away: Team = { name: awayName, shortName: options.shortName(awayName), score: noScoreYet ? undefined : awayRaw.score };
    const home: Team = { name: homeName, shortName: options.shortName(homeName), score: noScoreYet ? undefined : homeRaw.score };
    if (options.logo) { away.logo = options.logo(awayName); home.logo = options.logo(homeName); }
    if (options.color) { away.color = options.color(awayName); home.color = options.color(homeName); }

    const id = gameId ? `live-${gameId}` : `live-${options.date}-${awayName}-${homeName}`.replace(/\s+/g, "-").toLowerCase();
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    games.push({
      id,
      away,
      home,
      status,
      detail,
      venue: venue || undefined,
      date: options.date,
      updatedAt: now.toISOString(),
      sourceUrl: options.sourceUrl,
    });
  }

  return games;
}
