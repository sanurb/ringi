import type { FileDiffOptions } from "@pierre/diffs";

// `@pierre/diffs/react` transitively registers the shadow-DOM host and adopts the
// package's internal core stylesheet. Ringi only needs host-level CSS variable
// overrides in `src/styles.css` plus these shared runtime options.
export const pierreDiffOptions: FileDiffOptions<unknown> = {
  diffIndicators: "bars",
  diffStyle: "split",
  expandUnchanged: true,
  hunkSeparators: "line-info",
  lineDiffType: "word",
  overflow: "scroll",
  theme: "pierre-dark",
  themeType: "dark",
};
