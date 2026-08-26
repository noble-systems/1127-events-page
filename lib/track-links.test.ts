import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, test } from "node:test";

// The local JSON driver, same load-bearing chdir as the other store tests.
process.chdir(mkdtempSync(path.join(tmpdir(), "1127-track-")));

const {
  bumpTrackTap,
  createTrackLink,
  deleteTrackLink,
  getTrackLink,
  isValidTrackId,
  listTrackLinks,
  newTrackId,
  renameTrackLink,
  trackLinkStats,
} = await import("./track-links.ts");
const { createOrder } = await import("./tickets-store.ts");

async function reset() {
  await rm(path.join(process.cwd(), ".data"), { recursive: true, force: true });
}

const order = (ref: string, over: Record<string, unknown> = {}) => ({
  ref,
  status: "paid" as const,
  eventId: "mirage",
  tierId: "ga",
  eventName: "Mirage",
  tierName: "GA",
  quantity: 2,
  amountCents: 5000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

describe("tracking links", () => {
  beforeEach(reset);

  test("ids are obscure, valid, and never collide with labels", () => {
    const id = newTrackId();
    assert.equal(id.length, 10);
    assert.equal(isValidTrackId(id), true);
    assert.equal(isValidTrackId("IG-STORY"), false);
    assert.equal(isValidTrackId(""), false);
  });

  test("create, tap, rename, delete round trip", async () => {
    const link = await createTrackLink("IG story, Aug 30");
    assert.equal(link.taps, 0);

    await bumpTrackTap(link.id);
    await bumpTrackTap(link.id);
    assert.equal((await getTrackLink(link.id))?.taps, 2);

    await renameTrackLink(link.id, "IG bio");
    assert.equal((await getTrackLink(link.id))?.label, "IG bio");

    await deleteTrackLink(link.id);
    assert.equal(await getTrackLink(link.id), null);
    assert.equal((await listTrackLinks()).length, 0);
  });

  test("a tap on an unknown id is a quiet no-op", async () => {
    await bumpTrackTap("zzzzzzzzzz");
    assert.equal((await listTrackLinks()).length, 0);
  });

  test("stats count paid non-comp orders carrying the id, nothing else", async () => {
    const link = await createTrackLink("story");
    await createOrder(order("s1", { src: link.id }));
    await createOrder(order("s2", { src: link.id, quantity: 1, amountCents: 2500 }));
    await createOrder(order("s3", { src: link.id, status: "pending" }));
    await createOrder(order("s4", { src: link.id, comp: true, amountCents: 0 }));
    await createOrder(order("s5"));

    const { listAllOrders } = await import("./tickets-store.ts");
    const [row] = trackLinkStats([link], await listAllOrders());
    assert.equal(row.orders, 2, "pending and comp orders count for nothing");
    assert.equal(row.tickets, 3);
    assert.equal(row.grossCents, 7500);
  });

  test("the src survives the order store round trip", async () => {
    const link = await createTrackLink("bio");
    await createOrder(order("rt", { src: link.id }));
    const { getOrder } = await import("./tickets-store.ts");
    assert.equal((await getOrder("rt"))?.src, link.id);
  });
});
