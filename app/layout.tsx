import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GameForge Compiler",
  description: "Compile any game idea into a structured playable package."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
