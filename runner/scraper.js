"use strict";

/**
 * WCO Newsroom skraperi.
 * Yangiliklar ro'yxatini va har bir maqola matnini oladi.
 *
 * Mustahkamlik choralari:
 *  - tarmoq xatosida qayta urinish (retry);
 *  - yil sahifasi + oylik sahifalarni ham aylanib chiqish (to'liq qamrov);
 *  - maqola matnidan navigatsiya/menyu/footer kabi keraksiz qismlarni
 *    chiqarib tashlash (toza PDF uchun).
 */

const axios = require("axios");
const cheerio = require("cheerio");

const BASE = "https://www.wcoomd.org";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const http = axios.create({
  timeout: 30000,
  headers: {
    "User-Agent": UA,
    "Accept-Language": "en",
    Accept: "text/html,application/xhtml+xml",
  },
});

const MONTH_NAMES =
  "January|February|March|April|May|June|July|August|September|October|November|December";

/** Tarmoq/5xx xatosida 2 marta qayta uradi (eksponensial kutish bilan). */
async function getWithRetry(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await http.get(url);
    } catch (e) {
      lastErr = e;
      const status = e.response && e.response.status;
      // 4xx (404 kabi) qayta urinishga arzimaydi
      if (status && status >= 400 && status < 500) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastErr;
}

/** HTML'dan berilgan yil uchun maqola havolalarini ajratadi. */
function extractArticleLinks($, year) {
  const re = new RegExp(`/en/media/newsroom/${year}/[a-z]+/[^"'#? ]+\\.aspx`, "i");
  const out = [];
  const seen = new Set();

  $("a").each((_, el) => {
    let href = $(el).attr("href") || "";
    if (!re.test(href)) return;
    href = href.split("#")[0].split("?")[0];
    const abs = href.startsWith("http") ? href : BASE + href;
    if (seen.has(abs)) return;
    seen.add(abs);

    const title = $(el).text().replace(/\s+/g, " ").trim();
    // Sanani havola atrofidagi blokdan topishga urinish
    let date = "";
    const block = $(el).closest("li, article, .news-item, div");
    const m = block.text().match(
      new RegExp(`\\b\\d{1,2}\\s+(?:${MONTH_NAMES})\\s+\\d{4}\\b`)
    );
    if (m) date = m[0];

    out.push({ title, url: abs, date });
  });
  return out;
}

/** Yil sahifasidagi oylik indeks sahifalariga havolalarni topadi. */
function extractMonthPages($, year) {
  const re = new RegExp(`/en/media/newsroom/${year}/(?:${MONTH_NAMES})\\.aspx`, "i");
  const out = new Set();
  $("a").each((_, el) => {
    let href = $(el).attr("href") || "";
    if (!re.test(href)) return;
    href = href.split("#")[0].split("?")[0];
    out.add(href.startsWith("http") ? href : BASE + href);
  });
  return [...out];
}

/**
 * Bitta yil bo'yicha barcha maqola havolalarini yig'adi.
 * Yil sahifasini va undagi oylik sahifalarni ham aylanib chiqadi.
 */
async function listYear(year) {
  const url = `${BASE}/en/media/newsroom/${year}.aspx`;
  const { data } = await getWithRetry(url);
  const $ = cheerio.load(data);

  const byUrl = new Map();
  for (const it of extractArticleLinks($, year)) byUrl.set(it.url, it);

  // Oylik sahifalarni ham tekshiramiz (yil sahifasi hammasini ko'rsatmasligi mumkin)
  const monthPages = extractMonthPages($, year);
  for (const mp of monthPages) {
    try {
      const res = await getWithRetry(mp);
      const $$ = cheerio.load(res.data);
      for (const it of extractArticleLinks($$, year)) {
        if (!byUrl.has(it.url)) byUrl.set(it.url, it);
      }
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.error(`Oylik sahifa xatosi (${mp}):`, e.message);
    }
  }

  return [...byUrl.values()];
}

/** Bir nechta yil bo'yicha yangiliklarni yig'adi (takrorsiz). */
async function listMany(years) {
  const uniq = new Map();
  for (const y of years) {
    try {
      for (const it of await listYear(y)) uniq.set(it.url, it);
    } catch (e) {
      console.error(`listYear(${y}) xato:`, e.message);
    }
  }
  return [...uniq.values()];
}

