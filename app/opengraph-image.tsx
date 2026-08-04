import { ImageResponse } from "next/og";
import { PRESENTS, brand } from "@/content/site";
import { listPublicEvents } from "@/lib/store";

export const alt = "1127 Events. Curated event concepts, made in Arizona";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Rendered per request, not at build.
 *
 * Two reasons, both learned the hard way. The card used to typeset "SUN CLUB"
 * as a literal, so every link shared to iMessage or social kept announcing a
 * series that had been renamed; the sweep that hunted "Sun Club" missed it
 * because this file shouted in uppercase. And anything here that reads the
 * store must be dynamic, because the Amplify build role cannot reach DynamoDB
 * and a prerender would quietly bake the seed events instead.
 *
 * The name and tagline come from whichever event is featured, exactly like the
 * hero. Nothing on this card is a name written by hand.
 */
export const dynamic = "force-dynamic";

export default async function OpengraphImage() {
  const events = await listPublicEvents().catch(() => []);
  const featured = events.find((event) => event.featured) ?? null;

  const name = featured?.name ?? brand.name;
  const tagline = featured?.tagline?.trim() || brand.shortDescription;
  const location = featured?.location?.trim() || brand.region;
  const date = featured?.date?.trim() || "";

  // A five-letter name can fill the card; a five-word one cannot at the same
  // size. Step down with length rather than letting it clip.
  const nameSize = name.length <= 10 ? 150 : name.length <= 17 ? 108 : 78;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "linear-gradient(170deg, #07142f 0%, #10265c 34%, #3b4270 55%, #8b6357 74%, #c08a55 90%, #e0a63c 100%)",
          color: "#f7f2e9",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>
            1127
          </span>
          <span
            style={{
              width: 1,
              height: 26,
              background: "rgba(247,242,233,0.45)",
            }}
          />
          <span
            style={{
              fontSize: 18,
              letterSpacing: 5,
              textTransform: "uppercase",
            }}
          >
            Events
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {featured ? (
            <span
              style={{
                fontSize: 20,
                letterSpacing: 6,
                textTransform: "uppercase",
                color: "#f0d49a",
              }}
            >
              {PRESENTS}
            </span>
          ) : null}
          <span
            style={{
              fontSize: nameSize,
              lineHeight: 1,
              fontWeight: 700,
              letterSpacing: -3,
              marginTop: 18,
              textTransform: "uppercase",
            }}
          >
            {name}
          </span>
          <span
            style={{
              fontSize: 38,
              marginTop: 22,
              color: "rgba(247,242,233,0.9)",
            }}
          >
            {tagline}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(247,242,233,0.25)",
            paddingTop: 26,
            fontSize: 20,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "rgba(247,242,233,0.8)",
          }}
        >
          <span>{location}</span>
          <span>{date}</span>
        </div>
      </div>
    ),
    size,
  );
}
