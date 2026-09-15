"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Brand } from "./brand";
import { GameCard } from "./game-card";
import { announceScoreUpdate, announceStinger, isScoreUpdateMessage, SCORE_UPDATE_EVENT, type StingerKind } from "@/lib/score-update";
import { publishState, subscribeToState } from "@/lib/broadcast-state";
import { visibleGames } from "@/lib/filter";
import { BIG9_SCHOOLS } from "@/lib/teams";
import { DEFAULT_SPORT, findSport, SPORTS, type SportId } from "@/lib/sports";
import type { Game, ScoresPayload } from "@/lib/types";

const demoPayload: ScoresPayload = {
  games: [
    { id: "sample-1", away: { name: "Mankato West", shortName: "Mankato West", score: 21, record: "3–1" }, home: { name: "Owatonna", shortName: "Owatonna", score: 28, record: "4–0" }, status: "LIVE", detail: "Q4  •  02:18", venue: "Owatonna, MN", date: "Friday, September 12" },
    { id: "sample-2", away: { name: "Austin", shortName: "Austin", score: 14, record: "2–2" }, home: { name: "Rochester Mayo", shortName: "Rochester Mayo", score: 35, record: "4–0" }, status: "FINAL", detail: "FINAL", venue: "Rochester, MN", date: "Friday, September 12" },
    { id: "sample-3", away: { name: "Northfield", shortName: "Northfield", record: "1–2" }, home: { name: "Faribault", shortName: "Faribault", record: "2–1" }, status: "UPCOMING", detail: "FRI 7:00 PM", venue: "Faribault, MN", date: "Friday, September 19" },
    { id: "sample-4", away: { name: "Red Wing", shortName: "Red Wing", score: 7, record: "1–3" }, home: { name: "Winona", shortName: "Winona", score: 10, record: "3–1" }, status: "HALFTIME", detail: "HALFTIME", venue: "Winona, MN", date: "Friday, September 12" },
  ], fetchedAt: "", source: "demo", sourceUrl: "https://www.minnesota-scores.net/boys-sports/football/scoreboard", sport: DEFAULT_SPORT,
};

