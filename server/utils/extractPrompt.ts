const BASE_FIELDS: Record<string, string> = {
  price: 'ตัวเลขจำนวนเต็ม - ตัดจุลภาค (,) ออก, จุด (.) คือ decimal point ให้ปัดทิ้ง ไม่ใช่ thousands separator เช่น 1,560,000.00 → 1560000 | null',
  currency: 'สกุลเงิน เช่น THB, USD, JPY, EUR | null',
}

const FIELD_DESCRIPTIONS_BY_CATEGORY: Record<string, Record<string, string>> = {
  '103': {
    ...BASE_FIELDS,
    brand: 'แบรนด์ เช่น Rolex, Omega, AP, Patek Philippe',
    model: 'รุ่น เช่น Datejust 41, Seamaster, Royal Oak',
    condition: '"new" | "used" | "unknown" | null',
    dialColor: 'สีหน้าปัดนาฬิกา',
    caseMaterial: 'วัสดุตัวเรือนนาฬิกา',
    strapMaterial: 'วัสดุสายนาฬิกา',
    movementType: 'ประเภทเครื่อง เช่น Automatic, Quartz',
  },
  '106': {
    ...BASE_FIELDS,
    title: 'ชื่อพระ/วัตถุมงคล',
    model: 'รุ่น เช่น รุ่นแรก, รุ่น 2',
    material: 'วัสดุ เช่น เนื้อทองคำ, เนื้อเงิน, เนื้อนวะ | null',
    moldType: 'แม่พิมพ์/พิมพ์ เช่น พิมพ์ใหญ่, พิมพ์เล็ก | null',
    year: 'ปีที่สร้าง/ปี พ.ศ. | null',
    weight: 'น้ำหนัก | null',
  },
  '107': {
    ...BASE_FIELDS,
    itemType: 'ประเภทสินค้า เช่น smartphone, notebook, tablet | null',
    brand: 'แบรนด์ เช่น Apple, Samsung, Lenovo | null',
    model: 'รุ่น เช่น iPhone 16 Pro, MacBook Air M2 | null',
    capacity: 'ความจุ/สเปก เช่น 256GB, 16GB RAM | null',
    condition: 'สภาพ เช่น ใหม่, มือสอง, 99% | null',
  },
  '108': {
    ...BASE_FIELDS,
    itemType: 'ประเภทสินค้า เช่น handbag, watch, sunglasses, wallet | null',
    brand: 'แบรนด์ เช่น Gucci, Louis Vuitton, Chanel | null',
    model: 'รุ่น เช่น GG Marmont, Speedy 30 | null',
    year: 'ปีผลิต/ปีที่ระบุ | null',
    condition: 'สภาพ เช่น ใหม่, มือสอง, 99% | null',
  },
  '111': {
    ...BASE_FIELDS,
    itemType: 'ประเภทสินค้า เช่น รถแบคโฮ, รถเกรด, เครื่องปั๊ม, เครื่องกำเนิดไฟ | null',
    brand: 'แบรนด์ เช่น Komatsu, Caterpillar, Hitachi, Kubota | null',
    model: 'รุ่น เช่น PC200-8, 320D | null',
    condition: 'สภาพ เช่น ใหม่, มือสอง, สภาพดี | null',
  },
}
FIELD_DESCRIPTIONS_BY_CATEGORY['109'] = FIELD_DESCRIPTIONS_BY_CATEGORY['107']
FIELD_DESCRIPTIONS_BY_CATEGORY['110'] = FIELD_DESCRIPTIONS_BY_CATEGORY['108']
FIELD_DESCRIPTIONS_BY_CATEGORY['112'] = FIELD_DESCRIPTIONS_BY_CATEGORY['107']

export const CATEGORY_FIELDS: Record<string, string[]> = {
  '103': ['brand', 'model', 'price', 'currency', 'condition', 'dialColor', 'caseMaterial', 'strapMaterial', 'movementType'],
  '106': ['title', 'model', 'price', 'currency', 'material', 'moldType', 'year', 'weight'],
  '107': ['itemType', 'brand', 'model', 'price', 'currency', 'capacity', 'condition'],
  '108': ['itemType', 'brand', 'model', 'price', 'currency', 'year', 'condition'],
  '109': ['itemType', 'brand', 'model', 'price', 'currency', 'capacity', 'condition'],
  '110': ['itemType', 'brand', 'model', 'price', 'currency', 'year', 'condition'],
  '111': ['itemType', 'brand', 'model', 'price', 'currency', 'condition'],
  '112': ['itemType', 'brand', 'model', 'price', 'currency', 'capacity', 'condition'],
}

const CATEGORY_LABEL: Record<string, string> = {
  '103': 'นาฬิกามือสอง',
  '106': 'พระ/วัตถุมงคล',
  '107': 'สินค้าไอทีมือสอง',
  '108': 'สินค้าแบรนด์เนมมือสอง',
  '109': 'สินค้าไอทีมือสอง',
  '110': 'สินค้าแบรนด์เนมมือสอง',
  '111': 'สินค้าเครื่องมือช่างและเครื่องจักรมือสอง',
  '112': 'สินค้าไอทีมือสอง',
}

export function getCategoryLabel(categoryId: string): string {
  return CATEGORY_LABEL[categoryId] ?? 'สินค้ามือสอง'
}

export function buildSchema(categoryId: string, template?: Record<string, string>): string {
  if (template && Object.keys(template).length > 0) {
    return Object.entries(template).map(([k, v]) => `  "${k}": ${v}`).join(',\n')
  }
  const descs = FIELD_DESCRIPTIONS_BY_CATEGORY[categoryId] ?? {}
  const keys = CATEGORY_FIELDS[categoryId] ?? ['brand', 'model', 'price', 'currency']
  const entries = keys.map((k) => [k, descs[k] ?? 'string | null'] as [string, string])
  return entries.map(([k, v]) => `  "${k}": ${v}`).join(',\n')
}

export function buildExtractPrompt(options: {
  siteName: string
  categoryId: string
  schemaText: string
  mode: 'listing' | 'detail'
  extra?: string
}): string {
  const { siteName, categoryId, schemaText, mode, extra } = options
  const label = getCategoryLabel(categoryId)

  const modeText = mode === 'detail'
    ? `นี่คือหน้า product detail - สกัดเฉพาะ **สินค้าหลัก** ที่เป็นหัวข้อของหน้านี้เท่านั้น ห้ามรวมสินค้าแนะนำ, สินค้าที่เกี่ยวข้อง, หรือสินค้าอื่นๆ ที่แสดงอยู่ด้านล่าง\nตอบกลับเป็น JSON array ที่มี **1 element เท่านั้น** ไม่มีข้อความอื่น ไม่มี markdown code block`
    : `ตอบกลับเป็น JSON array ของสินค้าทุกชิ้นที่เห็นในภาพ ไม่มีข้อความอื่น ไม่มี markdown code block`

  return `คุณคือผู้ช่วยสกัดข้อมูล${label}จากภาพหน้าเว็บ ${siteName}
${modeText}
ถ้าหาข้อมูลใดไม่ได้ให้ใส่ null${extra ? '\n' + extra : ''}

Schema แต่ละ item:
{
${schemaText}
}`
}
