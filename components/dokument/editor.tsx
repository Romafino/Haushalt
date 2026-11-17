"use client";
/* Seite prüfen: Balken ansehen, antippen (auswählen/entfernen), im Zeichenmodus neue Balken ziehen.
   Jede Änderung lässt sich zurücknehmen (Verlauf je Seite, im Elternteil gehalten, damit er Seitenwechsel übersteht). */
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { balkenZeichnen, type Seite } from "@/lib/geraet/seiten";
import type { Balken } from "@/lib/schwaerzen/seitentext";
import { geschuetzt, merken, rueckgaengig, wiederholen, type Verlauf } from "@/lib/schwaerzen/verlauf";

export function SeitenEditor({ seite, labels, verlauf, aendern, automatisch }: {
  seite: Seite; labels: string[]; verlauf: Verlauf;
  aendern: (balken: Balken[], verlauf: Verlauf) => void;
  automatisch: () => Balken[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [zeichnen, setZeichnen] = useState(false);
  const [label, setLabel] = useState(labels[0] ?? "[geschwärzt]");
  const [auswahl, setAuswahl] = useState<Balken | null>(null);
  const [entwurf, setEntwurf] = useState<Balken | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [meldung, setMeldung] = useState("");
  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (uhr.current) clearTimeout(uhr.current); }, []);

  /** Neuer Stand mit Verlaufseintrag. */
  const setBalken = (l: Balken[]) => aendern(l, merken(verlauf, seite.balken));
  function kurz(t: string) {
    setMeldung(t);
    if (uhr.current) clearTimeout(uhr.current);
    uhr.current = setTimeout(() => setMeldung(""), 6000);
  }
  function zurueck() {
    const r = rueckgaengig(verlauf, seite.balken);
    if (!r) return;
    aendern(r.balken, r.verlauf); setAuswahl(null); setMeldung("");
  }
  function vor() {
    const r = wiederholen(verlauf, seite.balken);
    if (!r) return;
    aendern(r.balken, r.verlauf); setAuswahl(null); setMeldung("");
  }
  function zuruecksetzen() {
    if (!window.confirm("Alle Änderungen auf dieser Seite verwerfen und die automatischen Balken wiederherstellen? (Lässt sich mit „Rückgängig“ zurücknehmen.)")) return;
    setBalken(automatisch()); setAuswahl(null); setMeldung("");
  }

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const breite = c.parentElement!.clientWidth, k = breite / seite.c.width, dpr = window.devicePixelRatio || 1;
    c.style.width = breite + "px"; c.style.height = seite.c.height * k + "px";
    c.width = Math.round(breite * dpr); c.height = Math.round(seite.c.height * k * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.drawImage(seite.c, 0, 0, breite, seite.c.height * k);
    for (const b of seite.balken) balkenZeichnen(g, b, k, true);
    for (const b of [auswahl, entwurf].filter(Boolean) as Balken[]) {
      g.strokeStyle = "#e0a000"; g.lineWidth = 3; g.strokeRect(b.x * k, b.y * k, b.w * k, b.h * k);
    }
  });

  const punkt = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), k = seite.c.width / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  };
  function runter(e: PointerEvent<HTMLCanvasElement>) {
    start.current = punkt(e);
    if (zeichnen) e.currentTarget.setPointerCapture(e.pointerId);
  }
  function bewegen(e: PointerEvent<HTMLCanvasElement>) {
    if (!zeichnen || !start.current) return;
    const p = punkt(e), s = start.current;
    setEntwurf({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y), label });
  }
  function hoch(e: PointerEvent<HTMLCanvasElement>) {
    const s = start.current, p = punkt(e);
    start.current = null; setEntwurf(null);
    if (!s) return;
    const klein = Math.abs(p.x - s.x) < 8 && Math.abs(p.y - s.y) < 8;
    if (zeichnen && !klein) {
      setBalken([...seite.balken, { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y), label, auto: false, quelle: "hand" }]);
      return;
    }
    const b = [...seite.balken].reverse().find((x) => p.x >= x.x && p.x <= x.x + x.w && p.y >= x.y && p.y <= x.y + x.h);
    setAuswahl(b ?? null);
  }
  function entfernen() {
    if (!auswahl) return;
    if (geschuetzt(auswahl) && !window.confirm("Hier steht ein Eintrag aus der Schwärzliste. Wirklich ungeschwärzt lassen?\n\nIm Bild bleibt die Stelle dann sichtbar. Im gespeicherten Text und für die KI wird sie trotzdem ersetzt.")) return;
    setBalken(seite.balken.filter((b) => b !== auswahl));
    setAuswahl(null);
    kurz("Balken entfernt");
  }
  function umbenennen(l: string) {
    if (!auswahl) return;
    const neu = { ...auswahl, label: l };
    setBalken(seite.balken.map((b) => (b === auswahl ? neu : b)));
    setAuswahl(neu);
  }

  return (
    <div className="editor">
      <div className="knoepfe">
        <button type="button" className={zeichnen ? "" : "zweitrangig"} aria-pressed={zeichnen} onClick={() => { setZeichnen(!zeichnen); setAuswahl(null); }}>
          {zeichnen ? "Zeichnen an" : "Balken ziehen"}
        </button>
        <label className="inline">Platzhalter
          <select value={label} onChange={(e) => setLabel(e.target.value)}>{labels.map((l) => <option key={l}>{l}</option>)}</select>
        </label>
      </div>
      <div className="knoepfe">
        <button type="button" className="zweitrangig" disabled={!verlauf.zurueck.length} onClick={zurueck}>↶ Rückgängig</button>
        <button type="button" className="zweitrangig" disabled={!verlauf.vor.length} onClick={vor}>↷ Wiederholen</button>
        <button type="button" className="zweitrangig" onClick={zuruecksetzen}>Seite zurücksetzen</button>
      </div>
      <div className="leinwand">
        <canvas ref={ref} style={{ touchAction: zeichnen ? "none" : "auto" }} onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} aria-label="Seite mit Balken" />
      </div>
      {auswahl && (
        <div className="knoepfe">
          <button type="button" className="gefahr" onClick={entfernen}>Entfernen</button>
          <label className="inline">Platzhalter ändern
            <select value={auswahl.label ?? ""} onChange={(e) => umbenennen(e.target.value)}>{labels.map((l) => <option key={l}>{l}</option>)}</select>
          </label>
        </div>
      )}
      {meldung && (
        <div className="knoepfe" role="status">
          <span>{meldung}</span>
          <button type="button" className="zweitrangig" onClick={zurueck}>Rückgängig</button>
        </div>
      )}
      <p className="leise">{zeichnen ? "Mit dem Finger ein Rechteck über die Stelle ziehen." : "Balken antippen, um ihn zu ändern oder zu entfernen."}</p>
    </div>
  );
}
