// server.js - مع دعم البيئات المختلفة
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { exec } = require("child_process"); // ✅ أضف هذا السطر
const { extractTextFromImage, extractCurrencyFromText } = require("./utils/ocr");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// ============================================================
// 📂 تحديد البيئة ومسارات الملفات
// ============================================================

const isProduction = process.env.NODE_ENV === 'production';

// إعداد رفع الملفات (للاستخدام المحلي فقط)
const uploadDir = path.join(__dirname, "uploads");
if (!isProduction && !fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ============================================================
// 📂 قراءة البيانات من الملفات
// ============================================================

const DATA_FILE = path.join(__dirname, "data.json");

// مسار ملف البيانات من السكراب
const SCRAPER_DATA_FILE = isProduction
  ? path.join('/tmp', 'rates.json')           // ✅ على Render/Vercel
  : path.join(__dirname, "data", "rates.json"); // ✅ على جهازك المحلي

console.log(`📂 بيئة التشغيل: ${isProduction ? 'إنتاج (Production)' : 'تطوير (Development)'}`);
console.log(`📂 مسار بيانات السكراب: ${SCRAPER_DATA_FILE}`);

// دالة لقراءة البيانات من ملف السكراب
function loadScraperData() {
  try {
    if (fs.existsSync(SCRAPER_DATA_FILE)) {
      const rawData = fs.readFileSync(SCRAPER_DATA_FILE, "utf8");
      return JSON.parse(rawData);
    }
  } catch (error) {
    console.error("⚠️ خطأ في قراءة بيانات السكراب:", error.message);
  }
  return null;
}

function getMergedData() {
  let baseData = {
    official: { currencies: {}, lastUpdated: new Date().toISOString(), updatedBy: "system" },
    parallel: { currencies: {}, lastUpdated: new Date().toISOString(), updatedBy: "system" },
    history: []
  };

  // 1️⃣ تحميل البيانات الأساسية (احتياطي)
  try {
    if (fs.existsSync(DATA_FILE)) {
      const savedData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      baseData = { ...baseData, ...savedData };
    }
  } catch (error) {
    console.error("⚠️ خطأ في تحميل البيانات الأساسية:", error.message);
  }

  // 2️⃣ تحميل بيانات السكراب - استبدال كامل
  const scraperData = loadScraperData();
  if (scraperData && scraperData.official && scraperData.official.currencies) {
    console.log("📊 تم تحميل بيانات السكراب من data/rates.json");
    
    // ✅ استبدال العملات بالكامل (لا دمج)
    baseData.official.currencies = scraperData.official.currencies || {};
    baseData.official.lastUpdated = scraperData.official.lastUpdated || new Date().toISOString();
    baseData.official.updatedBy = scraperData.official.updatedBy || "alsoug_scraper";
    baseData.official.source = scraperData.official.source || "alsoug.com";
    baseData.official.usd_sdg = scraperData.official.usd_sdg || baseData.official.currencies.USD?.rate || 0;

    baseData.parallel.currencies = scraperData.parallel.currencies || {};
    baseData.parallel.lastUpdated = scraperData.parallel.lastUpdated || new Date().toISOString();
    baseData.parallel.updatedBy = scraperData.parallel.updatedBy || "alsoug_scraper";
    baseData.parallel.source = scraperData.parallel.source || "alsoug.com";
    baseData.parallel.usd_sdg = scraperData.parallel.usd_sdg || baseData.parallel.currencies.USD?.rate || 0;

    if (scraperData.history) {
      baseData.history = [...baseData.history, ...scraperData.history];
    }
  }

  return baseData;
}

// ============================================================
// 📊 البيانات في الذاكرة
// ============================================================
let data = getMergedData();

// دالة لحفظ البيانات
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log("💾 تم حفظ البيانات");
  } catch (error) {
    console.error("خطأ في حفظ البيانات:", error.message);
  }
}

// ============================================================
// 🔐 مفتاح الأدمن
// ============================================================
const ADMIN_KEY = "AdminSudan";

// ============================================================
// 🚀 تشغيل سكربت السحب عند بدء التشغيل
// ============================================================

// تشغيل السكربت فور بدء الخادم (مرة واحدة)
exec("node scrape-alsoug.js", (error, stdout, stderr) => {
  if (error) {
    console.error("❌ فشل تشغيل سكربت السحب:", error.message);
    return;
  }
  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);
  // تحديث البيانات في الذاكرة بعد السحب
  data = getMergedData();
  console.log("✅ تم تحديث البيانات بنجاح!");
});

