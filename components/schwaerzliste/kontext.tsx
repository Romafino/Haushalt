"use client";
/* Schwärzliste im Browser: entsperrte Liste nur im Speicher dieser Seite. Auf Wunsch wird der (nicht auslesbare)
   Schlüssel auf diesem Gerät in IndexedDB gemerkt, nie das Passwort. Der Server sieht nur den verschlüsselten Block. */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { boxAnlegen, boxOeffnen, boxSchreiben, mitSchluessel, type Box, type ListenEintrag } from "@/lib/schwaerzen/liste";
import { tresorAlsListe, tresorOeffnen, tresorVerschluesseln, type Tresor, type TresorBox } from "@/lib/schwaerzen/tresor";

type Zustand = "unbekannt" | "laden" | "keine" | "gesperrt" | "offen" | "fehler";
type Kontext = {
  zustand: Zustand;
  /** Zum Schwärzen und Prüfen: Schwärzliste plus Nummern aus dem Tresor (als „[Nummer]“). */
  liste: ListenEintrag[];
  /** Nur die Einträge der Schwärzliste (zum Bearbeiten). */
  eigeneListe: ListenEintrag[];
  /** Nummern-Tresor (gleicher Schlüssel wie die Schwärzliste), nur entsperrt gefüllt. */
  nummern: Tresor;
  nummernSpeichern: (t: Tresor) => Promise<string | null>;
  pruefen: () => Promise<void>;
  entsperren: (passwort: string, merken: boolean) => Promise<string | null>;
  anlegen: (passwort: string, liste: ListenEintrag[], merken: boolean) => Promise<string | null>;
  speichern: (liste: ListenEintrag[]) => Promise<string | null>;
  sperren: (vergessen: boolean) => Promise<void>;
};

const K = createContext<Kontext | null>(null);
export const useSchwaerzliste = () => {
  const k = useContext(K);
  if (!k) throw new Error("SchwaerzlisteAnbieter fehlt");
  return k;
};

