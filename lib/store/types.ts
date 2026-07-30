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

  /**
   * Homepage content overrides, as a flat map of dot path to value.
   *
   * Where this actually lives is the driver's business. DynamoDB keeps it as a
   * single reserved row in the events table rather than a table of its own,
   * which avoids another environment variable: every new variable also has to
   * be added to the allow-list in amplify.yml, and forgetting that has already
   * produced one outage where the site deployed green and failed every write.
   */
  getContent(): Promise<Record<string, unknown> | null>;
  putContent(overrides: Record<string, unknown>): Promise<void>;
};
