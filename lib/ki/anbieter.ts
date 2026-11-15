/* Austauschbare KI-Schicht (nur Server). Start: Google Gemini über die REST-Schnittstelle (generateContent).
   Prompts sind anbieterneutral; ein weiterer Anbieter braucht nur eine neue Umsetzung von KiAnbieter.
   Aufbau von Anfrage/Antwort nach der Gemini-API-Dokumentation [prüfen: nach dem Deploy mit /api/ki/test]. */

export type Bild = { mime: 'image/jpeg'; base64: string };
export type KiErgebnis = { text: string; ein: number; aus: number; denken: number };
export interface KiAnbieter {
  name: string;
  modell: string;
  auslesen(prompt: string, bilder: Bild[]): Promise<KiErgebnis>;
  modelle(): Promise<string[]>;
}

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';

export function geminiAnfrage(prompt: string, bilder: Bild[]) {
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }, ...bilder.map((b) => ({ inlineData: { mimeType: b.mime, data: b.base64 } }))] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
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

export function gemini(schluessel: string, modell: string, abrufen: typeof fetch = fetch): KiAnbieter & { mitModell: (m: string) => KiAnbieter } {
  const kopf = { 'Content-Type': 'application/json', 'x-goog-api-key': schluessel };
  return {
    name: 'gemini',
    modell,
    mitModell: (m: string) => gemini(schluessel, m, abrufen),
    async auslesen(prompt, bilder) {
      const r = await abrufen(`${GEMINI}/models/${encodeURIComponent(modell)}:generateContent`, {
        method: 'POST', headers: kopf, body: JSON.stringify(geminiAnfrage(prompt, bilder)), signal: AbortSignal.timeout(55000),
      });
      if (r.status === 429) throw new KiFehler('kontingent', 'Das Kontingent der KI ist gerade ausgeschöpft. Bitte später erneut versuchen.', await googleFehler(r));
      if (r.status === 404) throw new KiFehler('modell', `Das KI-Modell „${modell}“ ist mit diesem Schlüssel nicht nutzbar. Bitte in Vercel GEMINI_MODELL ändern (Test: /api/ki/test).`, await googleFehler(r));
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

/** Anbieter aus Umgebungsvariablen. Geheimnisse nur aus der Umgebung (Vercel), nie im Code. */
export function anbieterAus(env: Record<string, string | undefined>): KiAnbieter | null {
  const name = env.KI_ANBIETER ?? 'gemini';
  if (name === 'gemini' && env.GEMINI_API_KEY) return gemini(env.GEMINI_API_KEY, env.GEMINI_MODELL || 'gemini-2.5-flash');
  return null;
}
