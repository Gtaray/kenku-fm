import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import CssBaseline from "@mui/material/CssBaseline";

import Backdrop from "@mui/material/Backdrop";
import CircularProgress from "@mui/material/CircularProgress";
import { PersistGate } from "redux-persist/integration/react";

import { App } from "./app/App";
import { KenkuThemeProvider } from "../renderer/app/KenkuThemeProvider";
import { store, persistor } from "./app/store";
import { MemoryRouter } from "react-router-dom";

import "./index.css";

const container = document.getElementById("root");
const root = createRoot(container);

root.render(
  <Provider store={store}>
    <PersistGate
      loading={
        <Backdrop open>
          <CircularProgress />
        </Backdrop>
      }
      persistor={persistor}
    >
      <KenkuThemeProvider>
        <CssBaseline />
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </KenkuThemeProvider>
    </PersistGate>
  </Provider>
);
