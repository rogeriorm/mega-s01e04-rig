import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(
    join(dir, '2026-01-01.jsonl'),
    [
      line('2026-01-01T01:00:00+01:00', 'zeta', 'ok', 'ana'),
      line('2026-01-01T01:05:00+01:00', 'alpha', 'retry', 'bo'),
      line('2026-01-01T01:06:00+01:00', 'alpha', 'fail', 'bo', 'boom'),
    ].join('\n') + '\n',
  );
  writeFileSync(join(dir, '2026-01-02.jsonl'), '');
  writeFileSync(
    join(dir, '2026-01-03.jsonl'),
    [line('2026-01-03T02:00:00+01:00', 'alpha', 'ok', null), 'not json {'].join('\n') + '\n',
  );
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('GET /digest/:night', () => {
  it('renders the rows sorted by job', async () => {
    const res = await app.request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html.indexOf('alpha')).toBeGreaterThan(-1);
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
  });

  it('404 for a night with no file', async () => {
    expect((await app.request('/digest/2026-01-09')).status).toBe(404);
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request('/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('survives a bad line', async () => {
    const res = await app.request('/digest/2026-01-03');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('alpha');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the rows as JSON, sorted by job', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    const night = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(night.night).toBe('2026-01-01');
    expect(night.rows.map((r) => r.job)).toEqual(['alpha', 'zeta']);
    expect(night.rows[0]).toMatchObject({ runs: 2, retries: 1, lastStatus: 'fail', lastError: 'boom' });
  });

  it('page and JSON list the same jobs in the same order', async () => {
    const html = await (await app.request('/digest/2026-01-01')).text();
    const night = (await (await app.request('/api/digest/2026-01-01')).json()) as Night;
    const at = night.rows.map((r) => html.indexOf(r.job));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('404 for a night with no file', async () => {
    expect((await app.request('/api/digest/2026-01-09')).status).toBe(404);
  });

  it('empty night has no rows', async () => {
    const night = (await (await app.request('/api/digest/2026-01-02')).json()) as Night;
    expect(night.rows).toEqual([]);
  });

  it('counts a bad line without throwing', async () => {
    const res = await app.request('/api/digest/2026-01-03');
    const night = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(night.badLines).toBe(1);
    expect(night.rows).toHaveLength(1);
  });
});
