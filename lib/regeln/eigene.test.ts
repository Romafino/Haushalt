/* Eigene Auswahlwerte je Haushalt (18.11.2026). Erfundene Werte. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import * as R from '@/lib/regeln';
import { dokumentPrompt } from '@/lib/ki/prompt';
import { vorschlagAus } from '@/lib/ki/antwort';
import { auswahl } from '@/components/akte/definitionen';

const eigene = { typ: ['Gutachten'], vertragArt: ['Mitgliedschaft'], dingKat: ['Garten'], rolle: ['Oma'], firmaArt: ['Verein'] };

describe('eigene Listen', () => {
  it('listen(): eingebaute plus eigene, ohne die globalen Listen zu ändern', () => {
    const L = R.listen(eigene);
    expect(L.typ.at(-1)).toBe('Gutachten');
    expect(L.dingKat).toEqual(['Haus', 'Auto', 'Gerät', 'Wertsache', 'Garten']);
    expect(R.ENUM.typ.includes('Gutachten')).toBe(false);
    expect(R.listen(undefined).vertragArt).toEqual(R.BASIS.vertragArt);
  });
  it('ohneEigenes(): nimmt nur eigene Werte heraus', () => {
    const e = R.ohneEigenes({ kiLimitEuro: 10, eigene }, 'typ', 'Gutachten');
    expect([e.eigene.typ, e.kiLimitEuro, e.eigene.vertragArt]).toEqual([[], 10, ['Mitgliedschaft']]);
    expect(R.ohneEigenes({ eigene }, 'typ', 'Police')).toBeNull();
  });
  it('Server: bereinigen akzeptiert eigene Werte des Haushalts, fremde nicht', () => {
    const ids = { vertraege: [], dinge: [], firmen: [] };
    const roh = { dokument: { typ: 'Gutachten' }, vertrag: { art: 'Mitgliedschaft', fuerWen: 'Oma' }, firma: { name: 'Beispiel Verein', art: 'Verein' } };
    const mit = vorschlagAus(roh, ids, eigene) as any;
    expect([mit.dokument.typ, mit.vertrag.art, mit.vertrag.fuerWen, mit.firma.art]).toEqual(['Gutachten', 'Mitgliedschaft', 'Oma', 'Verein']);
    const ohne = vorschlagAus(roh, ids) as any;
    expect([ohne.dokument.typ, ohne.vertrag.art]).toEqual(['Brief', undefined]);
  });
  it('Prompt nennt die eigenen Werte als erlaubt', () => {
    const p = dokumentPrompt([{ nr: 1, text: 'x' }], { firmen: [], vertraege: [], dinge: [] }, '2026-11-18', 0, eigene);
    expect(p).toContain('|Gutachten;');
    expect(p).toContain('|Mitgliedschaft;');
    expect(dokumentPrompt([{ nr: 1, text: 'x' }], { firmen: [], vertraege: [], dinge: [] }, '2026-11-18', 0)).not.toContain('Gutachten');
  });
  it('Auswahl im Formular: aktueller Wert bleibt wählbar, auch wenn er nicht mehr in der Liste steht', () => {
    expect(auswahl(['Haus', 'Auto'], 'Garten').map((o) => o.wert)).toEqual(['Haus', 'Auto', 'Garten']);
    expect(auswahl(['Haus', 'Auto'], 'Haus').map((o) => o.wert)).toEqual(['Haus', 'Auto']);
  });
});
