import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CSV_HEADER, csvCell, submissionsToCsv } from "./csv.ts";
import type { SubmissionRecord } from "./types.ts";

const base: SubmissionRecord = {
  pk: "rsvp#a@b.co",
  type: "rsvp",
  email: "a@b.co",
  name: "Plain Name",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("csvCell", () => {
  test("leaves ordinary values untouched", () => {
    assert.equal(csvCell("Dana Ruiz"), "Dana Ruiz");
    assert.equal(csvCell(undefined), "");
    assert.equal(csvCell(null), "");
  });

  test("quotes values containing a comma, quote or newline", () => {
    assert.equal(csvCell("Lane, Jo"), '"Lane, Jo"');
    assert.equal(csvCell('He said "hi"'), '"He said ""hi"""');
    assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  });

  test("neutralises formula injection", () => {
    // Excel/Sheets would otherwise execute these.
    assert.equal(csvCell("=1+1"), "'=1+1");
    assert.equal(csvCell("+1234"), "'+1234");
    assert.equal(csvCell("-1+1"), "'-1+1");
    assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(
      csvCell('=HYPERLINK("http://evil","click")'),
      `"'=HYPERLINK(""http://evil"",""click"")"`,
    );
  });

  test("does not mangle a normal negative-looking string", () => {
    // A leading hyphen is still escaped, correctness beats prettiness here.
    assert.equal(csvCell("Smith-Jones"), "Smith-Jones");
  });
});

describe("submissionsToCsv", () => {
  test("starts with a BOM and the header row", () => {
    const csv = submissionsToCsv([]);
    assert.ok(csv.startsWith("﻿"), "expected a UTF-8 BOM for Excel");
    assert.ok(csv.includes(CSV_HEADER.join(",")));
  });

  test("uses CRLF line endings", () => {
    const csv = submissionsToCsv([base]);
    assert.ok(csv.includes("\r\n"));
    assert.equal(csv.split("\r\n").filter(Boolean).length, 2);
  });

  test("keeps columns aligned with the header", () => {
    const csv = submissionsToCsv([
      {
        ...base,
        phone: "480",
        message: "hello",
        role: "DJ",
        status: "contacted",
        notes: "called Tuesday",
      },
    ]);
    const [header, row] = csv.replace("﻿", "").trim().split("\r\n");
    const cols = header.split(",");
    const values = row.split(",");
    assert.equal(cols.length, values.length);
    assert.equal(values[cols.indexOf("Email")], "a@b.co");
    assert.equal(values[cols.indexOf("Message")], "hello");
    assert.equal(values[cols.indexOf("Role")], "DJ");
    assert.equal(values[cols.indexOf("Status")], "contacted");
    assert.equal(values[cols.indexOf("Notes")], "called Tuesday");
  });

  test("round-trips a value containing every troublesome character", () => {
    const nasty = 'Quote " comma , newline \n end';
    const csv = submissionsToCsv([{ ...base, name: nasty }]);
    assert.ok(csv.includes('"Quote "" comma , newline \n end"'));
  });
});

describe("CRM columns", () => {
  test('a record with no status exports as "new"', () => {
    const csv = submissionsToCsv([base]);
    const [header, row] = csv.replace("﻿", "").trim().split("\r\n");
    const cols = header.split(",");
    assert.equal(row.split(",")[cols.indexOf("Status")], "new");
  });

  test("notes survive commas and newlines", () => {
    const notes = "Called, left voicemail.\nTry again Friday.";
    const csv = submissionsToCsv([{ ...base, notes }]);
    assert.ok(csv.includes(`"${notes}"`));
  });
});
