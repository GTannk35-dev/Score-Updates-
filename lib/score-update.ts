export const SCORE_UPDATE_EVENT = "lmr-score-update";

type ScoreUpdateMessage = {
  type: typeof SCORE_UPDATE_EVENT;
  id: number;
};

export function announceScoreUpdate() {
  const message: ScoreUpdateMessage = { type: SCORE_UPDATE_EVENT, id: Date.now() };

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

export function isScoreUpdateMessage(value: unknown): value is ScoreUpdateMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as ScoreUpdateMessage).type === SCORE_UPDATE_EVENT &&
      typeof (value as ScoreUpdateMessage).id === "number",
  );
}
