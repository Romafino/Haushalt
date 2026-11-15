// Öffentliche Supabase-Angaben (URL und publishable/anon-Schlüssel).
// Der Service-Role-Schlüssel gehört NIE hierher (nur Cron und Push-Versand).
export function supabaseUmgebung() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const schluessel = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !schluessel) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlen (siehe .env.example).");
  }
  return { url, schluessel };
}
