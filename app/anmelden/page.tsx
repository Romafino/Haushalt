"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

// Verständliche Meldung je Fehlerart; der Code in Klammern hilft bei der Fehlersuche.
function fehlerText(e: { code?: string; status?: number; message?: string }): string {
  const code = e.code ?? (e.status ? `http_${e.status}` : "unbekannt");
  const texte: Record<string, string> = {
    invalid_credentials: "E-Mail oder Passwort stimmen nicht.",
    email_not_confirmed: "Der Zugang ist noch nicht bestätigt (in Supabase „Auto Confirm User“ bzw. Nutzer bestätigen).",
    email_provider_disabled: "Die Anmeldung per E-Mail ist in Supabase ausgeschaltet.",
    user_banned: "Dieser Zugang ist gesperrt.",
    over_request_rate_limit: "Zu viele Versuche. Bitte einige Minuten warten.",
    technik: "Technischer Fehler: " + (e.message ?? ""),
  };
  return `${texte[code] ?? "Anmeldung fehlgeschlagen: " + (e.message ?? "")} (${code})`;
}

export default function Anmelden() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    setLaeuft(true);
    let error: { code?: string; status?: number; message?: string } | null = null;
    try {
      ({ error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password: passwort }));
    } catch (e) {
      // z. B. fehlende Umgebungsvariablen oder kein Netz
      error = { code: "technik", message: e instanceof Error ? e.message : String(e) };
    }
    setLaeuft(false);
    if (error) {
      setFehler(fehlerText(error));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="seite">
      <h1>Haushalt</h1>
      <form className="karte" onSubmit={absenden}>
        <h2>Anmelden</h2>
        <label>
          E-Mail
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Passwort
          <input type="password" autoComplete="current-password" required value={passwort} onChange={(e) => setPasswort(e.target.value)} />
        </label>
        {fehler && <p className="fehler" role="alert">{fehler}</p>}
        <button type="submit" disabled={laeuft}>{laeuft ? "Einen Moment …" : "Anmelden"}</button>
      </form>
      <p className="leise">Zugänge werden im Supabase-Projekt angelegt. Eine freie Registrierung gibt es nicht.</p>
    </main>
  );
}
