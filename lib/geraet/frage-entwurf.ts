"use client";
/* Frage von der Startseite an /frage übergeben – nur im Speicher dieses Tabs (sessionStorage), nie in der Adresse. */
const KEY = "frage_entwurf";
export function frageMerken(t: string) { try { sessionStorage.setItem(KEY, t.slice(0, 1000)); } catch { /* ohne Speicher: Feld bleibt leer */ } }
export function frageHolen(): string | null { try { const t = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); return t; } catch { return null; } }
