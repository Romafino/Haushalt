/* Der Service-Role-Schlüssel darf nur im täglichen Lauf verwendet werden (CLAUDE.md). */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WURZEL = join(__dirname, '..', '..');
const dateien = (d: string): string[] => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? dateien(p) : /\.(ts|tsx|js|mjs)$/.test(n) ? [p] : [];
});

describe('Service-Role-Schlüssel', () => {
  it('nur lib/supabase/dienst.ts liest ihn, nur der Cron nutzt dienst.ts', () => {
    const alle = ['app', 'lib', 'components'].flatMap((d) => dateien(join(WURZEL, d))).filter((p) => !p.endsWith('.test.ts'));
    const rel = (p: string) => p.slice(WURZEL.length + 1);
    expect(alle.filter((p) => readFileSync(p, 'utf8').includes('SUPABASE_SERVICE_ROLE_KEY')).map(rel)).toEqual(['lib/supabase/dienst.ts']);
    expect(alle.filter((p) => /supabase\/dienst/.test(readFileSync(p, 'utf8'))).map(rel)).toEqual(['app/api/cron/taeglich/route.ts']);
  });
});
