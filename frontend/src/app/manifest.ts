import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WaffleWeather",
    short_name: "Waffle",
    description: "Personal weather station dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#1a1714",
    theme_color: "#1a1714",
    icons: [
      {
        src: "/manifest-icon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/manifest-icon/512",
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
        icons: [{ src: "/manifest-icon/96", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "VFD Console",
        short_name: "Console",
        url: "/console",
        icons: [{ src: "/manifest-icon/96", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Lightning",
        short_name: "Lightning",
        url: "/lightning",
        icons: [{ src: "/manifest-icon/96", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "History",
        short_name: "History",
        url: "/history",
        icons: [{ src: "/manifest-icon/96", sizes: "96x96", type: "image/png" }],
      },
    ],
  };
}
