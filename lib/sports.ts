export type SportGender = "boys" | "girls";

export type SportId =
  | "football"
  | "boys-basketball"
  | "girls-basketball"
  | "boys-hockey"
  | "girls-hockey"
  | "boys-soccer"
  | "girls-soccer"
  | "volleyball"
  | "baseball"
  | "softball"
  | "wrestling"
  | "boys-lacrosse"
  | "girls-lacrosse";

export type SportDefinition = {
  id: SportId;
  label: string;
  /** Path segment on minnesota-scores.net */
  sourcePath: string;
  gender: SportGender | "coed";
  /** Group label shown in the operator picker */
  season: "Fall" | "Winter" | "Spring";
};

/**
 * Every Big 9 sport that minnesota-scores.net exposes a scoreboard page for
 * (verified HTTP 200 on each). Sports without a scoreboard endpoint (golf,
 * tennis, track, swimming, etc.) are intentionally omitted.
 */
export const SPORTS: SportDefinition[] = [
  { id: "football", label: "Football", sourcePath: "boys-sports/football", gender: "coed", season: "Fall" },
  { id: "boys-soccer", label: "Boys Soccer", sourcePath: "boys-sports/soccer", gender: "boys", season: "Fall" },
  { id: "girls-soccer", label: "Girls Soccer", sourcePath: "girls-sports/soccer", gender: "girls", season: "Fall" },
  { id: "volleyball", label: "Volleyball", sourcePath: "girls-sports/volleyball", gender: "girls", season: "Fall" },
  { id: "boys-lacrosse", label: "Boys Lacrosse", sourcePath: "boys-sports/lacrosse", gender: "boys", season: "Spring" },
  { id: "girls-lacrosse", label: "Girls Lacrosse", sourcePath: "girls-sports/lacrosse", gender: "girls", season: "Spring" },
  { id: "boys-basketball", label: "Boys Basketball", sourcePath: "boys-sports/basketball", gender: "boys", season: "Winter" },
  { id: "girls-basketball", label: "Girls Basketball", sourcePath: "girls-sports/basketball", gender: "girls", season: "Winter" },
  { id: "boys-hockey", label: "Boys Hockey", sourcePath: "boys-sports/hockey", gender: "boys", season: "Winter" },
  { id: "girls-hockey", label: "Girls Hockey", sourcePath: "girls-sports/hockey", gender: "girls", season: "Winter" },
  { id: "wrestling", label: "Wrestling", sourcePath: "boys-sports/wrestling", gender: "coed", season: "Winter" },
  { id: "baseball", label: "Baseball", sourcePath: "boys-sports/baseball", gender: "boys", season: "Spring" },
  { id: "softball", label: "Softball", sourcePath: "girls-sports/softball", gender: "girls", season: "Spring" },
];

export const DEFAULT_SPORT: SportId = "football";

export function findSport(id: string | null | undefined): SportDefinition {
  return SPORTS.find((sport) => sport.id === id) ?? SPORTS.find((sport) => sport.id === DEFAULT_SPORT)!;
}

export function sourceUrlFor(sport: SportDefinition): string {
  return `https://www.minnesota-scores.net/${sport.sourcePath}/scoreboard`;
}
