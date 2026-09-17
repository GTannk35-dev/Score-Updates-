import type { Game } from "./types";

/**
 * The single source of truth for which games reach the air, used identically
 * by the operator preview and the broadcast board:
 * - schools: empty = every school; otherwise only games involving at least one selected school
 * - gameIds: empty = every game in the (school-filtered) feed; otherwise only these ids
 */
export function visibleGames(games: Game[], schools: string[], gameIds: string[]) {
  const schoolSet = new Set(schools);
  const idSet = new Set(gameIds);
  return games.filter((game) => {
    if (schoolSet.size && !(schoolSet.has(game.away.name) || schoolSet.has(game.home.name))) return false;
    if (idSet.size && !idSet.has(game.id)) return false;
    return true;
  });
}
