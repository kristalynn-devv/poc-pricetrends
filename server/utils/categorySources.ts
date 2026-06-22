export interface CategorySource {
  name: string
  url: string
  apiRoute?: string  // มี route พร้อมใช้แล้ว
}

export interface CategoryConfig {
  id: string[]
  label: string
  sources: CategorySource[]
}

export const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    id: ['103'],
    label: 'นาฬิกา',
    sources: [
      { name: 'StarBuyers Global Auction', url: 'https://www.starbuyers-global-auction.com/login' },
      { name: 'Chrono24', url: 'https://www.chrono24.com', apiRoute: '/api/chrono24-search' },
      { name: 'Auction House', url: 'https://www.auctionhouse.co.th', apiRoute: '/api/auctionhouse-search' },
      { name: 'Radium Watch', url: 'https://www.radiumwatch.com' },
      { name: 'Siam Watch Club', url: 'https://www.siamwatchclub.com' },
      { name: 'Komehyo (นาฬิกา)', url: 'https://www.komehyo.co.th/th' },
    ],
  },
  {
    id: ['106'],
    label: 'พระ/วัตถุมงคล',
    sources: [
      { name: 'Thaprachan', url: 'https://www.thaprachan.com/', apiRoute: '/api/thaprachan-search' },
      { name: 'Wutdychonburi', url: 'https://wutdychonburi.com/', apiRoute: '/api/wutdychonburi-search' },
      { name: 'Prapantip', url: 'https://www.prapantip.com/amulet/', apiRoute: '/api/prapantip-search' },
      { name: 'G-Pra', url: 'https://www.g-pra.com/' },
      { name: 'UAmulet', url: 'https://uauction.uamulet.com/AuctionUClubTopList.aspx', apiRoute: '/api/uauction-search' },
    ],
  },
  {
    id: ['107', '109', '112'],
    label: 'สินค้าไอที / โน้ตบุ๊ก / สมาร์ทโฟน',
    sources: [
      { name: 'ShopBKK', url: 'https://www.shopbkk.com', apiRoute: '/api/shopbkk-search' },
      { name: 'CompAsia', url: 'https://compasia.co.th', apiRoute: '/api/compasia-search' },
      { name: 'Kaidee', url: 'https://www.kaidee.com', apiRoute: '/api/kaidee-search' },
      { name: 'Pantipmarket (Mobile)', url: 'https://www.pantipmarket.com' },
      { name: '108 Accessory', url: 'http://www.108accessory.com/' },
    ],
  },
  {
    id: ['108', '110'],
    label: 'แบรนเนม / แว่นตา',
    sources: [
      { name: 'Komehyo', url: 'https://www.komehyo.co.th/' },
      { name: 'Sasom', url: 'https://sasom.co.th/th', apiRoute: '/api/sasom-search' },
      { name: 'Moppet Brandname', url: 'https://www.moppetbrandname.com/', apiRoute: '/api/moppet-search' },
      { name: 'SF Brandname', url: 'https://sfbrandname.com/', apiRoute: '/api/sfbrandname-search' },
      { name: 'Brandname Voyage', url: 'https://brandnamevoyage.com/', apiRoute: '/api/brandnamevoyage-search' },
    ],
  },
  {
    id: ['111'],
    label: 'เครื่องมือช่าง',
    sources: [
      { name: 'Kaidee (เครื่องมือช่าง)', url: 'https://www.kaidee.com/c296-appliances_decoration-accessories_and_tool_suppliers', apiRoute: '/api/kaidee-search' },
      { name: 'Shopee (เครื่องมือช่าง)', url: 'https://shopee.co.th/search?keyword=%E0%B9%80%E0%B8%84%E0%B8%A3%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%87%E0%B9%80%E0%B8%9B%E0%B9%88%E0%B8%B2%E0%B8%A5%E0%B8%A1' },
      { name: 'Truck2Hand', url: 'https://www.truck2hand.com/category/cat_equipment/', apiRoute: '/api/truck2hand-search' },
      { name: 'Facebook กลุ่ม 1', url: 'https://www.facebook.com/groups/198988708155849/' },
      { name: 'Facebook กลุ่ม 2', url: 'https://www.facebook.com/groups/4392804640788959/' },
      { name: 'Facebook กลุ่ม 3', url: 'https://www.facebook.com/groups/455495127955260/' },
    ],
  },
]

/** หา config ของหมวดที่ระบุ */
export function getCategoryConfig(categoryId: string): CategoryConfig | undefined {
  return CATEGORY_CONFIGS.find((c) => c.id.includes(categoryId))
}
