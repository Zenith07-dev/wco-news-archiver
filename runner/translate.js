"use strict";

/**
 * Tarjima moduli — ikki provayderli, fallback bilan.
 *
 * Asosiy:  Google Cloud Translation API (oyiga 500K belgi bepul)
 * Zaxira:  Anthropic Claude API (Google kvotasi tugaganda yoki xato berganda)
 *
 * Mantiq: avval Google bilan urinadi. Agar kvota (403/429) yoki boshqa
 * jiddiy xato bo'lsa, avtomatik Claude'ga o'tadi. Tartibni .env'da
 * TRANSLATE_PRIMARY="claude" qilib teskari ham qilish mumkin.
 */

const axios = require("axios");

const TARGET = "uz"; // o'zbek
const SOURCE = "en";

// ---- Google Cloud Translation (v2 REST) ----

/** Google format=text bo'lsa ham ba'zan HTML-belgilar qaytaradi; dekodlaymiz. */
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

async function googleTranslate(texts) {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) throw new Error("GOOGLE_TRANSLATE_API_KEY yo'q");

  const url = `https://translation.googleapis.com/language/translate/v2?key=${key}`;
  const { data } = await axios.post(
    url,
    { q: texts, source: SOURCE, target: TARGET, format: "text" },
    { timeout: 30000 }
  );
  return data.data.translations.map((t) => decodeEntities(t.translatedText));
}

// ---- Claude (Anthropic Messages API) ----
async function claudeTranslate(texts) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY yo'q");

  // Paragraflarni raqamlab, bitta so'rovda yuboramiz (tejamkor)
  const numbered = texts.map((t, i) => `[${i + 1}] ${t}`).join("\n\n");

  const prompt =
    "You are a professional translator specializing in customs, trade, and " +
    "legal terminology. Translate the following English paragraphs into formal, " +
    "professional Uzbek (Latin script). Preserve the exact numbering format " +
    "[1], [2], etc. Return ONLY the numbered Uzbek translations, nothing else.\n\n" +
    numbered;

  const { data } = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    },
    {
      timeout: 60000,
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    }
  );

  const out = data.content.map((c) => (c.type === "text" ? c.text : "")).join("");

  // Raqamlangan javobni qayta massivga ajratamiz (1 yoki 2 qator ajratuvchi)
  const parts = [];
  const re = /\[(\d+)\]\s*([\s\S]*?)(?=\n+\[\d+\]|\s*$)/g;
  let m;
  while ((m = re.exec(out)) !== null) {
    parts[parseInt(m[1], 10) - 1] = m[2].trim();
  }
  // Bo'sh qolgan joylarni bo'sh satr bilan to'ldiramiz (PDF ularni o'tkazadi)
  for (let i = 0; i < texts.length; i++) {
    if (parts[i] === undefined) parts[i] = "";
  }
  return parts;
}

/** Xato kvota/limit bilan bog'liqmi? (fallback'ga o'tish uchun) */
function isQuotaError(err) {
  const s = err.response && err.response.status;
  return s === 403 || s === 429 || s === 400;
}

/**
 * Paragraflar massivini o'zbekchaga tarjima qiladi.
 * Provayderni avtomatik tanlaydi va fallback qiladi.
 * @param {string[]} texts
 * @returns {Promise<{translations:string[], provider:string}>}
 */
async function translateParagraphs(texts) {
  if (!texts.length) return { translations: [], provider: "none" };

  const primary = (process.env.TRANSLATE_PRIMARY || "google").toLowerCase();
  const order =
    primary === "claude" ? ["claude", "google"] : ["google", "claude"];

  let lastErr = null;
  for (const provider of order) {
    try {
      const fn = provider === "google" ? googleTranslate : claudeTranslate;
      // Bo'laklash: ham element soni, ham umumiy belgilar bo'yicha cheklaymiz.
      // Google v2: <=128 segment va ~30K belgi/so'rov. Claude: chiqish
      // kesilmasligi uchun kichikroq bo'lak.
      const maxItems = provider === "google" ? 64 : 20;
      const maxChars = provider === "google" ? 9000 : 6000;
      const chunks = chunkBySize(texts, maxItems, maxChars);
      const results = [];
      for (const ch of chunks) {
        const r = await fn(ch);
        results.push(...r);
        await new Promise((res) => setTimeout(res, 300));
      }
      return { translations: results, provider };
    } catch (err) {
      lastErr = err;
      const reason = isQuotaError(err) ? "kvota/limit" : err.message;
      console.warn(`Tarjima provayderi '${provider}' ishlamadi (${reason}). Keyingisiga o'tilmoqda...`);
      // keyingi provayderga o'tamiz
    }
  }
  throw new Error(`Barcha tarjima provayderlari ishlamadi: ${lastErr && lastErr.message}`);
}

/** Massivni element soni VA umumiy belgilar bo'yicha bo'laklarga ajratadi. */
function chunkBySize(arr, maxItems, maxChars) {
  const out = [];
  let cur = [];
  let curChars = 0;
  for (const item of arr) {
    const len = (item || "").length;
    // Joriy bo'lak to'lgan bo'lsa, yangisini boshlaymiz
    if (cur.length && (cur.length >= maxItems || curChars + len > maxChars)) {
      out.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push(item);
    curChars += len;
  }
  if (cur.length) out.push(cur);
  return out;
}

module.exports = { translateParagraphs };