/* ---------- Schlüssel auf diesem Gerät merken (IndexedDB, CryptoKey nicht auslesbar) ---------- */
const idb = () => new Promise<IDBDatabase>((ok, no) => {
  const r = indexedDB.open("haushalt", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("k");
  r.onsuccess = () => ok(r.result);
  r.onerror = () => no(r.error);
});
async function keyHolen(haushaltId: string, salz: string): Promise<CryptoKey | null> {
  try {
    const d = await idb();
    return await new Promise((ok) => {
      const t = d.transaction("k").objectStore("k").get("liste_" + haushaltId);
      t.onsuccess = () => ok(t.result && t.result.salz === salz ? t.result.key : null);
      t.onerror = () => ok(null);
    });
  } catch { return null; }
}
async function keyMerken(haushaltId: string, key: CryptoKey, salz: string) {
  try {
    const d = await idb();
    await new Promise((ok) => { const t = d.transaction("k", "readwrite"); t.objectStore("k").put({ key, salz }, "liste_" + haushaltId); t.oncomplete = ok; t.onerror = ok; });
  } catch { /* ohne Merken weiter */ }
}
async function keyVergessen(haushaltId: string) {
  try { const d = await idb(); d.transaction("k", "readwrite").objectStore("k").delete("liste_" + haushaltId); } catch { /* nichts gemerkt */ }
}

export function SchwaerzlisteAnbieter({ children }: { children: ReactNode }) {
  const [zustand, setZustand] = useState<Zustand>("unbekannt");
  const [liste, setListe] = useState<ListenEintrag[]>([]);
  const [nummern, setNummern] = useState<Tresor>({});
  const geheim = useRef<{ haushaltId: string; box: Box | null; key: CryptoKey | null }>({ haushaltId: "", box: null, key: null });

  /** Tresor mit dem Schlüssel der Schwärzliste öffnen; fehlt er, ist er leer. */
  const tresorLaden = useCallback(async (key: CryptoKey) => {
    const r = await supabaseBrowser().from("nummern_tresor").select("v, iv, daten").eq("haushalt_id", geheim.current.haushaltId).maybeSingle();
    try { setNummern(r.data ? await tresorOeffnen(key, r.data as TresorBox) : {}); } catch { setNummern({}); }
  }, []);

  const pruefen = useCallback(async () => {
    setZustand("laden");
    const sb = supabaseBrowser();
    const h = await sb.from("haushalte").select("id").is("verworfen_am", null).order("erstellt_am").limit(1);
    if (h.error || !h.data?.length) return setZustand("fehler");
    const haushaltId = h.data[0].id as string;
    const r = await sb.from("schwaerzliste").select("v, salz, iter, iv, daten").eq("haushalt_id", haushaltId).maybeSingle();
    if (r.error) return setZustand("fehler");
    const box = (r.data as Box | null) ?? null;
    geheim.current = { haushaltId, box, key: geheim.current.haushaltId === haushaltId && geheim.current.box?.salz === box?.salz ? geheim.current.key : null };
    if (!box) { setListe([]); return setZustand("keine"); }
    const key = geheim.current.key ?? (await keyHolen(haushaltId, box.salz));
    if (key) {
      try { setListe(await mitSchluessel(key, box)); geheim.current.key = key; await tresorLaden(key); return setZustand("offen"); } catch { /* anderes Passwort gesetzt */ }
    }
    setListe([]); setNummern({});
    setZustand("gesperrt");
  }, [tresorLaden]);

  const schreiben = useCallback(async (box: Box) => {
    const { error } = await supabaseBrowser().from("schwaerzliste").upsert({ haushalt_id: geheim.current.haushaltId, ...box }, { onConflict: "haushalt_id" });
    return error ? "Speichern hat nicht geklappt." : null;
  }, []);

  const entsperren = useCallback(async (passwort: string, merken: boolean) => {
    const box = geheim.current.box;
    if (!box) return "Keine Liste vorhanden.";
    try {
      const { key, liste: l } = await boxOeffnen(passwort, box);
      geheim.current.key = key;
      if (merken) await keyMerken(geheim.current.haushaltId, key, box.salz);
      setListe(l);
      await tresorLaden(key);
      setZustand("offen");
      return null;
    } catch (e) {
      return (e as { code?: string })?.code === "passwort" ? "Das Passwort passt nicht." : "Entsperren hat nicht geklappt.";
    }
  }, [tresorLaden]);

  const anlegen = useCallback(async (passwort: string, l: ListenEintrag[], merken: boolean) => {
    const { box, key } = await boxAnlegen(passwort, l);
    const f = await schreiben(box);
    if (f) return f;
    geheim.current = { ...geheim.current, box, key };
    await keyVergessen(geheim.current.haushaltId);
    if (merken) await keyMerken(geheim.current.haushaltId, key, box.salz);
    setListe(l); setNummern({});
    setZustand("offen");
    return null;
  }, [schreiben]);

  const speichern = useCallback(async (l: ListenEintrag[]) => {
    const { box, key } = geheim.current;
    if (!box || !key) return "Liste ist gesperrt.";
    const neu = await boxSchreiben(key, box, l);
    const f = await schreiben(neu);
    if (f) return f;
    geheim.current.box = neu;
    setListe(l);
    return null;
  }, [schreiben]);

  const sperren = useCallback(async (vergessen: boolean) => {
    if (vergessen) await keyVergessen(geheim.current.haushaltId);
    geheim.current.key = null;
    setListe([]); setNummern({});
    setZustand(geheim.current.box ? "gesperrt" : "keine");
  }, []);

  const nummernSpeichern = useCallback(async (t: Tresor) => {
    const { key, haushaltId } = geheim.current;
    if (!key) return "Bitte zuerst die Schwärzliste entsperren.";
    const box = await tresorVerschluesseln(key, t);
    const { error } = await supabaseBrowser().from("nummern_tresor").upsert({ haushalt_id: haushaltId, ...box }, { onConflict: "haushalt_id" });
    if (error) return "Speichern hat nicht geklappt.";
    setNummern(t);
    return null;
  }, []);

  const pruefliste = useMemo(() => [...liste, ...tresorAlsListe(nummern)], [liste, nummern]);
  const wert = useMemo(() => ({ zustand, liste: pruefliste, eigeneListe: liste, nummern, nummernSpeichern, pruefen, entsperren, anlegen, speichern, sperren }),
    [zustand, pruefliste, liste, nummern, nummernSpeichern, pruefen, entsperren, anlegen, speichern, sperren]);
  return <K.Provider value={wert}>{children}</K.Provider>;
}
