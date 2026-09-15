export type GameStatus = "LIVE" | "FINAL" | "UPCOMING" | "HALFTIME" | "DELAYED";

export type Team = {
  name: string;
  shortName: string;
  score?: number;
  record?: string;
  accent?: string;
  logo?: string;
  color?: string;
};

export type Game = {
  id: string;
  home: Team;
  away: Team;
  status: GameStatus;
  detail: string;
  venue?: string;
  date: string;
  updatedAt?: string;
  sourceUrl?: string;
};

export type ScoresPayload = {
  games: Game[];
  fetchedAt: string;
  source: "live" | "cache" | "demo";
  sourceUrl: string;
  sport: string;
  stale?: boolean;
  error?: string;
};
