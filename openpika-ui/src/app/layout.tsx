import type { Metadata } from "next";
import "./globals.css";
import { OpenPikaA2UIProvider } from "@/components/a2ui/OpenPikaA2UIProvider";

export const metadata: Metadata = {
  title: "OpenPika — Agent Framework",
  description: "Personal & Enterprise AI Agent Interface",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className="antialiased">
        <OpenPikaA2UIProvider>{children}</OpenPikaA2UIProvider>
      </body>
    </html>
  );
}
