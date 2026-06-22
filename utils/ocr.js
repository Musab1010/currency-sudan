// utils/ocr.js
const Tesseract = require("tesseract.js");
const fs = require("fs");

// استخراج النص من الصورة
async function extractTextFromImage(imagePath) {
  try {
    const { data } = await Tesseract.recognize(imagePath, "ara+eng", {
      logger: (m) => console.log(m),
    });
    
    // حذف الصورة بعد المعالجة (اختياري)
    // fs.unlinkSync(imagePath);
    
    return data.text;
  } catch (error) {
    console.error("OCR Error:", error);
    throw new Error("Failed to extract text from image");
  }
}

// استخراج الأسعار من النص
async function extractCurrencyFromText(text) {
  const rates = {};
  
  // أنماط البحث للعملات المختلفة
  const patterns = {
    USD: [/USD\s*[:]?\s*(\d+(?:\.\d+)?)/i, /دولار\s*[:]?\s*(\d+(?:\.\d+)?)/i, /\$(\d+(?:\.\d+)?)/],
    EUR: [/EUR\s*[:]?\s*(\d+(?:\.\d+)?)/i, /يورو\s*[:]?\s*(\d+(?:\.\d+)?)/i, /€(\d+(?:\.\d+)?)/],
    GBP: [/GBP\s*[:]?\s*(\d+(?:\.\d+)?)/i, /جنيه إسترليني\s*[:]?\s*(\d+(?:\.\d+)?)/i],
    SAR: [/SAR\s*[:]?\s*(\d+(?:\.\d+)?)/i, /ريال سعودي\s*[:]?\s*(\d+(?:\.\d+)?)/i],
    AED: [/AED\s*[:]?\s*(\d+(?:\.\d+)?)/i, /درهم إماراتي\s*[:]?\s*(\d+(?:\.\d+)?)/i],
    QAR: [/QAR\s*[:]?\s*(\d+(?:\.\d+)?)/i, /ريال قطري\s*[:]?\s*(\d+(?:\.\d+)?)/i],
    KWD: [/KWD\s*[:]?\s*(\d+(?:\.\d+)?)/i, /دينار كويتي\s*[:]?\s*(\d+(?:\.\d+)?)/i],
    EGP: [/EGP\s*[:]?\s*(\d+(?:\.\d+)?)/i, /جنيه مصري\s*[:]?\s*(\d+(?:\.\d+)?)/i],
    TRY: [/TRY\s*[:]?\s*(\d+(?:\.\d+)?)/i, /ليرة تركية\s*[:]?\s*(\d+(?:\.\d+)?)/i],
  };

  for (const [currency, patternList] of Object.entries(patterns)) {
    for (const pattern of patternList) {
      const match = text.match(pattern);
      if (match && match[1]) {
        rates[currency] = parseFloat(match[1]);
        break;
      }
    }
  }

  return rates;
}

module.exports = { extractTextFromImage, extractCurrencyFromText };