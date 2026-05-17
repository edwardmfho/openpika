"use client";

import { A2UIRenderer } from "@a2ui/react";

interface Props {
  surfaceId: string;
}

export function A2UISurface({ surfaceId }: Props) {
  return (
    <A2UIRenderer
      surfaceId={surfaceId}
      className="my-3"
      fallback={null}
    />
  );
}
