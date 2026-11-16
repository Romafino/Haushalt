import type { NextRequest } from "next/server";
import { sitzungAktualisieren } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return sitzungAktualisieren(request);
}

export const config = {
  // Nicht für statische Dateien und Bilder.
  matcher: ["/((?!_next/static|_next/image|vendor/|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
