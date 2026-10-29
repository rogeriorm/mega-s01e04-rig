import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { digest, parseLine, readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28')!;

  it('reads 5 jobs and counts the 1 bad line', () => {
    expect(night.night).toBe('2026-10-28');
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.badLines).toBe(1);
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('folds each job into one row, times kept with their offset', () => {
    const row = (job: string) => night.rows.find((r) => r.job === job);
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(row('lane/sync')).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: null });
    expect(row('lane/sync')?.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(row('lane/sync')?.lastAt).toBe('2026-10-29T05:00:04+01:00');
    expect(row('notes/backup')).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a job whose owner is null', () => {
    expect(night.rows.find((r) => r.job === 'digest/render')).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok' });
  });
});

describe('readNight edges', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  writeFileSync(join(dir, '2026-01-01.jsonl'), '');

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-01-02')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    expect(readNight(dir, '../2026-01-01')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    expect(readNight(dir, '2026-01-01')).toEqual({
      night: '2026-01-01',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });
});

describe('digest', () => {
  it('counts lines without the shape as bad, skips blank lines', () => {
    const text = [
      '{"at":"t1","job":"a","status":"ok","owner":"x"}',
      '',
      '{"at":"t2","job":"a","status":"done","owner":"x"}',
      '{"job":"a","status":"ok","owner":"x"}',
      '[1,2]',
      'not json',
      '{"at":"t3","job":"a","status":"retry","owner":null,"error":"boom"}\r',
    ].join('\n');
    const n = digest('2026-01-01', text);
    expect(n.badLines).toBe(4);
    expect(n.rows).toEqual([
      { job: 'a', owner: null, runs: 2, retries: 1, lastStatus: 'retry', lastError: 'boom', firstAt: 't1', lastAt: 't3' },
    ]);
  });

  it('parseLine rejects a non-string error or owner', () => {
    expect(parseLine('{"at":"t","job":"a","status":"ok","owner":1}')).toBeNull();
    expect(parseLine('{"at":"t","job":"a","status":"ok","owner":"x","error":42}')).toBeNull();
  });
});
