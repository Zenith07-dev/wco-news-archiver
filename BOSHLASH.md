# 🚀 WCO News Archiver v2 — Tekin Stack (GitHub Actions + GitHub Pages)

**Hech qanday karta, Firebase yoki pullik xizmat kerak emas.**

| Xizmat | Narx | Maqsad |
|---|---|---|
| GitHub Actions | Tekin (oyiga 2000 daqiqa) | Har kuni arxivlash |
| GitHub Pages | Tekin | Veb-sayt |
| Google Drive | Tekin (15 GB) | PDF saqlash |
| Google Translate API | Tekin (oyiga 500K belgi) | Tarjima |
| Google Cloud (faqat API) | Tekin kvota | Faqat 2 ta API |

> ⏱ Taxminiy vaqt: 20–30 daqiqa.

---

## 📋 NIMA KERAK?

1. **Google hisobi** (Gmail) — Drive va API uchun
2. **GitHub hisobi** — tekin: https://github.com/signup

---

# 1-QADAM: Node.js o'rnatish (bir marta)

1. https://nodejs.org → **LTS** (20.x) → Windows Installer yuklang
2. O'rnating → CMD da tekshiring:
```cmd
node -v
npm -v
```

---

# 2-QADAM: GitHub reposi yaratish

1. https://github.com → **New repository**
2. Nom: `wco-news-archiver`
3. **Public** (GitHub Pages tekin faqat Public'da ishlaydi)
4. **Add README** belgilang → **Create repository**

---

# 3-QADAM: Loyiha fayllarini GitHub'ga yuklash

## Usul A: GitHub veb-interfeysi (sodda)

1. Repoda **"uploading an existing file"** havolasini bosing
2. Barcha fayllarni drag-and-drop qiling (papka tuzilishi bilan)
3. **Commit changes**

## Usul B: Git orqali (tez)

```cmd
cd C:\wco-news-archiver-v2

git init
git add .
git commit -m "birinchi commit"
git remote add origin https://github.com/SIZNING_USERNAME/wco-news-archiver.git
git branch -M main
git push -u origin main
```

---

# 4-QADAM: Google Cloud — faqat API (karta kerak emas!)

> **Muhim:** Google Cloud Console bepul foydalanish imkonini beradi,
> faqat 2 ta API yoqish kerak.

1. https://console.cloud.google.com → yuqorida **loyiha yarating**
   (masalan: `wco-archiver`) → Google Analytics o'chirish mumkin
2. Chap menyu → **"APIs & Services"** → **"Library"**
3. Qidiring: **"Cloud Translation API"** → **Enable**
4. Qidiring: **"Google Drive API"** → **Enable**

## 4.1. Google Translate API kaliti

1. **APIs & Services → Credentials**
2. **+ Create Credentials → API key**
3. Kalitni nusxalang (`AIzaSy...`) — yozib oling

## 4.2. Service Account yaratish (Drive uchun)

1. **APIs & Services → Credentials**
2. **+ Create Credentials → Service account**
3. Nom: `wco-archiver` → **Create and continue** → **Done**
4. Yaratilgan service account'ni bosing → **Keys** tab
5. **Add Key → Create new key → JSON** → **Create**
6. `.json` fayl yuklab olinadi — **SAQLAB QOLING!**

---

# 5-QADAM: Google Drive papkasi

1. https://drive.google.com → **New → New folder** → `WCO News`
2. Papka URL'idan ID ni oling:
   `https://drive.google.com/drive/folders/`**`1AbCdEfGh...XyZ`**

## Service Account'ga papkani ulashish

1. Yuklab olingan `.json` faylini Notepad bilan oching
2. `"client_email"` qiymatini oling (masalan: `wco-archiver@...gserviceaccount.com`)
3. `WCO News` papkasi → right-click → **Share**
4. Yuqoridagi email → huquq: **Editor** → **Send**

---

# 6-QADAM: Service Account JSON ni base64 ga aylantirish

GitHub Secrets matnli bo'lishi kerak. JSON ni base64 formatga o'giramiz.

**PowerShell da:**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\yuklagan-json-fayl.json")) | Set-Clipboard
```
Endi clipboard'da base64 matn bor — keyingi qadamda kerak bo'ladi.

---

# 7-QADAM: GitHub Secrets qo'shish

Repoda → **Settings → Secrets and variables → Actions → New repository secret**

Quyidagi secretlarni qo'shing:

| Secret nomi | Qiymat |
|---|---|
| `WCO_ROOT_FOLDER_ID` | Drive papka ID si (5-qadamdan) |
| `GOOGLE_SA_JSON` | base64 qilingan JSON (6-qadamdan) |
| `GOOGLE_TRANSLATE_API_KEY` | `AIzaSy...` (4.1-qadamdan) |
| `TRANSLATE_PRIMARY` | `google` |
| `ANTHROPIC_API_KEY` | *(ixtiyoriy)* `sk-ant-...` |

---

# 8-QADAM: GitHub Pages yoqish

Repoda → **Settings → Pages**:
- **Source**: `GitHub Actions`
- **Save**

---

# 9-QADAM: Birinchi marta ishga tushirish

## 9.1. npm o'rnatish (bir marta)

```cmd
cd C:\wco-news-archiver-v2\runner
npm install
git add package-lock.json
git commit -m "lock file"
git push
```

## 9.2. Qo'lda ishga tushirish

Repoda → **Actions → WCO News Archiver → Run workflow**

Parametrlar (ixtiyoriy):
- `months`: `0` (hammasi) yoki `12` (12 oy)
- `years`: `2024,2025,2026`
- `limit`: `50` (birinchi marta, sinab ko'rish uchun)

**Run workflow** → Ijro ko'rish uchun chap menyudan shu workflow'ni bosing.

## 9.3. Natijani tekshirish

Workflow tugagach:
1. Repoda `public/data.json` yangilangan bo'ladi
2. **Actions → pages build and deployment** workflow ham ishga tushadi
3. 1-2 daqiqadan keyin saytni oching:
   `https://SIZNING_USERNAME.github.io/wco-news-archiver/`

---

# 10-QADAM: Avtomatik kundalik ishlash

`.github/workflows/archive.yml` da:
```yaml
- cron: "0 6 * * *"   # har kuni 06:00 UTC (Toshkent 11:00)
```

Boshqa vaqtga o'zgartirish uchun shu qatorni tahrirlang va commit qiling.
GitHub Actions o'zi har kuni shu vaqtda ishlatadi.

---

# ⚡ Tezkor ish jarayoni (keyingi safar)

```cmd
:: Faqat saytni yangilash
git add public/
git commit -m "sayt yangilash"
git push

:: Backfill (qo'lda, GitHub Actions UI orqali)
Actions → Run workflow → months=24, years=2023,2024,2025
```

---

# 🛠 Muammolarni bartaraf etish

**Workflow xato: "WCO_ROOT_FOLDER_ID not set"**
→ 7-qadamni tekshiring — secret nomi to'g'rimi?

**Drive'ga yuklashda permission xato**
→ Service account email'i Drive papkasiga "Editor" sifatida ulashilganmi? (5-qadam)

**Translate API xatosi 403**
→ "Cloud Translation API" yoqilganmi? (4-qadam)
→ `GOOGLE_TRANSLATE_API_KEY` to'g'rimi?

**Sayt 404 beradi**
→ Settings → Pages → Source: "GitHub Actions" belgilanganmi?

**`GOOGLE_SA_JSON` xatosi**
→ base64 konvertatsiya to'g'ri bajarilganmi? Avvalgi PowerShell buyrug'ini qayta ishlating.

**ZIP yuklab olganda fayllar bo'sh**
→ Drive fayllari "anyone can view" (public) qilinganmi?
→ `drive.js` dagi `permissions.create` bloki ishlayaptimi?

---

# 💡 Arxitektura tushuntirishi

```
GitHub Actions (har kuni)
    │
    ├── WCO saytidan yangiliklar topadi (scraper.js)
    ├── Har bir yangilikni EN+UZ PDF qiladi (pdf.js)
    ├── Google Drive'ga yuklaydi (drive.js)
    ├── data.json ga yozadi (state.js)
    └── data.json ni GitHub'ga push qiladi
          │
          └── GitHub Pages avtomatik yangilanadi
                │
                └── Sayt data.json ni o'qiydi (server kerak emas!)
                    ZIP yuklab olish brauzerda JSZip orqali ishlaydi
```

**Firebase'dan farqi:**
- ❌ Cloud Functions → ✅ GitHub Actions (tekin)
- ❌ Firestore → ✅ `data.json` GitHub repoda (tekin)
- ❌ Firebase Hosting → ✅ GitHub Pages (tekin)
- ❌ /api/zip server → ✅ Brauzerda JSZip (server kerak emas)
