import type { Game } from "@/lib/types";

export function GameCard({ game, active = false }: { game: Game; active?: boolean }) {
  const isScoreless = game.away.score === undefined && game.home.score === undefined;
  return (
    <section className={`game-card ${active ? "game-card--active" : ""}`} aria-label={`${game.away.name} at ${game.home.name}`}>
      <div className="game-card__topline">
        <span className={`status status--${game.status.toLowerCase()}`}>{game.status === "LIVE" && <span className="status-pip" />}{game.status}</span>
        <span className="game-detail">{game.detail}</span>
      </div>
      <div className="matchup">
        <div className="teams">
          <div className="team-row"><span className="team-label">AWAY</span><strong>{game.away.shortName}</strong><span className="record">{game.away.record ?? "—"}</span></div>
          <div className="team-row"><span className="team-label">HOME</span><strong>{game.home.shortName}</strong><span className="record">{game.home.record ?? "—"}</span></div>
        </div>
        <div className="scores" aria-label="Scores">
          <strong>{isScoreless ? "–" : game.away.score ?? 0}</strong>
          <strong>{isScoreless ? "–" : game.home.score ?? 0}</strong>
        </div>
      </div>
      <div className="game-card__footer"><span>{game.venue ?? "Minnesota"}</span><span>{game.date}</span></div>
    </section>
  );
}
