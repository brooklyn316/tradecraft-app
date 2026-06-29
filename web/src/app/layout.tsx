import type { Metadata, Viewport } from "next";
import "./globals.css";
import PasswordGate from "./PasswordGate";

export const metadata: Metadata = {
  title: "Tradecraft — Stock Trading Game",
  description: "Trade real stocks with fake money. Compete solo, with friends, or against the algorithm.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Tradecraft — Can you beat the algorithm?",
    description: "Real stocks. Virtual money. Real competition. Start with $10,000 and outperform the AI bots.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tradecraft — Can you beat the algorithm?",
    description: "Real stocks. Virtual money. Real competition.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#060a14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body><PasswordGate>{children}</PasswordGate></body>
    </html>
  );
}
