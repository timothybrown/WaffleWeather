import type { Metadata } from "next";
import { Fraunces, Outfit, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/providers/QueryProvider";
import ThemeProvider from "@/providers/ThemeProvider";
import WebSocketProvider from "@/providers/WebSocketProvider";
import UnitsProvider from "@/providers/UnitsProvider";
import Shell from "@/components/layout/Shell";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

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
  description: "Personal weather station dashboard",
  appleWebApp: {
    title: "WaffleWeather",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${outfit.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('ww-theme');var t=s==='light'||s==='dark'?s:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="flex h-full bg-surface text-text font-sans">
        <ServiceWorkerRegistrar />
        <QueryProvider>
          <ThemeProvider>
            <WebSocketProvider>
              <UnitsProvider>
                <Shell>{children}</Shell>
              </UnitsProvider>
            </WebSocketProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
