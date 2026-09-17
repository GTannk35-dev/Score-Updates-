export const SCORE_UPDATE_EVENT = "lmr-score-update";

export type StingerKind = "score" | "kickoff" | "halftime" | "final" | "scores-report" | "halftime-report" | "custom";

type ScoreUpdateMessage = {
  type: typeof SCORE_UPDATE_EVENT;
  id: number;
  kind: StingerKind;
  custom?: string;
  /** On-screen duration in ms; omitted = per-kind default. */
  duration?: number;
};

export function isScoreUpdateMessage(value: unknown): value is ScoreUpdateMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as ScoreUpdateMessage).type === SCORE_UPDATE_EVENT &&
      typeof (value as ScoreUpdateMessage).id === "number",
  );
}

function send(message: ScoreUpdateMessage) {
  if (typeof window === "undefined") return;

  try {
    const channel = new BroadcastChannel(SCORE_UPDATE_EVENT);
    channel.postMessage(message);
    channel.close();
  } catch {
    // localStorage below provides compatibility for browsers without BroadcastChannel.
  }

  try {
    window.localStorage.setItem(SCORE_UPDATE_EVENT, JSON.stringify(message));
  } catch {
    // Private browsing modes can block localStorage; BroadcastChannel may still work.
  }
}

/** Fire a branded stinger on the air page. */
export function announceStinger(kind: StingerKind, custom?: string, duration?: number) {
  send({ type: SCORE_UPDATE_EVENT, id: Date.now(), kind, custom: custom?.trim() || undefined, duration });
}

/** Back-compatible helper for the plain score-update stinger. */
export function announceScoreUpdate() {
  announceStinger("score");
}
