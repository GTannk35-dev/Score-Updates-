"use client";

import { useCallback, useEffect, useState } from "react";
import { Brand, LiveDot } from "./brand";
import { GameCard } from "./game-card";
import { announceScoreUpdate, isScoreUpdateMessage, SCORE_UPDATE_EVENT } from "@/lib/score-update";
import type { Game, ScoresPayload } from "@/lib/types";

const demoPayload: ScoresPayload = {
  games: [
    { id: "sample-1", away: { name: "Mankato West", shortName: "Mankato West", score: 21, record: "3–1" }, home: { name: "Owatonna", shortName: "Owatonna", score: 28, record: "4–0" }, status: "LIVE", detail: "Q4  •  02:18", venue: "Owatonna, MN", date: "Friday, September 12" },
    { id: "sample-2", away: { name: "Austin", shortName: "Austin", score: 14, record: "2–2" }, home: { name: "Rochester Mayo", shortName: "Rochester Mayo", score: 35, record: "4–0" }, status: "FINAL", detail: "FINAL", venue: "Rochester, MN", date: "Friday, September 12" },
    { id: "sample-3", away: { name: "Northfield", shortName: "Northfield", record: "1–2" }, home: { name: "Faribault", shortName: "Faribault", record: "2–1" }, status: "UPCOMING", detail: "FRI 7:00 PM", venue: "Faribault, MN", date: "Friday, September 19" },
    { id: "sample-4", away: { name: "Red Wing", shortName: "Red Wing", score: 7, record: "1–3" }, home: { name: "Winona", shortName: "Winona", score: 10, record: "3–1" }, status: "HALFTIME", detail: "HALFTIME", venue: "Winona, MN", date: "Friday, September 12" },
  ], fetchedAt: new Date().toISOString(), source: "demo", sourceUrl: "https://www.minnesota-scores.net/boys-sports/football/scoreboard",
};

function useScores(date: string) {
  const [payload, setPayload] = useState<ScoresPayload>(demoPayload);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/scores?date=${encodeURIComponent(date)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to refresh scores");
      const next = (await response.json()) as ScoresPayload;
      setPayload(next);
    } catch { setPayload((current) => ({ ...current, stale: true, error: "Using the last available score feed" })); }
    finally { setLoading(false); }
  }, [date]);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 60_000); return () => window.clearInterval(timer); }, [refresh]);
  return { payload, loading, refresh };
}

