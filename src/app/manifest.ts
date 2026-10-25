import type { MetadataRoute } from "next";

/**
 * Lets the app be added to a phone's home screen and open full screen like an
 * app. There is deliberately no service worker: nothing from the health
 * records is cached on the device, so the app needs a connection.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rocha Health",
    short_name: "Rocha Health",
    description: "Private family health records.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f4f1",
    theme_color: "#1c5cab",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
