import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: "https://logo.harshapex.com.lk/sitemap.xml",
    host: "https://logo.harshapex.com.lk",
  };
}
