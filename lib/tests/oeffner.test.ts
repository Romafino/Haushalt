/* Öffner ohne App (public/sicherung-oeffnen.html): im echten Browser (Playwright, Chromium) als lokale Datei, ohne Netz.
   Erzeugt eine Sicherung mit dem Modul der App und öffnet sie im Öffner. Erfundene Daten. */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inhaltAus, verschluesselt } from '@/lib/akte/sicherung';

const require = createRequire(import.meta.url);
const pw = (() => { try { return require('playwright'); } catch { return null; } })();
const SEITE = 'file://' + join(__dirname, '..', '..', 'public', 'sicherung-oeffnen.html');

describe.runIf(pw)('Öffner ohne App', () => {
  it('entschlüsselt offline, zeigt Tabellen, falsches Passwort wird erkannt', async () => {
    const inhalt = inhaltAus({ haushalte: [{ id: 'h1', name: 'Zuhause' }], vertraege: [{ id: 'v1', kurzname: 'Hausrat', beitrag: 120 }], firmen: [{ id: 'f1', name: 'Beispiel Versicherung AG' }] }, {}, new Date('2026-11-16T10:00:00Z'));
    const datei = join(mkdtempSync(join(tmpdir(), 'oeffner-')), 'haushalt-sicherung.json');
    writeFileSync(datei, JSON.stringify(await verschluesselt(inhalt, 'vier zufällige Wörter', 1000)));

    const browser = await pw.chromium.launch();
    try {
      const ctx = await browser.newContext({ offline: true });
      const seite = await ctx.newPage();
      const anfragen: string[] = [];
      seite.on('request', (r: { url(): string }) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) anfragen.push(r.url()); });
      await seite.goto(SEITE);
      await seite.setInputFiles('#datei', datei);
      await seite.fill('#passwort', 'falsches Passwort');
      await seite.click('#oeffnen');
      await expect.poll(() => seite.textContent('#fehler')).toContain('Passwort passt nicht');
      await seite.fill('#passwort', 'vier zufällige Wörter');
      await seite.click('#oeffnen');
      await expect.poll(() => seite.textContent('#ansicht')).toContain('Hausrat');
      expect(await seite.textContent('#titel')).toContain('Sicherung vom');
      await seite.selectOption('#tabelle', 'firmen');
      expect(await seite.textContent('#ansicht')).toContain('Beispiel Versicherung AG');
      expect(anfragen).toEqual([]); // nichts ins Netz
    } finally { await browser.close(); }
  }, 30000);
});
