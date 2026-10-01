import { combineReducers, configureStore } from "@reduxjs/toolkit";
import connectionReducer from "../features/connection/connectionSlice";
import outputReducer, {
  isLocalOutput,
  LOCAL_OUTPUT_ID,
  OutputState,
} from "../features/output/outputSlice";
import settingsReducer, {
  DEFAULT_FLUXER_INSTANCE,
  SettingsState,
} from "../features/settings/settingsSlice";
import bookmarksReducer from "../features/bookmarks/bookmarksSlice";
import tabsReducer from "../features/tabs/tabsSlice";
import playerReducer from "../features/player/playerSlice";
import inputReducer from "../features/input/inputSlice";

import {
  persistStore,
  persistReducer,
  createMigrate,
  createTransform,
  PersistConfig,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from "redux-persist";
import storage from "redux-persist/lib/storage";

const rootReducer = combineReducers({
  connection: connectionReducer,
  output: outputReducer,
  settings: settingsReducer,
  bookmarks: bookmarksReducer,
  tabs: tabsReducer,
  player: playerReducer,
  input: inputReducer,
});

const migrations: any = {
  2: (state: RootState): RootState => {
    return {
      ...state,
      settings: {
        ...state.settings,
        urlBarEnabled: true,
        remoteEnabled: false,
        remoteAddress: "127.0.0.1",
        remotePort: "3333",
        externalInputsEnabled: false,
        multipleInputsEnabled: false,
        multipleOutputsEnabled: false,
      },
    };
  },
  // Fluxer replaces Discord, so the Discord token no longer applies
  5: (state: RootState): RootState => {
    const settings: Record<string, unknown> = { ...state.settings };
    delete settings.discordToken;
    return {
      ...state,
      settings: {
        ...(settings as unknown as SettingsState),
        fluxerInstance: DEFAULT_FLUXER_INSTANCE,
        fluxerToken: "",
      },
    };
  },
};

// Only remember outputs on this computer; voice channels need a live connection
const outputTransform = createTransform(
  (state: OutputState) => ({ outputs: state.outputs.filter(isLocalOutput) }),
  (state: { outputs: string[] }): OutputState => {
    const outputs = state.outputs.filter(isLocalOutput);
    return {
      guilds: [],
      outputs: outputs.length > 0 ? outputs : [LOCAL_OUTPUT_ID],
    };
  },
  { whitelist: ["output"] },
);

const persistConfig: PersistConfig<ReturnType<typeof rootReducer>> = {
  key: "root",
  version: 5,
  storage,
  whitelist: ["bookmarks", "settings", "output"],
  transforms: [outputTransform],
  migrate: createMigrate(migrations, { debug: false }),
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
