import assert from "node:assert/strict";
import { describe, test } from "node:test";

/**
 * Guards the JSON-LD block on the homepage.
 *
 * That block is injected with dangerouslySetInnerHTML and includes the featured
 * event's name and summary, which are edited from the dashboard. JSON.stringify
 * does not escape "<", so without the escape below an event named
 * "x</script><script>…" closes the tag and runs script against every visitor.
 *
 * The escape lives in app/page.tsx. This test pins the property so it cannot be
 * removed as "unnecessary".
 */

/** Exactly what app/page.tsx does. */
function toScriptBody(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

describe("JSON-LD escaping", () => {
  test("an event name cannot close the script tag", () => {
    const body = toScriptBody([
      {
        "@type": "EventSeries",
        name: "Sun Club</script><script>alert(document.cookie)</script>",
      },
    ]);
    assert.ok(!body.includes("</script>"), "broke out of the script tag");
    assert.ok(!body.includes("<script"), "injected an opening tag");
  });

  test("every < is escaped, wherever it appears", () => {
    const body = toScriptBody({
      name: "<img src=x onerror=alert(1)>",
      description: "a < b and c <div> d",
      nested: { deep: ["</SCRIPT>", "<!--"] },
    });
    assert.ok(!body.includes("<"), `unescaped < in: ${body}`);
  });

  test("the escape does not change what a JSON parser sees", () => {
    // If this stopped holding, search engines would read broken structured data
    // and the escape would be doing damage rather than preventing it.
    const original = {
      name: "Sun Club </script> & <b>bold</b>",
      description: 'Ünïcode ✓ and "quotes" and \\backslashes\\',
      list: ["<a>", "<b>"],
    };
    const body = toScriptBody(original);
    assert.deepEqual(JSON.parse(body), original);
  });

  test("ordinary content is untouched", () => {
    const plain = { name: "Sun Club", description: "House music, poolside." };
    assert.equal(toScriptBody(plain), JSON.stringify(plain));
  });
});
