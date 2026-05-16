"use client";

import { Download } from "lucide-react";

interface Props {
  data: Record<string, unknown>;
}

export function DataTable({ data }: Props) {
  const title = String(data.title ?? "Data");
  const columns = (data.columns as string[]) ?? [];
  const rows = (data.rows as unknown[][]) ?? [];

  function downloadCSV() {
    const csv = [columns.join(","), ...rows.map((r) => r.map(String).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!columns.length) {
    return <p className="text-xs text-zinc-500 italic">Empty table</p>;
  }

  return (
    <div className="my-3 border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm max-w-3xl animate-slide-up">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{title}</h4>
        <button
          onClick={downloadCSV}
          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-zinc-500 dark:text-zinc-400 uppercase border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/30">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-4 py-2.5 font-semibold whitespace-nowrap">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300">
                    {String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/20">
        <p className="text-xs text-zinc-400">{rows.length} row{rows.length !== 1 ? "s" : ""}</p>
      </div>
    </div>
  );
}
