import "server-only";
/* Supabase mit Service-Role-Schlüssel. NUR für den täglichen Lauf (Cron) und den Push-Versand darin.
   Nie im Browser, nie in KI-Routen (Test: lib/tests/dienst-schluessel.test.ts). */
import { createClient } from "@supabase/supabase-js";

export function supabaseDienst() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, schluessel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !schluessel) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt (nur in Vercel hinterlegen).");
  return createClient(url, schluessel, { auth: { persistSession: false, autoRefreshToken: false } });
}
