/* Kleiner Hinweis neben einem Ergebnis: Rechtsgrundlage und Stand der Regel, Link zur Übersicht. */
import Link from "next/link";
import { REGELN, standText } from "@/lib/regeln/stand";

export function RegelStand({ k }: { k: keyof typeof REGELN }) {
  const r = REGELN[k];
  return <p className="leise">Regel: {r.grundlage.split(";")[0]} · <Link href={`/regeln#${k}`}>{standText(r)}</Link>{r.hinweis?.startsWith("Geplant") ? " · Änderung geplant" : ""}</p>;
}
