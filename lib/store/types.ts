import type { EventRecord, SubmissionRecord, SubmissionType } from "@/lib/types";

export type Store = {
  kind: "dynamodb" | "local";
  listEvents(): Promise<EventRecord[]>;
  getEvent(id: string): Promise<EventRecord | null>;
  putEvent(event: EventRecord): Promise<EventRecord>;
  deleteEvent(id: string): Promise<void>;
  putSubmission(submission: SubmissionRecord): Promise<SubmissionRecord>;
  getSubmission(pk: string): Promise<SubmissionRecord | null>;
  listSubmissions(type?: SubmissionType): Promise<SubmissionRecord[]>;
  deleteSubmission(pk: string): Promise<void>;
};
