import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { resolveImageSrc } from "./images.ts";

describe("the image funnel actually funnels", () => {
  /**
   * The regression this pins.
   *
   * Media computed resolveImageSrc(src) and then rendered <Image src={src}>,
   * handing next/image the literal "s3:..." reference. The first photograph
   * ever uploaded rendered as a broken image in production, while development
   * never noticed: IMAGES_BASE_URL is unset there, so the resolver returned
   * null and the designed gradient covered for the bug.
   *
   * A source assertion is crude, but the failure was one identifier in JSX and
   * every behavioural test passed while it shipped broken.
   */
  test("Media renders the resolved URL, not the raw reference", () => {
    const media = readFileSync("components/ui/Media.tsx", "utf8");
    assert.match(media, /src=\{resolved\}/, "Image must receive resolved");
    assert.ok(
      !/\{src \? \(/.test(media),
      "the render branch must key on resolved, or a bad ref renders broken instead of falling back",
    );
  });

  test("with a base URL, an s3 ref resolves to a fetchable https URL", () => {
    process.env.NEXT_PUBLIC_IMAGES_BASE_URL = "https://img.example.com";
    try {
      assert.equal(
        resolveImageSrc("s3:events/ibiza-nights/hero.jpg"),
        "https://img.example.com/events/ibiza-nights/hero.jpg",
      );
    } finally {
      delete process.env.NEXT_PUBLIC_IMAGES_BASE_URL;
    }
  });

  test("without a base URL, an s3 ref resolves to null, never to itself", () => {
    delete process.env.NEXT_PUBLIC_IMAGES_BASE_URL;
    delete process.env.IMAGES_BASE_URL;
    const out = resolveImageSrc("s3:events/x/hero.jpg");
    assert.equal(out, null, `returned ${JSON.stringify(out)}`);
  });
});
