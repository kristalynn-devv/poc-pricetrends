export interface CategoryRunConfig {
  /** จำนวน source สูงสุดที่จะดึงต่อรอบค้นหา (หยุดก่อนเมื่อได้ผลลัพธ์ครบ) */
  maxSources: number
  /** จำนวนชิ้นที่ดึงต่อ source (ใช้เป็นค่า default ของ limit เมื่อ source ไม่มี override ของตัวเอง) */
  itemsPerSource: number
}
