import WebSocket from "ws";
import { TypedEmitter } from "tiny-typed-emitter";

export const GatewayOpcode = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  VOICE_STATE_UPDATE: 4,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

/** Close codes that will fail again if we reconnect unchanged */
const FATAL_CLOSE_CODES: Record<number, string> = {
  4004: "Invalid token",
  4010: "Invalid shard",
  4011: "Sharding required",
  4012: "Invalid API version",
};

/** Close codes after which the session can't be resumed */
const SESSION_ENDING_CLOSE_CODES = [4003, 4007];

const MAX_RECONNECT_DELAY_MS = 30000;

export type InstanceEndpoints = {
  gateway: string;
  media: string;
  voiceEnabled: boolean;
};

/** Read the instance discovery document (`/.well-known/fluxer`) */
export async function discoverInstance(
  instanceUrl: string,
): Promise<InstanceEndpoints> {
  let url: URL;
  try {
    url = new URL("/.well-known/fluxer", instanceUrl);
  } catch {
    throw new Error("Invalid instance URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Instance URL must start with https://");
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Instance discovery failed (HTTP ${response.status})`);
  }
  const document = (await response.json()) as {
    endpoints?: { gateway?: unknown; media?: unknown };
    features?: { voice_enabled?: unknown };
  };
  const { gateway, media } = document.endpoints ?? {};
  if (typeof gateway !== "string" || typeof media !== "string") {
    throw new Error("Instance discovery response has no gateway endpoint");
  }
  return {
    gateway,
    media,
    voiceEnabled: document.features?.voice_enabled !== false,
  };
}

interface FluxerGatewayEvents {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dispatch: (event: string, data: any) => void;
  /** The session ended, so every voice connection it held is gone */
  sessionLost: () => void;
  /** The gateway refused us in a way reconnecting won't fix */
  fatal: (message: string) => void;
}

/**
 * Minimal Fluxer Gateway client: JSON encoding, no compression.
 * Reconnects and resumes on its own after dropped connections.
 */
export class FluxerGateway extends TypedEmitter<FluxerGatewayEvents> {
  private ws?: WebSocket;
  private seq: number | null = null;
  private sessionId?: string;
  private hasConnected = false;
  private closed = false;
  private awaitingAck = false;
  private heartbeatTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private identifyTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts = 0;

  constructor(
    private url: string,
    private token: string,
  ) {
    super();
  }

  connect() {
    this.closed = false;
    this.open();
  }

  close() {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.identifyTimer);
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.on("error", () => undefined);
      this.ws.close(1000);
      this.ws = undefined;
    }
  }

  send(op: number, d: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op, d }));
    }
  }

  private open() {
    const url = new URL(this.url);
    url.searchParams.set("v", "1");
    url.searchParams.set("encoding", "json");

    const ws = new WebSocket(url);
    this.ws = ws;
    ws.on("message", (data) => this.handleMessage(data.toString()));
    ws.on("close", (code) => this.handleClose(code));
    ws.on("error", (err) => console.error("Fluxer gateway error:", err.message));
  }

  private handleMessage(raw: string) {
    let payload: { op: number; d?: any; s?: number; t?: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    switch (payload.op) {
      case GatewayOpcode.HELLO:
        this.startHeartbeat(payload.d.heartbeat_interval);
        if (this.sessionId && this.seq !== null) {
          this.send(GatewayOpcode.RESUME, {
            token: this.token,
            session_id: this.sessionId,
            seq: this.seq,
          });
        } else {
          this.identify();
        }
        break;
      case GatewayOpcode.HEARTBEAT:
        this.send(GatewayOpcode.HEARTBEAT, this.seq);
        break;
      case GatewayOpcode.HEARTBEAT_ACK:
        this.awaitingAck = false;
        break;
      case GatewayOpcode.DISPATCH:
        if (typeof payload.s === "number") {
          this.seq = payload.s;
        }
        if (payload.t === "READY") {
          this.sessionId = payload.d.session_id;
        }
        if (payload.t === "READY" || payload.t === "RESUMED") {
          this.hasConnected = true;
          this.reconnectAttempts = 0;
        }
        this.emit("dispatch", payload.t, payload.d);
        break;
      case GatewayOpcode.INVALID_SESSION:
        // The socket stays open but unauthenticated, so start a new session on it
        this.endSession();
        clearTimeout(this.identifyTimer);
        this.identifyTimer = setTimeout(
          () => this.identify(),
          1000 + Math.random() * 4000,
        );
        break;
      case GatewayOpcode.RECONNECT:
        // The server closes the socket next; handleClose reconnects and resumes
        break;
    }
  }

  private identify() {
    this.send(GatewayOpcode.IDENTIFY, {
      token: this.token,
      properties: {
        os: process.platform,
        browser: "Kenku FM",
        device: "Kenku FM",
      },
    });
  }

  private endSession() {
    const hadSession = this.sessionId !== undefined;
    this.sessionId = undefined;
    this.seq = null;
    if (hadSession) {
      this.emit("sessionLost");
    }
  }

  private handleClose(code: number) {
    this.stopHeartbeat();
    clearTimeout(this.identifyTimer);
    this.ws = undefined;
    if (this.closed) {
      return;
    }

    const fatal = FATAL_CLOSE_CODES[code];
    if (fatal || !this.hasConnected) {
      this.closed = true;
      this.emit(
        "fatal",
        fatal ?? `Unable to connect to the Fluxer gateway (code ${code})`,
      );
      return;
    }
    if (SESSION_ENDING_CLOSE_CODES.includes(code)) {
      this.endSession();
    }

    const delay = Math.min(
      MAX_RECONNECT_DELAY_MS,
      1000 * 2 ** this.reconnectAttempts,
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private startHeartbeat(interval: number) {
    this.stopHeartbeat();
    this.awaitingAck = false;
    const beat = () => {
      if (this.awaitingAck) {
        // No ACK since the last beat, so the connection is dead
        this.ws?.terminate();
        return;
      }
      this.awaitingAck = true;
      this.send(GatewayOpcode.HEARTBEAT, this.seq);
      this.heartbeatTimer = setTimeout(beat, interval);
    };
    this.heartbeatTimer = setTimeout(beat, interval * Math.random());
  }

  private stopHeartbeat() {
    clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }
}
