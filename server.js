// server.js - النسخة المستقرة (قبل تعديلات الزوار)
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ============================================================
// 📂 البيانات
// ============================================================

const DATA_FILE = path.join(__dirname, "data.json");
const VISITORS_FILE = path.join(__dirname, "data", "visitors.json");

// ✅ التأكد من وجود مجلد data
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ✅ إنشاء ملف الزوار إذا لم يكن موجوداً
if (!fs.existsSync(VISITORS_FILE)) {
  const defaultData = {
    total: 1000,
    today: 0,
    date: new Date().toISOString().split('T')[0],
    lastUpdate: new Date().toISOString()
  };
  fs.writeFileSync(VISITORS_FILE, JSON.stringify(defaultData, null, 2));
}

// ============================================================
// 📊 APIs
// ============================================================

// ✅ جلب أسعار العملات
app.get("/api/rates", (req, res) => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      res.json({ success: true, ...data });
    } else {
      res.json({
        success: true,
        official: { currencies: {}, lastUpdated: new Date().toISOString() },
        parallel: { currencies: {}, lastUpdated: new Date().toISOString() }
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ جلب بيانات الزوار
app.get('/api/visitors', (req, res) => {
  try {
    if (fs.existsSync(VISITORS_FILE)) {
      const data = JSON.parse(fs.readFileSync(VISITORS_FILE, 'utf8'));
      res.json({ success: true, ...data });
    } else {
      res.json({ success: true, total: 1000, today: 0 });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 🏠 الصفحات
// ============================================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "index.html"));
});

// ============================================================
// 🚀 تشغيل الخادم
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});