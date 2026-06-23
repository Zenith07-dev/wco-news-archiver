"use strict";

/**
 * Maqola obyektini PDF Buffer'ga aylantiradi (pdfkit yordamida).
 * Ikki til qo'llab-quvvatlanadi: "en" (ingliz) va "uz" (o'zbek).
 * O'zbek lotin belgilari uchun DejaVu Sans Unicode shrifti ishlatiladi.
 */

const path = require("path");
const PDFDocument = require("pdfkit");

const FONT_REG = path.join(__dirname, "fonts", "DejaVuSans.ttf");
const FONT_BOLD = path.join(__dirname, "fonts", "DejaVuSans-Bold.ttf");

// Til bo'yicha matn yorliqlari
const L = {
  en: {
    brand: "WORLD CUSTOMS ORGANIZATION  •  Newsroom Archive",
    date: "Date",
    source: "Source",
    footer: (d) => `Auto-archived from wcoomd.org on ${d}`,
  },
  uz: {
    brand: "JAHON BOJXONA TASHKILOTI  •  Yangiliklar arxivi",
    date: "Sana",
    source: "Manba",
    footer: (d) => `wcoomd.org saytidan ${d} sanasida avtomatik arxivlandi`,
  },
};

/**
 * @param {object} article
 * @param {string} article.url
 * @param {string} article.title
 * @param {string} article.date
 * @param {string[]} article.paragraphs
 * @param {"en"|"uz"} lang
 * @returns {Promise<Buffer>}
 */
function buildPdf(article, lang = "en") {
  const t = L[lang] || L.en;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      info: {
        Title: article.title || "WCO News",
        Author: "World Customs Organization",
        Subject: "WCO Newsroom",
      },
    });

    // Unicode shriftlarni ro'yxatdan o'tkazish (o'zbek belgilari uchun)
    doc.registerFont("Body", FONT_REG);
    doc.registerFont("Body-Bold", FONT_BOLD);

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Yuqori chiziq / brending
    doc.font("Body").fontSize(9).fillColor("#888888").text(t.brand, { align: "left" });
    doc.moveDown(0.3);
    doc
      .moveTo(60, doc.y)
      .lineTo(535, doc.y)
      .strokeColor("#1a4f8b")
      .lineWidth(2)
      .stroke();
    doc.moveDown(1);

    // Til belgisi (kichik rozetka)
    const badge = lang === "uz" ? " O'ZBEKCHA " : " ENGLISH ";
    doc.font("Body-Bold").fontSize(8);
    const bw = doc.widthOfString(badge) + 6;
    const badgeY = doc.y;
    doc.rect(60, badgeY, bw, 14).fill("#1a4f8b");
    doc.fillColor("#ffffff").text(badge, 63, badgeY + 3);
    doc.y = badgeY + 14;
    doc.moveDown(1);

    // Sarlavha
    doc
      .font("Body-Bold")
      .fontSize(17)
      .fillColor("#1a4f8b")
      .text(article.title || "Untitled", { align: "left" });
    doc.moveDown(0.4);

    // Meta (sana + manba)
    doc.font("Body").fontSize(9).fillColor("#666666");
    if (article.date) doc.text(`${t.date}: ${article.date}`);
    doc.text(`${t.source}: ${article.url}`, { link: article.url, underline: true });
    doc.moveDown(1);

    // Asosiy matn
    doc.font("Body").fontSize(11).fillColor("#222222");
    for (const p of article.paragraphs) {
      if (!p) continue;
      doc.text(p, { align: "justify", lineGap: 2 });
      doc.moveDown(0.6);
    }

    // Pastki kolontitul
    doc.moveDown(2);
    doc
      .font("Body")
      .fontSize(8)
      .fillColor("#999999")
      .text(t.footer(new Date().toISOString().slice(0, 10)), { align: "center" });

    doc.end();
  });
}

module.exports = { buildPdf };
