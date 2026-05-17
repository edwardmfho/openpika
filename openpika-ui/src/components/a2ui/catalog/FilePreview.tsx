"use client";

import { FileCode } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import type { A2UIComponentProps } from "@a2ui/react";
import type { CustomNode } from "@a2ui/web_core/types/types";

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    rs: "rust", py: "python", ts: "typescript", tsx: "tsx",
    js: "javascript", jsx: "jsx", json: "json", yaml: "yaml",
    yml: "yaml", toml: "toml", md: "markdown", sh: "bash",
    sql: "sql", html: "html", css: "css",
  };
  return map[ext] ?? "text";
}

export function FilePreview({ node }: A2UIComponentProps<CustomNode>) {
  const props = node.properties;
  const filename = String(props.filename ?? "file");
  const content = String(props.content ?? "");
  const lines = content.split("\n");

  return (
    <div className="rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900 my-2">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-700 bg-zinc-800">
        <FileCode className="w-3 h-3 text-zinc-400" />
        <span className="text-xs text-zinc-400 font-mono">{filename}</span>
      </div>
      <Highlight code={content} language={detectLanguage(filename)} theme={themes.oneDark}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`${className} p-3 text-xs overflow-x-auto leading-5 max-h-96 overflow-y-auto`}
            style={{ ...style, background: "transparent", margin: 0 }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                <span className="inline-block w-6 text-right mr-3 text-zinc-600 select-none">
                  {i + 1}
                </span>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
      {lines.length > 30 && (
        <p className="px-3 pb-2 text-xs text-zinc-500 italic border-t border-zinc-700">
          {lines.length} lines total
        </p>
      )}
    </div>
  );
}
