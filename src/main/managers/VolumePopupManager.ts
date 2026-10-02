import { BrowserWindow, ipcMain, WebContentsView } from "electron";

declare const VOLUME_POPUP_WINDOW_WEBPACK_ENTRY: string;
declare const VOLUME_POPUP_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

const POPUP_WIDTH = 48;
const POPUP_HEIGHT = 136;
const HIDE_DELAY_MS = 150;

export type VolumePopupAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Tab volume slider shown in its own view, since browser views are drawn above the main window's page
 */
export class VolumePopupManager {
  window: BrowserWindow;
  view?: WebContentsView;
  shown = false;
  tabId?: number;
  volume = 1;
  hideTimer?: ReturnType<typeof setTimeout>;

  constructor(window: BrowserWindow) {
    this.window = window;
    ipcMain.on("VOLUME_POPUP_SHOW", this._handleShow);
    ipcMain.on("VOLUME_POPUP_ENTER", this._handleEnter);
    ipcMain.on("VOLUME_POPUP_LEAVE", this._handleLeave);
    ipcMain.on("VOLUME_POPUP_SET_VOLUME", this._handleSetVolume);
    this.window.on("resize", this.hide);
  }

  destroy() {
    ipcMain.off("VOLUME_POPUP_SHOW", this._handleShow);
    ipcMain.off("VOLUME_POPUP_ENTER", this._handleEnter);
    ipcMain.off("VOLUME_POPUP_LEAVE", this._handleLeave);
    ipcMain.off("VOLUME_POPUP_SET_VOLUME", this._handleSetVolume);
    this.window.off("resize", this.hide);
    this.hide();
    if (this.view) {
      this.view.webContents.close();
      this.view = undefined;
    }
  }

  hide = () => {
    this._cancelHide();
    if (this.view && this.shown) {
      this.window.contentView.removeChildView(this.view);
      this.shown = false;
    }
  };

  _getView(): WebContentsView {
    if (!this.view) {
      const view = new WebContentsView({
        webPreferences: { preload: VOLUME_POPUP_WINDOW_PRELOAD_WEBPACK_ENTRY },
      });
      view.setBackgroundColor("#00000000");
      // The first state is sent before the page has loaded
      view.webContents.on("did-finish-load", this._sendState);
      view.webContents.loadURL(VOLUME_POPUP_WINDOW_WEBPACK_ENTRY);
      this.view = view;
    }
    return this.view;
  }

  _sendState = () => {
    this.view?.webContents.send("VOLUME_POPUP_STATE", this.volume);
  };

  _cancelHide() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    }
  }

  _handleShow = (
    event: Electron.IpcMainEvent,
    tabId: number,
    volume: number,
    anchor: VolumePopupAnchor,
  ) => {
    if (event.sender !== this.window.webContents) {
      return;
    }
    this._cancelHide();
    const view = this._getView();
    const { width } = this.window.getContentBounds();
    const x = anchor.x + anchor.width / 2 - POPUP_WIDTH / 2;
    view.setBounds({
      x: Math.round(Math.max(0, Math.min(x, width - POPUP_WIDTH))),
      y: Math.round(anchor.y + anchor.height),
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
    });
    this.tabId = tabId;
    this.volume = volume;
    this._sendState();
    // Adding an existing child again moves it above the browser views
    this.window.contentView.addChildView(view);
    this.shown = true;
  };

  _handleEnter = (event: Electron.IpcMainEvent) => {
    if (event.sender === this.view?.webContents) {
      this._cancelHide();
    }
  };

  _handleLeave = (event: Electron.IpcMainEvent) => {
    if (
      event.sender !== this.window.webContents &&
      event.sender !== this.view?.webContents
    ) {
      return;
    }
    this._cancelHide();
    this.hideTimer = setTimeout(this.hide, HIDE_DELAY_MS);
  };

  _handleSetVolume = (event: Electron.IpcMainEvent, volume: number) => {
    if (event.sender !== this.view?.webContents || this.tabId === undefined) {
      return;
    }
    this.volume = volume;
    this.window.webContents.send("VOLUME_POPUP_VOLUME", this.tabId, volume);
  };
}
