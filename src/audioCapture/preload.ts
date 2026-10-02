import { ipcRenderer } from "electron";

import { AudioCaptureManagerPreload } from "../preload/managers/AudioCaptureManagerPreload";
import { VoiceRoomManagerPreload } from "../preload/managers/VoiceRoomManagerPreload";

const audioCaptureManager = new AudioCaptureManagerPreload();
const voiceRoomManager = new VoiceRoomManagerPreload(
  () => audioCaptureManager.getMixTrack(),
  (connectionId, state, message) => {
    ipcRenderer.send(
      "AUDIO_CAPTURE_VOICE_ROOM_STATE",
      connectionId,
      state,
      message
    );
  }
);

ipcRenderer.on(
  "AUDIO_CAPTURE_VOICE_ROOM_CONNECT",
  (
    _,
    connectionId: string,
    endpoint: string,
    token: string,
    bitrate?: number
  ) => {
    voiceRoomManager.connect(connectionId, endpoint, token, bitrate);
  }
);

ipcRenderer.on(
  "AUDIO_CAPTURE_VOICE_ROOM_DISCONNECT",
  (_, connectionId: string) => {
    voiceRoomManager.disconnect(connectionId);
  }
);

ipcRenderer.on(
  "AUDIO_CAPTURE_START_BROWSER_VIEW_STREAM",
  (_, viewId: number, mediaSourceId: string) => {
    audioCaptureManager.startBrowserViewStream(viewId, mediaSourceId);
  }
);

ipcRenderer.on(
  "AUDIO_CAPTURE_STOP_BROWSER_VIEW_STREAM",
  (_, viewId: number) => {
    audioCaptureManager.stopBrowserViewStream(viewId);
  }
);

ipcRenderer.on(
  "AUDIO_CAPTURE_BROWSER_VIEW_MUTED",
  (_, viewId: number, muted: boolean) => {
    audioCaptureManager.setMuted(viewId, muted);
  }
);

ipcRenderer.on(
  "AUDIO_CAPTURE_BROWSER_VIEW_VOLUME",
  (_, viewId: number, volume: number) => {
    audioCaptureManager.setVolume(viewId, volume);
  }
);

ipcRenderer.on("AUDIO_CAPTURE_SET_LOOPBACK", (_, loopback: boolean) => {
  audioCaptureManager.setLoopback(loopback);
});

ipcRenderer.on("AUDIO_CAPTURE_SET_VIRTUAL_MIC", (_, enabled: boolean) => {
  audioCaptureManager.setVirtualMic(enabled);
});

ipcRenderer.on(
  "AUDIO_CAPTURE_START_EXTERNAL_AUDIO_CAPTURE",
  (_, deviceId: string) => {
    audioCaptureManager.startExternalAudioCapture(deviceId);
  }
);

ipcRenderer.on(
  "AUDIO_CAPTURE_STOP_EXTERNAL_AUDIO_CAPTURE",
  (_, deviceId: string) => {
    audioCaptureManager.stopExternalAudioCapture(deviceId);
  }
);

ipcRenderer.on("AUDIO_CAPTURE_START", () => {
  audioCaptureManager.start();
});
