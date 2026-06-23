"use strict";

/**
 * Holat moduli — Firestore o'rniga JSON fayl ishlatadi.
 *
 * data.json fayli GitHub repoda saqlanadi va har arxivlash paytida yangilanadi.
 * Tuzilish:
 *   {
 *     "launchDate": "2026-06-23T...",
 *     "items": [
 *       {
 *         "url": "https://...",
 *         "title": "...",
 *         "titleUz": "...",
 *         "date": "23 June 2026",
 *         "archivedAt": "2026-06-23T...",
 *         "enFileId": "...",
 *         "uzFileId": "...",
 *         "enLink": "...",
 *         "uzLink": "...",
 *         "enName": "...",
 *         "uzName": "...",
 *         "year": "2026",
 *         "month": "June",
 *         "translateProvider": "google"
 *       }
 *     ]
 *   }
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data.json");

// Xotirada kesh — bir ishga tushirishda faqat bir marta disk o'qiladi
let _data = null;

function loadData() {
  if (_data) return _data;
  if (fs.existsSync(DATA_FILE)) {
    try {
      _data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch {
      _data = { launchDate: null, items: [] };
    }
  } else {
    _data = { launchDate: null, items: [] };
  }
  // items indeksini tezkor qidirish uchun Set ga aylantiramiz
  _data._urlSet = new Set((_data.items || []).map((i) => i.url));
  return _data;
}

function saveData() {
  if (!_data) return;
  // _urlSet ni JSON ga yozmaymiz (xizmat ob'ekti)
  const { _urlSet, ...clean } = _data;
  fs.writeFileSync(DATA_FILE, JSON.stringify(clean, null, 2), "utf8");
}

function isArchived(url) {
  const d = loadData();
  return d._urlSet.has(url);
}

function markArchived(url, meta) {
  const d = loadData();
  if (d._urlSet.has(url)) return; // takrorlanmaslik
  d._urlSet.add(url);
  d.items.push({
    url,
    ...meta,
    archivedAt: new Date().toISOString(),
  });
  saveData();
}

/**
 * Birinchi ishga tushirish sanasini qaytaradi.
 * Agar hali yo'q bo'lsa — hozirgi sanani saqlaydi.
 */
function getLaunchDate() {
  const d = loadData();
  if (!d.launchDate) {
    d.launchDate = new Date().toISOString();
    saveData();
  }
  return new Date(d.launchDate);
}

module.exports = { isArchived, markArchived, getLaunchDate, loadData, saveData };
