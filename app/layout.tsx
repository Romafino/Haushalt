import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SchwaerzlisteAnbieter } from "@/components/schwaerzliste/kontext";

export const metadata: Metadata = {
  title: "Haushalt",
  description: "Private Haushalts-App",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Haushalt", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#16171a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de">
      <body>
        <SchwaerzlisteAnbieter>{children}</SchwaerzlisteAnbieter>
      </body>
    </html>
  );
}
