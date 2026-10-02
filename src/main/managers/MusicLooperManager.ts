import { ipcMain } from "electron";
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { LoopPoints, LoopTags } from "../../types/player";

const TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

function findTool(): string | undefined {
  const name = process.platform === "win32" ? "music-looper.exe" : "music-looper";
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  dirs.push("/usr/bin");
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Not in this directory
    }
  }
}

function checkTrackPath(trackPath: unknown): string {
  if (
    typeof trackPath !== "string" ||
    trackPath.includes("://") ||
    !path.isAbsolute(trackPath)
  ) {
    throw new Error("Loop tools only work with local files");
  }
  if (!fs.statSync(trackPath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error("Track file not found");
  }
  return trackPath;
}

function isSampleCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Runs the music-looper CLI (loop analysis and loop tags) for the player */
export class MusicLooperManager {
  toolPath = findTool();

  constructor() {
    ipcMain.on("MUSIC_LOOPER_AVAILABLE", this._handleAvailable);
    ipcMain.handle("MUSIC_LOOPER_READ_TAGS", this._handleReadTags);
    ipcMain.handle("MUSIC_LOOPER_ANALYZE", this._handleAnalyze);
    ipcMain.handle("MUSIC_LOOPER_WRITE_TAGS", this._handleWriteTags);
  }

  destroy() {
    ipcMain.off("MUSIC_LOOPER_AVAILABLE", this._handleAvailable);
    ipcMain.removeHandler("MUSIC_LOOPER_READ_TAGS");
    ipcMain.removeHandler("MUSIC_LOOPER_ANALYZE");
    ipcMain.removeHandler("MUSIC_LOOPER_WRITE_TAGS");
  }

  run(args: string[]): Promise<Record<string, unknown>> {
    const toolPath = this.toolPath;
    if (!toolPath) {
      return Promise.reject(new Error("music-looper is not installed"));
    }
    return new Promise((resolve, reject) => {
      const child = execFile(
        toolPath,
        args,
        {
          timeout: TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_BYTES,
          windowsHide: true,
          // Leave cores free so playback doesn't crackle during analysis
          env: {
            ...process.env,
            RAYON_NUM_THREADS: String(
              Math.max(1, Math.floor(os.availableParallelism() / 2))
            ),
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr.trim() || error.message));
            return;
          }
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(new Error("music-looper returned invalid output"));
          }
        }
      );
      if (child.pid !== undefined) {
        try {
          os.setPriority(child.pid, os.constants.priority.PRIORITY_LOW);
        } catch {
          // Already exited
        }
      }
    });
  }

  async readTags(trackPath: string): Promise<LoopTags> {
    const result = await this.run(["read-tags", "--", trackPath]);
    const { sampleRate, start, end } = result;
    if (typeof sampleRate !== "number" || !(sampleRate > 0)) {
      throw new Error("music-looper returned no sample rate");
    }
    if (isSampleCount(start) && isSampleCount(end) && end > start) {
      return { sampleRate, start: start / sampleRate, end: end / sampleRate };
    }
    return { sampleRate };
  }

  _handleAvailable = (event: Electron.IpcMainEvent) => {
    event.returnValue = Boolean(this.toolPath);
  };

  _handleReadTags = (_: Electron.IpcMainInvokeEvent, trackPath: unknown) =>
    this.readTags(checkTrackPath(trackPath));

  _handleAnalyze = async (
    _: Electron.IpcMainInvokeEvent,
    trackPath: unknown
  ): Promise<LoopPoints> => {
    const result = await this.run([
      "analyze",
      "--max-candidates",
      "1",
      "--",
      checkTrackPath(trackPath),
    ]);
    const { sampleRate, start, end } = result;
    if (
      typeof sampleRate !== "number" ||
      !(sampleRate > 0) ||
      !isSampleCount(start) ||
      !isSampleCount(end) ||
      end <= start
    ) {
      throw new Error("music-looper returned invalid loop points");
    }
    return { sampleRate, start: start / sampleRate, end: end / sampleRate };
  };

  /** Start and end are in seconds */
  _handleWriteTags = async (
    _: Electron.IpcMainInvokeEvent,
    trackPath: unknown,
    start: unknown,
    end: unknown
  ): Promise<void> => {
    const checkedPath = checkTrackPath(trackPath);
    if (
      typeof start !== "number" ||
      typeof end !== "number" ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start
    ) {
      throw new Error("Invalid loop points");
    }
    const { sampleRate } = await this.readTags(checkedPath);
    const startSamples = Math.round(start * sampleRate);
    const endSamples = Math.round(end * sampleRate);
    if (endSamples <= startSamples) {
      throw new Error("Invalid loop points");
    }
    await this.run([
      "write-tags",
      "--start",
      String(startSamples),
      "--end",
      String(endSamples),
      "--",
      checkedPath,
    ]);
  };
}
