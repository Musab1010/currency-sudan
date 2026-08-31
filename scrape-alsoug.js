// scrape-alsoug.js - نسخة محسنة للعمل على Render.com
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// ============================================================
// 📂 تحديد مسار حفظ البيانات حسب البيئة
// ============================================================

const isProduction = process.env.NODE_ENV === 'production';

// ✅ مسار البيانات الصحيح في بيئة الإنتاج
const dataPath = isProduction 
  ? '/tmp/rates.json'  // ✅ Render.com يستخدم /tmp كمجلد مؤقت
  : path.join(__dirname, 'data', 'rates.json');

console.log(`📂 بيئة التشغيل: ${isProduction ? 'إنتاج (Production)' : 'تطوير (Development)'}`);
console.log(`📂 مسار حفظ البيانات: ${dataPath}`);

// ============================================================
// 📊 البيانات الافتراضية (في حالة فشل الجلب)
// ============================================================

const DEFAULT_RATES = {
  official: {
    currencies: {
      USD: { rate: 3577, flag: "🇺🇸", name: "دولار أمريكي" },
      EUR: { rate: 4045, flag: "🇪🇺", name: "يورو" },
      SAR: { rate: 961, flag: "🇸🇦", name: "ريال سعودي" },
      AED: { rate: 980, flag: "🇦🇪", name: "درهم إماراتي" },
      EGP: { rate: 71, flag: "🇪🇬", name: "جنيه مصري" },
      QAR: { rate: 986, flag: "🇶🇦", name: "ريال قطري" }
    },
    lastUpdated: new Date().toISOString(),
    updatedBy: "system",
    source: "default",
    usd_sdg: 3577
  },
  parallel: {
    currencies: {
      USD: { rate: 3600, flag: "🇺🇸", name: "دولار أمريكي" },
      EUR: { rate: 4100, flag: "🇪🇺", name: "يورو" },
      SAR: { rate: 970, flag: "🇸🇦", name: "ريال سعودي" },
      AED: { rate: 990, flag: "🇦🇪", name: "درهم إماراتي" },
      EGP: { rate: 72, flag: "🇪🇬", name: "جنيه مصري" },
      QAR: { rate: 995, flag: "🇶🇦", name: "ريال قطري" }
    },
    lastUpdated: new Date().toISOString(),
    updatedBy: "system",
    source: "default",
    usd_sdg: 3600
  },
  history: []
};

// ============================================================
// 📊 خريطة العملات
// ============================================================

const currencyMap = {
  'الدولار الامريكي': 'USD',
  'الدولار': 'USD',
  'الدرهم الاماراتي': 'AED',
  'الاماراتي': 'AED',
  'اليورو': 'EUR',
  'الريال السعودي': 'SAR',
  'السعودي': 'SAR',
  'الجنيه المصري': 'EGP',
  'المصري': 'EGP',
  'الريال القطري': 'QAR',
  'القطري': 'QAR'
};

// ============================================================
// 🌐 جلب الأسعار من alsoug.com
// ============================================================

async function fetchRatesFromAlsoug() {
  try {
    console.log('🔄 جاري سحب الأسعار من موقع سوق السودان...');
    
    const response = await axios.get('https://www.alsoug.com/currency', {
      timeout: 15000,  // ✅ تقليل وقت الانتظار
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar-SA,ar;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    });
    
    const $ = cheerio.load(response.data);
    const rates = {};

    // ✅ البحث عن الجدول بشكل أكثر مرونة
    const tables = $('table');
    let ratesTable = null;
    
    tables.each((i, table) => {
      const text = $(table).text();
      if (text.includes('بنك الخرطوم') && text.includes('البديل')) {
        ratesTable = $(table);
        return false;
      }
    });

    if (!ratesTable || ratesTable.length === 0) {
      console.log('❌ لم يتم العثور على جدول الأسعار');
      return null;
    }

    // ✅ استخراج البيانات من الجدول
    ratesTable.find('tr').each((i, row) => {
      if (i === 0) return;  // تخطي رأس الجدول

      const columns = $(row).find('td');
      if (columns.length >= 3) {
        let currencyText = $(columns[0]).text().trim();
        // ✅ تنظيف النص
        currencyText = currencyText.replace(/^[^\s]+\s/, '').trim();
        
        // ✅ استخراج رمز العملة
        let code = null;
        for (const [name, currencyCode] of Object.entries(currencyMap)) {
          if (currencyText.includes(name)) {
            code = currencyCode;
            break;
          }
        }
        
        if (!code) {
          // ✅ محاولة استخراج الرمز من النص
          const match = currencyText.match(/\(([A-Z]{3})\)/);
          if (match) {
            code = match[1];
          } else {
            code = currencyText.substring(0, 3).toUpperCase();
          }
        }

        const bankRate = parseFloat($(columns[1]).text().trim().replace(/,/g, '')) || 0;
        const parallelRate = parseFloat($(columns[2]).text().trim().replace(/,/g, '')) || 0;

        if (bankRate > 0 || parallelRate > 0) {
          rates[code] = {
            bank: bankRate,
            parallel: parallelRate,
            name: currencyText
          };
          console.log(`   ✅ ${code}: ${bankRate} / ${parallelRate}`);
        }
      }
    });

    console.log(`✅ تم جلب ${Object.keys(rates).length} عملة من alsoug.com`);
    return rates;
    
  } catch (error) {
    console.error('❌ خطأ في جلب البيانات من alsoug.com:', error.message);
    return null;
  }
}

