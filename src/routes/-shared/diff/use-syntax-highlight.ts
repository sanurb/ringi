import { ringiTheme } from '@/lib/shiki-theme';
import { useEffect, useState } from 'react';
import { codeToHtml, type BundledLanguage } from 'shiki';

const languageMap: Record<string, BundledLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.css': 'css',
  '.json': 'json',
  '.md': 'markdown',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.html': 'html',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.sh': 'bash',
  '.bash': 'bash',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.toml': 'toml',
  '.xml': 'xml',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
};

export function detectLanguage(filePath: string): BundledLanguage {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  return languageMap[ext] ?? 'text';
}

interface HighlightResult {
  /** Map from line content to highlighted HTML span */
  lineHtml: Map<string, string>;
  loading: boolean;
}

/**
 * Highlights all unique line contents from a file's diff hunks.
 * Returns a Map from raw content → highlighted HTML.
 * Batches all lines into a single codeToHtml call for performance.
 */
export function useSyntaxHighlight(
  lines: ReadonlyArray<string>,
  language: BundledLanguage,
): HighlightResult {
  const [lineHtml, setLineHtml] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (lines.length === 0) {
      setLoading(false);
      return;
    }

    const uniqueLines = [...new Set(lines)];
    const joined = uniqueLines.join('\n');

    let cancelled = false;

    codeToHtml(joined, {
      lang: language,
      theme: ringiTheme,
    })
      .then((html) => {
        if (cancelled) return;
        // Parse the HTML to extract per-line spans
        // Shiki wraps each line in a .line span inside <code>
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const lineEls = doc.querySelectorAll('.line');
        const result = new Map<string, string>();
        lineEls.forEach((el, i) => {
          if (i < uniqueLines.length) {
            result.set(uniqueLines[i], el.innerHTML);
          }
        });
        setLineHtml(result);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [lines, language]);

  return { lineHtml, loading };
}
