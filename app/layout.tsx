import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LMR Media | Big 9 Football Live",
  description: "LMR Media Big 9 Conference football scoreboard for broadcast production.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
