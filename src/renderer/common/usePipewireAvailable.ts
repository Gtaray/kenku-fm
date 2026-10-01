import { useEffect, useState } from "react";

import { VIRTUAL_MIC_SINK_LABEL } from "../../types/pipewire";

/** True while Kenku's PipeWire virtual mic device exists (Linux with pw-loopback only) */
export function usePipewireAvailable() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!cancelled) {
        setAvailable(
          devices.some(
            (device) =>
              device.kind === "audiooutput" &&
              device.label === VIRTUAL_MIC_SINK_LABEL,
          ),
        );
      }
    }
    check();
    navigator.mediaDevices.addEventListener("devicechange", check);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener("devicechange", check);
    };
  }, []);

  return available;
}
