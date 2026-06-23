"use strict";

const axios = require("axios");
const cheerio = require("cheerio");

const BASE = "https://www.wcoomd.org";

const USER_AGENTS = [
  "Googlebot/2.1 (+http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "facebookexternalhit/1.1",
];

const MONTH_NAMES = "January|February|March|April|May|June|July|August|September|October|November|December";

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getWithRetry(url, tries = 3, uaIndex = 0) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
      return await axios.get(url, {
        timeout: 30000,
        headers: { "User-Agent": ua, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
        maxRedirects: 5,
      });
    } catch (e) {
      lastErr = e;
      const status = e.response && e.response.status;
      if (status && status >= 400 && status < 500) throw e;
      await sleep(1000 * (i + 1));
    }
  }
  throw lastErr;
}

async function listYear(year) {
  const urls = [`${BASE}/en/media/newsroom/${year}.aspx`];
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  for (const m of months) urls.push(`${BASE}/en/media/newsroom/${year}/${m}.aspx`);

  const byUrl = new Map();
  const re = new RegExp(`/en/media/newsroom/${year}/[a-z]+/[^"'#? ]+\\.aspx`, "i");

  for (const pageUrl of urls) {
    try {
      const { data } = await getWithRetry(pageUrl, 2);
      const $ = cheerio.load(data);
      $("a").each((_, el) => {
        let href = $(el).attr("href") || "";
        if (!re.test(href)) return;
        href = href.split("#")[0].split("?")[0];
        const abs = href.startsWith("http") ? href : BASE + href;
        if (byUrl.has(abs)) return;
        const title = $(el).text().replace(/\s+/g, " ").trim();
        let date = "";
        const block = $(el).closest("li, article, .news-item, div");
        const dm = block.text().match(new RegExp(`\\b\\d{1,2}\\s+(?:${MONTH_NAMES})\\s+\\d{4}\\b`));
        if (dm) date = dm[0];
        byUrl.set(abs, { title, url: abs, date });
      });
      await sleep(300);
    } catch (e) {}
  }
  return [...byUrl.values()];
}

async function listMany(years) {
  const uniq = new Map();
  for (const y of years) {
    try { for (const it of await listYear(y)) uniq.set(it.url, it); }
    catch (e) { console.error(`listYear(${y}) xato:`, e.message); }
  }
  return [...uniq.values()];
}

const BOILERPLATE = ["sign in","log in","home","sitemap","contact us","français","newsroom","follow us","share this","back to","read more","all rights reserved","cookie","privacy policy","terms of use","skip to","search","menu"];
function isBoilerplate(text) {
  const low = text.toLowerCase();
  if (low.length < 25 && BOILERPLATE.some((b) => low.includes(b))) return true;
  if (text.split(/\s+/).length < 2 && text.length < 20) return true;
  return false;
}

async function fetchArticle(url) {
  let data = "", success = false;
  for (let uaIdx = 0; uaIdx < USER_AGENTS.length; uaIdx++) {
    try {
      const res = await getWithRetry(url, 2, uaIdx);
      data = res.data;
      const $ = cheerio.load(data);
      if ($("body").text().trim().length > 300) { success = true; break; }
    } catch (e) {}
    await sleep(500);
  }
  if (!success && data === "") throw new Error("bo'sh kontent");

  const $ = cheerio.load(data);
  $("script,style,nav,header,footer,noscript,form,iframe,.breadcrumb,.menu,.nav,.navigation,.navbar,#header,#footer,.header,.footer,.sidebar,.side,.social,.share,.sharing,.related,.cookie,#nav,[role='navigation'],[role='banner'],[role='contentinfo']").remove();

  const candidates = [".field-items",".field-item","article","#content .content","#content",".content-main",".article-body",".article","main",".main-content","#main",".col-md-9",".col-md-8",".col-sm-9",".news-content",".page-content"];
  let $main = null;
  for (const sel of candidates) {
    const node = $(sel).first();
    if (node.length && node.text().trim().length > 150) { $main = node; break; }
  }
  if (!$main) $main = $("body");

  let title = $main.find("h1").first().text().trim() || $("h1").first().text().trim() || $("title").first().text().trim();
  title = title.replace(/\s+/g, " ").trim().replace(/\s*[|–-]\s*(WCO|World Customs Organization).*$/i, "").trim();

  let date = "";
  const fullText = $main.text();
  const dm = fullText.match(new RegExp(`\\b\\d{1,2}\\s+(?:${MONTH_NAMES})\\s+\\d{4}\\b`));
  if (dm) date = dm[0];
  if (!date) {
    const urlM = url.match(/\/(\d{4})\/(january|february|march|april|may|june|july|august|september|october|november|december)\//i);
    if (urlM) {
      const mm = {january:"January",february:"February",march:"March",april:"April",may:"May",june:"June",july:"July",august:"August",september:"September",october:"October",november:"November",december:"December"};
      date = mm[urlM[2].toLowerCase()] + " " + urlM[1];
    }
  }

  const paragraphs = [];
  const lastSeen = new Set();
  $main.find("p,h2,h3,blockquote,li").each((_, el) => {
    const $el = $(el);
    if (el.tagName === "li") {
      const lt = $el.find("a").text().replace(/\s+/g, " ").trim();
      const ft = $el.text().replace(/\s+/g, " ").trim();
      if (lt && lt.length >= ft.length - 2) return;
    }
    const t = $el.text().replace(/\s+/g, " ").trim();
    if (!t || t.length < 10 || isBoilerplate(t)) return;
    if (/^\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\.?$/i.test(t)) return;
    if (lastSeen.has(t)) return;
    lastSeen.add(t);
    paragraphs.push(t);
  });
  if (paragraphs.length && title && paragraphs[0] === title) paragraphs.shift();
  if (paragraphs.length === 0) {
    const lines = fullText.split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(l => l.length > 50 && !isBoilerplate(l));
    paragraphs.push(...lines.slice(0, 20));
  }
  if (paragraphs.length === 0) throw new Error("bo'sh kontent");

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

module.exports = { listYear, listMany, fetchArticle, extractArticleLinks: () => [], extractMonthPages: () => [], isBoilerplate, BASE };
