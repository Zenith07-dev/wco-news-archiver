"use strict";

/**
 * Asosiy orkestrator: yangiliklarni topadi, yangilarini tarjima qiladi,
 * ikkita PDF (EN + UZ) yaratadi, Drive'ga yuklaydi va JSON faylida belgilaydi.
 */

const { listMany, fetchArticle } = require("./scraper");
const { buildPdf } = require("./pdf");
const { uploadPdf } = require("./drive");
const { isArchived, markArchived, getLaunchDate } = require("./state");
const { translateParagraphs } = require("./translate");
const { MONTH_NUM: MONTHS, parseArticleDate } = require("./util");

function makeFileName(article, lang) {
  const slug = article.url
    .split("/")
    .pop()
    .replace(/\.aspx$/i, "")
    .slice(0, 70);

  let datePart = "0000-00-00";
  const m = article.date.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const mon = MONTHS[m[2].toLowerCase()] || "00";
    datePart = `${m[3]}-${mon}-${day}`;
  }
  return `${datePart}_${slug}_${lang}.pdf`;
}

function yearMonthFromUrl(url) {
  const m = url.match(/\/newsroom\/(\d{4})\/([a-z]+)\//i);
  if (m) return { year: m[1], month: capitalize(m[2]) };
  return { year: "unknown", month: "unknown" };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

async function processArticle(article, cfg) {
  const { year, month } = yearMonthFromUrl(article.url);

  // 1) INGLIZ PDF — doim avval
  const enName = makeFileName(article, "en");
  const enBuf = await buildPdf(article, "en");
  const enUp = await uploadPdf({
    buffer: enBuf,
    fileName: enName,
    rootFolderId: cfg.rootFolderId,
    lang: "EN",
    year,
    month,
  });

  // 2) Tarjima va o'zbekcha PDF
  let uzUp = null;
  let uzName = null;
  let uzTitle = null;
  let provider = "none";
  let complete = false;

  try {
    const combined = [article.title, ...article.paragraphs];
    const tr = await translateParagraphs(combined);
    provider = tr.provider;
    uzTitle = (tr.translations[0] || article.title).trim();
    const uzParagraphs = tr.translations.slice(1);

    const uzArticle = {
      url: article.url,
      title: uzTitle,
      date: article.date,
      paragraphs: uzParagraphs,
    };
    uzName = makeFileName(article, "uz");
    const uzBuf = await buildPdf(uzArticle, "uz");
    uzUp = await uploadPdf({
      buffer: uzBuf,
      fileName: uzName,
      rootFolderId: cfg.rootFolderId,
      lang: "UZ",
      year,
      month,
    });
    complete = true;
  } catch (e) {
    console.error(`Tarjima/UZ yuklash uzildi (${article.url}):`, e.message);
  }

  return {
    complete,
    enId: enUp.id,
    uzId: uzUp ? uzUp.id : null,
    enLink: enUp.link,
    uzLink: uzUp ? uzUp.link : null,
    enName,
    uzName,
    uzTitle,
    provider,
    year,
    month,
  };
}

async function run(cfg) {
  const years = cfg.years && cfg.years.length ? cfg.years : [new Date().getFullYear()];
  const limit = cfg.limit || 100;
  const windowMonths = cfg.windowMonths == null ? 6 : cfg.windowMonths;

  let cutoff = null;
  if (windowMonths > 0) {
    const launch = getLaunchDate();
    cutoff = new Date(launch);
    cutoff.setMonth(cutoff.getMonth() - windowMonths);
  }

  const list = await listMany(years);
  console.log(`Topildi: ${list.length} ta maqola havolasi`);
  if (cutoff) console.log(`Sana chegarasi: ${cutoff.toISOString().slice(0, 10)} dan boshlab`);

  const result = {
    checked: list.length,
    uploaded: 0,
    skipped: 0,
    skippedOld: 0,
    translationFailed: 0,
    errors: [],
    providers: {},
  };

  for (const item of list) {
    if (result.uploaded >= limit) break;
    try {
      if (cutoff && item.date) {
        const d = parseArticleDate(item.date);
        if (d && d < cutoff) {
          result.skippedOld++;
          continue;
        }
      }

      if (isArchived(item.url)) {
        result.skipped++;
        continue;
      }

      const article = await fetchArticle(item.url);
      if (!article.title || article.paragraphs.length === 0) {
        result.errors.push({ url: item.url, error: "bo'sh kontent" });
        continue;
      }
      if (item.date && !article.date) article.date = item.date;

      if (cutoff && article.date) {
        const d = parseArticleDate(article.date);
        if (d && d < cutoff) {
          result.skippedOld++;
          continue;
        }
      }

      const r = await processArticle(article, cfg);

      if (!r.complete) {
        result.translationFailed++;
        console.warn(`Qisman (faqat EN): ${article.title.slice(0, 60)}`);
        await new Promise((res) => setTimeout(res, 800));
        continue;
      }

      markArchived(item.url, {
        title: article.title,
        titleUz: r.uzTitle || null,
        date: article.date,
        enFileId: r.enId,
        uzFileId: r.uzId,
        enLink: r.enLink || null,
        uzLink: r.uzLink || null,
        enName: r.enName || null,
        uzName: r.uzName || null,
        translateProvider: r.provider,
        year: r.year,
        month: r.month,
      });

      result.uploaded++;
      result.providers[r.provider] = (result.providers[r.provider] || 0) + 1;
      console.log(`✓ Yuklandi (EN+UZ, ${r.provider}): ${article.title.slice(0, 60)}`);

      await new Promise((r2) => setTimeout(r2, 800));
    } catch (e) {
      console.error(`✗ Xato (${item.url}):`, e.message);
      result.errors.push({ url: item.url, error: e.message });
    }
  }

  console.log("\n=== YAKUN ===");
  console.log(JSON.stringify(result, null, 2));
  return result;
}

module.exports = { run };
