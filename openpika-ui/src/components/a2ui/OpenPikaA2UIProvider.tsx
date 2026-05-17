"use client";

import { useEffect, type ReactNode } from "react";
import { A2UIProvider } from "@a2ui/react";
import { registerOpenPikaCatalog } from "./catalog";

interface Props {
  children: ReactNode;
}

export function OpenPikaA2UIProvider({ children }: Props) {
  useEffect(() => {
    registerOpenPikaCatalog();
  }, []);

  return <A2UIProvider>{children}</A2UIProvider>;
}
