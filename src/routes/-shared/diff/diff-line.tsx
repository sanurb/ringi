import { clsx } from "clsx";
import type { DiffLine as DiffLineType } from "@/api/schemas/diff";

const bgClass: Record<DiffLineType["type"], string> = {
  added: "bg-green-500/10 border-l-2 border-green-500/30",
  removed: "bg-red-500/10 border-l-2 border-red-500/30",
  context: "",
};

const numClass: Record<DiffLineType["type"], string> = {
  added: "text-green-600",
  removed: "text-red-600",
  context: "text-gray-600",
};

const prefixChar: Record<DiffLineType["type"], string> = {
  added: "+",
  removed: "-",
  context: " ",
};

export function DiffLine({ line }: { line: DiffLineType }) {
  return (
    <div className={clsx("flex font-mono text-xs leading-6", bgClass[line.type])}>
      <span
        className={clsx(
          "w-12 shrink-0 select-none text-right pr-2",
          numClass[line.type],
        )}
      >
        {line.oldLineNumber ?? ""}
      </span>
      <span
        className={clsx(
          "w-12 shrink-0 select-none text-right pr-2",
          numClass[line.type],
        )}
      >
        {line.newLineNumber ?? ""}
      </span>
      <span className="shrink-0 w-4 select-none text-center text-gray-500">
        {prefixChar[line.type]}
      </span>
      <pre className="flex-1 whitespace-pre-wrap break-all pl-2 text-gray-300">
        {line.content}
      </pre>
    </div>
  );
}
