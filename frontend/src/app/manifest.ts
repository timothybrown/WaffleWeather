import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WaffleWeather",
    short_name: "WaffleWX",
    description: "Personal weather station dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#1a1714",
    theme_color: "#1a1714",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Observatory",
        short_name: "Home",
        url: "/",
        icons: [{ src: "/icon-96.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "VFD Console",
        short_name: "Console",
        url: "/console",
        icons: [{ src: "/icon-96.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Lightning",
        short_name: "Lightning",
        url: "/lightning",
        icons: [{ src: "/icon-96.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "History",
        short_name: "History",
        url: "/history",
        icons: [{ src: "/icon-96.png", sizes: "96x96", type: "image/png" }],
      },
    ],
  };
}
