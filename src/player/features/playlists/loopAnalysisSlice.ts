import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type LoopAnalysis =
  | { state: "pending" }
  | { state: "error"; error: string };

/** Automatic loop point lookups by track id, kept out of the saved store */
export type LoopAnalysisState = Record<string, LoopAnalysis>;

const initialState: LoopAnalysisState = {};

export const loopAnalysisSlice = createSlice({
  name: "loopAnalysis",
  initialState,
  reducers: {
    setLoopAnalysis: (
      state,
      action: PayloadAction<{ trackId: string; analysis: LoopAnalysis }>
    ) => {
      state[action.payload.trackId] = action.payload.analysis;
    },
    clearLoopAnalysis: (state, action: PayloadAction<string>) => {
      delete state[action.payload];
    },
  },
});

export const { setLoopAnalysis, clearLoopAnalysis } = loopAnalysisSlice.actions;

export default loopAnalysisSlice.reducer;
