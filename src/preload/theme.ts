import { contextBridge, ipcRenderer } from "electron";

import { ThemeState } from "../types/theme";

const api = {
  getState: (): ThemeState => ipcRenderer.sendSync("THEME_GET"),
  /** Returns a function that removes the listener */
  onChange: (callback: (state: ThemeState) => void) => {
    const listener = (_: Electron.IpcRendererEvent, state: ThemeState) =>
      callback(state);
    ipcRenderer.on("THEME_UPDATED", listener);
    return () => {
      ipcRenderer.off("THEME_UPDATED", listener);
    };
  },
  select: (id: string) => {
    ipcRenderer.send("THEME_SELECT", id);
  },
  openFolder: () => {
    ipcRenderer.send("THEME_OPEN_FOLDER");
  },
};

declare global {
  interface Window {
    kenkuTheme: typeof api;
  }
}

contextBridge.exposeInMainWorld("kenkuTheme", api);
