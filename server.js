const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ============================================================
// 📂 قراءة البيانات من الملفات
// ============================================================

const DATA_FILE = path.join(__dirname, "data.json");
const RATES_FILE = path.join(__dirname, "data", "rates.json");
const VISITORS_FILE = path.join(__dirname, "data", "visitors.json");

// ✅ التأكد من وجود مجلد data
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ✅ البيانات الافتراضية للعملات (محدثة)
function getDefaultRates() {
  return {
    official: {
      currencies: {
        USD: { rate: 3611.89, flag: "🇺🇸", name: "دولار أمريكي" },
        EUR: { rate: 4109.97, flag: "🇪🇺", name: "يورو" },
        SAR: { rate: 970.94, flag: "🇸🇦", name: "ريال سعودي" },
        AED: { rate: 989.56, flag: "🇦🇪", name: "درهم إماراتي" },
        EGP: { rate: 70.94, flag: "🇪🇬", name: "جنيه مصري" },
        QAR: { rate: 997.08, flag: "🇶🇦", name: "ريال قطري" }
      },
      lastUpdated: new Date().toISOString(),
      updatedBy: "system",
      source: "default",
      usd_sdg: 3611.89
    },
    parallel: {
      currencies: {
        USD: { rate: 7155, flag: "🇺🇸", name: "دولار أمريكي" },
        EUR: { rate: 8270, flag: "🇪🇺", name: "يورو" },
        SAR: { rate: 1820, flag: "🇸🇦", name: "ريال سعودي" },
        AED: { rate: 1950, flag: "🇦🇪", name: "درهم إماراتي" },
        EGP: { rate: 136, flag: "🇪🇬", name: "جنيه مصري" },
        QAR: { rate: 1950, flag: "🇶🇦", name: "ريال قطري" }
      },
      lastUpdated: new Date().toISOString(),
      updatedBy: "system",
      source: "default",
      usd_sdg: 7155
    },
    history: []
  };
}

// ✅ دالة لقراءة البيانات (مع دعم Render.com)
function loadRatesData() {
  try {
    // ✅ 1. محاولة قراءة من مسار Render.com أولاً
    const renderPath = '/tmp/rates.json';
    if (fs.existsSync(renderPath)) {
      const rawData = fs.readFileSync(renderPath, "utf8");
      const data = JSON.parse(rawData);
      if (data.official?.currencies && Object.keys(data.official.currencies).length > 0) {
        console.log("📊 تم تحميل البيانات من /tmp/rates.json (Render) بنجاح");
        return data;
      }
    }
    
    // ✅ 2. محاولة قراءة من المسار المحلي (data/rates.json)
    if (fs.existsSync(RATES_FILE)) {
      const rawData = fs.readFileSync(RATES_FILE, "utf8");
      const data = JSON.parse(rawData);
      if (data.official?.currencies && Object.keys(data.official.currencies).length > 0) {
        console.log("📊 تم تحميل البيانات من rates.json بنجاح");
        return data;
      }
    }
    
    // ✅ 3. محاولة قراءة من data.json
    if (fs.existsSync(DATA_FILE)) {
      const rawData = fs.readFileSync(DATA_FILE, "utf8");
      const data = JSON.parse(rawData);
      if (data.official?.currencies && Object.keys(data.official.currencies).length > 0) {
        console.log("📊 تم تحميل البيانات من data.json بنجاح");
        return data;
      }
    }
    
    console.log("⚠️ لا توجد بيانات، استخدام البيانات الافتراضية");
    return getDefaultRates();
  } catch (error) {
    console.error("❌ خطأ في تحميل البيانات:", error.message);
    return getDefaultRates();
  }
}

// ============================================================
// 🚀 تشغيل سكربت السحب عند بدء الخادم
// ============================================================

function runScraper() {
  console.log("🔄 [بدء] جلب الأسعار من alsoug.com...");
  const scriptPath = path.join(__dirname, "scrape-alsoug.js");
  
  exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
    if (error) {
      console.error("❌ فشل تشغيل سكربت السحب:", error.message);
      return;
    }
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    console.log("✅ تم تحديث البيانات بنجاح!");
  });
}

// ✅ تشغيل السكربت فور بدء الخادم (بعد 5 ثوانٍ)
setTimeout(runScraper, 5000);

