export type PaletteId = (typeof RINGI_PALETTES)[number]["id"];

export interface RingiPalette {
  id: PaletteId;
  label: string;
  description: string;
  /** Four swatches for card preview: surface, accent, add, remove */
  swatches: readonly [string, string, string, string];
}

/** Ordered list: default first. IDs must match `data-ringi-palette` in `ringi-palettes.css`. */
export const RINGI_PALETTES = [
  {
    description: "Ringi default — cool neutral surfaces, blue accent.",
    id: "ringi",
    label: "Ringi",
    swatches: ["#0d0d0d", "#3d6ad6", "#3fb950", "#f85149"],
  },
  {
    description: "Classic Dracula-inspired contrast with green accent.",
    id: "dracula",
    label: "Dracula",
    swatches: ["#282a36", "#50fa7b", "#8be9fd", "#ff5555"],
  },
  {
    description: "Tokyo Night — deep blue-violet editor tones.",
    id: "tokyo-night",
    label: "Tokyo Night",
    swatches: ["#1a1b26", "#7aa2f7", "#9ece6a", "#f7768e"],
  },
  {
    description: "Catppuccin Mocha — soft pastel accents on dark base.",
    id: "catppuccin",
    label: "Catppuccin",
    swatches: ["#1e1e2e", "#89dceb", "#a6e3a1", "#f38ba8"],
  },
  {
    description: "Gruvbox — warm paper-like dark UI.",
    id: "gruvbox",
    label: "Gruvbox",
    swatches: ["#282828", "#d79921", "#b8bb26", "#fb4934"],
  },
  {
    description: "Rosé Pine — muted mauve and sage atmosphere.",
    id: "rose-pine",
    label: "Rosé Pine",
    swatches: ["#191724", "#ebbcba", "#9ccfd8", "#eb6f92"],
  },
  {
    description: "Monokai-inspired greens and magentas.",
    id: "monokai",
    label: "Monokai",
    swatches: ["#272822", "#a6e22e", "#66d9ef", "#f92672"],
  },
  {
    description: "Synthwave hints — coral accent on midnight plum.",
    id: "synthwave",
    label: "Synthwave",
    swatches: ["#1a1625", "#f97e72", "#34d3c6", "#b794f6"],
  },
] as const satisfies readonly RingiPalette[];
