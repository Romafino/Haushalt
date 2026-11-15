/* Gemini-Schicht mit nachgebautem fetch: Anfrageaufbau, Antwort, Fehler. Kein echter Aufruf. */
import { describe, expect, it } from 'vitest';
import { anbieterAus, gemini, geminiAntwort, KiFehler } from './anbieter';

describe('Gemini', () => {
  it('Anfrage: Prompt + Bilder, JSON-Antwort, Schlüssel nur im Header', async () => {
    let url = '', init: RequestInit | undefined;
    const f = (async (u: string, i?: RequestInit) => {
      url = u; init = i;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300, thoughtsTokenCount: 50 } }));
    }) as typeof fetch;
    const r = await gemini('GEHEIM', 'gemini-test', f).auslesen('Bitte auslesen', [{ mime: 'image/jpeg', base64: 'AAAA' }]);
    expect(r).toEqual({ text: '{"ok":true}', ein: 1200, aus: 300, denken: 50 });
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    expect(url).not.toContain('GEHEIM');
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('GEHEIM');
    const body = JSON.parse(String(init?.body));
    expect(body.contents[0].parts).toEqual([{ text: 'Bitte auslesen' }, { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }]);
    expect(body.generationConfig).toEqual({ temperature: 0, responseMimeType: 'application/json' });
  });

  it('Denk-Teile werden nicht als Antwort gewertet; blockiert und leer werden zu verständlichen Fehlern', () => {
    expect(geminiAntwort({ candidates: [{ content: { parts: [{ text: 'nachdenken', thought: true }, { text: '{}' }] } }] }).text).toBe('{}');
    expect(() => geminiAntwort({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow(KiFehler);
    expect(() => geminiAntwort({ candidates: [] })).toThrow('keine Antwort');
  });

  it('429 → Kontingent, andere Fehler → nicht erreichbar', async () => {
    const mit = (status: number) => (async () => new Response('x', { status })) as typeof fetch;
    await expect(gemini('k', 'm', mit(429)).auslesen('p', [])).rejects.toMatchObject({ code: 'kontingent' });
    await expect(gemini('k', 'm', mit(500)).auslesen('p', [])).rejects.toMatchObject({ code: 'http_500' });
  });

  it('Modelle: nur solche mit generateContent, ohne Präfix', async () => {
    const f = (async () => new Response(JSON.stringify({ models: [{ name: 'models/a', supportedGenerationMethods: ['generateContent'] }, { name: 'models/b', supportedGenerationMethods: ['embedContent'] }] }))) as typeof fetch;
    expect(await gemini('k', 'm', f).modelle()).toEqual(['a']);
  });

  it('ohne Schlüssel kein Anbieter; Modell einstellbar', () => {
    expect(anbieterAus({})).toBeNull();
    expect(anbieterAus({ GEMINI_API_KEY: 'k', GEMINI_MODELL: 'x' })?.modell).toBe('x');
  });
});
