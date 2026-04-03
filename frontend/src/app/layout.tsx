import type { Metadata } from "next";
import { Fraunces, Outfit, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/providers/QueryProvider";
import WebSocketProvider from "@/providers/WebSocketProvider";
import UnitsProvider from "@/providers/UnitsProvider";
import Shell from "@/components/layout/Shell";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "WaffleWeather",
  description: "Modern weather station dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${outfit.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex h-full bg-surface text-text font-sans">
        <QueryProvider>
          <WebSocketProvider>
            <UnitsProvider>
              <Shell>{children}</Shell>
            </UnitsProvider>
          </WebSocketProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
