import type { MetadataRoute } from "next";
import { brand } from "@/content/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: brand.domain,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${brand.domain}/rsvp`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${brand.domain}/opportunities`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${brand.domain}/partner`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${brand.domain}/cookies`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${brand.domain}/privacy`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${brand.domain}/terms`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
