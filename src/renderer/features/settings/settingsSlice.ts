import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type ConnectionStatus = "disconnected" | "connecting" | "ready";

export const DEFAULT_FLUXER_INSTANCE = "https://fluxer.app";

export interface SettingsState {
  fluxerInstance: string;
  fluxerToken: string;
  urlBarEnabled: boolean;
  remoteEnabled: boolean;
  remoteAddress: string;
  remotePort: string;
  externalInputsEnabled: boolean;
  multipleInputsEnabled: boolean;
  multipleOutputsEnabled: boolean;
}

const initialState: SettingsState = {
  fluxerInstance: DEFAULT_FLUXER_INSTANCE,
  fluxerToken: "",
  urlBarEnabled: true,
  remoteEnabled: false,
  remoteAddress: "127.0.0.1",
  remotePort: "3333",
  externalInputsEnabled: false,
  multipleInputsEnabled: false,
  multipleOutputsEnabled: false,
};

export const connectionSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    setFluxerInstance: (state, action: PayloadAction<string>) => {
      state.fluxerInstance = action.payload;
    },
    setFluxerToken: (state, action: PayloadAction<string>) => {
      state.fluxerToken = action.payload;
    },
    setURLBarEnabled: (state, action: PayloadAction<boolean>) => {
      state.urlBarEnabled = action.payload;
    },
    setRemoteEnabled: (state, action: PayloadAction<boolean>) => {
      state.remoteEnabled = action.payload;
    },
    setRemoteAddress: (state, action: PayloadAction<string>) => {
      state.remoteAddress = action.payload;
    },
    setRemotePort: (state, action: PayloadAction<string>) => {
      state.remotePort = action.payload;
    },
    setExternalInputsEnabled: (state, action: PayloadAction<boolean>) => {
      state.externalInputsEnabled = action.payload;
    },
    setMultipleInputsEnabled: (state, action: PayloadAction<boolean>) => {
      state.multipleInputsEnabled = action.payload;
    },
    setMultipleOutputsEnabled: (state, action: PayloadAction<boolean>) => {
      state.multipleOutputsEnabled = action.payload;
    },
  },
});

export const {
  setFluxerInstance,
  setFluxerToken,
  setURLBarEnabled,
  setRemoteEnabled,
  setRemoteAddress,
  setRemotePort,
  setExternalInputsEnabled,
  setMultipleInputsEnabled,
  setMultipleOutputsEnabled,
} = connectionSlice.actions;

export default connectionSlice.reducer;
