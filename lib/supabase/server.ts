import "server-only";
/* Supabase auf dem Server mit der Anmeldung der Person (Cookies). RLS gilt; kein Service-Role-Schlüssel. */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseUmgebung } from "./umgebung";

export async function supabaseServer() {
  const { url, schluessel } = supabaseUmgebung();
  const c = await cookies();
  return createServerClient(url, schluessel, {
    cookies: {
      getAll: () => c.getAll(),
      setAll: (neu) => {
        try { neu.forEach(({ name, value, options }) => c.set(name, value, options)); } catch { /* in Route-Antworten frischt der Proxy auf */ }
      },
    },
  });
}
