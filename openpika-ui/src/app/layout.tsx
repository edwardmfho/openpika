import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenPika — Agent Framework",
  description: "Personal & Enterprise AI Agent Interface",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className="antialiased">{children}</body>
    </html>
  );
}
