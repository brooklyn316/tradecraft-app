import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tradecraft — Stock Trading Game",
  description: "Trade real stocks with fake money. Compete solo, with friends, or against a bot.",
  icons: {
    icon: [
      { url: "/favicon.png",    sizes: "32x32",  type: "image/png" },
      { url: "/favicon-64.png", sizes: "64x64",  type: "image/png" },
    ],
    apple: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  openGraph: {
    title: "Tradecraft — Stock Trading Game",
    description: "Trade real stocks with fake money. Compete solo, with friends, or against a bot.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tradecraft — Stock Trading Game",
    description: "Trade real stocks with fake money. Compete solo, with friends, or against a bot.",
    images: ["/og-image.png"],
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111827",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
