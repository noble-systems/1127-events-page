import type { MetadataRoute } from "next";
import { brand } from "@/content/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The wallet, door, personal stats and redirect links are real pages
      // with nothing a search result should ever surface.
      disallow: ["/api/", "/admin", "/door", "/t/", "/me/", "/a/", "/l/", "/unsubscribe"],
    },
    sitemap: `${brand.domain}/sitemap.xml`,
  };
}
