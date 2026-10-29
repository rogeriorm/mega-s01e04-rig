import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunRecord, RunStatus } from './types.js';

// Plan morning-digest § 1. The log is appended in order, so "first" and "last" are file order:
// comparing `at` strings across offsets would be wrong, and converting them to UTC is not ours to do.

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

// One line → a RunRecord, or null if it doesn't parse or doesn't have the shape.
export function parseLine(line: string): RunRecord | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const { at, job, status, owner, error } = o;
  if (typeof at !== 'string' || at === '') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (typeof status !== 'string' || !STATUSES.includes(status as RunStatus)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const r: RunRecord = { at, job, status: status as RunStatus, owner: owner ?? null };
  if (error !== undefined) r.error = error;
  return r;
}

// Text of one night → its rows. Blank lines are skipped; anything else that doesn't parse is a bad line.
export function digest(night: string, text: string): Night {
  const byJob = new Map<string, DigestRow>();
  const counts: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const r = parseLine(line);
    if (!r) {
      badLines++;
      continue;
    }
    counts[r.status]++;
    const row = byJob.get(r.job);
    if (!row) {
      byJob.set(r.job, {
        job: r.job,
        owner: r.owner,
        runs: 1,
        retries: r.status === 'retry' ? 1 : 0,
        lastStatus: r.status,
        lastError: r.error ?? null,
        firstAt: r.at,
        lastAt: r.at,
      });
      continue;
    }
    row.owner = r.owner;
    row.runs++;
    if (r.status === 'retry') row.retries++;
    row.lastStatus = r.status;
    row.lastError = r.error ?? null;
    row.lastAt = r.at;
  }

  // Code-unit order, not localeCompare: the page and the JSON must sort the same on any machine.
  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, counts, badLines };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  return digest(night, text);
};
