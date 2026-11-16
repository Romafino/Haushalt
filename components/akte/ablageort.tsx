"use client";
/* Ablageort des Originals (z. B. „Ordner Versicherungen, Fach 3“): Freitext ohne sensible Daten, direkt änderbar. */
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { freitextPruefen } from "@/lib/akte/freitext";

export function AblageortFeld({ tabelle, id, haushaltId, wert }: { tabelle: "dokumente" | "vertraege"; id: string; haushaltId: string; wert: string }) {
  const [text, setText] = useState(wert);
  const [gespeichert, setGespeichert] = useState(wert);
  const [meldung, setMeldung] = useState("");
  return (
    <div className="formular">
      <label><span>Ablageort des Originals</span>
        <input value={text} maxLength={200} placeholder="z. B. Ordner Versicherungen, Fach 3 oder Kundenportal" onChange={(e) => { setText(e.target.value); setMeldung(""); }} />
      </label>
      {text !== gespeichert && (
        <button type="button" className="klein" onClick={async () => {
          const f = freitextPruefen(text, "streng");
          if (f) return setMeldung(f);
          const { error } = await supabaseBrowser().from(tabelle).update({ ablageort: text.trim() || null }).eq("id", id).eq("haushalt_id", haushaltId);
          if (error) return setMeldung("Konnte nicht gespeichert werden.");
          setGespeichert(text); setMeldung("Gespeichert.");
        }}>Speichern</button>
      )}
      {meldung && <p className="leise" role="status">{meldung}</p>}
    </div>
  );
}
