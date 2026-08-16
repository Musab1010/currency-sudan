// server.js - الكود الكامل النهائي مع الزوار الحقيقيين والوهميين (تم إصلاح تسجيل الزوار)
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

// تشغيل سكربت السحب عند بدء التشغيل
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
// 👥 نظام الزوار الوهميين
// ============================================================

const VISITORS_FILE = path.join(__dirname, "data", "visitors.json");

function getVisitors() {
  try {
    if (fs.existsSync(VISITORS_FILE)) {
      const data = JSON.parse(fs.readFileSync(VISITORS_FILE, 'utf8'));
      
      const now = new Date();
      const resetDate = new Date(data.dailyReset);
      if (resetDate.getDate() !== now.getDate() || 
          resetDate.getMonth() !== now.getMonth() || 
          resetDate.getFullYear() !== now.getFullYear()) {
        data.today = 0;
        data.dailyReset = now.toISOString();
        saveVisitors(data);
      }
      
      return data;
    }
  } catch (error) {
    console.error('خطأ في قراءة بيانات الزوار:', error.message);
  }
  
  const defaultData = {
    total: 0,
    today: 0,
    lastUpdate: new Date().toISOString(),
    dailyReset: new Date().toISOString()
  };
  saveVisitors(defaultData);
  return defaultData;
}

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

function updateVisitors() {
  const data = getVisitors();
  const now = new Date();
  
  const resetDate = new Date(data.dailyReset);
  if (resetDate.getDate() !== now.getDate() || 
      resetDate.getMonth() !== now.getMonth() || 
      resetDate.getFullYear() !== now.getFullYear()) {
    data.today = 0;
    data.dailyReset = now.toISOString();
  }
  
  const increase = Math.floor(Math.random() * 10) + 5;
  data.total += increase;
  data.today += increase;
  data.lastUpdate = now.toISOString();
  
  saveVisitors(data);
  console.log(`👥 تم تحديث الزوار الوهميين: +${increase} (الإجمالي: ${data.total}, اليوم: ${data.today})`);
}

setInterval(updateVisitors, 60 * 60 * 1000);
setTimeout(updateVisitors, 5000);

app.get('/api/visitors', (req, res) => {
  const data = getVisitors();
  res.json({
    success: true,
    total: data.total,
    today: data.today,
    lastUpdate: data.lastUpdate
  });
});

console.log('👥 نظام الزوار الوهميين يعمل (تحديث كل ساعة)');

// ============================================================
// 👥 الزوار الحقيقيين (تم إصلاح المشكلة)
// ============================================================

const REAL_VISITORS_FILE = path.join(__dirname, "data", "real-visitors.json");

// دالة لتسجيل زائر حقيقي
function logRealVisitor(req) {
  try {
    let data = { total: 0, today: 0, online: 0, recent: [], lastReset: new Date().toISOString() };
    
    if (fs.existsSync(REAL_VISITORS_FILE)) {
      data = JSON.parse(fs.readFileSync(REAL_VISITORS_FILE, 'utf8'));
    }
    
    // التحقق من إعادة التعيين اليومي
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    if (data.lastReset !== today) {
      data.today = 0;
      data.lastReset = today;
    }
    
    // زيادة العداد
    data.total += 1;
    data.today += 1;
    data.online = Math.min(data.online + 1, 50);
    
    // إضافة الزيارة إلى السجل
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'غير معروف';
    const userAgent = req.headers['user-agent'] || 'غير معروف';
    const browser = userAgent.split(' ').slice(0, 2).join(' ') || 'متصفح غير معروف';
    
    data.recent.unshift({
      ip: ip,
      browser: browser,
      time: new Date().toISOString()
    });
    
    // الاحتفاظ بآخر 50 زيارة فقط
    if (data.recent.length > 50) {
      data.recent = data.recent.slice(0, 50);
    }
    
    fs.writeFileSync(REAL_VISITORS_FILE, JSON.stringify(data, null, 2));
    console.log(`👤 تم تسجيل زائر حقيقي: ${ip} (${browser})`);
  } catch (error) {
    console.error('❌ خطأ في تسجيل الزائر:', error.message);
  }
}

// ✅ تسجيل الزوار الحقيقيين (Middleware) - النسخة المحسنة مع إصلاح المشكلة
app.use((req, res, next) => {
  // تسجيل الزوار فقط عند فتح الصفحة الرئيسية أو أي صفحة عادية (ليست API أو Admin)
  if (!req.path.startsWith('/api/') && 
      !req.path.startsWith('/admin') && 
      !req.path.includes('.') && 
      req.path !== '/favicon.ico') {  // ✅ تم إزالة الشرط الذي كان يمنع تسجيل الصفحة الرئيسية
    logRealVisitor(req);
  }
  next();
});

// ✅ تقليل عدد المتصلين بعد فترة (محاكاة خروج الزوار)
setInterval(() => {
  try {
    if (fs.existsSync(REAL_VISITORS_FILE)) {
      const data = JSON.parse(fs.readFileSync(REAL_VISITORS_FILE, 'utf8'));
      if (data.online > 0) {
        data.online = Math.max(0, data.online - Math.floor(Math.random() * 3));
        fs.writeFileSync(REAL_VISITORS_FILE, JSON.stringify(data, null, 2));
      }
    }
  } catch (error) {}
}, 60000); // كل دقيقة

// API: الحصول على إحصائيات الزوار الحقيقيين
app.get('/api/real-visitors', (req, res) => {
  try {
    if (fs.existsSync(REAL_VISITORS_FILE)) {
      const data = JSON.parse(fs.readFileSync(REAL_VISITORS_FILE, 'utf8'));
      res.json({
        success: true,
        total: data.total || 0,
        today: data.today || 0,
        online: data.online || 0,
        recent: data.recent || []
      });
    } else {
      res.json({
        success: true,
        total: 0,
        today: 0,
        online: 0,
        recent: []
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

console.log('👥 نظام الزوار الحقيقيين يعمل (تم إصلاح مشكلة تسجيل الزوار)');

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