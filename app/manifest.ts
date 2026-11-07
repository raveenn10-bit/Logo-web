import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LOGOVA AI Logo Builder",
    short_name: "LOGOVA",
    description: "Professional editable AI logo and brand identity builder.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f6f0",
    theme_color: "#ff7a00",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
