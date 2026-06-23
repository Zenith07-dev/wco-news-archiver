"use strict";

/**
 * Yengil sana yordamchilari (og'ir kutubxonalarsiz).
 * Ham archiver.js, ham index.js (downloadZip) ishlatadi — shu tufayli
 * ZIP/list funksiyalari pdfkit/cheerio kabi og'ir modullarni yuklamaydi.
 */

const MONTH_NUM = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
};

const MONTH_INDEX = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/** "01 June 2026" -> Date (topilmasa null). */
function parseArticleDate(str) {
  if (!str) return null;
  const m = String(str).match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mo = MONTH_INDEX[m[2].toLowerCase()];
  const year = parseInt(m[3], 10);
  if (mo === undefined) return null;
  return new Date(year, mo, day);
}

module.exports = { MONTH_NUM, MONTH_INDEX, parseArticleDate };
