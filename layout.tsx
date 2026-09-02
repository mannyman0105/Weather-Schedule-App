import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Track My Weather",
  description: "See your hourly weather and Google Calendar schedule in one view.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Track My Weather" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