// Matnda uchrasa, bu element navigatsiya/menyu deb hisoblanadi va tashlab yuboriladi
const BOILERPLATE = [
  "sign in", "log in", "home", "sitemap", "contact us", "français",
  "newsroom", "follow us", "share this", "back to", "read more",
  "all rights reserved", "cookie", "privacy policy", "terms of use",
  "skip to", "search", "menu",
];

function isBoilerplate(text) {
  const low = text.toLowerCase();
  if (low.length < 25 && BOILERPLATE.some((b) => low.includes(b))) return true;
  // Faqat bitta so'z yoki juda qisqa "tugma" matnlari
  if (text.split(/\s+/).length < 2 && text.length < 20) return true;
  return false;
}

/**
 * Maqola sahifasidan sarlavha, sana va asosiy matnni ajratadi.
 * Navigatsiya, menyu, footer kabi keraksiz qismlar chiqarib tashlanadi.
 */
async function fetchArticle(url) {
  const { data } = await getWithRetry(url);
  const $ = cheerio.load(data);

  // Aniq keraksiz bo'limlarni butunlay o'chiramiz
  $(
    "script, style, nav, header, footer, noscript, form, " +
    ".breadcrumb, .breadcrumbs, .menu, .nav, .navigation, .navbar, " +
    "#header, #footer, .header, .footer, .sidebar, .side, .social, " +
    ".share, .sharing, .related, .related-news, .cookie, .cookies, " +
    "#nav, [role='navigation'], [role='banner'], [role='contentinfo']"
  ).remove();

  // Asosiy kontent konteynerini topish
  const candidates = [
    "article",
    "#content .content",
    "#content",
    ".content-main",
    ".article-body",
    ".article",
    "main",
    ".main-content",
    "#main",
    ".col-md-9",
    ".col-md-8",
  ];
  let $main = null;
  for (const sel of candidates) {
    const node = $(sel).first();
    if (node.length && node.text().trim().length > 200) {
      $main = node;
      break;
    }
  }
  if (!$main) $main = $("body");

  // Sarlavha
  let title =
    $main.find("h1").first().text().trim() ||
    $("h1").first().text().trim() ||
    $("title").first().text().trim();
  title = title.replace(/\s+/g, " ").trim();
  // "| WCO" kabi sayt qo'shimchasini olib tashlash
  title = title.replace(/\s*[|–-]\s*(WCO|World Customs Organization).*$/i, "").trim();

  // Sana
  let date = "";
  const dm = $main.text().match(
    new RegExp(`\\b\\d{1,2}\\s+(?:${MONTH_NAMES})\\s+\\d{4}\\b`)
  );
  if (dm) date = dm[0];

  // Paragraflar — faqat haqiqiy matn bloklari
  const paragraphs = [];
  const lastSeen = new Set();
  $main.find("p, h2, h3, blockquote, li").each((_, el) => {
    const $el = $(el);
    // Menyu turidagi li (faqat havoladan iborat) — tashlab yuboramiz
    if (el.tagName === "li") {
      const linkText = $el.find("a").text().replace(/\s+/g, " ").trim();
      const fullText = $el.text().replace(/\s+/g, " ").trim();
      if (linkText && linkText.length >= fullText.length - 2) return;
    }
    const t = $el.text().replace(/\s+/g, " ").trim();
    if (!t || t.length < 2) return;
    if (isBoilerplate(t)) return;
    // Faqat sanadan iborat paragrafni tashlab yuboramiz (sana alohida saqlanadi)
    if (
      /^\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\.?$/i.test(
        t
      )
    )
      return;
    if (lastSeen.has(t)) return; // takror paragraf
    lastSeen.add(t);
    paragraphs.push(t);
  });

  // Sarlavha matn ichida birinchi paragraf sifatida takrorlansa, olib tashlaymiz
  if (paragraphs.length && title && paragraphs[0] === title) paragraphs.shift();

  // Rasm havolalari (ixtiyoriy)
  const images = [];
  $main.find("img").each((_, el) => {
    let src = $(el).attr("src") || "";
    if (!src) return;
    if (src.startsWith("//")) src = "https:" + src;
    else if (src.startsWith("/")) src = BASE + src;
    if (/\.(png|jpe?g|webp)/i.test(src)) images.push(src);
  });

  return { url, title, date, paragraphs, images };
}

module.exports = {
  listYear,
  listMany,
  fetchArticle,
  extractArticleLinks,
  extractMonthPages,
  isBoilerplate,
  BASE,
};