// ============================================================
// 📊 تحديث النظام بالأسعار
// ============================================================

async function updateSystemWithRates(rates) {
  try {
    // ✅ إذا لم تكن هناك بيانات من الموقع، استخدم الافتراضية
    if (!rates || Object.keys(rates).length === 0) {
      console.log('⚠️ لا توجد بيانات من الموقع، استخدام البيانات الافتراضية');
      fs.writeFileSync(dataPath, JSON.stringify(DEFAULT_RATES, null, 2));
      console.log('✅ تم حفظ البيانات الافتراضية');
      return true;
    }

    // ✅ قراءة البيانات الحالية
    let currentData = {};
    if (fs.existsSync(dataPath)) {
      try {
        currentData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      } catch (e) {
        currentData = { history: [] };
      }
    }

    // ✅ بناء بيانات العملات
    const officialCurrencies = {};
    const parallelCurrencies = {};
    
    for (const [code, data] of Object.entries(rates)) {
      officialCurrencies[code] = {
        name: data.name || code,
        code: code,
        rate: data.bank || 0,
        flag: getFlag(code),
        type: 'official'
      };
      
      parallelCurrencies[code] = {
        name: data.name || code,
        code: code,
        rate: data.parallel || 0,
        flag: getFlag(code),
        type: 'parallel'
      };
    }

    // ✅ إذا لم تكن هناك عملات، استخدم الافتراضية
    if (Object.keys(officialCurrencies).length === 0) {
      console.log('⚠️ لا توجد عملات مستخرجة، استخدام البيانات الافتراضية');
      fs.writeFileSync(dataPath, JSON.stringify(DEFAULT_RATES, null, 2));
      return true;
    }

    // ✅ تحديث البيانات
    const newData = {
      official: {
        currencies: officialCurrencies,
        lastUpdated: new Date().toISOString(),
        updatedBy: 'alsoug_scraper',
        source: 'alsoug.com',
        usd_sdg: rates.USD?.bank || 0
      },
      parallel: {
        currencies: parallelCurrencies,
        lastUpdated: new Date().toISOString(),
        updatedBy: 'alsoug_scraper',
        source: 'alsoug.com',
        usd_sdg: rates.USD?.parallel || 0
      },
      history: currentData.history || []
    };

    // ✅ إضافة سجل التحديث
    newData.history.unshift({
      action: 'alsoug_update',
      source: 'alsoug.com',
      official: rates.USD?.bank || 0,
      parallel: rates.USD?.parallel || 0,
      oldOfficial: currentData.official?.usd_sdg || 0,
      timestamp: new Date().toISOString()
    });

    // ✅ حفظ البيانات
    fs.writeFileSync(dataPath, JSON.stringify(newData, null, 2));
    console.log('✅ تم تحديث ملف البيانات بنجاح');
    console.log(`💰 عدد العملات المحفوظة: ${Object.keys(rates).length}`);
    console.log(`💰 السعر الرسمي: ${rates.USD?.bank || 0} ج.س`);
    console.log(`💰 السعر الموازي: ${rates.USD?.parallel || 0} ج.س`);
    
    return true;
    
  } catch (error) {
    console.error('❌ خطأ في تحديث البيانات:', error.message);
    // ✅ في حالة الخطأ، استخدم البيانات الافتراضية
    fs.writeFileSync(dataPath, JSON.stringify(DEFAULT_RATES, null, 2));
    console.log('✅ تم حفظ البيانات الافتراضية كحل احتياطي');
    return true;
  }
}

// ============================================================
// 🚩 دوال مساعدة
// ============================================================

function getFlag(code) {
  const flags = {
    USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', SAR: '🇸🇦',
    AED: '🇦🇪', QAR: '🇶🇦', KWD: '🇰🇼', BHD: '🇧🇭',
    OMR: '🇴🇲', JOD: '🇯🇴', EGP: '🇪🇬', TRY: '🇹🇷',
    CNY: '🇨🇳', INR: '🇮🇳', CHF: '🇨🇭', CAD: '🇨🇦',
    AUD: '🇦🇺'
  };
  return flags[code] || '💱';
}

// ============================================================
// 🚀 التشغيل الرئيسي
// ============================================================

async function main() {
  console.log('🔄 جاري جلب الأسعار من موقع سوق السودان...');
  const rates = await fetchRatesFromAlsoug();
  
  if (rates && Object.keys(rates).length > 0) {
    console.log('\n📊 الأسعار المستخرجة من alsoug.com:');
    console.log(JSON.stringify(rates, null, 2));
    await updateSystemWithRates(rates);
  } else {
    console.log('⚠️ فشل في جلب الأسعار، استخدام البيانات الافتراضية');
    await updateSystemWithRates(null);
  }
}

// ✅ تشغيل السكربت إذا تم استدعاؤه مباشرة
if (require.main === module) {
  main().catch(console.error);
}

// ✅ تصدير الدوال
module.exports = { fetchRatesFromAlsoug, updateSystemWithRates };