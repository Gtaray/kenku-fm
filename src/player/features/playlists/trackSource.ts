// Local files are stored as `file://<encoded path>` by `encodeFilePath` in src/renderer/common/drop.ts

export function isLocalFileUrl(url: string): boolean {
  return url.startsWith("file://");
}

/** Reverse of `encodeFilePath` */
export function fileUrlToPath(url: string): string {
  return decodeURIComponent(url.slice("file://".length));
}

export function revealLabel(platform: string): string {
  switch (platform) {
    case "darwin":
      return "Reveal in Finder";
    case "win32":
      return "Show in File Explorer";
    default:
      return "Show in Folder";
  }
}
