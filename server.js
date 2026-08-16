// server.js - نظام الزوار الوهميين فقط (متوافق مع الملف الحالي)
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { exec } = require("child_process");
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
// 🏦 فحص البنوك (مواقع)
// ============================================================
const { checkAllBanks, getLastResults: getLastBankResults, BANKS } = require('./bank-checker');

app.get('/api/banks', (req, res) => {
  const data = getLastBankResults();
  if (data) {
    res.json({ success: true, ...data });
  } else {
    checkAllBanks().then(result => {
      res.json({ success: true, ...result });
    }).catch(error => {
      res.status(500).json({ success: false, error: error.message });
    });
  }
});

app.post('/api/banks/check', async (req, res) => {
  try {
    const result = await checkAllBanks();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 📱 فحص تطبيقات البنوك
// ============================================================
const { checkAllApps, getLastResults: getLastAppResults, APPS } = require('./app-checker');

app.get('/api/apps', (req, res) => {
  const data = getLastAppResults();
  if (data) {
    res.json({ success: true, ...data });
  } else {
    checkAllApps().then(result => {
      res.json({ success: true, ...result });
    }).catch(error => {
      res.status(500).json({ success: false, error: error.message });
    });
  }
});

app.post('/api/apps/check', async (req, res) => {
  try {
    const result = await checkAllApps();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 📂 قراءة البيانات من الملفات
// ============================================================

const DATA_FILE = path.join(__dirname, "data.json");
const SCRAPER_DATA_FILE = isProduction
  ? path.join('/tmp', 'rates.json')
  : path.join(__dirname, "data", "rates.json");

console.log(`📂 بيئة التشغيل: ${isProduction ? 'إنتاج (Production)' : 'تطوير (Development)'}`);
console.log(`📂 مسار بيانات السكراب: ${SCRAPER_DATA_FILE}`);

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

  try {
    if (fs.existsSync(DATA_FILE)) {
      const savedData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      baseData = { ...baseData, ...savedData };
    }
  } catch (error) {
    console.error("⚠️ خطأ في تحميل البيانات الأساسية:", error.message);
  }

  const scraperData = loadScraperData();
  if (scraperData && scraperData.official && scraperData.official.currencies) {
    console.log("📊 تم تحميل بيانات السكراب من data/rates.json");
    
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

let data = getMergedData();

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log("💾 تم حفظ البيانات");
  } catch (error) {
    console.error("خطأ في حفظ البيانات:", error.message);
  }
}

const ADMIN_KEY = "AdminSudan";

exec("node scrape-alsoug.js", (error, stdout, stderr) => {
  if (error) {
    console.error("❌ فشل تشغيل سكربت السحب:", error.message);
    return;
  }
  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);
  data = getMergedData();
  console.log("✅ تم تحديث البيانات بنجاح!");
});

// ============================================================
// 🔧 إدارة العملات (Admin)
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
// 📊 APIs
// ============================================================

app.get("/api/rates", (req, res) => {
  data = getMergedData();
  res.json({
    success: true,
    official: data.official,
    parallel: data.parallel,
  });
});

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
// ⏰ تحديث تلقائي كل ساعة (أسعار العملات)
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
}, 60 * 60 * 1000);

console.log("⏰ سيتم تحديث الأسعار تلقائياً كل ساعة");

// ============================================================
// 👥 نظام الزوار الوهميين فقط (متوافق مع الملف الحالي)
// ============================================================

const VISITORS_FILE = path.join(__dirname, "data", "visitors.json");

// ✅ دالة للحصول على بيانات الزوار
function getVisitors() {
  try {
    if (fs.existsSync(VISITORS_FILE)) {
      const data = JSON.parse(fs.readFileSync(VISITORS_FILE, 'utf8'));
      
      // ✅ التحقق من اليوم - إعادة تعيين إذا كان يوم جديد
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const savedDate = data.date || todayStr;
      
      if (savedDate !== todayStr) {
        // ✅ يوم جديد: إضافة زوار الأمس إلى الإجمالي وإعادة تعيين اليوم
        const yesterdayToday = data.today || 0;
        data.total = (data.total || 0) + yesterdayToday;
        data.today = 0;
        data.date = todayStr;
        data.dailyReset = now.toISOString();
        data.lastUpdate = now.toISOString();
        saveVisitors(data);
        console.log(`📅 يوم جديد - تم إضافة ${yesterdayToday} إلى الإجمالي (الإجمالي: ${data.total})`);
      }
      
      return data;
    }
  } catch (error) {
    console.error('خطأ في قراءة بيانات الزوار:', error.message);
  }
  
  // ✅ بيانات افتراضية عند عدم وجود ملف
  const defaultData = {
    total: 0,
    today: 0,
    date: new Date().toISOString().split('T')[0],
    dailyReset: new Date().toISOString(),
    lastUpdate: new Date().toISOString()
  };
  saveVisitors(defaultData);
  return defaultData;
}

// ✅ دالة لحفظ بيانات الزوار
function saveVisitors(data) {
  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(VISITORS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('خطأ في حفظ بيانات الزوار:', error.message);
  }
}

// ✅ دالة لتحديث الزوار (تضيف 9 أو 14 أو 17)
function updateVisitors() {
  const data = getVisitors();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  
  // ✅ التحقق من اليوم
  if (data.date !== todayStr) {
    const yesterdayToday = data.today || 0;
    data.total = (data.total || 0) + yesterdayToday;
    data.today = 0;
    data.date = todayStr;
    data.dailyReset = now.toISOString();
  }
  
  // ✅ اختيار رقم عشوائي: 9 أو 14 أو 17
  const numbers = [9, 14, 17];
  const increase = numbers[Math.floor(Math.random() * numbers.length)];
  
  data.today = (data.today || 0) + increase;
  data.lastUpdate = now.toISOString();
  
  saveVisitors(data);
  console.log(`👥 تم تحديث الزوار الوهميين: +${increase} (اليوم: ${data.today}, الإجمالي: ${data.total})`);
}

// ✅ تحديث الزوار كل ساعة
setInterval(updateVisitors, 60 * 60 * 1000);

// ✅ تحديث أولي بعد 5 ثوانٍ من بدء التشغيل
setTimeout(updateVisitors, 5000);

// ✅ API لعرض بيانات الزوار
app.get('/api/visitors', (req, res) => {
  const data = getVisitors();
  res.json({
    success: true,
    total: data.total || 0,
    today: data.today || 0,
    lastUpdate: data.lastUpdate,
    dailyReset: data.dailyReset,
    date: data.date
  });
});

console.log('👥 نظام الزوار الوهميين يعمل (تحديث كل ساعة: +9/14/17)');
console.log('📅 سيتم إضافة زوار اليوم إلى الإجمالي عند منتصف الليل');

// ============================================================
// 🚀 تشغيل الخادم
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  
  const currencyCount = data?.official?.currencies 
    ? Object.keys(data.official.currencies).length 
    : 0;
  const source = data?.official?.source || 'data.json';
  
  console.log(`📊 عدد العملات المدعومة: ${currencyCount}`);
  console.log(`📂 المصدر: ${source}`);
});