// ============================================================
// 📡 API: تحديث سعر عملة محددة
// ============================================================
app.post("/admin/update/currency", (req, res) => {
  const { currencyCode, rate, market, adminKey, updatedBy } = req.body;

  if (!currencyCode || !rate) {
    return res.status(400).json({ error: "currencyCode and rate required" });
  }
  if (adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const marketData = market === "parallel" ? data.parallel : data.official;
  if (!marketData.currencies[currencyCode]) {
    return res.status(404).json({ error: `Currency ${currencyCode} not found` });
  }

  const oldRate = marketData.currencies[currencyCode].rate;
  marketData.currencies[currencyCode].rate = Number(rate);
  marketData.lastUpdated = new Date().toISOString();
  marketData.updatedBy = updatedBy || "admin";

  data.history.unshift({
    action: "update",
    market,
    currency: currencyCode,
    oldRate,
    newRate: Number(rate),
    updatedBy: updatedBy || "admin",
    timestamp: new Date().toISOString(),
  });

  saveData();

  res.json({
    success: true,
    message: `تم تحديث سعر ${currencyCode} بنجاح`,
    data: marketData.currencies[currencyCode],
  });
});

// ============================================================
// 📸 رفع صورة من البنك واستخراج الأسعار
// ============================================================
app.post("/admin/upload-bank-image", upload.single("bankImage"), async (req, res) => {
  const { adminKey, market = "official" } = req.body;

  if (adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const extractedText = await extractTextFromImage(req.file.path);
    const extractedRates = await extractCurrencyFromText(extractedText);

    const marketData = market === "parallel" ? data.parallel : data.official;
    const updates = [];

    for (const [code, rate] of Object.entries(extractedRates)) {
      if (marketData.currencies[code]) {
        const oldRate = marketData.currencies[code].rate;
        marketData.currencies[code].rate = rate;
        updates.push({ code, oldRate, newRate: rate });
      }
    }

    marketData.lastUpdated = new Date().toISOString();
    marketData.updatedBy = "system (OCR)";

    data.history.unshift({
      action: "batch_update",
      market,
      source: "bank_image",
      imageUrl: `/uploads/${req.file.filename}`,
      updates,
      timestamp: new Date().toISOString(),
    });

    saveData();

    res.json({
      success: true,
      message: `تم استخراج وتحديث ${updates.length} عملة من الصورة`,
      extractedText,
      extractedRates,
      updates,
      imageUrl: `/uploads/${req.file.filename}`,
    });
  } catch (error) {
    console.error("OCR Error:", error);
    res.status(500).json({ error: "فشل في معالجة الصورة", details: error.message });
  }
});

// ============================================================
// 📊 API: الحصول على جميع الأسعار
// ============================================================
app.get("/api/rates", (req, res) => {
  // إعادة تحميل البيانات من الملفات قبل الإرسال
  data = getMergedData();
  
  res.json({
    success: true,
    official: data.official,
    parallel: data.parallel,
  });
});

// ============================================================
// 📜 API: الحصول على سجل التحديثات
// ============================================================
app.get("/api/history", (req, res) => {
  res.json({
    success: true,
    history: data.history.slice(0, 50),
  });
});

// ============================================================
// 🏠 الصفحات
// ============================================================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "admin", "index.html")));

// ============================================================
// ⏰ تحديث تلقائي كل ساعة
// ============================================================
setInterval(() => {
  console.log("🔄 [تلقائي] جلب الأسعار من السوق السودان...");
  exec("node scrape-alsoug.js", (error, stdout, stderr) => {
    if (error) {
      console.error("❌ خطأ في السكربت:", error.message);
      return;
    }
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    data = getMergedData();
  });
}, 60 * 60 * 1000); // كل ساعة

console.log("⏰ سيتم تحديث الأسعار تلقائياً كل ساعة");

// ============================================================
// 🚀 تشغيل الخادم
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  
  // ✅ التحقق من وجود البيانات قبل استخدامها
  const currencyCount = data?.official?.currencies 
    ? Object.keys(data.official.currencies).length 
    : 0;
  const source = data?.official?.source || 'data.json';
  
  console.log(`📊 عدد العملات المدعومة: ${currencyCount}`);
  console.log(`📂 المصدر: ${source}`);
});