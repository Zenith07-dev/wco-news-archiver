"use strict";

/**
 * Google Drive moduli — Service Account JSON bilan autentifikatsiya.
 * GitHub Actions muhitida ADC (Application Default Credentials) ishlamaydi,
 * shuning uchun GOOGLE_SA_JSON muhit o'zgaruvchisidan to'g'ridan-to'g'ri
 * JSON kalitini o'qiymiz.
 */

const { google } = require("googleapis");
const { Readable } = require("stream");

let _drive = null;

function getDrive() {
  if (_drive) return _drive;

  const saJson = process.env.GOOGLE_SA_JSON;
  if (!saJson) throw new Error("GOOGLE_SA_JSON muhit o'zgaruvchisi yo'q");

  let credentials;
  try {
    // base64 kodlangan bo'lsa — dekod qilamiz
    const raw = Buffer.from(saJson, "base64").toString("utf8");
    credentials = JSON.parse(raw);
  } catch {
    // Agar to'g'ridan-to'g'ri JSON bo'lsa
    try {
      credentials = JSON.parse(saJson);
    } catch (e) {
      throw new Error("GOOGLE_SA_JSON noto'g'ri format (base64 yoki JSON kerak): " + e.message);
    }
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  _drive = google.drive({ version: "v3", auth });
  return _drive;
}

// Bir ishga tushirish davomida papka ID'larini keshlaymiz
const folderCache = new Map();

async function ensureFolder(drive, name, parentId) {
  const cacheKey = `${parentId || "root"}/${name}`;
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);

  const safe = name.replace(/'/g, "\\'");
  let q = `mimeType='application/vnd.google-apps.folder' and name='${safe}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;

  const res = await drive.files.list({
    q,
    fields: "files(id,name)",
    spaces: "drive",
  });

  if (res.data.files && res.data.files.length) {
    folderCache.set(cacheKey, res.data.files[0].id);
    return res.data.files[0].id;
  }

  const meta = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) meta.parents = [parentId];

  const created = await drive.files.create({ requestBody: meta, fields: "id" });
  folderCache.set(cacheKey, created.data.id);
  return created.data.id;
}

async function fileExists(drive, name, parentId) {
  const safe = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name='${safe}' and '${parentId}' in parents and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
  });
  return res.data.files && res.data.files.length ? res.data.files[0].id : null;
}

async function uploadPdf({ buffer, fileName, rootFolderId, lang, year, month }) {
  const drive = getDrive();

  const langFolder = await ensureFolder(drive, String(lang || "EN"), rootFolderId);
  const yearFolder = await ensureFolder(drive, String(year), langFolder);
  const monthFolder = await ensureFolder(drive, String(month), yearFolder);

  const existing = await fileExists(drive, fileName, monthFolder);
  if (existing) {
    const meta = await drive.files.get({ fileId: existing, fields: "id,webViewLink" });
    return { id: existing, link: meta.data.webViewLink, skipped: true };
  }

  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [monthFolder] },
    media: { mimeType: "application/pdf", body: Readable.from(buffer) },
    fields: "id,webViewLink",
  });

  // Faylni ommaviy qilish (saytdan to'g'ridan-to'g'ri ochish uchun)
  await drive.permissions.create({
    fileId: res.data.id,
    requestBody: { role: "reader", type: "anyone" },
  });

  return { id: res.data.id, link: res.data.webViewLink, skipped: false };
}

module.exports = { uploadPdf, ensureFolder, getDrive };
