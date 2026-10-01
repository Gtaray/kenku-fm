import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type VoiceChannel = {
  id: string;
  name: string;
};

export type Guild = {
  id: string;
  name: string;
  icon: string;
  voiceChannels: VoiceChannel[];
};

export interface OutputState {
  guilds: Guild[];
  outputs: string[];
}

export const LOCAL_OUTPUT_ID = "local";
export const VIRTUAL_MIC_OUTPUT_ID = "virtual-mic";

/** Outputs played by this computer, as opposed to voice channels */
export function isLocalOutput(id: string) {
  return id === LOCAL_OUTPUT_ID || id === VIRTUAL_MIC_OUTPUT_ID;
}

const initialState: OutputState = {
  guilds: [],
  outputs: [LOCAL_OUTPUT_ID],
};

export const outputSlice = createSlice({
  name: "output",
  initialState,
  reducers: {
    setGuilds: (state, action: PayloadAction<Guild[]>) => {
      state.guilds = action.payload;
    },
    setOutput: (state, action: PayloadAction<string>) => {
      state.outputs = [action.payload];
    },
    addOutput: (state, action: PayloadAction<string>) => {
      if (state.outputs.includes(action.payload)) {
        return;
      }
      state.outputs.push(action.payload);
    },
    removeOutput: (state, action: PayloadAction<string>) => {
      state.outputs = state.outputs.filter(
        (channel) => channel !== action.payload
      );
    },
  },
});

export const { setGuilds, setOutput, addOutput, removeOutput } =
  outputSlice.actions;

export default outputSlice.reducer;
