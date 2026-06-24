export interface FieldDef { key: string; label: string }

// price + currency are common to all categories
const COMMON_FIELDS: FieldDef[] = [
  { key: 'price', label: 'ราคา' },
  { key: 'currency', label: 'สกุลเงิน' },
]

const CATEGORY_FIELDS: Record<string, { required: FieldDef[]; optional: FieldDef[] }> = {
  '103': {
    required: [{ key: 'brand', label: 'แบรนด์' }, { key: 'model', label: 'รุ่น' }],
    optional: [
      { key: 'dialColor', label: 'สีหน้าปัด' },
      { key: 'caseMaterial', label: 'วัสดุตัวเรือน' },
      { key: 'strapMaterial', label: 'วัสดุสายนาฬิกา' },
      { key: 'movementType', label: 'ระบบ' },
      { key: 'condition', label: 'สภาพ' },
    ],
  },
  '106': {
    required: [{ key: 'title', label: 'ชื่อ/ยี่ห้อ' }, { key: 'material', label: 'วัสดุ' }],
    optional: [
      { key: 'model', label: 'รุ่น' },
      { key: 'moldType', label: 'พิมพ์' },
      { key: 'year', label: 'ปี' },
      { key: 'weight', label: 'น้ำหนัก' },
    ],
  },
  '107': {
    required: [{ key: 'brand', label: 'แบรนด์' }, { key: 'model', label: 'รุ่น' }],
    optional: [
      { key: 'itemType', label: 'ประเภท' },
      { key: 'capacity', label: 'ความจุ/สเปก' },
      { key: 'condition', label: 'สภาพ' },
    ],
  },
  '108': {
    required: [{ key: 'brand', label: 'แบรนด์' }, { key: 'model', label: 'รุ่น' }],
    optional: [
      { key: 'itemType', label: 'ประเภท' },
      { key: 'condition', label: 'สภาพ' },
      { key: 'year', label: 'ปี' },
    ],
  },
  '111': {
    required: [{ key: 'brand', label: 'แบรนด์' }, { key: 'model', label: 'รุ่น' }],
    optional: [
      { key: 'itemType', label: 'ประเภท' },
      { key: 'condition', label: 'สภาพ' },
    ],
  },
}

// categories sharing the same field definition
const CATEGORY_ALIAS: Record<string, string> = {
  '109': '107',
  '112': '107',
  '110': '108',
}

export function useCategoryFields() {
  function getFields(categoryId: string) {
    const id = CATEGORY_ALIAS[categoryId] ?? categoryId
    return CATEGORY_FIELDS[id] ?? {
      required: [{ key: 'brand', label: 'แบรนด์' }, { key: 'model', label: 'รุ่น' }],
      optional: [],
    }
  }

  function getAllowedKeys(categoryId: string): Set<string> {
    const { required, optional } = getFields(categoryId)
    return new Set([
      ...required.map((f) => f.key),
      ...optional.map((f) => f.key),
      ...COMMON_FIELDS.map((f) => f.key),
    ])
  }

  return { getFields, getAllowedKeys, COMMON_FIELDS }
}
