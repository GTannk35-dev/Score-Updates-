export const BROADCAST_STATE_EVENT = "lmr-broadcast-state";

export type BroadcastState = {
  sport?: string;
  /** Dates (YYYY-MM-DD) to show; empty array = today. */
  dates?: string[];
  paused?: boolean;
  stepTo?: number;
  /** School names to show; empty array = every school. */
  schools?: string[];
  /** Game ids to show; empty array = every game in the feed. */
  gameIds?: string[];
  /** Monotonic counter so every message, even identical state, is delivered. */
  seq: number;
};

export type BroadcastStateInput = Omit<BroadcastState, "seq">;

type StateMessage = BroadcastState & { type: typeof BROADCAST_STATE_EVENT };

function isStateMessage(value: unknown): value is StateMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as StateMessage).type === BROADCAST_STATE_EVENT &&
      typeof (value as StateMessage).seq === "number",
  );
}

function sendState(state: BroadcastState & { type: string }) {
  if (typeof window === "undefined") return;

  try {
    const channel = new BroadcastChannel(BROADCAST_STATE_EVENT);
    channel.postMessage(state);
    channel.close();
  } catch {
    // localStorage below provides compatibility for browsers without BroadcastChannel.
  }

  try {
    window.localStorage.setItem(BROADCAST_STATE_EVENT, JSON.stringify(state));
  } catch {
    // Private browsing modes can block localStorage; BroadcastChannel may still work.
  }
}

/**
 * Publish the operator's current control state to every tab listening on the
 * same origin (i.e. the on-air board). Listeners de-duplicate by `seq`.
 */
export function publishState(state: BroadcastStateInput) {
  sendState({ ...state, type: BROADCAST_STATE_EVENT, seq: Date.now() });
}

export function subscribeToState(handler: (state: BroadcastState) => void) {
  if (typeof window === "undefined") return () => {};

  let lastSeq = 0;
  const deliver = (raw: unknown) => {
    if (!isStateMessage(raw) || raw.seq <= lastSeq) return;
    lastSeq = raw.seq;
    const { type: _type, ...state } = raw;
    handler(state);
  };

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(BROADCAST_STATE_EVENT);
    channel.onmessage = (event) => deliver(event.data);
  } catch {
    channel = null;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== BROADCAST_STATE_EVENT || !event.newValue) return;
    try {
      deliver(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed cross-tab messages.
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    channel?.close();
    window.removeEventListener("storage", onStorage);
  };
}
