/* Gemini-Schicht mit nachgebautem fetch: Anfrageaufbau, Antwort, Fehler. Kein echter Aufruf. */
import { describe, expect, it } from 'vitest';
import { anbieterAus, claude, claudeAntwort, gemini, geminiAntwort, KiFehler } from './anbieter';
import { preisAus } from './kosten';

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

  it('404 → Modell nicht nutzbar, mit Googles Fehlertext als Detail', async () => {
    const f = (async () => new Response(JSON.stringify({ error: { status: 'NOT_FOUND', message: 'models/x is not found' } }), { status: 404 })) as typeof fetch;
    await expect(gemini('k', 'x', f).auslesen('p', [])).rejects.toMatchObject({ code: 'modell', detail: 'NOT_FOUND: models/x is not found' });
  });

  it('429 → Kontingent, andere Fehler → nicht erreichbar', async () => {
    const mit = (status: number) => (async () => new Response('x', { status })) as typeof fetch;
    await expect(gemini('k', 'm', mit(429)).auslesen('p', [])).rejects.toMatchObject({ code: 'kontingent' });
    await expect(gemini('k', 'm', mit(500)).auslesen('p', [])).rejects.toMatchObject({ code: 'http_500' });
    await expect(gemini('k', 'm', mit(503)).auslesen('p', [])).rejects.toMatchObject({ code: 'http_503', message: expect.stringContaining('überlastet') });
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

describe('Claude', () => {
  const antwort = (text: string, extra: Record<string, unknown> = {}) => ({
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'end_turn', stop_sequence: null,
    content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text }],
    usage: { input_tokens: 1000, output_tokens: 250, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, ...extra,
  });
  const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } });

  it('Anfrage: Bilder vor dem Text, Modell, Ausweichen bei Ablehnung; Schlüssel nur im Header', async () => {
    let url = '', init: RequestInit | undefined;
    const f = (async (u: string | URL | Request, i?: RequestInit) => { url = String(u); init = i; return json(antwort('{"ok":true}')); }) as typeof fetch;
    const r = await claude('GEHEIM', 'claude-sonnet-5-5', { abrufen: f, maxRetries: 0 }).auslesen('Bitte auslesen', [{ mime: 'image/jpeg', base64: 'AAAA' }]);
    expect(r).toEqual({ text: '{"ok":true}', ein: 1000, aus: 250, denken: 0 });
    expect(url).toContain('/v1/messages');
    expect(url).not.toContain('GEHEIM');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer GEHEIM'); // SDK 1.x: Schlüssel als Bearer-Header
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.fallbacks).toBe('default');
    expect(body.content).toBeUndefined();
    expect(body.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
    expect(body.messages[0].content[1].text).toContain('Bitte auslesen');
    expect(body.messages[0].content[1].text).toContain('ausschließlich mit dem JSON-Objekt');
  });

  it('Freitext-Antwort ohne JSON-Hinweis; Ablehnung, leere und abgeschnittene Antwort werden zu Fehlern', async () => {
    let body: { messages: { content: { text?: string }[] }[] } | undefined;
    const f = (async (_u: unknown, i?: RequestInit) => { body = JSON.parse(String(i?.body)); return json(antwort('Hallo')); }) as typeof fetch;
    expect((await claude('k', 'm', { abrufen: f, maxRetries: 0 }).auslesen('Frage', [], { json: false })).text).toBe('Hallo');
    expect(body!.messages[0].content[0].text).toBe('Frage');
    expect(() => claudeAntwort(antwort('x', { stop_reason: 'refusal' }) as never)).toThrow('abgelehnt');
    expect(() => claudeAntwort(antwort('', {}) as never)).toThrow('keine Antwort');
    expect(() => claudeAntwort(antwort('{"a":', { stop_reason: 'max_tokens' }) as never)).toThrow('abgeschnitten');
  });

  it('Fehler: 529 überlastet, 401 Schlüssel, 404 Modell, 429 Kontingent', async () => {
    const mit = (status: number) => (async () => json({ type: 'error', error: { type: 'x', message: 'technisch' } }, status)) as typeof fetch;
    const c = (s: number) => claude('k', 'm', { abrufen: mit(s), maxRetries: 0 }).auslesen('p', []);
    await expect(c(529)).rejects.toMatchObject({ code: 'http_529', message: expect.stringContaining('überlastet') });
    await expect(c(401)).rejects.toMatchObject({ code: 'schluessel' });
    await expect(c(404)).rejects.toMatchObject({ code: 'modell' });
    await expect(c(429)).rejects.toMatchObject({ code: 'kontingent' });
  });

  it('wiederholt bei Überlastung selbst und hat dann Erfolg', async () => {
    let n = 0;
    const f = (async () => (++n === 1 ? json({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 529) : json(antwort('{}')))) as typeof fetch;
    const r = await claude('k', 'm', { abrufen: f, maxRetries: 2 }).auslesen('p', []);
    expect(r.text).toBe('{}');
    expect(n).toBe(2);
  });

  it('Umschalten per KI_ANBIETER; Preise für Claude', () => {
    expect(anbieterAus({ KI_ANBIETER: 'claude', GEMINI_API_KEY: 'g' })).toBeNull();
    const a = anbieterAus({ KI_ANBIETER: 'claude', ANTHROPIC_API_KEY: 'k' });
    expect([a?.name, a?.modell]).toEqual(['claude', 'claude-sonnet-5-5']);
    expect(anbieterAus({ KI_ANBIETER: 'claude', ANTHROPIC_API_KEY: 'k', CLAUDE_MODELL: 'claude-haiku-5-5' })?.modell).toBe('claude-haiku-5-5');
    expect(preisAus({ KI_ANBIETER: 'claude' })).toEqual({ ein: 2, aus: 10 });
    expect(preisAus({})).toEqual({ ein: 1.5, aus: 9 });
  });
});
