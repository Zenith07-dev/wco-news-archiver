#!/usr/bin/env node
"use strict";

/**
 * GitHub Actions kirish nuqtasi.
 * Muhit o'zgaruvchilaridan sozlamalarni o'qiydi va arxivlashni ishga tushiradi.
 *
 * Muhit o'zgaruvchilari (GitHub Secrets orqali beriladi):
 *   WCO_ROOT_FOLDER_ID    — Drive papka ID si (majburiy)
 *   GOOGLE_SA_JSON        — Service Account JSON (base64 yoki to'g'ridan-to'g'ri)
 *   GOOGLE_TRANSLATE_API_KEY — Google Translate API kaliti
 *   ANTHROPIC_API_KEY     — Claude API kaliti (ixtiyoriy, zaxira tarjima)
 *   TRANSLATE_PRIMARY     — "google" yoki "claude" (default: google)
 *   WCO_YEARS             — "2025,2026" (bo'sh bo'lsa: joriy yil)
 *   WCO_LIMIT             — maksimal yangi fayl (default: 100)
 *   WCO_MONTHS            — necha oy oynasi (default: 6; 0 = chegara yo'q)
 */

const { run } = require("./archiver");

async function main() {
  const rootFolderId = process.env.WCO_ROOT_FOLDER_ID;
  if (!rootFolderId) {
    console.error("XATO: WCO_ROOT_FOLDER_ID o'rnatilmagan!");
    process.exit(1);
  }

  // Yillarni o'qish
  let years = (process.env.WCO_YEARS || "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter(Boolean);

  if (!years.length) {
    const y = new Date().getFullYear();
    years = [y, y - 1];
  }

  const limit = parseInt(process.env.WCO_LIMIT || "100", 10);
  const windowMonths = parseInt(process.env.WCO_MONTHS || "6", 10);

  console.log("=== WCO News Archiver (GitHub Actions) ===");
  console.log(`Yillar: ${years.join(", ")}`);
  console.log(`Limit: ${limit}`);
  console.log(`Oyna: ${windowMonths === 0 ? "chegarasiz" : windowMonths + " oy"}`);
  console.log(`Tarjima: ${process.env.TRANSLATE_PRIMARY || "google"}`);
  console.log("=========================================\n");

  try {
    await run({ rootFolderId, years, limit, windowMonths });
  } catch (e) {
    console.error("Arxivlash xatosi:", e.message);
    process.exit(1);
  }
}

main();
