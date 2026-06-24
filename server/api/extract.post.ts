import { GoogleGenerativeAI } from '@google/generative-ai'

/** Fields per category ID */
const CATEGORY_FIELDS: Record<string, string[]> = {
  '103': ['brand', 'model', 'price', 'currency', 'condition', 'dialColor', 'caseMaterial', 'strapMaterial', 'movementType'],
  '106': ['title', 'model', 'price', 'currency', 'material', 'moldType', 'year', 'weight'],
  '107': ['itemType', 'brand', 'model', 'price', 'currency', 'capacity', 'condition'],
  '108': ['itemType', 'brand', 'model', 'price', 'currency', 'year', 'condition'],
  '109': ['itemType', 'brand', 'model', 'price', 'currency', 'condition'],
  '110': ['itemType', 'brand', 'model', 'price', 'currency', 'year', 'condition'],
  '111': ['itemType', 'brand', 'model', 'price', 'currency', 'condition'],
  '112': ['itemType', 'brand', 'model', 'price', 'currency', 'condition'],
}

const FIELD_DESCRIPTIONS: Record<string, string> = {
  title: 'ชื่อสินค้า',
  price: 'ตัวเลขจำนวนเต็ม - ตัดจุลภาค (,) ออก, จุด (.) คือ decimal point ให้ปัดทิ้ง ไม่ใช่ thousands separator เช่น 1,560,000.00 → 1560000 | 1560000.00 → 1560000 | null',
  currency: 'สกุลเงิน เช่น THB, USD, JPY, EUR | null',
  condition: '"new" | "used" | "unknown" | null',
  brand: 'แบรนด์ เช่น Rolex, Apple',
  model: 'รุ่น เช่น Datejust 41, iPhone 15 Pro',
  itemType: 'ประเภทสินค้า เช่น โน้ตบุ๊ก, กระเป๋า',
  year: 'ปีผลิต',
  material: 'วัสดุ เช่น เนื้อทองคำ',
  moldType: 'ลักษณะพิมพ์/แบบพิมพ์',
  weight: 'น้ำหนัก เช่น 15.2g',
  capacity: 'ความจุ เช่น 512GB',
  dialColor: 'สีหน้าปัดนาฬิกา',
  caseMaterial: 'วัสดุตัวเรือนนาฬิกา',
  strapMaterial: 'วัสดุสายนาฬิกา',
  movementType: 'ประเภทเครื่อง เช่น Automatic, Quartz',
}

export default defineEventHandler(async (event) => {
  const { base64, mimeType, categoryId, template } = await readBody<{
    base64: string
    mimeType: string
    categoryId?: string
    template?: Record<string, string>
  }>(event)

  if (!base64) throw createError({ statusCode: 400, message: 'base64 image required' })

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey
  if (!apiKey) throw createError({ statusCode: 500, message: 'GEMINI_API_KEY not configured' })

  // Build schema from categoryId or custom template
  let fields: Record<string, string>
  if (template && Object.keys(template).length > 0) {
    fields = template
  } else {
    const fieldKeys = categoryId ? (CATEGORY_FIELDS[categoryId] ?? ['title', 'price', 'condition']) : ['title', 'price', 'condition']
    fields = Object.fromEntries(fieldKeys.map((k) => [k, FIELD_DESCRIPTIONS[k] ?? 'string | null']))
  }

  const schemaText = Object.entries(fields)
    .map(([k, v]) => `  "${k}": ${v}`)
    .join(',\n')

  const prompt = `คุณคือผู้ช่วยสกัดข้อมูลสินค้าจากภาพหน้าเว็บตลาดมือสองไทย
ตอบกลับเป็น JSON array ของสินค้าทุกชิ้นที่เห็นในภาพ ไม่มีข้อความอื่น ไม่มี markdown code block
ถ้าหาข้อมูลใดไม่ได้ให้ใส่ null

Schema แต่ละ item:
{
${schemaText}
}`

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' })

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64, mimeType: mimeType ?? 'image/jpeg' } },
  ])

  const text = result.response.text().trim()
  try {
    return { items: sanitizeItems(JSON.parse(text)) }
  } catch {
    return { items: [], raw: text }
  }
})
