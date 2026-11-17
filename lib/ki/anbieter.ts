/* Austauschbare KI-Schicht (nur Server). Gemini über die REST-Schnittstelle (generateContent), Claude über Anthropics offizielles SDK.
   Umschalten per Umgebungsvariable KI_ANBIETER (gemini | claude).
   Prompts sind anbieterneutral; ein weiterer Anbieter braucht nur eine neue Umsetzung von KiAnbieter.
   Aufbau von Anfrage/Antwort nach der Gemini-API-Dokumentation [prüfen: nach dem Deploy mit /api/ki/test]. */

export type Bild = { mime: 'image/jpeg'; base64: string };
export type KiErgebnis = { text: string; ein: number; aus: number; denken: number };
export interface KiAnbieter {
  name: string;
  modell: string;
  /** json: Antwort als JSON verlangen (Standard: Einstellung des Anbieters, sonst ja). */
  auslesen(prompt: string, bilder: Bild[], opt?: { json?: boolean }): Promise<KiErgebnis>;
  modelle(): Promise<string[]>;
}

import Anthropic from '@anthropic-ai/sdk';

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';

export function geminiAnfrage(prompt: string, bilder: Bild[], json = true) {
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }, ...bilder.map((b) => ({ inlineData: { mimeType: b.mime, data: b.base64 } }))] }],
    generationConfig: json ? { temperature: 0, responseMimeType: 'application/json' } : { temperature: 0 },
  };
}

type GeminiAntwort = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  promptFeedback?: { blockReason?: string };
};

export function geminiAntwort(j: GeminiAntwort): KiErgebnis {
  if (j.promptFeedback?.blockReason) throw new KiFehler('blockiert', 'Die KI hat die Anfrage abgelehnt.');
  const teile = j.candidates?.[0]?.content?.parts ?? [];
  const text = teile.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
  if (!text) throw new KiFehler('leer', 'Die KI hat keine Antwort geliefert.');
  const u = j.usageMetadata ?? {};
  return { text, ein: u.promptTokenCount ?? 0, aus: u.candidatesTokenCount ?? 0, denken: u.thoughtsTokenCount ?? 0 };
}

export class KiFehler extends Error {
  constructor(public code: string, meldung: string, public detail = '') { super(meldung); }
}

/** Fehlertext von Google (technisch, ohne Inhalte), gekürzt. */
async function googleFehler(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { error?: { message?: string; status?: string } };
    return [j.error?.status, j.error?.message].filter(Boolean).join(': ').slice(0, 300);
  } catch { return ''; }
}

export type GeminiOptionen = { timeoutMs?: number; json?: boolean };

