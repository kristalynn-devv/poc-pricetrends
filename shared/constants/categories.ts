export const CATEGORY_NAMES: Record<string, string> = {
  '103': 'นาฬิกา',
  '106': 'พระ / วัตถุมงคล',
  '107': 'IT / โน้ตบุ๊ก',
  '108': 'แบรนด์เนม',
  '109': 'สมาร์ทโฟน',
  '110': 'แว่นตา',
  '111': 'เครื่องมือช่าง',
  '112': 'อุปกรณ์ไอที',
}

/** Categories that share the same field template on the server. */
export const CATEGORY_ALIAS: Record<string, string> = {
  '109': '107',
  '112': '107',
  '110': '108',
}

export function resolveCategoryId(categoryId: string): string {
  return CATEGORY_ALIAS[categoryId] ?? categoryId
}
