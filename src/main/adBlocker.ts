import { app, session } from "electron";
import { promises as fs } from "fs";
import path from "path";
import {
  adsAndTrackingLists,
  ElectronBlocker,
} from "@ghostery/adblocker-electron";

// The lists change often (e.g. YouTube rules), so rebuild the engine daily
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function loadBlocker(cachePath: string): Promise<ElectronBlocker> {
  try {
    const { mtimeMs } = await fs.stat(cachePath);
    if (Date.now() - mtimeMs < CACHE_MAX_AGE_MS) {
      return ElectronBlocker.deserialize(await fs.readFile(cachePath));
    }
  } catch {
    // No usable cache, fetch the lists below
  }

  try {
    const blocker = await ElectronBlocker.fromLists(fetch, adsAndTrackingLists, {
      // Injected uBlock scriptlets clash with each other (`JSONPath` redeclared) and break YouTube
      loadCosmeticFilters: false,
    });
    await fs.writeFile(cachePath, blocker.serialize());
    return blocker;
  } catch {
    // Offline: an outdated engine is better than none
    return ElectronBlocker.deserialize(await fs.readFile(cachePath));
  }
}

/** Block ads and trackers in every web view (they all share the default session) */
export async function enableAdBlocker(): Promise<void> {
  try {
    const cachePath = path.join(
      app.getPath("userData"),
      "adblocker-network-engine.bin",
    );
    const blocker = await loadBlocker(cachePath);
    blocker.enableBlockingInSession(session.defaultSession);
  } catch (error) {
    console.error("Unable to start the ad blocker");
    console.error(error);
  }
}
