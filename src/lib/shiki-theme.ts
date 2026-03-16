/**
 * Custom Shiki theme for ringi's code review surfaces.
 *
 * Design principles:
 * - Optimized for #0d0d0d–#1a1a1a dark backgrounds
 * - High-contrast foreground (WCAG AA on #1a1a1a)
 * - Restrained, desaturated palette — syntax colors guide the eye without shouting
 * - Comments legible but visually recessed
 * - Strings and keywords distinct but not neon
 * - Works well on plain, added, and removed diff backgrounds
 *
 * Color budget (8 hues max to stay calm):
 *   fg:       #d1d5db  (gray-300 equivalent — high contrast on dark)
 *   comment:  #6b7280  (gray-500 — visible but recessed, 4.6:1 on #1a1a1a)
 *   keyword:  #c4a5e2  (muted lavender — echoes the accent-primary indigo)
 *   string:   #a5d6b7  (soft sage — distinct from keywords, calmer than bright green)
 *   type:     #7cc4d4  (muted cyan — readable on all diff backgrounds)
 *   function: #dbbe91  (warm sand — subtle emphasis for call sites)
 *   constant: #e0967a  (muted coral — numbers, booleans, null)
 *   punct:    #9ca3af  (gray-400 — structural glue, not distracting)
 *   tag:      #7cc4d4  (same as type — JSX/HTML tags)
 *   attr:     #dbbe91  (same as function — JSX/HTML attributes)
 */

import type { ThemeRegistration } from "shiki";

export const ringiTheme: ThemeRegistration = {
  name: "ringi",
  type: "dark",
  colors: {
    // Editor chrome (only used by Shiki for the <pre> wrapper)
    "editor.background": "#00000000", // transparent — we control bg via CSS
    "editor.foreground": "#d1d5db",
  },
  settings: [
    // ── Base foreground ──
    {
      settings: {
        foreground: "#d1d5db",
      },
    },

    // ── Comments ──
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: {
        foreground: "#6b7280",
        fontStyle: "italic",
      },
    },

    // ── Keywords & control flow ──
    {
      scope: [
        "keyword",
        "keyword.control",
        "keyword.operator.expression",
        "keyword.operator.new",
        "keyword.operator.delete",
        "keyword.operator.typeof",
        "keyword.operator.void",
        "keyword.operator.instanceof",
        "storage.type",
        "storage.modifier",
      ],
      settings: {
        foreground: "#c4a5e2",
      },
    },

    // ── Operators & punctuation ──
    {
      scope: [
        "keyword.operator",
        "keyword.operator.assignment",
        "keyword.operator.arithmetic",
        "keyword.operator.comparison",
        "keyword.operator.logical",
        "punctuation",
        "meta.brace",
        "meta.delimiter",
      ],
      settings: {
        foreground: "#9ca3af",
      },
    },

    // ── Strings ──
    {
      scope: [
        "string",
        "string.template",
        "punctuation.definition.string",
      ],
      settings: {
        foreground: "#a5d6b7",
      },
    },

    // ── Template expression interpolation ──
    {
      scope: [
        "punctuation.definition.template-expression",
        "punctuation.section.embedded",
      ],
      settings: {
        foreground: "#c4a5e2",
      },
    },

    // ── Constants: numbers, booleans, null, undefined ──
    {
      scope: [
        "constant.numeric",
        "constant.language",
        "constant.language.boolean",
        "constant.language.null",
        "constant.language.undefined",
      ],
      settings: {
        foreground: "#e0967a",
      },
    },

    // ── Types & interfaces ──
    {
      scope: [
        "entity.name.type",
        "entity.name.class",
        "support.type",
        "support.class",
        "meta.type.annotation",
        "entity.name.type.alias",
        "entity.name.type.interface",
        "entity.name.type.enum",
      ],
      settings: {
        foreground: "#7cc4d4",
      },
    },

    // ── Functions & methods ──
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call entity.name.function",
        "meta.function-call support.function",
      ],
      settings: {
        foreground: "#dbbe91",
      },
    },

    // ── Variables & parameters ──
    {
      scope: [
        "variable",
        "variable.other",
        "variable.parameter",
        "meta.definition.variable",
      ],
      settings: {
        foreground: "#d1d5db",
      },
    },

    // ── Object properties ──
    {
      scope: [
        "variable.other.property",
        "variable.other.object.property",
        "meta.object-literal.key",
        "support.type.property-name",
      ],
      settings: {
        foreground: "#d1d5db",
      },
    },

    // ── JSX/HTML tags ──
    {
      scope: [
        "entity.name.tag",
        "punctuation.definition.tag",
        "support.class.component",
      ],
      settings: {
        foreground: "#7cc4d4",
      },
    },

    // ── JSX/HTML attributes ──
    {
      scope: [
        "entity.other.attribute-name",
      ],
      settings: {
        foreground: "#dbbe91",
      },
    },

    // ── Regex ──
    {
      scope: ["string.regexp"],
      settings: {
        foreground: "#e0967a",
      },
    },

    // ── Import/export paths ──
    {
      scope: [
        "string.quoted.module",
        "meta.import string",
      ],
      settings: {
        foreground: "#a5d6b7",
      },
    },

    // ── CSS property names ──
    {
      scope: ["support.type.property-name.css"],
      settings: {
        foreground: "#7cc4d4",
      },
    },

    // ── CSS values ──
    {
      scope: [
        "support.constant.property-value.css",
        "meta.property-value.css",
      ],
      settings: {
        foreground: "#dbbe91",
      },
    },

    // ── CSS selectors ──
    {
      scope: [
        "entity.name.tag.css",
        "entity.other.attribute-name.class.css",
        "entity.other.attribute-name.id.css",
      ],
      settings: {
        foreground: "#c4a5e2",
      },
    },

    // ── JSON keys ──
    {
      scope: ["support.type.property-name.json"],
      settings: {
        foreground: "#7cc4d4",
      },
    },

    // ── Markdown ──
    {
      scope: ["markup.heading", "punctuation.definition.heading.markdown"],
      settings: {
        foreground: "#c4a5e2",
        fontStyle: "bold",
      },
    },
    {
      scope: ["markup.bold"],
      settings: {
        fontStyle: "bold",
      },
    },
    {
      scope: ["markup.italic"],
      settings: {
        fontStyle: "italic",
      },
    },
    {
      scope: ["markup.inline.raw", "markup.fenced_code"],
      settings: {
        foreground: "#a5d6b7",
      },
    },

    // ── Shell/Bash ──
    {
      scope: [
        "variable.other.normal.shell",
        "variable.other.special.shell",
        "punctuation.definition.variable.shell",
      ],
      settings: {
        foreground: "#e0967a",
      },
    },

    // ── Decorators ──
    {
      scope: [
        "meta.decorator",
        "punctuation.decorator",
      ],
      settings: {
        foreground: "#dbbe91",
      },
    },

    // ── Escape characters ──
    {
      scope: ["constant.character.escape"],
      settings: {
        foreground: "#7cc4d4",
      },
    },
  ],
};
