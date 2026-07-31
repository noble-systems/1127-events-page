import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, test } from "node:test";
import {
  eventImageKey,
  isValidImageRef,
  isValidLocalPath,
  isValidS3Key,
  resolveImageSrc,
  s3Key,
} from "./images.ts";

const BASE = "https://1127-events-images-000.s3.us-west-2.amazonaws.com";

describe("isValidS3Key", () => {
  test("accepts grouped photograph keys", () => {
    for (const key of [
      "events/sun-club/hero.jpg",
      "events/sun-club/hero.jpeg",
      "events/sun-club/gallery-01.png",
      "media/room.webp",
      "a.avif",
    ]) {
      assert.equal(isValidS3Key(key), true, `rejected "${key}"`);
    }
  });

  test("refuses keys that try to escape their prefix", () => {
    for (const key of [
      "/events/hero.jpg",
      "events//hero.jpg",
      "events/../secrets.jpg",
      "..",
      "events\\hero.jpg",
      "events/hero.jpg/",
    ]) {
      assert.equal(isValidS3Key(key), false, `accepted "${key}"`);
    }
  });

  test("refuses anything that is not a photograph", () => {
    for (const key of [
      "events/index.html",
      "events/script.js",
      "events/hero",
      "events/hero.txt",
      // SVG can carry script, and these are photographs. Serving one from our
      // own bucket would put it on our origin.
      "events/logo.svg",
    ]) {
      assert.equal(isValidS3Key(key), false, `accepted "${key}"`);
    }
  });

  test("refuses empty and absurdly long keys", () => {
    assert.equal(isValidS3Key(""), false);
    assert.equal(isValidS3Key(`${"a".repeat(300)}.jpg`), false);
  });
});

describe("isValidLocalPath", () => {
  test("accepts a path inside /public", () => {
    assert.equal(isValidLocalPath("/media/sun-club-01.jpg"), true);
  });

  test("refuses a protocol-relative URL", () => {
    // This is the bug this rule exists for: "//evil.example/x.jpg" is not a
    // local file, it is a third-party image on whatever scheme the page used.
    assert.equal(isValidLocalPath("//evil.example/x.jpg"), false);
  });

  test("refuses directory traversal and absolute URLs", () => {
    assert.equal(isValidLocalPath("/media/../../etc/passwd"), false);
    assert.equal(isValidLocalPath("https://evil.example/x.jpg"), false);
    assert.equal(isValidLocalPath("media/x.jpg"), false);
  });
});

describe("isValidImageRef", () => {
  test("empty is allowed: it means no photograph yet", () => {
    assert.equal(isValidImageRef(""), true);
    assert.equal(isValidImageRef("   "), true);
  });

  test("accepts both storage forms", () => {
    assert.equal(isValidImageRef("/media/sun-club-01.jpg"), true);
    assert.equal(isValidImageRef("s3:events/sun-club/hero.jpg"), true);
  });

  test("a bad key is refused even with the s3 prefix", () => {
    assert.equal(isValidImageRef("s3:../../secrets.jpg"), false);
    assert.equal(isValidImageRef("s3:events/index.html"), false);
  });

  test("refuses an arbitrary external host", () => {
    // Nothing may point the site at a third-party image. The s3: form exists so
    // there is never a reason to accept a hostname here.
    for (const ref of [
      "https://evil.example/x.jpg",
      "http://evil.example/x.jpg",
      "//evil.example/x.jpg",
      "s3://evil.example/x.jpg",
    ]) {
      assert.equal(isValidImageRef(ref), false, `accepted "${ref}"`);
    }
  });
});

describe("s3Key", () => {
  test("strips the prefix, and is a no-op otherwise", () => {
    assert.equal(s3Key("s3:events/hero.jpg"), "events/hero.jpg");
    assert.equal(s3Key("/media/hero.jpg"), "/media/hero.jpg");
  });
});

describe("resolveImageSrc", () => {
  const original = {
    pub: process.env.NEXT_PUBLIC_IMAGES_BASE_URL,
    priv: process.env.IMAGES_BASE_URL,
  };

  afterEach(() => {
    if (original.pub === undefined) delete process.env.NEXT_PUBLIC_IMAGES_BASE_URL;
    else process.env.NEXT_PUBLIC_IMAGES_BASE_URL = original.pub;
    if (original.priv === undefined) delete process.env.IMAGES_BASE_URL;
    else process.env.IMAGES_BASE_URL = original.priv;
  });

  test("builds a bucket URL from a key", () => {
    process.env.NEXT_PUBLIC_IMAGES_BASE_URL = BASE;
    assert.equal(
      resolveImageSrc("s3:events/sun-club/hero.jpg"),
      `${BASE}/events/sun-club/hero.jpg`,
    );
  });

  test("tolerates a trailing slash on the base URL", () => {
    process.env.NEXT_PUBLIC_IMAGES_BASE_URL = `${BASE}/`;
    assert.equal(resolveImageSrc("s3:a.jpg"), `${BASE}/a.jpg`);
  });

  test("passes a local path through untouched", () => {
    assert.equal(resolveImageSrc("/media/x.jpg"), "/media/x.jpg");
  });

  test("returns null rather than a broken URL when unconfigured", () => {
    delete process.env.NEXT_PUBLIC_IMAGES_BASE_URL;
    delete process.env.IMAGES_BASE_URL;
    // Null makes the component fall back to its gradient placeholder, which
    // looks deliberate. A half-built URL would render a broken image icon.
    assert.equal(resolveImageSrc("s3:events/hero.jpg"), null);
  });

  test("returns null for empty or hostile input", () => {
    process.env.NEXT_PUBLIC_IMAGES_BASE_URL = BASE;
    for (const ref of [
      null,
      undefined,
      "",
      "  ",
      "https://evil.example/x.jpg",
      "s3:../x.jpg",
    ]) {
      assert.equal(resolveImageSrc(ref as string), null, `for "${ref}"`);
    }
  });
});

describe("eventImageKey", () => {
  test("is stable for an event, so re-uploading replaces the photograph", () => {
    const a = eventImageKey("sun-club", "DSC_0042.jpg");
    const b = eventImageKey("sun-club", "completely-different-name.jpg");
    assert.equal(a, b, "the key must not depend on the uploaded filename");
    assert.equal(a, "events/sun-club/hero.jpg");
  });

  test("keeps the real extension", () => {
    assert.equal(eventImageKey("x", "a.png"), "events/x/hero.png");
    assert.equal(eventImageKey("x", "a.webp"), "events/x/hero.webp");
    assert.equal(eventImageKey("x", "a.avif"), "events/x/hero.avif");
  });

  test("normalises jpeg to jpg so one event cannot have two hero files", () => {
    assert.equal(eventImageKey("x", "a.jpeg"), "events/x/hero.jpg");
  });

  test("sanitises the event id and always produces a valid key", () => {
    const nasty = eventImageKey("../../etc/passwd", "a.jpg");
    assert.equal(nasty.includes(".."), false);
    assert.equal(isValidS3Key(nasty), true);
    assert.equal(isValidS3Key(eventImageKey("", "a.jpg")), true);
  });

  test("falls back to jpg for an unknown extension", () => {
    assert.equal(eventImageKey("x", "a.gif"), "events/x/hero.jpg");
    assert.equal(eventImageKey("x", "noextension"), "events/x/hero.jpg");
  });
});

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
