import { BrowserWindow, ipcMain } from "electron";

import { VoiceRoomState } from "../../../types/voice";
import { AudioCaptureManagerMain } from "../../managers/AudioCaptureManagerMain";
import { discoverInstance, FluxerGateway, GatewayOpcode } from "./FluxerGateway";

type VoiceChannel = {
  id: string;
  name: string;
  position: number;
  bitrate?: number;
};

type Guild = {
  id: string;
  name: string;
  icon: string | null;
  voiceChannels: VoiceChannel[];
};

type StoredGuild = {
  id: string;
  name: string;
  iconHash: string | null;
  voiceChannels: Map<string, VoiceChannel>;
};

type VoiceConnection = {
  connectionId: string;
  guildId: string;
  channelId: string;
};

type PendingJoin = {
  guildId: string;
  timeout: ReturnType<typeof setTimeout>;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type ChannelPayload = any;
type DispatchPayload = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const GUILD_VOICE_CHANNEL_TYPE = 2;
/** Fluxer sends no refusal, so a join with no grant by then has failed */
const GRANT_TIMEOUT_MS = 10000;
const GUILD_LIST_DEBOUNCE_MS = 250;
const JOIN_FAILED_MESSAGE =
  "Unable to join voice channel. This channel might be full or this bot might not have permission to join.";

/**
 * Fluxer bot: lists the guilds and voice channels the bot can see, and joins
 * and leaves voice channels. Fluxer only keeps a join if the client connects to
 * the LiveKit room within 30 seconds, so the audio capture window opens a room
 * for every joined channel.
 */
export class FluxerBroadcast {
  private gateway?: FluxerGateway;
  private connectAttempt = 0;
  private mediaUrl = "";
  private userId?: string;
  private announced = false;
  private guilds = new Map<string, StoredGuild>();
  private pendingJoins = new Map<string, PendingJoin>();
  private connections = new Map<string, VoiceConnection>();
  private guildListTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private window: BrowserWindow,
    private voiceRooms: AudioCaptureManagerMain,
  ) {
    ipcMain.on("FLUXER_CONNECT", this.handleConnect);
    ipcMain.on("FLUXER_DISCONNECT", this.handleDisconnect);
    ipcMain.on("FLUXER_JOIN_CHANNEL", this.handleJoinChannel);
    ipcMain.on("FLUXER_LEAVE_CHANNEL", this.handleLeaveChannel);
    this.voiceRooms.on("voiceRoomState", this.handleVoiceRoomState);
  }

  destroy() {
    ipcMain.off("FLUXER_CONNECT", this.handleConnect);
    ipcMain.off("FLUXER_DISCONNECT", this.handleDisconnect);
    ipcMain.off("FLUXER_JOIN_CHANNEL", this.handleJoinChannel);
    ipcMain.off("FLUXER_LEAVE_CHANNEL", this.handleLeaveChannel);
    this.voiceRooms.off("voiceRoomState", this.handleVoiceRoomState);
    this.teardown();
  }

  private reply(channel: string, ...args: unknown[]) {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(channel, ...args);
    }
  }

  private handleConnect = async (
    _: Electron.IpcMainEvent,
    instanceUrl: string,
    token: string,
  ) => {
    this.teardown();
    const attempt = ++this.connectAttempt;
    if (!token) {
      this.reply("FLUXER_DISCONNECTED");
      this.reply("ERROR", "Error connecting to bot: Invalid token");
      return;
    }

    try {
      const endpoints = await discoverInstance(instanceUrl);
      if (attempt !== this.connectAttempt) {
        return;
      }
      if (!endpoints.voiceEnabled) {
        throw new Error("This Fluxer instance has voice disabled");
      }
      this.mediaUrl = endpoints.media;
      const gateway = new FluxerGateway(endpoints.gateway, token);
      gateway.on("dispatch", this.handleDispatch);
      gateway.on("sessionLost", this.handleSessionLost);
      gateway.on("fatal", this.handleFatal);
      this.gateway = gateway;
      gateway.connect();
    } catch (err) {
      if (attempt === this.connectAttempt) {
        this.reply("FLUXER_DISCONNECTED");
        this.reply("ERROR", `Error connecting to bot: ${err.message}`);
      }
    }
  };

  private handleDisconnect = () => {
    this.connectAttempt++;
    this.teardown();
    this.reply("FLUXER_DISCONNECTED");
    this.reply("FLUXER_GUILDS", []);
    this.reply("FLUXER_CHANNEL_JOINED", "local");
  };

  private handleFatal = (message: string) => {
    this.teardown();
    this.reply("FLUXER_DISCONNECTED");
    this.reply("FLUXER_GUILDS", []);
    this.reply("ERROR", `Error connecting to bot: ${message}`);
  };

  private handleSessionLost = () => {
    if (this.connections.size > 0 || this.pendingJoins.size > 0) {
      this.reply(
        "ERROR",
        "Lost the connection to Fluxer and left voice. Rejoin your channels.",
      );
    }
    this.dropAllVoice(false);
  };

  /** Close the gateway and forget all state, leaving any voice channels first */
  private teardown() {
    this.dropAllVoice(true);
    clearTimeout(this.guildListTimeout);
    this.gateway?.close();
    this.gateway = undefined;
    this.guilds.clear();
    this.userId = undefined;
    this.announced = false;
  }

  private dropAllVoice(notifyServer: boolean) {
    for (const [channelId, pending] of this.pendingJoins) {
      clearTimeout(pending.timeout);
      this.reply("FLUXER_CHANNEL_LEFT", channelId);
    }
    this.pendingJoins.clear();
    for (const connection of [...this.connections.values()]) {
      this.endConnection(connection, notifyServer);
    }
  }

  private handleDispatch = (event: string, data: DispatchPayload) => {
    switch (event) {
      case "READY":
        this.userId = data.user?.id;
        this.guilds.clear();
        if (!this.announced) {
          this.announced = true;
          this.reply("FLUXER_READY");
          this.reply("MESSAGE", "Connected");
        }
        this.scheduleGuildList();
        break;
      case "GUILD_CREATE":
        if (!data.unavailable) {
          this.storeGuild(data);
        }
        break;
      case "GUILD_UPDATE": {
        const guild = this.guilds.get(data.id);
        if (guild) {
          guild.name = data.name;
          guild.iconHash = data.icon ?? null;
          this.scheduleGuildList();
        }
        break;
      }
      case "GUILD_DELETE":
        this.removeGuild(data.id, !data.unavailable);
        break;
      case "CHANNEL_CREATE":
      case "CHANNEL_UPDATE":
        this.storeChannel(data);
        break;
      case "CHANNEL_UPDATE_BULK":
        for (const channel of data.channels ?? []) {
          this.storeChannel(channel);
        }
        break;
      case "CHANNEL_DELETE":
        this.removeChannel(data.guild_id, data.id);
        break;
      case "VOICE_SERVER_UPDATE":
        this.handleVoiceGrant(data);
        break;
      case "VOICE_STATE_UPDATE":
        this.handleVoiceState(data);
        break;
    }
  };

  private storeGuild(data: DispatchPayload) {
    const voiceChannels = new Map<string, VoiceChannel>();
    for (const channel of data.channels ?? []) {
      if (channel.type === GUILD_VOICE_CHANNEL_TYPE) {
        voiceChannels.set(channel.id, toVoiceChannel(channel));
      }
    }
    this.guilds.set(data.id, {
      id: data.id,
      name: data.properties?.name ?? "",
      iconHash: data.properties?.icon ?? null,
      voiceChannels,
    });
    this.scheduleGuildList();
  }

  private removeGuild(guildId: string, leftGuild: boolean) {
    if (leftGuild) {
      for (const connection of [...this.connections.values()]) {
        if (connection.guildId === guildId) {
          this.endConnection(connection, false);
        }
      }
    }
    if (this.guilds.delete(guildId)) {
      this.scheduleGuildList();
    }
  }

  private storeChannel(channel: ChannelPayload) {
    const guild = this.guilds.get(channel.guild_id);
    if (!guild) {
      return;
    }
    if (channel.type === GUILD_VOICE_CHANNEL_TYPE) {
      guild.voiceChannels.set(channel.id, toVoiceChannel(channel));
    } else {
      guild.voiceChannels.delete(channel.id);
    }
    this.scheduleGuildList();
  }

  private removeChannel(guildId: string, channelId: string) {
    for (const connection of [...this.connections.values()]) {
      if (connection.channelId === channelId) {
        this.endConnection(connection, false);
      }
    }
    if (this.guilds.get(guildId)?.voiceChannels.delete(channelId)) {
      this.scheduleGuildList();
    }
  }

  /** Guild Create arrives once per guild after Ready, so batch the list updates */
  private scheduleGuildList() {
    clearTimeout(this.guildListTimeout);
    this.guildListTimeout = setTimeout(
      () => this.reply("FLUXER_GUILDS", this.guildList()),
      GUILD_LIST_DEBOUNCE_MS,
    );
  }

  private guildList(): Guild[] {
    return [...this.guilds.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.iconHash
          ? `${this.mediaUrl}/icons/${guild.id}/${guild.iconHash}.png`
          : null,
        voiceChannels: [...guild.voiceChannels.values()].sort(
          (a, b) => a.position - b.position,
        ),
      }));
  }

  private handleJoinChannel = (_: Electron.IpcMainEvent, channelId: string) => {
    const guild = [...this.guilds.values()].find((g) =>
      g.voiceChannels.has(channelId),
    );
    if (this.pendingJoins.has(channelId)) {
      return;
    }
    if (!this.gateway || !guild) {
      this.reply("FLUXER_CHANNEL_LEFT", channelId);
      this.reply("ERROR", JOIN_FAILED_MESSAGE);
      return;
    }

    const timeout = setTimeout(() => {
      this.pendingJoins.delete(channelId);
      this.reply("FLUXER_CHANNEL_LEFT", channelId);
      this.reply("ERROR", JOIN_FAILED_MESSAGE);
    }, GRANT_TIMEOUT_MS);
    this.pendingJoins.set(channelId, { guildId: guild.id, timeout });

    this.gateway.send(GatewayOpcode.VOICE_STATE_UPDATE, {
      guild_id: guild.id,
      channel_id: channelId,
      self_mute: false,
      self_deaf: true,
      self_video: false,
      self_stream: false,
    });
  };

  private handleLeaveChannel = (_: Electron.IpcMainEvent, channelId: string) => {
    const pending = this.pendingJoins.get(channelId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingJoins.delete(channelId);
    }
    for (const connection of [...this.connections.values()]) {
      if (connection.channelId === channelId) {
        this.endConnection(connection, true);
      }
    }
    this.reply("FLUXER_CHANNEL_LEFT", channelId);
  };

  private handleVoiceGrant(data: DispatchPayload) {
    const { connection_id: connectionId, channel_id: channelId } = data;
    const existing = this.connections.get(connectionId);
    if (existing) {
      // A move or region change reissues the grant for the same connection
      const previousChannelId = existing.channelId;
      existing.channelId = channelId;
      existing.guildId = data.guild_id ?? existing.guildId;
      this.voiceRooms.connectVoiceRoom(
        connectionId,
        data.endpoint,
        data.token,
        this.channelBitrate(existing),
      );
      if (previousChannelId !== channelId) {
        this.reply("FLUXER_CHANNEL_LEFT", previousChannelId);
      }
      return;
    }

    const pending = this.pendingJoins.get(channelId);
    if (!pending) {
      // A grant for a join we already gave up on
      this.gateway?.send(GatewayOpcode.VOICE_STATE_UPDATE, {
        guild_id: data.guild_id ?? null,
        channel_id: null,
        connection_id: connectionId,
      });
      return;
    }
    clearTimeout(pending.timeout);
    this.pendingJoins.delete(channelId);
    const connection = {
      connectionId,
      guildId: pending.guildId,
      channelId,
    };
    this.connections.set(connectionId, connection);
    this.voiceRooms.connectVoiceRoom(
      connectionId,
      data.endpoint,
      data.token,
      this.channelBitrate(connection),
    );
  }

  private channelBitrate(connection: VoiceConnection) {
    return this.guilds
      .get(connection.guildId)
      ?.voiceChannels.get(connection.channelId)?.bitrate;
  }

  /** Notice when a moderator disconnects the bot */
  private handleVoiceState(data: DispatchPayload) {
    if (data.user_id !== this.userId || data.channel_id !== null) {
      return;
    }
    const connection = this.connections.get(data.connection_id);
    if (connection) {
      this.endConnection(connection, false);
      this.reply("ERROR", "Disconnected from voice channel");
    }
  }

  private handleVoiceRoomState = (
    connectionId: string,
    state: VoiceRoomState,
    message?: string,
  ) => {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }
    if (state === "connected") {
      this.reply("FLUXER_CHANNEL_JOINED", connection.channelId);
    } else {
      this.endConnection(connection, true);
      this.reply(
        "ERROR",
        `Error connecting to voice channel${message ? `: ${message}` : ""}`,
      );
    }
  };

  private endConnection(connection: VoiceConnection, notifyServer: boolean) {
    this.connections.delete(connection.connectionId);
    if (notifyServer) {
      this.gateway?.send(GatewayOpcode.VOICE_STATE_UPDATE, {
        guild_id: connection.guildId,
        channel_id: null,
        connection_id: connection.connectionId,
      });
    }
    this.voiceRooms.disconnectVoiceRoom(connection.connectionId);
    this.reply("FLUXER_CHANNEL_LEFT", connection.channelId);
  }
}

function toVoiceChannel(channel: ChannelPayload): VoiceChannel {
  return {
    id: channel.id,
    name: channel.name ?? "",
    position: channel.position ?? 0,
    bitrate: channel.bitrate ?? undefined,
  };
}
