"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ladeAkte } from "@/lib/akte/laden";
import { opsUebersetzen } from "@/lib/akte/ops";
import { opsAnwenden } from "@/lib/akte/useAkte";
import * as R from "@/lib/regeln";
import type { Akte } from "@/lib/akte/abbilden";
import { Uebersicht } from "@/components/uebersicht";

type Haushalt = { id: string; name: string };
export default function Start() {
  const router = useRouter();
  const [haushalte, setHaushalte] = useState<Haushalt[] | null>(null);
  const [akte, setAkte] = useState<Akte | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");
  const [nachgetragen, setNachgetragen] = useState<string[]>([]);
  const wartungGelaufen = useRef(false);

  const laden = useCallback(async () => {
    const sb = supabaseBrowser();
    const { data, error } = await sb.from("haushalte").select("id, name").is("verworfen_am", null).order("erstellt_am");
    if (error) return setFehler("Daten konnten nicht geladen werden.");
    setHaushalte(data ?? []);
    if (data?.length) {
      try {
        let S = await ladeAkte(sb, data[0].id);
        // Täglicher Lauf beim Öffnen (wie im Altbestand): Vertragsende eintragen, verpasste Fristen fortschreiben.
        // Feste Schlüssel verhindern Doppel; läuft je Seitenaufruf höchstens einmal.
        if (!wartungGelaufen.current) {
          wartungGelaufen.current = true;
          const ops = R.wartung(S, R.heute());
          if (ops.length) {
            await opsAnwenden(data[0].id, opsUebersetzen(ops, S));
            setNachgetragen(ops.filter((o: { col: string }) => o.col === "ereignisse").map((o: { data: { text: string } }) => o.data.text));
            S = await ladeAkte(sb, data[0].id);
          }
        }
        setAkte(S);
      } catch {
        setFehler("Die Akte konnte nicht geladen werden.");
      }
    }
  }, []);

  useEffect(() => {
    // Erstes Laden nach dem Rendern; laden() setzt den Zustand erst nach der Antwort.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void laden();
  }, [laden]);

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    const { error } = await supabaseBrowser().rpc("haushalt_anlegen", { p_name: name.trim() });
    if (error) return setFehler("Haushalt konnte nicht angelegt werden.");
    setName("");
    await laden();
  }

  async function hinzufuegen(e: FormEvent, haushaltId: string) {
    e.preventDefault();
    setFehler("");
    setMeldung("");
    const { data, error } = await supabaseBrowser().rpc("mitglied_hinzufuegen", { p_haushalt_id: haushaltId, p_email: email });
    if (error) return setFehler("Mitglied konnte nicht hinzugefügt werden.");
    setMeldung(data ? "Hinzugefügt." : "Zu dieser E-Mail gibt es noch keinen Zugang.");
    if (data) setEmail("");
  }

  async function abmelden() {
    await supabaseBrowser().auth.signOut();
    router.replace("/anmelden");
    router.refresh();
  }

  const h = haushalte?.[0];

  return (
    <main className="seite">
      <div className="zeile">
        <h1>{h ? h.name : "Haushalt"}</h1>
        <button className="zweitrangig" onClick={abmelden}>Abmelden</button>
      </div>

      {haushalte === null && <p className="leise">Wird geladen …</p>}
      {fehler && <p className="fehler" role="alert">{fehler}</p>}

      {haushalte?.length === 0 && (
        <form className="karte" onSubmit={anlegen}>
          <h2>Haushalt anlegen</h2>
          <label>
            Bezeichnung (ohne Familiennamen, z. B. „Zuhause“)
            <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit">Anlegen</button>
        </form>
      )}

      {h && !akte && !fehler && <p className="leise">Akte wird geladen …</p>}
      {nachgetragen.length > 0 && (
        <section className="karte" role="status">
          <h2>Automatisch nachgetragen</h2>
          <ul>{nachgetragen.map((t, i) => <li key={i} className="leise">{t}</li>)}</ul>
        </section>
      )}
      {h && akte && <Uebersicht akte={akte} haushaltId={h.id} onGeaendert={laden} />}

      {h && (
        <details className="karte">
          <summary>Haushalt teilen</summary>
          <form onSubmit={(e) => hinzufuegen(e, h.id)} style={{ display: "grid", gap: "0.75rem" }}>
            <label>
              Weitere Person hinzufügen (E-Mail eines bestehenden Zugangs)
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button type="submit" className="zweitrangig">Hinzufügen</button>
            {meldung && <p className="leise">{meldung}</p>}
          </form>
        </details>
      )}
    </main>
  );
}