export function gemini(schluessel: string, modell: string, abrufen: typeof fetch = fetch, opt: GeminiOptionen = {}): KiAnbieter & { mitModell: (m: string) => KiAnbieter } {
  const kopf = { 'Content-Type': 'application/json', 'x-goog-api-key': schluessel };
  return {
    name: 'gemini',
    modell,
    mitModell: (m: string) => gemini(schluessel, m, abrufen, opt),
    async auslesen(prompt, bilder, o) {
      const r = await abrufen(`${GEMINI}/models/${encodeURIComponent(modell)}:generateContent`, {
        method: 'POST', headers: kopf, body: JSON.stringify(geminiAnfrage(prompt, bilder, o?.json ?? opt.json ?? true)), signal: AbortSignal.timeout(opt.timeoutMs ?? 55000),
      });
      if (r.status === 429) throw new KiFehler('kontingent', 'Das Kontingent der KI ist gerade ausgeschöpft. Bitte später erneut versuchen.', await googleFehler(r));
      if (r.status === 404) throw new KiFehler('modell', `Das KI-Modell „${modell}“ ist mit diesem Schlüssel nicht nutzbar. Bitte in Vercel GEMINI_MODELL ändern (Test: /api/ki/test).`, await googleFehler(r));
      if (r.status === 503) throw new KiFehler('http_503', 'Die KI ist gerade überlastet. Bitte in ein paar Minuten noch einmal versuchen.', await googleFehler(r));
      if (!r.ok) throw new KiFehler('http_' + r.status, 'Die KI ist gerade nicht erreichbar (' + r.status + ').', await googleFehler(r));
      return geminiAntwort(await r.json());
    },
    async modelle() {
      const r = await abrufen(`${GEMINI}/models?pageSize=200`, { headers: kopf, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new KiFehler('http_' + r.status, 'Modelle nicht abrufbar (' + r.status + ').');
      const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      return (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
    },
  };
}

export type ClaudeOptionen = { timeoutMs?: number; abrufen?: typeof fetch; maxRetries?: number };

/** Antwort von Claude → KiErgebnis. Ausgabe-Tokens enthalten das Nachdenken (wird wie Ausgabe berechnet). */
export function claudeAntwort(m: { content: { type: string; text?: string }[]; stop_reason: string | null; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } }): KiErgebnis {
  if (m.stop_reason === 'refusal') throw new KiFehler('blockiert', 'Die KI hat die Anfrage abgelehnt.');
  const text = m.content.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
  if (!text) throw new KiFehler('leer', 'Die KI hat keine Antwort geliefert.');
  if (m.stop_reason === 'max_tokens') throw new KiFehler('zu_lang', 'Die Antwort der KI war zu lang und wurde abgeschnitten. Bitte das Dokument aufteilen.');
  const u = m.usage;
  return { text, ein: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), aus: u.output_tokens, denken: 0 };
}

/** Claude (Anthropic). Das SDK wiederholt bei Überlastung (429/5xx/529) selbst bis zu 2-mal. Bilder als JPEG, Text danach. */
export function claude(schluessel: string, modell: string, opt: ClaudeOptionen = {}): KiAnbieter {
  const client = new Anthropic({ apiKey: schluessel, maxRetries: opt.maxRetries ?? 2, ...(opt.abrufen ? { fetch: opt.abrufen } : {}) });
  return {
    name: 'claude',
    modell,
    async auslesen(prompt, bilder, o) {
      const json = o?.json ?? true;
      try {
        const m = await client.beta.messages.create({
          model: modell,
          max_tokens: 16000,
          output_config: { effort: 'medium' }, // Auslesen/Antworten: medium reicht und bleibt unter dem 60-s-Limit [prüfen]
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default', // lehnt das Modell ab, springt serverseitig ein anderes ein
          messages: [{
            role: 'user',
            content: [
              ...bilder.map((b) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: b.mime, data: b.base64 } })),
              { type: 'text' as const, text: json ? prompt + '\n\nAntworte ausschließlich mit dem JSON-Objekt, ohne Codeblock und ohne Text davor oder danach.' : prompt },
            ],
          }],
        }, { signal: AbortSignal.timeout(opt.timeoutMs ?? 55000) });
        return claudeAntwort(m as unknown as Parameters<typeof claudeAntwort>[0]);
      } catch (e) {
        throw claudeFehler(e, modell);
      }
    },
    async modelle() {
      try {
        const out: string[] = [];
        for await (const m of client.models.list({ limit: 100 })) out.push(m.id);
        return out;
      } catch (e) { throw claudeFehler(e, modell); }
    },
  };
}

/** SDK-Fehler → KiFehler mit verständlicher Meldung (technisches Detail ohne Inhalte). */
export function claudeFehler(e: unknown, modell: string): KiFehler {
  if (e instanceof KiFehler) return e;
  if (e instanceof Anthropic.AuthenticationError) return new KiFehler('schluessel', 'Der Claude-Schlüssel wird nicht akzeptiert. Bitte ANTHROPIC_API_KEY in Vercel prüfen.', e.message.slice(0, 300));
  if (e instanceof Anthropic.NotFoundError) return new KiFehler('modell', `Das KI-Modell „${modell}“ ist mit diesem Schlüssel nicht nutzbar. Bitte in Vercel CLAUDE_MODELL ändern (Test: /api/ki/test).`, e.message.slice(0, 300));
  if (e instanceof Anthropic.RateLimitError) return new KiFehler('kontingent', 'Das Kontingent der KI ist gerade ausgeschöpft. Bitte später erneut versuchen.', e.message.slice(0, 300));
  if (e instanceof Anthropic.APIError) {
    if (e.status === 402 || /credit balance/i.test(e.message)) return new KiFehler('guthaben', 'Das Claude-Guthaben ist aufgebraucht. Bitte in der Anthropic Console aufladen.', e.message.slice(0, 300));
    if (e.status === 529 || e.status === 503) return new KiFehler('http_' + e.status, 'Die KI ist gerade überlastet. Bitte in ein paar Minuten noch einmal versuchen.', e.message.slice(0, 300));
    return new KiFehler('http_' + (e.status ?? 0), 'Die KI ist gerade nicht erreichbar (' + (e.status ?? 'Netz') + ').', e.message.slice(0, 300));
  }
  return new KiFehler('netz', 'Die KI ist gerade nicht erreichbar.', e instanceof Error ? e.name : '');
}

/** Anbieter aus Umgebungsvariablen. Geheimnisse nur aus der Umgebung (Vercel), nie im Code. */
export function anbieterAus(env: Record<string, string | undefined>): KiAnbieter | null {
  const name = env.KI_ANBIETER ?? 'gemini';
  if (name === 'gemini' && env.GEMINI_API_KEY) return gemini(env.GEMINI_API_KEY, env.GEMINI_MODELL || 'gemini-2.5-flash');
  if (name === 'claude' && env.ANTHROPIC_API_KEY) return claude(env.ANTHROPIC_API_KEY, env.CLAUDE_MODELL || 'claude-sonnet-5-5');
  return null;
}
