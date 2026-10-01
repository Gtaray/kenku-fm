import { BrowserWindow } from "electron";
import { FluxerBroadcast } from "../broadcast/fluxer/FluxerBroadcast";
import { AudioCaptureManagerMain } from "./AudioCaptureManagerMain";

export class PlaybackManager {
  fluxer: FluxerBroadcast;
  audioCaptureManager: AudioCaptureManagerMain;

  constructor(window: BrowserWindow) {
    this.audioCaptureManager = new AudioCaptureManagerMain();
    this.fluxer = new FluxerBroadcast(window, this.audioCaptureManager);
  }

  destroy() {
    this.fluxer.destroy();
    this.audioCaptureManager.destroy();
  }
}
