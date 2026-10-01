import fs from "fs";
import path from "path";
import { app, ipcMain, shell, WebContents } from "electron";
import Store from "electron-store";

import {
  ThemeDefinition,
  ThemeState,
  themeColorKeys,
} from "../../types/theme";

const DEFAULT_THEME_ID = "default";
const THEME_EXTENSION = ".json";
const HEX_COLOR = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;
const REFRESH_DEBOUNCE_MS = 150;

/** Kenku FM's original colours, written to default.json and used when a theme can't be loaded */
const builtInTheme: ThemeDefinition = {
  mode: "dark",
  colors: {
    primary: "#bb99ff",
    on_primary: "#000000de",
    secondary: "#ee99ff",
    on_secondary: "#000000de",
    error: "#f44336",
    on_error: "#ffffff",
    surface: "#1e2231",
    surface_container: "#222639",
    surface_container_high: "#2d3143",
    on_surface: "#ffffff",
    on_surface_variant: "#ffffffb3",
    outline_variant: "#ffffff1f",
  },
};

function parseTheme(raw: unknown): ThemeDefinition | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { mode, colors } = raw as { mode?: unknown; colors?: unknown };
  if (mode !== "dark" && mode !== "light") {
    return null;
  }
  if (typeof colors !== "object" || colors === null) {
    return null;
  }
  const parsed = {} as ThemeDefinition["colors"];
  for (const key of themeColorKeys) {
    const value = (colors as Record<string, unknown>)[key];
    if (typeof value !== "string" || !HEX_COLOR.test(value)) {
      return null;
    }
    parsed[key] = value;
  }
  return { mode, colors: parsed };
}

/**
 * Loads colour themes from `<userData>/theme/*.json`, watches that folder
 * and pushes the selected theme to every renderer that asked for it
 */
export class ThemeManager {
  private dir = path.join(app.getPath("userData"), "theme");
  private store = new Store<{ themeId: string }>({
    name: "theme-settings",
    defaults: { themeId: DEFAULT_THEME_ID },
  });
  private themes = new Map<string, ThemeDefinition | null>();
  private subscribers = new Set<WebContents>();
  private refreshTimeout: NodeJS.Timeout | undefined;
  private state: ThemeState;

  constructor() {
    this.createDefaultTheme();
    this.scan();
    this.state = this.resolve();
    this.watch();

    ipcMain.on("THEME_GET", this.handleGet);
    ipcMain.on("THEME_SELECT", this.handleSelect);
    ipcMain.on("THEME_OPEN_FOLDER", this.handleOpenFolder);
  }

  private createDefaultTheme() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      // "wx" leaves an existing (possibly user-edited) default.json alone
      fs.writeFileSync(
        path.join(this.dir, DEFAULT_THEME_ID + THEME_EXTENSION),
        JSON.stringify(builtInTheme, null, 2) + "\n",
        { flag: "wx" },
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
        console.error("Unable to create default theme:", err);
      }
    }
  }

  private scan() {
    this.themes.clear();
    let files: string[] = [];
    try {
      files = fs.readdirSync(this.dir);
    } catch (err) {
      console.error("Unable to read theme folder:", err);
    }
    for (const file of files.sort()) {
      if (!file.endsWith(THEME_EXTENSION)) {
        continue;
      }
      const id = path.basename(file, THEME_EXTENSION);
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(this.dir, file), "utf8"));
        this.themes.set(id, parseTheme(raw));
      } catch {
        this.themes.set(id, null);
      }
    }
  }

  private resolve(): ThemeState {
    const selected = this.store.get("themeId");
    return {
      themes: [...this.themes].map(([id, theme]) => ({ id, valid: !!theme })),
      selected,
      theme: this.themes.get(selected) ?? builtInTheme,
    };
  }

  private watch() {
    try {
      const watcher = fs.watch(this.dir, (_, filename) => {
        // Ignore editor swap files and temp files written before a rename
        if (filename && !filename.endsWith(THEME_EXTENSION)) {
          return;
        }
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = setTimeout(this.refresh, REFRESH_DEBOUNCE_MS);
      });
      watcher.on("error", (err) => console.error("Theme watcher error:", err));
    } catch (err) {
      console.error("Unable to watch theme folder:", err);
    }
  }

  private refresh = () => {
    this.scan();
    this.publish();
  };

  private publish() {
    const next = this.resolve();
    if (JSON.stringify(next) === JSON.stringify(this.state)) {
      return;
    }
    this.state = next;
    for (const contents of this.subscribers) {
      contents.send("THEME_UPDATED", this.state);
    }
  }

  private handleGet = (event: Electron.IpcMainEvent) => {
    const contents = event.sender;
    if (!this.subscribers.has(contents)) {
      this.subscribers.add(contents);
      contents.once("destroyed", () => this.subscribers.delete(contents));
    }
    event.returnValue = this.state;
  };

  private handleSelect = (_: Electron.IpcMainEvent, id: unknown) => {
    if (typeof id !== "string" || !this.themes.has(id)) {
      return;
    }
    this.store.set("themeId", id);
    this.publish();
  };

  private handleOpenFolder = () => {
    shell.openPath(this.dir);
  };
}
