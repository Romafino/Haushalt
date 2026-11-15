"use client";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseUmgebung } from "./umgebung";

/** Supabase im Browser, mit der Anmeldung der Person. RLS schützt die Daten. */
export function supabaseBrowser() {
  const { url, schluessel } = supabaseUmgebung();
  return createBrowserClient(url, schluessel);
}
