
// scrape-alsoug.js - مع دعم البيئات المختلفة
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// ============================================================
// 📂 تحديد مسار حفظ البيانات حسب البيئة
// ============================================================

const isProduction = process.env.NODE_ENV === 'production';

// مجلد البيانات (للاستخدام المحلي فقط)
const dataDir = path.join(__dirname, 'data');
if (!isProduction && !fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// مسار ملف البيانات
const dataPath = isProduction 
  ? path.join('/tmp', 'rates.json')      // ✅ على Render/Vercel
  : path.join(dataDir, 'rates.json');    // ✅ على جهازك المحلي

console.log(`📂 بيئة التشغيل: ${isProduction ? 'إنتاج (Production)' : 'تطوير (Development)'}`);
console.log(`📂 مسار حفظ البيانات: ${dataPath}`);

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
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar-SA,ar;q=0.9,en;q=0.8'
      }
    });
    
    const $ = cheerio.load(response.data);

    // البحث عن جدول الأسعار
    const ratesTable = $('table').filter((i, el) => {
      return $(el).text().includes('بنك الخرطوم') && $(el).text().includes('البديل');
    }).first();

    if (ratesTable.length === 0) {
      console.log('❌ لم يتم العثور على جدول الأسعار');
      return null;
    }

    const rates = {};
    
    ratesTable.find('tr').each((i, row) => {
      if (i === 0) return;

      const columns = $(row).find('td');
      if (columns.length >= 3) {
        let currencyText = $(columns[0]).text().trim();
        currencyText = currencyText.replace(/^[^\s]+\s/, '').trim();
        
        // استخراج رمز العملة
        let code = null;
        for (const [name, currencyCode] of Object.entries(currencyMap)) {
          if (currencyText.includes(name)) {
            code = currencyCode;
            break;
          }
        }
        
        if (!code) {
          code = currencyText.substring(0, 3).toUpperCase();
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
// 📊 تحديث النظام بالأسعار (العملات الموجودة فقط)
// ============================================================
async function updateSystemWithRates(rates) {
  if (!rates || !rates.USD) {
    console.log('⚠️ لم يتم العثور على سعر الدولار');
    return false;
  }

  try {
    const usdRate = rates.USD;
    
    // قراءة البيانات الحالية
    let currentData = {};
    if (fs.existsSync(dataPath)) {
      currentData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }

    // بناء بيانات العملات الرسمية - فقط العملات الموجودة في الموقع
    const officialCurrencies = {};
    const parallelCurrencies = {};
    
    // ✅ إضافة العملات الموجودة فقط من الموقع
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

    // تحديث البيانات
    const newData = {
      official: {
        currencies: officialCurrencies,
        lastUpdated: new Date().toISOString(),
        updatedBy: 'alsoug_scraper',
        source: 'alsoug.com',
        usd_sdg: usdRate.bank || 0
      },
      parallel: {
        currencies: parallelCurrencies,
        lastUpdated: new Date().toISOString(),
        updatedBy: 'alsoug_scraper',
        source: 'alsoug.com',
        usd_sdg: usdRate.parallel || 0
      },
      history: currentData.history || []
    };

    // إضافة سجل التحديث
    newData.history.unshift({
      action: 'alsoug_update',
      source: 'alsoug.com',
      official: usdRate.bank || 0,
      parallel: usdRate.parallel || 0,
      oldOfficial: currentData.official?.usd_sdg || 0,
      timestamp: new Date().toISOString()
    });

    // حفظ البيانات
    fs.writeFileSync(dataPath, JSON.stringify(newData, null, 2));
    console.log('✅ تم تحديث ملف البيانات بنجاح');
    console.log(`💰 عدد العملات المحفوظة: ${Object.keys(rates).length}`);
    console.log(`💰 السعر الرسمي (بنك الخرطوم): ${usdRate.bank || 0} ج.س`);
    console.log(`💰 السعر الموازي (البديل): ${usdRate.parallel || 0} ج.س`);
    
    return true;
  } catch (error) {
    console.error('❌ خطأ في تحديث البيانات:', error.message);
    return false;
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
  
  if (rates) {
    console.log('\n📊 الأسعار المستخرجة من alsoug.com:');
    console.log(JSON.stringify(rates, null, 2));
    await updateSystemWithRates(rates);
  } else {
    console.log('❌ فشل في جلب الأسعار من alsoug.com');
  }
}

// تشغيل السكربت
main().catch(console.error);

// تصدير الدوال
module.exports = { fetchRatesFromAlsoug, updateSystemWithRates };