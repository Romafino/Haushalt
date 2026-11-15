"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

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
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password: passwort });
    setLaeuft(false);
    if (error) {
      setFehler("Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.");
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
