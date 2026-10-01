import { BrowserWindow, ipcMain, webContents } from "electron";
import { TypedEmitter } from "tiny-typed-emitter";

import { VoiceRoomState } from "../../types/voice";

declare const AUDIO_CAPTURE_WINDOW_WEBPACK_ENTRY: string;
declare const AUDIO_CAPTURE_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

interface AudioCaptureManagerEvents {
  voiceRoomState: (
    connectionId: string,
    state: VoiceRoomState,
    message?: string
  ) => void;
}

/**
 * Manager to capture audio from browser views and external audio devices
 * This class is to be run on the main thread
 * For the render thread counterpart see `AudioCaptureManagerPreload.ts`
 */
export class AudioCaptureManagerMain extends TypedEmitter<AudioCaptureManagerEvents> {
  _browserWindow: BrowserWindow;

  constructor() {
    super();
    this._browserWindow = new BrowserWindow({
      webPreferences: {
        preload: AUDIO_CAPTURE_WINDOW_PRELOAD_WEBPACK_ENTRY,
        // Disable sandbox for the audio capture window
        // This allows us to use a web worker in the preload script
        // https://github.com/electron/forge/issues/2931
        // This has little security concerns as we don't load any third party
        // content in the capture window
        sandbox: false,
      },
      minimizable: false,
      frame: false,
      show: false
    });
    this._browserWindow.webContents.loadURL(AUDIO_CAPTURE_WINDOW_WEBPACK_ENTRY);

    ipcMain.on("AUDIO_CAPTURE_START", this._handleStart);
    ipcMain.on("AUDIO_CAPTURE_SET_LOOPBACK", this._handleSetLoopback);
    ipcMain.on("AUDIO_CAPTURE_SET_VIRTUAL_MIC", this._handleSetVirtualMic);
    ipcMain.on("AUDIO_CAPTURE_SET_MUTED", this._handleSetMuted);
    ipcMain.on(
      "AUDIO_CAPTURE_START_EXTERNAL_AUDIO_CAPTURE",
      this._handleStartExternalAudioCapture
    );
    ipcMain.on(
      "AUDIO_CAPTURE_STOP_EXTERNAL_AUDIO_CAPTURE",
      this._handleStopExternalAudioCapture
    );
    ipcMain.on("AUDIO_CAPTURE_VOICE_ROOM_STATE", this._handleVoiceRoomState);
    ipcMain.on(
      "AUDIO_CAPTURE_START_BROWSER_VIEW_STREAM",
      this._handleStartBrowserViewStream
    );
    ipcMain.on(
      "AUDIO_CAPTURE_STOP_BROWSER_VIEW_STREAM",
      this._handleStopBrowserViewStream
    );
  }

  destroy() {
    ipcMain.off("AUDIO_CAPTURE_START", this._handleStart);
    ipcMain.off("AUDIO_CAPTURE_SET_LOOPBACK", this._handleSetLoopback);
    ipcMain.off("AUDIO_CAPTURE_SET_VIRTUAL_MIC", this._handleSetVirtualMic);
    ipcMain.off("AUDIO_CAPTURE_SET_MUTED", this._handleSetMuted);
    ipcMain.off(
      "AUDIO_CAPTURE_START_EXTERNAL_AUDIO_CAPTURE",
      this._handleStartExternalAudioCapture
    );
    ipcMain.off(
      "AUDIO_CAPTURE_STOP_EXTERNAL_AUDIO_CAPTURE",
      this._handleStopExternalAudioCapture
    );
    ipcMain.off("AUDIO_CAPTURE_VOICE_ROOM_STATE", this._handleVoiceRoomState);
    ipcMain.off(
      "AUDIO_CAPTURE_START_BROWSER_VIEW_STREAM",
      this._handleStartBrowserViewStream
    );
    ipcMain.off(
      "AUDIO_CAPTURE_STOP_BROWSER_VIEW_STREAM",
      this._handleStopBrowserViewStream
    );
    this._browserWindow.webContents.close();
    (this._browserWindow.webContents as any).destroy();
  }

  connectVoiceRoom(
    connectionId: string,
    endpoint: string,
    token: string,
    bitrate?: number
  ) {
    this._browserWindow.webContents.send(
      "AUDIO_CAPTURE_VOICE_ROOM_CONNECT",
      connectionId,
      endpoint,
      token,
      bitrate
    );
  }

  disconnectVoiceRoom(connectionId: string) {
    if (!this._browserWindow.isDestroyed()) {
      this._browserWindow.webContents.send(
        "AUDIO_CAPTURE_VOICE_ROOM_DISCONNECT",
        connectionId
      );
    }
  }

  _handleVoiceRoomState = (
    event: Electron.IpcMainEvent,
    connectionId: string,
    state: VoiceRoomState,
    message?: string
  ) => {
    if (event.sender === this._browserWindow.webContents) {
      this.emit("voiceRoomState", connectionId, state, message);
    }
  };

  _handleStart = () => {
    this._browserWindow.webContents.send("AUDIO_CAPTURE_START");
  };

  _handleSetLoopback = (_: Electron.IpcMainEvent, loopback: boolean) => {
    this._browserWindow.webContents.send("AUDIO_CAPTURE_SET_LOOPBACK", loopback);
  };

  _handleSetVirtualMic = (_: Electron.IpcMainEvent, enabled: boolean) => {
    this._browserWindow.webContents.send(
      "AUDIO_CAPTURE_SET_VIRTUAL_MIC",
      enabled
    );
  };

  _handleSetMuted = (
    _: Electron.IpcMainEvent,
    viewId: number,
    muted: boolean
  ) => {
    this._browserWindow.webContents.send(
      "AUDIO_CAPTURE_BROWSER_VIEW_MUTED",
      viewId,
      muted
    );
  };

  _handleStartExternalAudioCapture = (
    _: Electron.IpcMainEvent,
    deviceId: string
  ) => {
    this._browserWindow.webContents.send(
      "AUDIO_CAPTURE_START_EXTERNAL_AUDIO_CAPTURE",
      deviceId
    );
  };

  _handleStopExternalAudioCapture = (
    _: Electron.IpcMainEvent,
    deviceId: string
  ) => {
    this._browserWindow.webContents.send(
      "AUDIO_CAPTURE_STOP_EXTERNAL_AUDIO_CAPTURE",
      deviceId
    );
  };

  _handleStartBrowserViewStream = (
    _: Electron.IpcMainEvent,
    viewId: number
  ) => {
    const contents = webContents.fromId(viewId);
    const mediaSourceId = contents.getMediaSourceId(
      this._browserWindow.webContents
    );
    this._browserWindow.webContents.send(
      "AUDIO_CAPTURE_START_BROWSER_VIEW_STREAM",
      viewId,
      mediaSourceId
    );
  };

  _handleStopBrowserViewStream = (_: Electron.IpcMainEvent, viewId: number) => {
    this._browserWindow.webContents.send(
      "AUDIO_CAPTURE_STOP_BROWSER_VIEW_STREAM",
      viewId
    );
  };
}
