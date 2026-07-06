// bank-monitor.js - فحص تلقائي بالكامل
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ============================================================
// 📋 قائمة البنوك (سترسل أنت الروابط)
// ============================================================
// 🔥 هنا ضع روابط API الخاصة بكل بنك
// سأقوم بفحصها كل 30 ثانية وتحديث الحالة تلقائياً

const BANKS = [
  {
    id: 'cbos',
    name: 'بنك السودان المركزي',
    apiUrl: 'https://cbos.gov.sd',  // <- رابط API
    icon: '🏦',
    type: 'بنك'
  },
  {
    id: 'bank-of-khartoum',
    name: 'بنك الخرطوم',
    apiUrl: 'https://bankofkhartoum.com',  // <- رابط API
    icon: '🏛️',
    type: 'بنك'
  },
  {
    id: 'obn',
    name: 'بنك أم درمان الوطني',
    apiUrl: 'https://www.obn-sd.com',  // <- رابط API
    icon: '🏛️',
    type: 'بنك'
  },
  {
    id: 'fibank',
    name: 'في بنك',
    apiUrl: 'https://fibank.sd',  // <- رابط API
    icon: '🏛️',
    type: 'بنك'
  },
  {
    id: 'abn',
    name: 'بنك أبو ظبي الإسلامي',
    apiUrl: 'https://www.abn-sd.com',  // <- رابط API
    icon: '🏛️',
    type: 'بنك'
  },
  {
    id: 'qnb',
    name: 'بنك قطر الوطني',
    apiUrl: 'https://www.qnb.com/sudan',  // <- رابط API
    icon: '🏛️',
    type: 'بنك'
  },
  {
    id: 'faisal',
    name: 'بنك فيصل الإسلامي',
    apiUrl: 'https://www.faisalbank-sd.com',  // <- رابط API
    icon: '🏛️',
    type: 'بنك'
  },
  {
    id: 'sib',
    name: 'البنك السوداني الإسلامي',
    apiUrl: 'https://www.sib.sd',  // <- رابط API
    icon: '🏛️',
    type: 'بنك'
  },
  {
    id: 'aljazeera',
    name: 'بنك الجزيرة السوداني',
    apiUrl: 'https://www.aljazeerabank.sd',  // <- رابط API
    icon: '🏛️',
    type: 'بنك'
  },
  {
    id: 'nilein',
    name: 'بنك النيلين',
    apiUrl: 'https://www.nileinbank.sd',  // <- رابط API
    icon: '🏛️',
    type: 'بنك'
  },
  // 🔥 أضف هنا أي بنك أو خدمة جديدة
  // {
  //   id: 'new-bank',
  //   name: 'اسم البنك',
  //   apiUrl: 'https://api.bank.com',  // <- رابط API
  //   icon: '🏛️',
  //   type: 'بنك'
  // }
];

// ============================================================
// 📂 مسار حفظ البيانات
// ============================================================
const isProduction = process.env.NODE_ENV === 'production';
const dataPath = isProduction
  ? path.join('/tmp', 'banks-status.json')
  : path.join(__dirname, 'data', 'banks-status.json');

const dataDir = path.join(__dirname, 'data');
if (!isProduction && !fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ============================================================
// 🔍 فحص بنك واحد
// ============================================================
async function checkBank(bank) {
  const startTime = Date.now();
  
  try {
    const response = await axios.get(bank.apiUrl, {
      timeout: 7000, // 7 ثواني
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar-SA,ar;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      },
      validateStatus: false // لا ترمي خطأ لأي حالة
    });
    
    const responseTime = Date.now() - startTime;
    const isUp = response.status >= 200 && response.status < 400;
    
    return {
      ...bank,
      status: isUp ? 'up' : 'down',
      statusCode: response.status,
      responseTime: responseTime,
      lastChecked: new Date().toISOString(),
      message: isUp ? '✅ يعمل' : `⚠️ خطأ ${response.status}`
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    let message = '❌ لا يمكن الاتصال';
    
    if (error.code === 'ECONNABORTED') {
      message = '⏰ انتهت المهلة (7 ثواني)';
    } else if (error.code === 'ENOTFOUND') {
      message = '🌐 الرابط غير موجود';
    } else if (error.code === 'ECONNREFUSED') {
      message = '🚫 الخادم يرفض الاتصال';
    }
    
    return {
      ...bank,
      status: 'down',
      statusCode: 0,
      responseTime: responseTime,
      lastChecked: new Date().toISOString(),
      message: message
    };
  }
}

// ============================================================
// 🔍 فحص جميع البنوك
// ============================================================
async function checkAllBanks() {
  console.log(`🔄 [${new Date().toLocaleTimeString()}] جاري فحص البنوك...`);
  
  const results = [];
  for (const bank of BANKS) {
    const result = await checkBank(bank);
    results.push(result);
    console.log(`   ${result.status === 'up' ? '✅' : '❌'} ${bank.name}: ${result.message} (${result.responseTime}ms)`);
    
    // تأخير بين الطلبات
    await new Promise(r => setTimeout(r, 200));
  }
  
  const upCount = results.filter(r => r.status === 'up').length;
  const summary = {
    lastUpdated: new Date().toISOString(),
    total: results.length,
    up: upCount,
    down: results.length - upCount,
    upPercentage: Math.round((upCount / results.length) * 100),
    banks: results
  };
  
  fs.writeFileSync(dataPath, JSON.stringify(summary, null, 2));
  console.log(`✅ [${new Date().toLocaleTimeString()}] تم الحفظ: ${upCount} يعمل / ${results.length - upCount} معطل`);
  
  return summary;
}

// ============================================================
// 📊 الحصول على آخر النتائج
// ============================================================
function getLastResults() {
  try {
    if (fs.existsSync(dataPath)) {
      return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
  } catch (error) {}
  return null;
}

// ============================================================
// 🚀 التشغيل التلقائي (كل 30 ثانية)
// ============================================================
// 🔥 هذا هو الجزء المهم: فحص كل 30 ثانية!

// تشغيل فوري عند بدء التشغيل
checkAllBanks().catch(console.error);

// جدولة الفحص كل 30 ثانية
setInterval(() => {
  checkAllBanks().catch(console.error);
}, 30 * 1000); // 30 ثانية

console.log('⏰ سيتم فحص البنوك تلقائياً كل 30 ثانية');

// ============================================================
// تصدير الدوال
// ============================================================
module.exports = { checkAllBanks, getLastResults, BANKS };