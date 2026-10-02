import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Paper from "@mui/material/Paper";
import Slider from "@mui/material/Slider";

import { KenkuThemeProvider } from "../renderer/app/KenkuThemeProvider";

function VolumePopup() {
  const [volume, setVolume] = useState(1);

  useEffect(() => window.volumePopup.onState(setVolume), []);

  // Hover is shared with the tab icon in the main window, the main process decides when to hide
  useEffect(() => {
    const root = document.documentElement;
    let inside = false;
    let pressed = false;
    const handleEnter = () => {
      inside = true;
      window.volumePopup.enter();
    };
    const handleLeave = () => {
      inside = false;
      // Keep the popup open while dragging the slider outside of it
      if (!pressed) {
        window.volumePopup.leave();
      }
    };
    const handleDown = () => {
      pressed = true;
    };
    const handleUp = () => {
      pressed = false;
      if (!inside) {
        window.volumePopup.leave();
      }
    };
    root.addEventListener("mouseenter", handleEnter);
    root.addEventListener("mouseleave", handleLeave);
    window.addEventListener("pointerdown", handleDown);
    window.addEventListener("pointerup", handleUp);
    return () => {
      root.removeEventListener("mouseenter", handleEnter);
      root.removeEventListener("mouseleave", handleLeave);
      window.removeEventListener("pointerdown", handleDown);
      window.removeEventListener("pointerup", handleUp);
    };
  }, []);

  function handleChange(_: Event, value: number | number[]) {
    const newVolume = (value as number) / 100;
    setVolume(newVolume);
    window.volumePopup.setVolume(newVolume);
  }

  return (
    <Paper
      elevation={4}
      sx={{
        position: "absolute",
        top: 4,
        bottom: 4,
        left: 4,
        right: 4,
        display: "flex",
        justifyContent: "center",
        py: 1.5,
      }}
    >
      <Slider
        aria-label="tab volume"
        orientation="vertical"
        size="small"
        value={Math.round(volume * 100)}
        min={0}
        max={100}
        onChange={handleChange}
      />
    </Paper>
  );
}

createRoot(document.getElementById("root")).render(
  <KenkuThemeProvider>
    <VolumePopup />
  </KenkuThemeProvider>,
);