function useScores(dates: string[], sport: SportId) {
  const [payload, setPayload] = useState<ScoresPayload>(demoPayload);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const query = dates.length ? dates.map((date) => `date=${encodeURIComponent(date)}`).join("&") : "";
      const response = await fetch(`/api/scores?sport=${encodeURIComponent(sport)}${query ? `&${query}` : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to refresh scores");
      const next = (await response.json()) as ScoresPayload;
      setPayload(next);
    } catch { setPayload((current) => ({ ...current, stale: true, error: "Using the last available score feed" })); }
    finally { setLoading(false); }
  }, [dates, sport]);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 60_000); return () => window.clearInterval(timer); }, [refresh]);
  return { payload, loading, refresh };
}

export function BroadcastBoard() {
  const [dates, setDates] = useState<string[]>([]);
  const [sportId, setSportId] = useState<SportId>(DEFAULT_SPORT);
  const { payload } = useScores(dates, sportId);
  const [stinger, setStinger] = useState<{ kind: StingerKind; custom?: string; duration: number } | null>(null);
  const [schools, setSchools] = useState<string[]>([]);
  const [gameIds, setGameIds] = useState<string[]>([]);
  const games = visibleGames(payload.games, schools, gameIds);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showScoreUpdate, setShowScoreUpdate] = useState(false);
  const game = games[index % Math.max(games.length, 1)];
  const sportLabel = findSport(payload.sport).label;

  useEffect(() => {
    const show = (kind: StingerKind, custom?: string, duration?: number) => {
      const ms = duration ?? STINGER_MS[kind] ?? 3200;
      setStinger({ kind, custom, duration: ms });
      window.setTimeout(() => setStinger(null), ms);
    };
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(SCORE_UPDATE_EVENT);
      channel.addEventListener("message", (event) => {
        if (isScoreUpdateMessage(event.data)) show(event.data.kind ?? "score", event.data.custom, event.data.duration);
      });
    } catch {
      // localStorage fallback remains active below.
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SCORE_UPDATE_EVENT || !event.newValue) return;
      try {
        const message = JSON.parse(event.newValue);
        if (isScoreUpdateMessage(message)) show(message.kind ?? "score", message.custom, message.duration);
      } catch {
        // Ignore malformed cross-tab messages.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      channel?.close();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => { if (games.length) setIndex((current) => current % games.length); else setIndex(0); }, [games.length]);

  // Operator tab drives this board: sport, date, pause, filters, and manual stepping.
  useEffect(() => subscribeToState((state) => {
    if (state.sport) setSportId(findSport(state.sport).id as SportId);
    if (state.dates !== undefined) setDates(state.dates);
    if (state.paused !== undefined) setPaused(state.paused);
    if (state.schools !== undefined) setSchools(state.schools);
    if (state.gameIds !== undefined) setGameIds(state.gameIds);
    if (state.stepTo !== undefined) { setIndex((current) => { const total = Math.max(games.length, 1); return ((state.stepTo ?? current) % total + total) % total; }); }
  }), [games.length]);

  if (!game) return <main className="broadcast"><div className="broadcast__grain" />{stinger && <ScoreUpdateStinger sportLabel={sportLabel} kind={stinger.kind} custom={stinger.custom} duration={stinger.duration} />}<header className="broadcast-header"><a className="brand-link" href="/operator" aria-label="LMR Media — operator controls"><Brand /></a></header><div className="empty-state"><span className="empty-state__eyebrow">BIG 9 CONFERENCE / {sportLabel.toUpperCase()}</span><h1>No games on the board</h1><p>No Big 9 {sportLabel.toLowerCase()} games are scheduled for this date.</p></div></main>;
  return <main className="broadcast">
    {stinger && <ScoreUpdateStinger sportLabel={sportLabel} kind={stinger.kind} custom={stinger.custom} duration={stinger.duration} />}
    <div className="broadcast__glow" /><div className="broadcast__grain" />
    <header className="broadcast-header"><a className="brand-link" href="/operator" aria-label="LMR Media — operator controls"><Brand /></a></header>
    <div className="broadcast__content"><GameCard game={game} active /></div>
  </main>;
}

const STINGER_COPY: Record<StingerKind, { line1: string; line2: string; sub: string }> = {
  score: { line1: "SCORE", line2: "UPDATE", sub: "LIVE" },
  kickoff: { line1: "GAME", line2: "START", sub: "KICKOFF" },
  halftime: { line1: "HALFTIME", line2: "REPORT", sub: "AT THE HALF" },
  final: { line1: "FINAL", line2: "SCORE", sub: "FINAL" },
  "scores-report": { line1: "SCORES", line2: "REPORT", sub: "AROUND THE BIG 9" },
  "halftime-report": { line1: "HALFTIME", line2: "REPORT", sub: "AROUND THE BIG 9" },
  custom: { line1: "", line2: "", sub: "LMR MEDIA" },
};

/** Report stingers hold on screen longer than quick stingers. */
const STINGER_MS: Partial<Record<StingerKind, number>> = { "scores-report": 5000, "halftime-report": 5000 };

function formatShortDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ScoreUpdateStinger({ sportLabel, kind, custom, duration }: { sportLabel: string; kind: StingerKind; custom?: string; duration: number }) {
  const copy = STINGER_COPY[kind] ?? STINGER_COPY.score;
  const headline = kind === "custom" && custom ? custom.split("\n").slice(0, 2) : [copy.line1, copy.line2];
  const reportClass = STINGER_MS[kind] ? " score-update-stinger--report" : "";
  return <div className={`score-update-stinger${reportClass}`} role="status" aria-live="assertive" style={{ animationDuration: `${duration}ms` }}>
    <div className="score-update-stinger__wash" style={{ animationDuration: `${duration}ms` }} />
    <div className="score-update-stinger__content" style={{ animationDuration: `${duration}ms` }}>
      <div className="score-update-stinger__compass"><span /><i /><b /></div>
      <Brand />
      <span className="score-update-stinger__rule" style={{ animationDuration: `${duration}ms` }} />
      <strong>{headline[0] ?? ""}<br /><em>{headline[1] ?? ""}</em></strong>
      <span className="score-update-stinger__sub">BIG 9 {sportLabel.toUpperCase()} · {copy.sub}</span>
    </div>
  </div>;
}

/** Live miniature of the on-air page: a scaled, non-interactive iframe rendering exactly what airs. */
function PreviewMonitor() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => setScale(stage.clientWidth / 1920);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  return <div className="preview-stage" ref={stageRef}>
    {scale > 0 ? <iframe className="preview-frame" src="/" title="On-air output preview" tabIndex={-1} aria-hidden="true" style={{ width: "1920px", height: "1080px", transform: `scale(${scale})` }} /> : <p className="preview-msg">Tuning monitor…</p>}
  </div>;
}

export function OperatorPanel() {
  const [sport, setSport] = useState<SportId>(DEFAULT_SPORT);
  const [dates, setDates] = useState<string[]>([]); const { payload, loading, refresh } = useScores(dates, sport); const [index, setIndex] = useState(0); const [paused, setPaused] = useState(false); const [interval, setIntervalValue] = useState(10); const [seconds, setSeconds] = useState(10);  const [updateSent, setUpdateSent] = useState<string | null>(null); const [customHeadline, setCustomHeadline] = useState(""); const [schools, setSchools] = useState<string[]>([]); const [gameIds, setGameIds] = useState<string[]>([]); const [schoolsOpen, setSchoolsOpen] = useState(false); const [gamesOpen, setGamesOpen] = useState(false); const [datesOpen, setDatesOpen] = useState(false);  const [armed, setArmed] = useState<StingerKind>("score"); const [stingerSeconds, setStingerSeconds] = useState(3);
  const games = visibleGames(payload.games, schools, gameIds);
  useEffect(() => { if (paused || games.length < 2) return; const timer = window.setInterval(() => setSeconds((current) => { if (current <= 1) { setIndex((i) => { const next = (i + 1) % games.length; publishState({ sport, dates, paused, schools, gameIds, stepTo: next }); return next; }); return interval; } return current - 1; }), 1000); return () => window.clearInterval(timer); }, [paused, games.length, interval, sport, dates, schools, gameIds]);
  useEffect(() => { setSeconds(interval); }, [index, interval]);
  const move = (direction: number) => { if (!games.length) return; setIndex((current) => (current + direction + games.length) % games.length); publishState({ sport, dates, paused, schools, gameIds, stepTo: (index + direction + games.length) % games.length }); };
  const STINGER_LABELS: Record<StingerKind, string> = { score: "Score update", kickoff: "Game start", halftime: "Halftime report", final: "Final score", "scores-report": "Scores report", "halftime-report": "Halftime report", custom: "Custom headline" };
  const sendStinger = (kind: StingerKind, label?: string) => { announceStinger(kind, kind === "custom" ? customHeadline : undefined, stingerSeconds * 1000); setUpdateSent(label ?? STINGER_LABELS[kind]); window.setTimeout(() => setUpdateSent(null), 1800); };

  // F9 fires the armed announcement from anywhere on the operator page.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "F9") return;
      event.preventDefault();
      sendStinger(armed);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed, customHeadline]);

  const changeSport = (id: SportId) => { setSport(id); setIndex(0); publishState({ sport: id, dates, paused, schools, gameIds, stepTo: 0 }); };
  const toggleDate = (value: string) => {
    const next = dates.includes(value) ? dates.filter((entry) => entry !== value) : [...dates, value].sort();
    setDates(next); setGameIds([]); setIndex(0); publishState({ sport, dates: next, paused, schools, gameIds: [], stepTo: 0 });
  };
  const clearDates = () => { setDates([]); setGameIds([]); setIndex(0); publishState({ sport, dates: [], paused, schools, gameIds: [], stepTo: 0 }); };
  const togglePause = () => { const next = !paused; setPaused(next); publishState({ sport, dates, paused: next, schools, gameIds, stepTo: index }); };
  const toggleSchool = (school: string) => {
    const next = schools.includes(school) ? schools.filter((entry) => entry !== school) : [...schools, school];
    setSchools(next); setGameIds([]); setIndex(0); publishState({ sport, dates, paused, schools: next, gameIds: [], stepTo: 0 });
  };
  const clearSchools = () => { setSchools([]); setGameIds([]); setIndex(0); publishState({ sport, dates, paused, schools: [], gameIds: [], stepTo: 0 }); };
  const toggleGameId = (id: string) => {
    const next = gameIds.includes(id) ? gameIds.filter((entry) => entry !== id) : [...gameIds, id];
    setGameIds(next); setIndex(0); publishState({ sport, dates, paused, schools, gameIds: next, stepTo: 0 });
  };
  const clearGameIds = () => { setGameIds([]); setIndex(0); publishState({ sport, dates, paused, schools, gameIds: [], stepTo: 0 }); };
  const resetBoard = () => {
    setSport(DEFAULT_SPORT); setDates([]); setSchools([]); setGameIds([]); setIndex(0); setPaused(false); setCustomHeadline(""); setArmed("score");
    publishState({ sport: DEFAULT_SPORT, dates: [], paused: false, schools: [], gameIds: [], stepTo: 0 });
  };

  const schoolFiltered = visibleGames(payload.games, schools, []);
  const grouped = ("Fall Winter Spring" as const).split(" ").map((season) => ({ season, sports: SPORTS.filter((entry) => entry.season === season) }));
  return <main className="operator"><header className="operator-header"><Brand compact /><div><span className="operator-kicker">PRODUCTION CONTROL</span><h1>Big 9 Sports Board</h1></div><a className="button button--ghost" href="/">Open broadcast ↗</a></header><div className="operator-grid"><section className="operator-preview"><div className="operator-preview__label">PROGRAM MONITOR</div><div className="operator-preview__screen"><PreviewMonitor /></div></section><aside className="control-card"><div className="control-card__header"><div><span className="operator-kicker">CONTROL PANEL</span></div></div><label className="field">Sport<select value={sport} onChange={(event) => changeSport(event.target.value as SportId)}>{grouped.map(({ season, sports }) => sports.length ? <optgroup key={season} label={`${season} season`}>{sports.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</optgroup> : null)}</select></label><div className="field"><span className="field__head">Schools</span><div className="dd"><button type="button" className="dd__toggle" aria-expanded={schoolsOpen} onClick={() => setSchoolsOpen((open) => !open)}>{schools.length ? schools.join(", ") : "All schools"}<i>{schoolsOpen ? "▴" : "▾"}</i></button>{schoolsOpen && <div className="dd__menu">{BIG9_SCHOOLS.map((school) => { const on = schools.includes(school); return <label key={school} className="dd__opt"><input type="checkbox" checked={on} onChange={() => toggleSchool(school)} />{school}</label>; })}</div>}</div></div><div className="control-card__primary"><button className="button button--wide" onClick={togglePause}>{paused ? "▶ Resume rotation" : "Ⅱ Pause rotation"}</button><div className="transport"><button className="button button--icon" onClick={() => move(-1)} aria-label="Previous game">←</button><div><strong>{String(index + 1).padStart(2, "0")}</strong><span> / {String(games.length).padStart(2, "0")} GAMES</span></div><button className="button button--icon" onClick={() => move(1)} aria-label="Next game">→</button></div></div><div className="field"><span className="field__head">Dates {dates.length ? <button type="button" className="chip-clear" onClick={clearDates}>clear · {dates.length}</button> : null}</span><div className="dd"><button type="button" className="dd__toggle" aria-expanded={datesOpen} onClick={() => setDatesOpen((open) => !open)}>{dates.length ? dates.map((date) => formatShortDate(date)).join(", ") : "Today"}<i>{datesOpen ? "▴" : "▾"}</i></button>{datesOpen && <div className="dd__menu"><input type="date" className="dd__datepick" value={dates[dates.length - 1] ?? ""} onChange={(event) => event.target.value && toggleDate(event.target.value)} /><p className="dd__hint">Pick a date to add it. Tap a chosen date below to remove it.</p><div className="dd__chips">{dates.length ? dates.map((date) => <button key={date} type="button" className="chip chip--on" onClick={() => toggleDate(date)}>{formatShortDate(date)} ✕</button>) : <p className="game-list__empty">No extra dates — showing today.</p>}</div></div>}</div></div><div className="field"><span className="field__head">Games {gameIds.length ? <button type="button" className="chip-clear" onClick={clearGameIds}>clear · {gameIds.length}</button> : <em>all showing</em>}</span><div className="dd"><button type="button" className="dd__toggle" aria-expanded={gamesOpen} onClick={() => setGamesOpen((open) => !open)}>{gameIds.length ? `${gameIds.length} game${gameIds.length > 1 ? "s" : ""} selected` : "All games"}<i>{gamesOpen ? "▴" : "▾"}</i></button>{gamesOpen && <div className="dd__menu">{schoolFiltered.length ? schoolFiltered.map((entry) => { const on = gameIds.includes(entry.id); return <label key={entry.id} className="dd__opt"><input type="checkbox" checked={on} onChange={() => toggleGameId(entry.id)} /><span>{entry.away.shortName} @ {entry.home.shortName}</span><b>{entry.status === "UPCOMING" ? entry.detail : `${entry.away.score ?? 0}–${entry.home.score ?? 0}`}</b></label>; }) : <p className="game-list__empty">No games match the selected schools for this date.</p>}</div>}</div></div><label className="field">Rotation interval <span>{interval}s</span><input type="range" min="5" max="60" step="5" value={interval} onChange={(event) => setIntervalValue(Number(event.target.value))} /></label><div className="stinger-block"><div className="stinger-block__title"><span className="operator-kicker">ON-AIR ANNOUNCE</span>{updateSent && <b>✓ {updateSent} sent to air</b>}</div><label className="field">Animation length <span>{stingerSeconds}s</span><input type="range" min="2" max="15" step="1" value={stingerSeconds} onChange={(event) => setStingerSeconds(Number(event.target.value))} /></label><div className="stinger-grid">{(["score", "kickoff", "halftime", "final", "scores-report", "halftime-report"] as StingerKind[]).map((kind) => { const labels: Record<string, string> = { score: "✦ Score update", kickoff: "▶ Game start", halftime: "⏸ Halftime", final: "■ Final score", "scores-report": "☰ Scores report · 5s", "halftime-report": "☰ Halftime report · 5s" }; return <button key={kind} type="button" className={`stinger-btn stinger-choice ${armed === kind ? "stinger-choice--armed" : ""}`} onClick={() => setArmed(kind)}>{labels[kind]}</button>; })}</div><input className="stinger-custom-input" type="text" placeholder="Custom headline (2 lines — press Enter to arm)" maxLength={80} value={customHeadline} onChange={(event) => setCustomHeadline(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && customHeadline.trim()) { setArmed("custom"); event.preventDefault(); } }} /><button className={`button button--wide stinger-send ${armed === "custom" && !customHeadline.trim() ? "stinger-send--off" : ""}`} onClick={() => armed !== "custom" && sendStinger(armed)} disabled={armed === "custom" && !customHeadline.trim()}>◉ SEND TO AIR <span>{armed === "custom" ? "CUSTOM" : ("⌨ F9")}</span></button></div><button className="button button--outline button--wide" onClick={() => void refresh()}>↻ Refresh scores now</button><button className="button button--wide reset-button" onClick={resetBoard}>⟲ Reset board to defaults</button><div className="feed-info"><div><span>DATA SOURCE</span><b>Minnesota-Scores.net</b></div><div><span>SPORT</span><b>{findSport(sport).label}</b></div><div><span>LAST UPDATED</span><b>{payload.fetchedAt ? new Date(payload.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}</b></div><div><span>COUNTDOWN</span><b>{paused ? "PAUSED" : `00:${String(seconds).padStart(2, "0")}`}</b></div></div></aside></div><div className="operator-note"><span className="feed-dot feed-dot--live" /> Controls drive the on-air board in the other tab. Live data refreshes every 60 seconds; if the source is unavailable, the board preserves the last valid response. <b className="version-tag">build v8</b></div></main>;
}

export function BroadcastControls() { return <div className="broadcast-controls"><a href="/operator">Operator controls ↗</a></div>; }
