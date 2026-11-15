import Link from "next/link";

export function Kopf({ zurueck = "/", text = "Übersicht" }: { zurueck?: string; text?: string }) {
  return <nav className="kopf"><Link href={zurueck}>← {text}</Link></nav>;
}
