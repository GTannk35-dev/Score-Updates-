export const BROADCAST_STATE_EVENT = "lmr-broadcast-state";

/** How long a persisted snapshot stays trustworthy for a board that joins late. */
const STATE_TTL_MS = 24 * 60 * 60 * 1000;

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
  /** Player stat card to display on air, when selected. */
  playerId?: string;
  /** Whether the selected player stat card is currently fullscreen on air. */
  showPlayerStats?: boolean;
  /** Wall-clock publish time (ms). Lets a late joiner ignore stale snapshots. */
  publishedAt?: number;
};

export type BroadcastStateInput = Omit<BroadcastState, "seq" | "publishedAt">;

type StateMessage = BroadcastState & { type: typeof BROADCAST_STATE_EVENT };

function isStateMessage(value: unknown): value is StateMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as StateMessage).type === BROADCAST_STATE_EVENT &&
      typeof (value as StateMessage).seq === "number",
  );
}

// One long-lived channel for the whole tab: creating and closing a channel per
// publish is wasteful and can race message delivery.
let sharedChannel: BroadcastChannel | null = null;
let lastPublishedSeq = 0;

// Server snapshot (cross-device): every publish also POSTs to /api/board-state
// so a board on a different device can pick up the operator's controls.
const BOARD_STATE_API = "/api/board-state";

/** How often the board re-checks the server for cross-device control changes. */
const POLL_MS = 2500;

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (sharedChannel) return sharedChannel;
  try {
    sharedChannel = new BroadcastChannel(BROADCAST_STATE_EVENT);
  } catch {
    sharedChannel = null;
  }
  return sharedChannel;
}

/**
 * The last state published in this browser, if it is fresh enough to trust.
 * Both the control panel and the broadcast board adopt this on load so a board
 * opened after setup — or reloaded — matches the panel instead of defaults.
 */
export function readLastState(): BroadcastState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BROADCAST_STATE_EVENT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isStateMessage(parsed)) return null;
    if (!parsed.publishedAt || Date.now() - parsed.publishedAt > STATE_TTL_MS) return null;
    const { type: _type, ...state } = parsed;
    return state;
  } catch {
    return null;
  }
}

function sendState(state: BroadcastState & { type: string }) {
  const channel = getChannel();
  if (channel) {
    try {
      channel.postMessage(state);
    } catch {
      // localStorage below provides compatibility if posting fails.
    }
  }

  try {
    window.localStorage.setItem(BROADCAST_STATE_EVENT, JSON.stringify(state));
  } catch {
    // Private browsing modes can block localStorage; BroadcastChannel may still work.
  }

  // Mirror to the server so boards on other devices converge on this state.
  void fetch(BOARD_STATE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
    keepalive: true,
  }).catch(() => {
    // Offline / server unreachable: same-tab delivery still works.
  });
}

function snapshotToState(raw: unknown): BroadcastState | null {
  if (!raw || typeof raw !== "object" || typeof (raw as { publishedAt?: unknown }).publishedAt !== "number") return null;
  const { publishedAt, ...state } = raw as BroadcastState & { publishedAt: number };
  const message: StateMessage = { ...state, type: BROADCAST_STATE_EVENT, seq: publishedAt };
  if (!isStateMessage(message)) return null;
  return message;
}

/** Fetch the latest cross-device snapshot from the server, if one exists. */
export async function fetchServerState(): Promise<BroadcastState | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch(BOARD_STATE_API, { cache: "no-store" });
    if (!response.ok) return null;
    return snapshotToState(await response.json());
  } catch {
    return null;
  }
}

/**
 * Publish the operator's current control state to every tab listening on the
 * same origin (i.e. the on-air board), and persist it as the snapshot that
 * future board loads replay. Also mirrors to the server so boards on other
 * devices converge on the same state. Listeners de-duplicate by `seq`.
 */
export function publishState(state: BroadcastStateInput) {
  if (typeof window === "undefined") return;

  const now = Date.now();
  const seq = now > lastPublishedSeq ? now : lastPublishedSeq + 1;
  lastPublishedSeq = seq;

  sendState({ ...state, type: BROADCAST_STATE_EVENT, seq, publishedAt: seq });
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

  // Replay the freshest snapshot so a board opened after setup (or reloaded)
  // immediately matches the control panel instead of starting from defaults.
  const snapshot = readLastState();
  if (snapshot) {
    lastSeq = snapshot.seq;
    handler(snapshot);
  }

  // Cross-device: pull the server snapshot too. It wins over the local one
  // when it is newer, because another device may have published after us.
  void fetchServerState().then((remote) => {
    if (!remote || remote.seq <= lastSeq) return;
    lastSeq = remote.seq;
    handler(remote);
  });

  const channel = getChannel();
  const onMessage = (event: MessageEvent) => deliver(event.data);
  channel?.addEventListener("message", onMessage);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== BROADCAST_STATE_EVENT || !event.newValue) return;
    try {
      deliver(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed cross-tab messages.
    }
  };
  window.addEventListener("storage", onStorage);

  // While the page is open, keep checking the server so a board on another
  // device follows the operator without a reload.
  const poll = window.setInterval(() => {
    void fetchServerState().then((remote) => {
      if (!remote || remote.seq <= lastSeq) return;
      lastSeq = remote.seq;
      handler(remote);
    });
  }, POLL_MS);

  return () => {
    window.clearInterval(poll);
    channel?.removeEventListener("message", onMessage);
    window.removeEventListener("storage", onStorage);
  };
}
