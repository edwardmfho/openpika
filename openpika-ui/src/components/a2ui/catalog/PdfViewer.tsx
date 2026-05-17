"use client";

import { FileText, Download, ExternalLink } from "lucide-react";
import type { A2UIComponentProps } from "@a2ui/react";
import type { CustomNode } from "@a2ui/web_core/types/types";

export function PdfViewer({ node }: A2UIComponentProps<CustomNode>) {
  const props = node.properties;
  const url = String(props.url ?? "");
  const filename = String(props.filename ?? "document.pdf");

  if (!url) return null;

  return (
    <div className="my-2 rounded-xl border border-zinc-700 overflow-hidden bg-zinc-900">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border-b border-zinc-700">
        <FileText className="w-4 h-4 text-zinc-400 flex-shrink-0" />
        <span className="text-sm text-zinc-300 font-mono flex-1 truncate">{filename}</span>
        <a
          href={url}
          download={filename}
          className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </a>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Open in new tab"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
      <iframe src={url} title={filename} className="w-full" style={{ height: "500px", border: "none" }} />
    </div>
  );
}
