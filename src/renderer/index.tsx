import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";

import Backdrop from "@mui/material/Backdrop";
import CircularProgress from "@mui/material/CircularProgress";
import CssBaseline from "@mui/material/CssBaseline";
import { PersistGate } from "redux-persist/integration/react";

import { App } from "./app/App";
import { persistor, store } from "./app/store";
import { KenkuThemeProvider } from "./app/KenkuThemeProvider";
import ErrorBoundary from "./common/ErrorBoundary";

const container = document.getElementById("root");
const root = createRoot(container);

root.render(
  <KenkuThemeProvider>
    <ErrorBoundary>
      <Provider store={store}>
        <PersistGate
          loading={
            <Backdrop open>
              <CircularProgress />
            </Backdrop>
          }
          persistor={persistor}
        >
          <CssBaseline />
          <App />
        </PersistGate>
      </Provider>
    </ErrorBoundary>
  </KenkuThemeProvider>
);
