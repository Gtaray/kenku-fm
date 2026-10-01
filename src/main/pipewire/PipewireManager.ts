import { ChildProcess, spawn, spawnSync } from "child_process";
import { app } from "electron";

import {
  VIRTUAL_MIC_SINK_LABEL,
  VIRTUAL_MIC_SINK_NAME,
  VIRTUAL_MIC_SOURCE_LABEL,
  VIRTUAL_MIC_SOURCE_NAME,
} from "../../types/pipewire";

/**
 * Creates the "Kenku FM" virtual microphone on Linux systems with PipeWire.
 * `pw-loopback` owns both nodes, so they disappear when the process stops.
 * Does nothing on other platforms or when `pw-loopback` isn't installed.
 */
export class PipewireManager {
  private loopback: ChildProcess | undefined;

  constructor() {
    if (process.platform !== "linux") {
      return;
    }

    // Remove devices left behind if Kenku previously crashed
    spawnSync("pkill", ["-f", `node.name=${VIRTUAL_MIC_SINK_NAME}`]);

    // Audio/Source/Virtual crashes pw-loopback 1.6.9, plain Audio/Source still shows as a mic
    const loopback = spawn(
      "pw-loopback",
      [
        "--name",
        "kenku-fm",
        "--capture-props",
        `media.class=Audio/Sink node.name=${VIRTUAL_MIC_SINK_NAME} node.description="${VIRTUAL_MIC_SINK_LABEL}" priority.session=0 audio.position=[FL,FR]`,
        "--playback-props",
        `media.class=Audio/Source node.name=${VIRTUAL_MIC_SOURCE_NAME} node.description="${VIRTUAL_MIC_SOURCE_LABEL}" priority.session=0 audio.position=[FL,FR]`,
      ],
      { stdio: "ignore" },
    );
    loopback.on("error", (err) => {
      console.log("PipeWire virtual mic unavailable:", err.message);
    });
    loopback.on("exit", () => {
      this.loopback = undefined;
    });
    this.loopback = loopback;

    app.on("will-quit", () => this.loopback?.kill());
  }
}
