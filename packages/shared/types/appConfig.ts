export interface AppConfig {
  /** จำนวน source ที่รันพร้อมกันได้สูงสุด ต่อหมวด — ใช้ร่วมกันทั้ง manual run, cron, และ source check */
  concurrency: number
}