// ✅ تحديث تلقائي كل ساعة
setInterval(() => {
  console.log("🔄 [تلقائي] جلب الأسعار من السوق السودان...");
  const scriptPath = path.join(__dirname, "scrape-alsoug.js");
  exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
    if (error) {
      console.error("❌ خطأ في السكربت:", error.message);
      return;
    }
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    console.log("✅ تم تحديث الأسعار تلقائياً");
  });
}, 60 * 60 * 1000);

console.log("⏰ سيتم تحديث الأسعار تلقائياً كل ساعة");

// ============================================================
// 📊 APIs
// ============================================================

// ✅ جلب أسعار العملات
app.get("/api/rates", (req, res) => {
  try {
    const data = loadRatesData();
    res.json({ success: true, ...data });
  } catch (error) {
    console.error("❌ خطأ في /api/rates:", error.message);
    res.json({ success: true, ...getDefaultRates() });
  }
});

// ============================================================
// 👥 نظام الزوار الوهميين
// ============================================================

// ✅ إنشاء ملف الزوار إذا لم يكن موجوداً
if (!fs.existsSync(VISITORS_FILE)) {
  const defaultVisitors = {
    total: 1000,
    today: 0,
    date: new Date().toISOString().split('T')[0],
    lastUpdate: new Date().toISOString()
  };
  fs.writeFileSync(VISITORS_FILE, JSON.stringify(defaultVisitors, null, 2));
  console.log("✅ تم إنشاء ملف visitors.json");
}

// ✅ دالة للحصول على بيانات الزوار
function getVisitors() {
  try {
    if (fs.existsSync(VISITORS_FILE)) {
      const data = JSON.parse(fs.readFileSync(VISITORS_FILE, 'utf8'));
      
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const savedDate = data.date || todayStr;
      
      if (savedDate !== todayStr) {
        const yesterdayToday = data.today || 0;
        data.total = (data.total || 0) + yesterdayToday;
        data.today = 0;
        data.date = todayStr;
        data.lastUpdate = now.toISOString();
        saveVisitors(data);
        console.log(`📅 يوم جديد - تم إضافة ${yesterdayToday} إلى الإجمالي (الإجمالي: ${data.total})`);
      }
      
      return data;
    }
  } catch (error) {
    console.error('خطأ في قراءة بيانات الزوار:', error.message);
  }
  
  const defaultData = {
    total: 1000,
    today: 0,
    date: new Date().toISOString().split('T')[0],
    lastUpdate: new Date().toISOString()
  };
  saveVisitors(defaultData);
  return defaultData;
}

// ✅ دالة لحفظ بيانات الزوار
function saveVisitors(data) {
  try {
    fs.writeFileSync(VISITORS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('خطأ في حفظ بيانات الزوار:', error.message);
  }
}

// ✅ تحديث الزوار كل ساعة
function updateVisitors() {
  const data = getVisitors();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  
  if (data.date !== todayStr) {
    const yesterdayToday = data.today || 0;
    data.total = (data.total || 0) + yesterdayToday;
    data.today = 0;
    data.date = todayStr;
    data.lastUpdate = now.toISOString();
  }
  
  const numbers = [9, 14, 17];
  const increase = numbers[Math.floor(Math.random() * numbers.length)];
  
  data.today = (data.today || 0) + increase;
  data.lastUpdate = now.toISOString();
  
  saveVisitors(data);
  console.log(`👥 تم تحديث الزوار: +${increase} (اليوم: ${data.today}, الإجمالي: ${data.total})`);
}

// ✅ تحديث الزوار كل ساعة
setInterval(updateVisitors, 60 * 60 * 1000);
setTimeout(updateVisitors, 5000);

// ✅ API الزوار
app.get('/api/visitors', (req, res) => {
  const data = getVisitors();
  res.json({
    success: true,
    total: data.total || 0,
    today: data.today || 0,
    lastUpdate: data.lastUpdate
  });
});

console.log('👥 نظام الزوار الوهميين يعمل (تحديث كل ساعة: +9/14/17)');
console.log('📊 بداية الإجمالي: 1000 زائر');
console.log('📅 سيتم إضافة زوار اليوم إلى الإجمالي عند منتصف الليل');

// ============================================================
// 🏠 الصفحات
// ============================================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ============================================================
// 🚀 تشغيل الخادم
// ============================================================

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  const data = loadRatesData();
  const currencyCount = data?.official?.currencies 
    ? Object.keys(data.official.currencies).length 
    : 0;
  console.log(`📊 عدد العملات المدعومة: ${currencyCount}`);
  console.log(`📂 المصدر: ${data?.official?.source || 'default'}`);
});
