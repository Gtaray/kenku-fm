import { contextBridge, ipcRenderer } from "electron";
import "../preload/theme";

const api = {
  /** Returns a function that removes the listener */
  onState: (callback: (volume: number) => void) => {
    const listener = (_: Electron.IpcRendererEvent, volume: number) =>
      callback(volume);
    ipcRenderer.on("VOLUME_POPUP_STATE", listener);
    return () => {
      ipcRenderer.off("VOLUME_POPUP_STATE", listener);
    };
  },
  setVolume: (volume: number) => {
    ipcRenderer.send("VOLUME_POPUP_SET_VOLUME", volume);
  },
  enter: () => {
    ipcRenderer.send("VOLUME_POPUP_ENTER");
  },
  leave: () => {
    ipcRenderer.send("VOLUME_POPUP_LEAVE");
  },
};

declare global {
  interface Window {
    volumePopup: typeof api;
  }
}

contextBridge.exposeInMainWorld("volumePopup", api);
