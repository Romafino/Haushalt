"use client";
/* Service Worker auf jedem Gerät anmelden (Push und Notfallseite ohne Netz). */
import { useEffect } from "react";
import { swRegistrieren } from "@/lib/geraet/push";

export function SwAnmelden() {
  useEffect(() => { void swRegistrieren().catch(() => {}); }, []);
  return null;
}
