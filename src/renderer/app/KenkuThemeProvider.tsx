import React, { useEffect, useMemo, useState } from "react";
import ThemeProvider from "@mui/material/styles/ThemeProvider";

import { createKenkuTheme } from "./theme";

export function useThemeState() {
  const [state, setState] = useState(() => window.kenkuTheme.getState());
  useEffect(() => window.kenkuTheme.onChange(setState), []);
  return state;
}

export function KenkuThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme: definition } = useThemeState();
  const theme = useMemo(() => createKenkuTheme(definition), [definition]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
