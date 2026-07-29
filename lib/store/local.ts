import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EventRecord, SubmissionRecord, SubmissionType } from "@/lib/types";
import type { Store } from "./types";

/**
 * Development driver. JSON files under `.data/`.
 *
 * Lets the whole app (including the admin dashboard) run with `npm run dev`
 * before any AWS resources exist. Never used in production: `lib/store/index.ts`
 * only selects this driver when NODE_ENV !== "production".
 */

const DIR = path.join(process.cwd(), ".data");
const EVENTS = path.join(DIR, "events.json");
const SUBMISSIONS = path.join(DIR, "submissions.json");

async function read<T>(file: string): Promise<T[]> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T[];
  } catch {
    return [];
  }
}

async function write<T>(file: string, rows: T[]): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(file, JSON.stringify(rows, null, 2), "utf8");
}

export const localStore: Store = {
  kind: "local",

  async listEvents() {
    return read<EventRecord>(EVENTS);
  },

  async getEvent(id) {
    const rows = await read<EventRecord>(EVENTS);
    return rows.find((row) => row.id === id) ?? null;
  },

  async putEvent(event) {
    const rows = await read<EventRecord>(EVENTS);
    const next = rows.filter((row) => row.id !== event.id);
    next.push(event);
    await write(EVENTS, next);
    return event;
  },

  async deleteEvent(id) {
    const rows = await read<EventRecord>(EVENTS);
    await write(
      EVENTS,
      rows.filter((row) => row.id !== id),
    );
  },

  async putSubmission(submission) {
    const rows = await read<SubmissionRecord>(SUBMISSIONS);
    const next = rows.filter((row) => row.pk !== submission.pk);
    next.push(submission);
    await write(SUBMISSIONS, next);
    return submission;
  },

  async getSubmission(pk) {
    const rows = await read<SubmissionRecord>(SUBMISSIONS);
    return rows.find((row) => row.pk === pk) ?? null;
  },

  async listSubmissions(type?: SubmissionType) {
    const rows = await read<SubmissionRecord>(SUBMISSIONS);
    return rows
      .filter((row) => (type ? row.type === type : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async deleteSubmission(pk) {
    const rows = await read<SubmissionRecord>(SUBMISSIONS);
    await write(
      SUBMISSIONS,
      rows.filter((row) => row.pk !== pk),
    );
  },
};
