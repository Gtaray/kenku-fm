import { BrowserWindow } from "electron";
import { BrowserViewManagerMain } from "./BrowserViewManagerMain";
import { MusicLooperManager } from "./MusicLooperManager";
import { PlaybackManager } from "./PlaybackManager";
import { PlayerManager } from "./PlayerManager";
import { SystemManager } from "./SystemManager";
import { VolumePopupManager } from "./VolumePopupManager";
import { WindowManager } from "./WindowManager";

export class SessionManager {
  private playbackManager: PlaybackManager;
  private playerManager: PlayerManager;
  private viewManager: BrowserViewManagerMain;
  private windowManager: WindowManager;
  private systemManager: SystemManager;
  private volumePopupManager: VolumePopupManager;
  private musicLooperManager: MusicLooperManager;

  constructor(window: BrowserWindow) {
    this.playbackManager = new PlaybackManager(window);
    this.viewManager = new BrowserViewManagerMain(window);
    this.windowManager = new WindowManager(window);
    this.playerManager = new PlayerManager();
    this.systemManager = new SystemManager();
    this.volumePopupManager = new VolumePopupManager(window);
    this.musicLooperManager = new MusicLooperManager();
  }

  destroy() {
    this.playbackManager.destroy();
    this.viewManager.destroy();
    this.windowManager.destroy();
    this.playerManager.destroy();
    this.systemManager.destroy();
    this.volumePopupManager.destroy();
    this.musicLooperManager.destroy();
  }
}
