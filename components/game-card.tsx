import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { CSSProperties } from "react";
import type { Game, Team } from "@/lib/types";

function TeamLogo({ team, glowing = false }: { team: Team; glowing?: boolean }) {
  // Logos are dark art on white, so the school color is a ring + glow, keeping art legible.
  const ringStyle = team.color ? ({ borderColor: team.color, "--logo-glow": team.color } as CSSProperties) : undefined;
  if (team.logo) {
    return (
      <span className={`team-logo ${glowing ? "team-logo--glow" : ""}`} style={ringStyle}>
        <Image src={team.logo} alt="" width={80} height={80} className="team-logo__img" unoptimized />
      </span>
    );
  }
  const fillStyle = team.color ? ({ backgroundColor: team.color, "--logo-glow": team.color } as CSSProperties) : undefined;
  return (
    <span className={`team-logo team-logo--fallback ${glowing ? "team-logo--glow" : ""}`} style={fillStyle}>
      {team.shortName.slice(0, 2).toUpperCase()}
    </span>
  );
}

function useScoreFlash(score: number | undefined) {
  const previous = useRef<number | undefined>(score);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (previous.current === undefined || score === undefined) {
      previous.current = score;
      return;
    }
    if (score !== previous.current) {
      previous.current = score;
      setFlashing(true);
      const timer = window.setTimeout(() => setFlashing(false), 2600);
      return () => window.clearTimeout(timer);
    }
  }, [score]);
  return flashing;
}

export function GameCard({ game, active = false }: { game: Game; active?: boolean }) {
  const awayFlash = useScoreFlash(game.away.score);
  const homeFlash = useScoreFlash(game.home.score);
  const isScoreless = game.away.score === undefined && game.home.score === undefined;
  return (
    <section className={`game-card ${active ? "game-card--active" : ""}`} aria-label={`${game.away.name} at ${game.home.name}`}>
      <div className="game-card__topline">
        <span className={`status status--${game.status.toLowerCase()}`}>{game.status === "LIVE" && <span className="status-pip" />}{game.status}</span>
        <span className="game-detail">{game.detail}</span>
      </div>
      <div className="matchup">
        <div className="teams">
          <div className="team-row"><TeamLogo team={game.away} glowing={awayFlash} /><span className="team-label">AWAY</span><strong>{game.away.shortName}</strong><span className="record">{game.away.record ?? "—"}</span></div>
          <div className="team-row"><TeamLogo team={game.home} glowing={homeFlash} /><span className="team-label">HOME</span><strong>{game.home.shortName}</strong><span className="record">{game.home.record ?? "—"}</span></div>
        </div>
        <div className="scores" aria-label="Scores">
          <strong className={awayFlash ? "scores__score--flash" : undefined}>{isScoreless ? "–" : game.away.score ?? 0}</strong>
          <strong className={homeFlash ? "scores__score--flash" : undefined}>{isScoreless ? "–" : game.home.score ?? 0}</strong>
        </div>
      </div>
      <div className="game-card__footer"><span>{game.venue ?? "Minnesota"}</span><span>{game.date}</span></div>
    </section>
  );
}
