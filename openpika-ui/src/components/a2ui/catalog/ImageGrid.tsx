"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { A2UIComponentProps } from "@a2ui/react";
import type { CustomNode } from "@a2ui/web_core/types/types";

export function ImageGrid({ node }: A2UIComponentProps<CustomNode>) {
  const props = node.properties;
  const images = (Array.isArray(props.images) ? props.images : []) as string[];
  const cols = typeof props.columns === "number" ? props.columns : 3;
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (images.length === 0) return null;

  return (
    <>
      <div
        className="grid gap-2 my-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(cols, images.length)}, minmax(0, 1fr))` }}
      >
        {images.map((url, i) => (
          <button
            key={i}
            onClick={() => setLightbox(url)}
            className="aspect-square overflow-hidden rounded-lg border border-zinc-700 hover:border-indigo-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white hover:text-zinc-300"
          >
            <X className="w-6 h-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Full size"
            className="max-w-full max-h-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
