// bank-checker.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ============================================================
// 📋 قائمة البنوك السودانية
// ============================================================
const BANKS = [
  { id: 'cbos', name: 'بنك السودان المركزي', url: 'https://cbos.gov.sd', icon: '🏦' },
  { id: 'bank-of-khartoum', name: 'بنك الخرطوم', url: 'https://bankofkhartoum.com', icon: '🏛️' },
  { id: 'obn', name: 'بنك أم درمان الوطني', url: 'https://www.obn-sd.com', icon: '🏛️' },
  { id: 'fibank', name: 'في بنك', url: 'https://fibank.sd', icon: '🏛️' },
  { id: 'abn', name: 'بنك أبو ظبي الإسلامي', url: 'https://www.abn-sd.com', icon: '🏛️' },
  { id: 'qnb', name: 'بنك قطر الوطني - السودان', url: 'https://www.qnb.com/sudan', icon: '🏛️' },
  { id: 'faisal', name: 'بنك فيصل الإسلامي', url: 'https://www.faisalbank-sd.com', icon: '🏛️' },
  { id: 'sib', name: 'البنك السوداني الإسلامي', url: 'https://www.sib.sd', icon: '🏛️' },
  { id: 'aljazeera', name: 'بنك الجزيرة السوداني', url: 'https://www.aljazeerabank.sd', icon: '🏛️' },
  { id: 'nilein', name: 'بنك النيلين', url: 'https://www.nileinbank.sd', icon: '🏛️' }
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
    const response = await axios.get(bank.url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      validateStatus: false
    });
    
    const isUp = response.status >= 200 && response.status < 400;
    const responseTime = Date.now() - startTime;
    
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
    if (error.code === 'ECONNABORTED') message = '⏰ انتهت المهلة';
    
    return {
      ...bank,
      status: 'down',
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
  console.log('🔄 جاري فحص البنوك...');
  
  const results = [];
  for (const bank of BANKS) {
    const result = await checkBank(bank);
    results.push(result);
    console.log(`   ${result.status === 'up' ? '✅' : '❌'} ${bank.name}: ${result.message}`);
    
    // تأخير بين الطلبات
    await new Promise(r => setTimeout(r, 500));
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
  console.log(`✅ تم حفظ نتائج البنوك (${upCount} يعمل)`);
  
  return summary;
}

// ============================================================
// 📊 الحصول على آخر نتائج الفحص
// ============================================================
function getLastResults() {
  try {
    if (fs.existsSync(dataPath)) {
      const rawData = fs.readFileSync(dataPath, 'utf8');
      return JSON.parse(rawData);
    }
  } catch (error) {
    console.error('⚠️ خطأ في قراءة نتائج البنوك:', error.message);
  }
  return null;
}

// ============================================================
// 🚀 التشغيل
// ============================================================
if (require.main === module) {
  checkAllBanks().catch(console.error);
}

module.exports = { checkAllBanks, getLastResults, BANKS };