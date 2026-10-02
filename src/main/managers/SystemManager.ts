import { ipcMain, shell } from "electron";
import path from "path";

/** Lets the player reveal local track files and open web tracks in the default browser */
export class SystemManager {
  constructor() {
    ipcMain.on("SHELL_SHOW_ITEM_IN_FOLDER", this._handleShowItemInFolder);
    ipcMain.on("SHELL_OPEN_EXTERNAL", this._handleOpenExternal);
  }

  destroy() {
    ipcMain.off("SHELL_SHOW_ITEM_IN_FOLDER", this._handleShowItemInFolder);
    ipcMain.off("SHELL_OPEN_EXTERNAL", this._handleOpenExternal);
  }

  _handleShowItemInFolder = (_: Electron.IpcMainEvent, filePath: string) => {
    if (typeof filePath === "string" && filePath) {
      shell.showItemInFolder(path.normalize(filePath));
    }
  };

  _handleOpenExternal = (_: Electron.IpcMainEvent, url: string) => {
    let protocol: string;
    try {
      protocol = new URL(url).protocol;
    } catch {
      return;
    }
    if (protocol === "http:" || protocol === "https:") {
      shell.openExternal(url).catch((error) => {
        console.error(`Unable to open ${url}`);
        console.error(error);
      });
    }
  };
}
