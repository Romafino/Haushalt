/* Kosten und Limit. Preise je 1 Mio. Tokens in USD; gerechnet wird vorsichtig 1 USD = 1 EUR (überschätzt eher).
   Preise können sich ändern [prüfen]: per Umgebungsvariable KI_PREIS_EIN / KI_PREIS_AUS überschreibbar. Reines Modul. */

export type Preis = { ein: number; aus: number };

/** Vorsichtige Standardpreise (eher hoch angesetzt), falls nichts eingestellt ist. */
export const STANDARD_PREIS: Preis = { ein: 1.5, aus: 9 };

export function preisAus(env: Record<string, string | undefined>): Preis {
  const ein = Number(env.KI_PREIS_EIN), aus = Number(env.KI_PREIS_AUS);
  return { ein: Number.isFinite(ein) && ein > 0 ? ein : STANDARD_PREIS.ein, aus: Number.isFinite(aus) && aus > 0 ? aus : STANDARD_PREIS.aus };
}

/** Kosten in Cent (4 Nachkommastellen). Denk-Tokens zählen wie Ausgabe. */
export function kostenCent(t: { ein: number; aus: number; denken?: number }, p: Preis): number {
  const usd = (t.ein * p.ein + (t.aus + (t.denken ?? 0)) * p.aus) / 1_000_000;
  return Math.round(usd * 100 * 10000) / 10000;
}

export type Limitstand = { verbrauchtCent: number; limitCent: number; gesperrt: boolean; warnung: boolean };

export function limitstand(verbrauchtCent: number, einst: Record<string, unknown>): Limitstand {
  const limitEuro = Number(einst.kiLimitEuro) > 0 ? Number(einst.kiLimitEuro) : 10;
  const warnProzent = Number(einst.kiWarnungProzent) > 0 ? Number(einst.kiWarnungProzent) : 80;
  const limitCent = limitEuro * 100;
  return { verbrauchtCent, limitCent, gesperrt: verbrauchtCent >= limitCent, warnung: verbrauchtCent >= (limitCent * warnProzent) / 100 };
}

/** Erster Tag des laufenden Monats (UTC) als ISO-Zeitpunkt, für die Monatssumme. */
export const monatsbeginn = (jetzt = new Date()) => new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), 1)).toISOString();
