import { Room, RoomEvent, Track, TrackPublishOptions } from "livekit-client";

import { VoiceRoomState } from "../../types/voice";

const MIN_BITRATE_BPS = 8000;
const MAX_BITRATE_BPS = 510000;
/** Fluxer's own client only sends stereo at 128 kbps and above */
const STEREO_MIN_BITRATE_BPS = 128000;

/** Mirrors Fluxer's microphone publish options, tuned to the channel bitrate */
function publishOptions(channelBitrate?: number): TrackPublishOptions {
  const options: TrackPublishOptions = {
    source: Track.Source.Microphone,
    name: "Kenku FM",
    dtx: false,
    red: true,
  };
  if (channelBitrate && channelBitrate > 0) {
    const maxBitrate = Math.min(
      Math.max(channelBitrate, MIN_BITRATE_BPS),
      MAX_BITRATE_BPS,
    );
    options.audioPreset = { maxBitrate, priority: "high" };
    options.forceStereo = maxBitrate >= STEREO_MIN_BITRATE_BPS;
  }
  return options;
}

/**
 * One LiveKit room per Fluxer voice connection, run in the audio capture window.
 * Each room publishes Kenku's mix as the bot's microphone.
 */
export class VoiceRoomManagerPreload {
  private rooms = new Map<string, Room>();

  constructor(
    private getMixTrack: () => Promise<MediaStreamTrack>,
    private onState: (
      connectionId: string,
      state: VoiceRoomState,
      message?: string,
    ) => void,
  ) {}

  async connect(
    connectionId: string,
    endpoint: string,
    token: string,
    bitrate?: number,
  ) {
    // A reissued grant (move or region change) replaces the existing room
    this.disconnect(connectionId);

    const room = new Room();
    this.rooms.set(connectionId, room);
    room.on(RoomEvent.Disconnected, () => {
      if (this.rooms.get(connectionId) === room) {
        this.rooms.delete(connectionId);
        this.onState(connectionId, "disconnected");
      }
    });

    try {
      // Kenku never plays voice chat back, so don't receive other participants
      await room.connect(endpoint, token, { autoSubscribe: false });
      if (this.rooms.get(connectionId) !== room) {
        return;
      }
      this.onState(connectionId, "connected");

      // Each room gets its own copy, as leaving a room stops its published track
      const track = (await this.getMixTrack()).clone();
      track.contentHint = "music";
      if (this.rooms.get(connectionId) !== room) {
        track.stop();
        return;
      }
      await room.localParticipant.publishTrack(track, publishOptions(bitrate));
    } catch (error) {
      if (this.rooms.get(connectionId) === room) {
        this.rooms.delete(connectionId);
        this.onState(connectionId, "failed", error.message);
      }
    }
  }

  disconnect(connectionId: string) {
    const room = this.rooms.get(connectionId);
    if (room) {
      this.rooms.delete(connectionId);
      room.disconnect();
    }
  }
}
