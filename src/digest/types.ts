// Plan morning-digest § 1. The contract section 2 (page, JSON, board link, route tests) builds
// against; the reader itself is #2, in src/digest/read.ts.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once parsed.
export type RunRecord = {
  at: string; // ISO 8601 with the log's offset, kept as written
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One job's night. Missing data stays null here; views render it as `—`.
export type DigestRow = {
  job: string;
  owner: string | null; // last owner seen for the job; null rows are kept
  runs: number; // lines for this job, any status
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // error of the last line, null if it had none
  firstAt: string; // times keep the log's offset, never converted to UTC
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job, so the page and the JSON agree by construction
  counts: Record<RunStatus, number>; // parsed lines per status, for the board
  badLines: number; // lines that didn't parse; counted, never thrown
};

// null: no runs/<night>.jsonl (or `night` isn't YYYY-MM-DD) → 404.
// An empty file is a Night with no rows → "nothing ran".
export type ReadNight = (runsDir: string, night: string) => Night | null;
