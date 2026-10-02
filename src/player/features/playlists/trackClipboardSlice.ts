import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { Track } from "./playlistsSlice";

export interface TrackClipboardState {
  track: Track | null;
}

const initialState: TrackClipboardState = {
  track: null,
};

export const trackClipboardSlice = createSlice({
  name: "trackClipboard",
  initialState,
  reducers: {
    copyTrackToClipboard: (state, action: PayloadAction<Track>) => {
      state.track = action.payload;
    },
  },
});

export const { copyTrackToClipboard } = trackClipboardSlice.actions;

export default trackClipboardSlice.reducer;
