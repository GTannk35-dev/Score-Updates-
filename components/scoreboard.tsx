"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Brand } from "./brand";
import { GameCard } from "./game-card";
import { announceScoreUpdate, announceStinger, isScoreUpdateMessage, SCORE_UPDATE_EVENT, type StingerKind } from "@/lib/score-update";
import { publishState, readLastState, subscribeToState } from "@/lib/broadcast-state";
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

/** Must match the .game-switch--* animation duration in globals.css. */
const SWITCH_MS = 700;

/** Fixed entrance+exit envelope of a stinger — the speed never changes; the operator's setting only extends the hold. */
const STINGER_ENVELOPE_MS = 640;

type GameTransition = {
  from: Game | null;
  to: Game;
  direction: 1 | -1;
  key: number;
};

/**
 * Smooth game-to-game transitions: when the on-air game changes, the old card
 * slides/fades out while the new one slides in from the direction of travel,
 * so the board never blanks mid-swap. Identity is compared by game id so the
 * 60-second data refresh never triggers a fake transition.
 */
function useGameTransition(game: Game | undefined, games: Game[]) {
  const [transition, setTransition] = useState<GameTransition | null>(null);
  const currentRef = useRef<Game | undefined>(game);
  const timerRef = useRef<number | undefined>(undefined);
  const keyRef = useRef(0);

  useEffect(() => {
    const previous = currentRef.current;
    if (!game || game.id === previous?.id) { currentRef.current = game; return; }

    // Direction of travel through the visible list (wrap-aware), so stepping
    // forward slides one way and stepping back slides the other.
    let direction: 1 | -1 = 1;
    if (previous && games.length > 1) {
      const fromPos = games.findIndex((entry) => entry.id === previous.id);
      const toPos = games.findIndex((entry) => entry.id === game.id);
      if (fromPos >= 0 && toPos >= 0) {
        const delta = (toPos - fromPos + games.length) % games.length;
        direction = delta === games.length - 1 ? -1 : 1;
      }
    }

    currentRef.current = game;
    keyRef.current += 1;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setTransition({ from: previous ?? null, to: game, direction, key: keyRef.current });
    // Keep the transition (with from: null) instead of clearing it: dropping
    // the --in classes would re-trigger the entrance animation a second time.
    timerRef.current = window.setTimeout(() => setTransition((current) => (current ? { ...current, from: null } : null)), SWITCH_MS + 60);
  }, [game, games]);

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  return transition;
}

/** Fixed on-air canvas: the board is always laid out at this size and scaled to fit the viewport, so every device shows an identical frame. */
const STAGE_W = 1920;
const STAGE_H = 1080;

/** Scales a fixed 1920×1080 stage to fill the window (letterboxed if needed). */
function useStageScale() {
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

/** The on-air frame: everything is laid out at exactly 1920×1080 and scaled, so phones, tablets, and OBS all render the same picture. */
function BroadcastStage({ children }: { children: React.ReactNode }) {
  const scale = useStageScale();
  return <div className="stage">
    {scale > 0 ? <div className="stage__frame" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}>
      {children}
    </div> : null}
  </div>;
}

