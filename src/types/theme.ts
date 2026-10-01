/** Colours a theme file must define; any other keys in the file are ignored */
export const themeColorKeys = [
  "primary",
  "on_primary",
  "secondary",
  "on_secondary",
  "error",
  "on_error",
  "surface",
  "surface_container",
  "surface_container_high",
  "on_surface",
  "on_surface_variant",
  "outline_variant",
] as const;

export type ThemeColorKey = (typeof themeColorKeys)[number];

export type ThemeDefinition = {
  mode: "dark" | "light";
  colors: Record<ThemeColorKey, string>;
};

export type ThemeListItem = {
  id: string;
  valid: boolean;
};

export type ThemeState = {
  themes: ThemeListItem[];
  selected: string;
  /** Resolved colours for `selected`, or the built-in default if it is missing or invalid */
  theme: ThemeDefinition;
};