export function BroadcastBoard() {
  const [date, setDate] = useState("");
  const { payload, loading } = useScores(date);
  const games = payload.games;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(10);
  const [rotationKey, setRotationKey] = useState(0);
  const [showScoreUpdate, setShowScoreUpdate] = useState(false);
  const game = games[index % Math.max(games.length, 1)];

  useEffect(() => {
    const show = () => {
      setShowScoreUpdate(true);
      window.setTimeout(() => setShowScoreUpdate(false), 3200);
    };
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(SCORE_UPDATE_EVENT);
      channel.addEventListener("message", (event) => {
        if (isScoreUpdateMessage(event.data)) show();
      });
    } catch {
      // localStorage fallback remains active below.
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SCORE_UPDATE_EVENT || !event.newValue) return;
      try {
        if (isScoreUpdateMessage(JSON.parse(event.newValue))) show();
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

  useEffect(() => { if (games.length) setIndex((current) => current % games.length); }, [games.length]);
  useEffect(() => {
    if (paused || games.length < 2) return;
    const timer = window.setInterval(() => { setSeconds((current) => { if (current <= 1) { setIndex((i) => (i + 1) % games.length); return 10; } return current - 1; }); }, 1000);
    return () => window.clearInterval(timer);
  }, [paused, games.length, rotationKey]);
  useEffect(() => { setSeconds(10); }, [index]);

  if (!game) return <main className="broadcast"><div className="broadcast__grain" /><header className="broadcast-header"><Brand /></header><div className="empty-state"><span className="empty-state__eyebrow">BIG 9 CONFERENCE / FOOTBALL</span><h1>No games on the board</h1><p>No Big 9 football games are scheduled for this date.</p></div></main>;
  return <main className="broadcast">
    {showScoreUpdate && <ScoreUpdateStinger />}
    <div className="broadcast__glow" /><div className="broadcast__grain" />
    <header className="broadcast-header"><Brand /><div className="broadcast-header__right"><span className="network-mark">BIG 9 <i>FOOTBALL</i></span><span className="on-air"><LiveDot /> ON AIR</span></div></header>
    <div className="broadcast__content"><div className="eyebrow-row"><span>MINNESOTA HIGH SCHOOL FOOTBALL</span><span>GAME {String(index + 1).padStart(2, "0")} / {String(games.length).padStart(2, "0")}</span></div><GameCard game={game} active /><div className="rotation"><span>ROTATING GAMES</span><div className="rotation__track"><span style={{ width: `${paused ? Math.max(0, (seconds / 10) * 100) : ((10 - seconds) / 10) * 100}%` }} /></div><b>{paused ? "PAUSED" : `NEXT IN 00:${String(seconds).padStart(2, "0")}`}</b></div></div>
  </main>;
}

function ScoreUpdateStinger() {
  return <div className="score-update-stinger" role="status" aria-live="assertive">
    <div className="score-update-stinger__wash" />
    <div className="score-update-stinger__content">
      <div className="score-update-stinger__compass"><span /><i /><b /></div>
      <Brand />
      <span className="score-update-stinger__rule" />
      <strong>SCORE<br /><em>UPDATE</em></strong>
      <span className="score-update-stinger__sub">BIG 9 FOOTBALL · LIVE</span>
    </div>
  </div>;
}


export function OperatorPanel() {
  const [date, setDate] = useState(""); const { payload, loading, refresh } = useScores(date); const [index, setIndex] = useState(0); const [paused, setPaused] = useState(false); const [interval, setIntervalValue] = useState(10); const [seconds, setSeconds] = useState(10); const [updateSent, setUpdateSent] = useState(false); const games = payload.games; const game = games[index % Math.max(games.length, 1)];
  useEffect(() => { if (paused || games.length < 2) return; const timer = window.setInterval(() => setSeconds((current) => { if (current <= 1) { setIndex((i) => (i + 1) % games.length); return interval; } return current - 1; }), 1000); return () => window.clearInterval(timer); }, [paused, games.length, interval]);
  useEffect(() => { setSeconds(interval); }, [index, interval]);
  const move = (direction: number) => { if (!games.length) return; setIndex((current) => (current + direction + games.length) % games.length); };
  const triggerScoreUpdate = () => { announceScoreUpdate(); setUpdateSent(true); window.setTimeout(() => setUpdateSent(false), 1800); };
  return <main className="operator"><header className="operator-header"><Brand compact /><div><span className="operator-kicker">PRODUCTION CONTROL</span><h1>Big 9 Football Board</h1></div><a className="button button--ghost" href="/">Open broadcast ↗</a></header><div className="operator-grid"><section className="operator-preview"><div className="operator-preview__label">PROGRAM PREVIEW <span><LiveDot /> {paused ? "PAUSED" : "AUTO"}</span></div><div className="operator-preview__screen">{game ? <GameCard game={game} active /> : <div className="empty-state empty-state--small"><h2>No games scheduled</h2><p>Change the date or check back later.</p></div>}</div></section><aside className="control-card"><div className="control-card__header"><div><span className="operator-kicker">LIVE CONTROL</span><h2>Carousel</h2></div><span className="health"><i /> {loading ? "SYNCING" : payload.stale ? "DEGRADED" : "HEALTHY"}</span></div><div className="control-card__primary"><button className="button button--wide" onClick={() => setPaused((value) => !value)}>{paused ? "▶ Resume rotation" : "Ⅱ Pause rotation"}</button><div className="transport"><button className="button button--icon" onClick={() => move(-1)} aria-label="Previous game">←</button><div><strong>{String(index + 1).padStart(2, "0")}</strong><span> / {String(games.length).padStart(2, "0")} GAMES</span></div><button className="button button--icon" onClick={() => move(1)} aria-label="Next game">→</button></div></div><label className="field">Score date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="field">Rotation interval <span>{interval}s</span><input type="range" min="5" max="60" step="5" value={interval} onChange={(event) => setIntervalValue(Number(event.target.value))} /></label><button className="button button--outline button--wide" onClick={triggerScoreUpdate}>{updateSent ? "✓ Score update sent to air" : "✦ Trigger score update"}</button><button className="button button--outline button--wide" onClick={() => void refresh()}>↻ Refresh scores now</button><div className="feed-info"><div><span>DATA SOURCE</span><b>Minnesota-Scores.net</b></div><div><span>LAST UPDATED</span><b>{payload.fetchedAt ? new Date(payload.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}</b></div><div><span>COUNTDOWN</span><b>{paused ? "PAUSED" : `00:${String(seconds).padStart(2, "0")}`}</b></div></div></aside></div><div className="operator-note"><span className="feed-dot feed-dot--live" /> Live data refreshes every 60 seconds. If the source is unavailable, the board preserves the last valid response.</div></main>;
}

export function BroadcastControls() { return <div className="broadcast-controls"><a href="/operator">Operator controls ↗</a></div>; }
