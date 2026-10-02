import { Track } from "./playlistsSlice";
import { fileUrlToPath, isLocalFileUrl } from "./trackSource";

/** Looping is disabled for longer tracks */
export const MAX_LOOP_TRACK_SECONDS = 30 * 60;

export type LoopRange = { start: number; end: number };

export function hasLoopPoints(track?: Track): boolean {
  return (
    typeof track?.loopStart === "number" &&
    typeof track?.loopEnd === "number" &&
    track.loopEnd > track.loopStart
  );
}

/** Local file path of the track, or undefined for web tracks */
export function trackFilePath(track: Track): string | undefined {
  return isLocalFileUrl(track.url) ? fileUrlToPath(track.url) : undefined;
}

// Formats music-looper decodes the same way Chromium does (not M4A: its AAC lead-in isn't trimmed)
const LOOP_EXTENSIONS = ["flac", "wav", "ogg", "mp3"];

/** Why the track can't loop at all, or undefined if it can */
export function loopUnsupportedReason(track: Track): string | undefined {
  const filePath = trackFilePath(track);
  if (!filePath) {
    return "Looping only works with local files";
  }
  const name = filePath.slice(filePath.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (!LOOP_EXTENSIONS.includes(extension)) {
    return extension
      ? `Looping isn't supported for .${extension} files`
      : "Looping isn't supported for this file type";
  }
}

export function canLoopTrack(track: Track, duration: number): boolean {
  return (
    !loopUnsupportedReason(track) &&
    duration > 0 &&
    duration <= MAX_LOOP_TRACK_SECONDS
  );
}

export function trackLoopRange(
  track: Track,
  duration: number
): LoopRange | null {
  if (!canLoopTrack(track, duration) || !hasLoopPoints(track)) {
    return null;
  }
  const start = Math.max(0, track.loopStart);
  const end = Math.min(duration, track.loopEnd);
  if (end - start < 0.05) {
    return null;
  }
  return { start, end };
}

export function wrapPosition(position: number, range: LoopRange): number {
  if (position < range.end) {
    return position;
  }
  return range.start + ((position - range.end) % (range.end - range.start));
}

/** music-looper reads and writes loop tags in FLAC files only */
export function supportsLoopTags(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".flac");
}

/** Loop tags if the file has them, otherwise music-looper's analysis */
export async function findLoopPoints(
  filePath: string
): Promise<Pick<Track, "loopStart" | "loopEnd" | "loopSource">> {
  if (supportsLoopTags(filePath)) {
    const tags = await window.player.readLoopTags(filePath);
    if (tags.start !== undefined && tags.end !== undefined) {
      return { loopStart: tags.start, loopEnd: tags.end, loopSource: "tags" };
    }
  }
  const points = await window.player.analyzeLoop(filePath);
  return {
    loopStart: points.start,
    loopEnd: points.end,
    loopSource: "analysis",
  };
}

/** Strips Electron's "Error invoking remote method" prefix */
export function loopErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}
