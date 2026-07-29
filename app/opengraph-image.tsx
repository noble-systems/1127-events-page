import { ImageResponse } from "next/og";

export const alt =
  "1127 Events presents Sun Club, house music under the desert sun";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Social share card, generated at build time so there's no binary asset to
 * keep in sync. Replace with a real photograph by dropping `opengraph-image.jpg`
 * into /app and deleting this file.
 */
export default async function OpengraphImage() {
  return new ImageResponse(
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
          style={{ fontSize: 18, letterSpacing: 5, textTransform: "uppercase" }}
        >
          Events
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <span
          style={{
            fontSize: 20,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#f0d49a",
          }}
        >
          1127 Events Presents
        </span>
        <span
          style={{
            fontSize: 156,
            lineHeight: 1,
            fontWeight: 700,
            letterSpacing: -6,
            marginTop: 18,
          }}
        >
          SUN CLUB
        </span>
        <span
          style={{ fontSize: 38, marginTop: 22, color: "rgba(247,242,233,0.9)" }}
        >
          House music under the desert sun.
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
        <span>Old Town Scottsdale, Arizona</span>
        <span>Dates Announcing Soon</span>
      </div>
    </div>,
    size,
  );
}
