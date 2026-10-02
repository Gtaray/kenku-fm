import { Dispatch } from "@reduxjs/toolkit";

import { setMuted, setVolume } from "../player/playerSlice";
import { editTab } from "./tabsSlice";

export function setTabMuted(
  dispatch: Dispatch,
  playerTabId: number,
  tabId: number,
  muted: boolean,
) {
  window.kenku.setMuted(tabId, muted);
  if (tabId === playerTabId) {
    dispatch(setMuted(muted));
  } else {
    dispatch(editTab({ id: tabId, muted }));
  }
}

export function setTabVolume(
  dispatch: Dispatch,
  playerTabId: number,
  tabId: number,
  volume: number,
) {
  window.kenku.setVolume(tabId, volume);
  if (tabId === playerTabId) {
    dispatch(setVolume(volume));
  } else {
    dispatch(editTab({ id: tabId, volume }));
  }
}