export function BroadcastBoard() {
  const [dates, setDates] = useState<string[]>([]);
  const [sportId, setSportId] = useState<SportId>(DEFAULT_SPORT);
  const { payload } = useScores(dates, sportId);
  const [stinger, setStinger] = useState<{ kind: StingerKind; custom?: string; hold: number; key: number } | null>(null);
  const [schools, setSchools] = useState<string[]>([]);
  const [gameIds, setGameIds] = useState<string[]>([]);
  const games = visibleGames(payload.games, schools, gameIds);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const game = games[index % Math.max(games.length, 1)];
  const sportLabel = findSport(payload.sport).label;
  const transition = useGameTransition(game, games);

  // Ref mirror of the visible list so the operator channel stays open across
  // data refreshes while still stepping against the latest games.
  const gamesRef = useRef(games);
  useEffect(() => { gamesRef.current = games; }, [games]);

  const stingerKeyRef = useRef(0);
  useEffect(() => {
    // Stingers play at broadcast speed and HOLD for the set length — a 10s
    // halftime report keeps the same 640ms entrance as a 2s flash.
    const show = (kind: StingerKind, custom?: string, duration?: number) => {
      const total = duration ?? STINGER_MS[kind] ?? 3200;
      const hold = Math.max(900, total - STINGER_ENVELOPE_MS);
      stingerKeyRef.current += 1;
      setStinger({ kind, custom, hold, key: stingerKeyRef.current });
      window.setTimeout(() => setStinger(null), hold + STINGER_ENVELOPE_MS);
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

  // Operator tab drives this board: sport, date, pause, filters, and manual
  // stepping. Subscribed once for the lifetime of the page — re-subscribing on
  // every data refresh used to drop messages sent during the gap. The freshest
  // snapshot is also replayed on load so a board opened after setup (or one
  // that reloads mid-show, as OBS sources do) matches the control panel.
  useEffect(() => subscribeToState((state) => {
    if (state.sport) setSportId(findSport(state.sport).id as SportId);
    if (state.dates !== undefined) setDates(state.dates);
    if (state.paused !== undefined) setPaused(state.paused);
    if (state.schools !== undefined) setSchools(state.schools);
    if (state.gameIds !== undefined) setGameIds(state.gameIds);
    if (state.stepTo !== undefined) { setIndex((current) => { const total = Math.max(gamesRef.current.length, 1); return ((state.stepTo ?? current) % total + total) % total; }); }
  }), []);

  // The demo payload only exists as the initial React state placeholder.
  // Never air it: hold on a branded standby frame until the real feed (or a
  // stale-but-real last-good response) arrives, otherwise every board load
  // flashes sample football games that read as "the board reset".
  const awaitingFeed = payload.source === "demo" && !payload.stale;
  if (awaitingFeed) return <BroadcastStage><main className="broadcast"><div className="broadcast__glow" /><div className="broadcast__grain" />{stinger && <ScoreUpdateStinger key={stinger.key} sportLabel={sportLabel} kind={stinger.kind} custom={stinger.custom} hold={stinger.hold} />}<header className="broadcast-header"><a className="brand-link" href="/operator" aria-label="LMR Media — operator controls"><Brand /></a></header><div className="empty-state"><span className="empty-state__eyebrow">LMR MEDIA / BIG 9 CONFERENCE</span><h1>Standing by</h1><p>Waiting for the operator console…</p></div></main></BroadcastStage>;
  if (!game) return <BroadcastStage><main className="broadcast"><div className="broadcast__glow" /><div className="broadcast__grain" />{stinger && <ScoreUpdateStinger key={stinger.key} sportLabel={sportLabel} kind={stinger.kind} custom={stinger.custom} hold={stinger.hold} />}<header className="broadcast-header"><a className="brand-link" href="/operator" aria-label="LMR Media — operator controls"><Brand /></a></header><div className="empty-state"><span className="empty-state__eyebrow">BIG 9 CONFERENCE / {sportLabel.toUpperCase()}</span><h1>No games on the board</h1><p>No Big 9 {sportLabel.toLowerCase()} games are scheduled for this date.</p></div></main></BroadcastStage>;
  return <BroadcastStage><main className="broadcast">
    {stinger && <ScoreUpdateStinger key={stinger.key} sportLabel={sportLabel} kind={stinger.kind} custom={stinger.custom} hold={stinger.hold} />}
    <div className="broadcast__glow" /><div className="broadcast__grain" />
    <header className="broadcast-header"><a className="brand-link" href="/operator" aria-label="LMR Media — operator controls"><Brand /></a></header>
    <div className="broadcast__content">
      {transition?.from ? (
        <div key={`out-${transition.key}`} className={`game-switch game-switch--out game-switch--${transition.direction === 1 ? "fwd" : "back"}`} aria-hidden="true"><GameCard game={transition.from} /></div>
      ) : null}
      <div key={game.id} className={`game-switch${transition ? ` game-switch--in game-switch--${transition.direction === 1 ? "fwd" : "back"}` : ""}`}><GameCard game={game} /></div>
    </div>
  </main></BroadcastStage>;
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

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function toISODate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Today's date in the conference's Central time, matching the score API. */
function todayInCentral() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Month-grid calendar with multi-select, used by the operator date dropdown. */
function Calendar({ selected, today, onToggle, onClear }: { selected: string[]; today: string; onToggle: (date: string) => void; onClear: () => void }) {
  const [view, setView] = useState(() => {
    const anchor = selected[selected.length - 1] ?? today;
    const [year, month] = anchor.split("-").map(Number);
    return { year: year || new Date().getFullYear(), month: (month || 1) - 1 };
  });
  const startOffset = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const selectedSet = new Set(selected);
  const cells: (string | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, day) => `${view.year}-${String(view.month + 1).padStart(2, "0")}-${String(day + 1).padStart(2, "0")}`),
  ];
  const shiftMonth = (delta: number) => setView((current) => { const next = new Date(current.year, current.month + delta, 1); return { year: next.getFullYear(), month: next.getMonth() }; });
  return <div className="cal">
    <div className="cal__head">
      <button type="button" className="cal__nav" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
      <strong>{MONTH_LABELS[view.month]} {view.year}</strong>
      <button type="button" className="cal__nav" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
    </div>
    <div className="cal__grid cal__grid--labels" aria-hidden="true">{WEEKDAY_LABELS.map((label, index) => <span key={index}>{label}</span>)}</div>
    <div className="cal__grid">
      {cells.map((iso, index) => iso ? (
        <button key={iso} type="button" className={`cal__day${selectedSet.has(iso) ? " cal__day--on" : ""}${iso === today ? " cal__day--today" : ""}`} aria-pressed={selectedSet.has(iso)} onClick={() => onToggle(iso)}>{Number(iso.slice(8))}</button>
      ) : <span key={`pad-${index}`} className="cal__pad" />)}
    </div>
    <div className="cal__foot">
      <button type="button" className="chip chip--on" onClick={onClear}>Show today</button>
      <span className="cal__hint">{selected.length ? `${selected.length} date${selected.length > 1 ? "s" : ""} selected` : "No extra dates"}</span>
    </div>
  </div>;
}

function ScoreUpdateStinger({ sportLabel, kind, custom, hold }: { sportLabel: string; kind: StingerKind; custom?: string; hold: number }) {
  const copy = STINGER_COPY[kind] ?? STINGER_COPY.score;
  const headline = kind === "custom" && custom ? custom.split("\n").slice(0, 2) : [copy.line1, copy.line2];
  const reportClass = STINGER_MS[kind] ? " score-update-stinger--report" : "";
  // Hold time is passed as a CSS variable; entrance/exit speeds stay fixed in
  // globals.css so longer announcements never play in slow motion.
  return <div className={`score-update-stinger${reportClass}`} role="status" aria-live="assertive" style={{ "--stinger-hold": `${hold}ms` } as CSSProperties}>
    <div className="score-update-stinger__wash" />
    <div className="score-update-stinger__content">
      <div className="score-update-stinger__compass"><span /><i /><b /></div>
      <Brand />
      <span className="score-update-stinger__rule" />
      <strong>{headline[0] ?? ""}<br /><em>{headline[1] ?? ""}</em></strong>
      <span className="score-update-stinger__sub">BIG 9 {sportLabel.toUpperCase()} · {copy.sub}</span>
    </div>
  </div>;
}

/** Live miniature of the on-air page: a scaled, non-interactive iframe rendering exactly what airs. */
function PreviewMonitor({ showUpNext = false }: { showUpNext?: boolean }) {
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

/** Miniature of the next game in rotation, rendered at full air resolution and scaled down. */
function UpNextCard({ game }: { game: Game }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const fit = () => setScale(frame.parentElement ? frame.parentElement.clientWidth / STAGE_W : 0);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame.parentElement ?? frame);
    return () => observer.disconnect();
  }, []);
  return <div className="upnext__frame" ref={frameRef} style={scale > 0 ? { width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` } : undefined}>
    {scale > 0 ? <main className="broadcast"><div className="broadcast__glow" /><div className="broadcast__grain" /><div className="broadcast__content"><GameCard game={game} /></div></main> : null}
  </div>;
}

export function OperatorPanel() {
  const [sport, setSport] = useState<SportId>(DEFAULT_SPORT);
  const [dates, setDates] = useState<string[]>([]); const { payload, loading, refresh } = useScores(dates, sport); const [index, setIndex] = useState(0); const [paused, setPaused] = useState(false); const [interval, setIntervalValue] = useState(10); const [seconds, setSeconds] = useState(10);  const [updateSent, setUpdateSent] = useState<string | null>(null); const [customHeadline, setCustomHeadline] = useState(""); const [schools, setSchools] = useState<string[]>([]); const [gameIds, setGameIds] = useState<string[]>([]); const [schoolsOpen, setSchoolsOpen] = useState(false); const [gamesOpen, setGamesOpen] = useState(false); const [datesOpen, setDatesOpen] = useState(false);  const [armed, setArmed] = useState<StingerKind>("score"); const [stingerSeconds, setStingerSeconds] = useState(3);
  const games = visibleGames(payload.games, schools, gameIds);

  // Adopt the last published control state so a reloaded panel shows exactly
  // what the board is airing (instead of silently resetting and re-publishing
  // defaults over the live board).
  useEffect(() => {
    const snapshot = readLastState();
    if (!snapshot) return;
    if (snapshot.sport) setSport(findSport(snapshot.sport).id as SportId);
    if (snapshot.dates !== undefined) setDates(snapshot.dates);
    if (snapshot.paused !== undefined) setPaused(snapshot.paused);
    if (snapshot.schools !== undefined) setSchools(snapshot.schools);
    if (snapshot.gameIds !== undefined) setGameIds(snapshot.gameIds);
    if (snapshot.stepTo !== undefined) setIndex(snapshot.stepTo);
  }, []);
  // Keep the adopted/restored index inside the current feed.
  useEffect(() => { if (games.length && index >= games.length) setIndex(0); }, [games.length, index]);

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
  const todayISO = todayInCentral();
  const grouped = ("Fall Winter Spring" as const).split(" ").map((season) => ({ season, sports: SPORTS.filter((entry) => entry.season === season) }));
  const upNext = games.length ? games[(index + 1) % games.length] : undefined;
  return <main className="operator"><header className="operator-header"><Brand compact /><div><span className="operator-kicker">PRODUCTION CONTROL</span><h1>Big 9 Sports Board</h1></div><a className="button button--ghost" href="/">Open broadcast ↗</a></header><div className="operator-grid"><section className="operator-preview"><div className="operator-preview__label">PROGRAM MONITOR</div><div className="operator-preview__screen"><PreviewMonitor /></div><div className="upnext"><div className="upnext__label"><i />UP NEXT {upNext ? "· " + upNext.away.shortName.toUpperCase() + " @ " + upNext.home.shortName.toUpperCase() : ""}</div><div className="upnext__screen">{upNext ? <UpNextCard key={upNext.id} game={upNext} /> : <p className="upnext__empty">NO FURTHER GAMES IN THE ROTATION</p>}</div></div></section><aside className="control-card"><div className="control-card__header"><div><span className="operator-kicker">CONTROL PANEL</span></div></div><label className="field">Sport<select value={sport} onChange={(event) => changeSport(event.target.value as SportId)}>{grouped.map(({ season, sports }) => sports.length ? <optgroup key={season} label={`${season} season`}>{sports.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</optgroup> : null)}</select></label><div className="field"><span className="field__head">Schools</span><div className="dd"><button type="button" className="dd__toggle" aria-expanded={schoolsOpen} onClick={() => setSchoolsOpen((open) => !open)}>{schools.length ? schools.join(", ") : "All schools"}<i>{schoolsOpen ? "▴" : "▾"}</i></button>{schoolsOpen && <div className="dd__menu">{BIG9_SCHOOLS.map((school) => { const on = schools.includes(school); return <label key={school} className="dd__opt"><input type="checkbox" checked={on} onChange={() => toggleSchool(school)} />{school}</label>; })}</div>}</div></div><div className="control-card__primary"><button className="button button--wide" onClick={togglePause}>{paused ? "▶ Resume rotation" : "Ⅱ Pause rotation"}</button><label className="field interval-field">Rotation interval <span>{interval}s</span><input type="range" min="5" max="60" step="5" value={interval} onChange={(event) => setIntervalValue(Number(event.target.value))} aria-label="Rotation interval in seconds" /></label><div className="transport"><button className="button button--icon" onClick={() => move(-1)} aria-label="Previous game">←</button><div><strong>{String(index + 1).padStart(2, "0")}</strong><span> / {String(games.length).padStart(2, "0")} GAMES</span></div><button className="button button--icon" onClick={() => move(1)} aria-label="Next game">→</button></div></div><div className="field"><span className="field__head">Dates {dates.length ? <button type="button" className="chip-clear" onClick={clearDates}>clear · {dates.length}</button> : null}</span><div className="dd"><button type="button" className="dd__toggle" aria-expanded={datesOpen} onClick={() => setDatesOpen((open) => !open)}>{dates.length ? dates.map((date) => formatShortDate(date)).join(", ") : "Today"}<i>{datesOpen ? "▴" : "▾"}</i></button>{datesOpen && <div className="dd__menu"><Calendar selected={dates} today={todayISO} onToggle={toggleDate} onClear={clearDates} /></div>}</div></div><div className="field"><span className="field__head">Games {gameIds.length ? <button type="button" className="chip-clear" onClick={clearGameIds}>clear · {gameIds.length}</button> : <em>all showing</em>}</span><div className="dd"><button type="button" className="dd__toggle" aria-expanded={gamesOpen} onClick={() => setGamesOpen((open) => !open)}>{gameIds.length ? `${gameIds.length} game${gameIds.length > 1 ? "s" : ""} selected` : "All games"}<i>{gamesOpen ? "▴" : "▾"}</i></button>{gamesOpen && <div className="dd__menu">{schoolFiltered.length ? schoolFiltered.map((entry) => { const on = gameIds.includes(entry.id); return <label key={entry.id} className="dd__opt"><input type="checkbox" checked={on} onChange={() => toggleGameId(entry.id)} /><span>{entry.away.shortName} @ {entry.home.shortName}</span><b>{entry.status === "UPCOMING" ? entry.detail : `${entry.away.score ?? 0}–${entry.home.score ?? 0}`}</b></label>; }) : <p className="game-list__empty">No games match the selected schools for this date.</p>}</div>}</div></div><div className="stinger-block"><div className="stinger-block__title"><span className="operator-kicker">ON-AIR ANNOUNCE</span>{updateSent && <b>✓ {updateSent} sent to air</b>}</div><label className="field">Hold on air <span>{stingerSeconds}s</span><input type="range" min="2" max="15" step="1" value={stingerSeconds} onChange={(event) => setStingerSeconds(Number(event.target.value))} /></label><div className="stinger-grid">{(["score", "kickoff", "halftime", "final", "scores-report", "halftime-report"] as StingerKind[]).map((kind) => { const labels: Record<string, string> = { score: "✦ Score update", kickoff: "▶ Game start", halftime: "⏸ Halftime", final: "■ Final score", "scores-report": "☰ Scores report · 5s", "halftime-report": "☰ Halftime report · 5s" }; return <button key={kind} type="button" className={`stinger-btn stinger-choice ${armed === kind ? "stinger-choice--armed" : ""}`} onClick={() => setArmed(kind)}>{labels[kind]}</button>; })}</div><input className="stinger-custom-input" type="text" placeholder="Custom headline (2 lines — press Enter to arm)" maxLength={80} value={customHeadline} onChange={(event) => setCustomHeadline(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && customHeadline.trim()) { setArmed("custom"); event.preventDefault(); } }} /><button className={`button button--wide stinger-send ${armed === "custom" && !customHeadline.trim() ? "stinger-send--off" : ""}`} onClick={() => armed !== "custom" && sendStinger(armed)} disabled={armed === "custom" && !customHeadline.trim()}>◉ SEND TO AIR <span>{armed === "custom" ? "CUSTOM" : ("⌨ F9")}</span></button></div><button className="button button--outline button--wide" onClick={() => void refresh()}>↻ Refresh scores now</button><button className="button button--wide reset-button" onClick={resetBoard}>⟲ Reset board to defaults</button><div className="feed-info"><div><span>DATA SOURCE</span><b>Minnesota-Scores.net</b></div><div><span>SPORT</span><b>{findSport(sport).label}</b></div><div><span>LAST UPDATED</span><b>{payload.fetchedAt ? new Date(payload.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}</b></div><div><span>COUNTDOWN</span><b>{paused ? "PAUSED" : `00:${String(seconds).padStart(2, "0")}`}</b></div></div></aside></div><div className="operator-note"><span className="feed-dot feed-dot--live" /> Controls drive the on-air board in the other tab — and on any other device. Live data refreshes every 60 seconds; if the source is unavailable, the board preserves the last valid response. <b className="version-tag">build v11</b></div></main>;
}

export function BroadcastControls() { return <div className="broadcast-controls"><a href="/operator">Operator controls ↗</a></div>; }
