import createTheme, { ThemeOptions } from "@mui/material/styles/createTheme";

import { ThemeDefinition } from "../../types/theme";

declare module "@mui/material/styles" {
  interface TypeBackground {
    /** Full-window background gradient */
    wallpaper: string;
  }
}

export const themeOptions: ThemeOptions = {
  shape: {
    borderRadius: 16,
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          color: "secondary",
        },
      },
    },
    MuiButtonBase: {
      defaultProps: {
        disableRipple: true,
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          padding: 8,
          "& .MuiSwitch-track": {
            borderRadius: 22 / 2,
          },
          "& .MuiSwitch-thumb": {
            boxShadow: "none",
            width: 16,
            height: 16,
            margin: 2,
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          margin: "4px 8px",
          borderRadius: "16px",
        },
        dense: {
          borderRadius: "12px",
        },
      },
    },
    MuiSnackbarContent: {
      styleOverrides: {
        root: {
          minWidth: "192px !important",
        },
      },
    },
  },
};

export function createKenkuTheme({ mode, colors }: ThemeDefinition) {
  return createTheme({
    ...themeOptions,
    palette: {
      mode,
      primary: { main: colors.primary, contrastText: colors.on_primary },
      secondary: { main: colors.secondary, contrastText: colors.on_secondary },
      error: { main: colors.error, contrastText: colors.on_error },
      background: {
        default: colors.surface,
        paper: colors.surface_container,
        wallpaper: `linear-gradient(${colors.surface_container_high} 0%, ${colors.surface} 100%)`,
      },
      text: {
        primary: colors.on_surface,
        secondary: colors.on_surface_variant,
      },
      divider: colors.outline_variant,
    },
  });
}
