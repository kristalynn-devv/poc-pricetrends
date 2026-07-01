import { SEARCH_ROUTES } from './searchRoutes'

export interface CategorySourceDef {
  name: string
  url: string
  apiRoute?: string
}

export interface CategoryGroupDef {
  label: string
  ids: string[]
  sources: CategorySourceDef[]
}

/** Single source of truth for category → source list. Used by client (searchGroups store) and server (cron runner). */
export const CATEGORY_GROUPS: CategoryGroupDef[] = [
  {
    label: 'นาฬิกา', ids: ['103'], sources: [
      { name: 'StarBuyers Global Auction', url: 'https://www.starbuyers-global-auction.com/login' },
      { name: 'Chrono24', url: 'https://www.chrono24.com', apiRoute: SEARCH_ROUTES.chrono24 },
      { name: 'Auction House', url: 'https://www.auctionhouse.co.th', apiRoute: SEARCH_ROUTES.auctionhouse },
      { name: 'Radium Watch', url: 'https://radiumwatch.com', apiRoute: SEARCH_ROUTES.radiumwatch },
      { name: 'Siam Watch Club', url: 'https://www.siamwatchclub.com', apiRoute: SEARCH_ROUTES.siamwatchclub },
      { name: 'Komehyo (นาฬิกา)', url: 'https://www.komehyo.co.th', apiRoute: SEARCH_ROUTES.komehyo },
    ],
  },
  {
    label: 'พระ / วัตถุมงคล', ids: ['106'], sources: [
      { name: 'Thaprachan', url: 'https://www.thaprachan.com/', apiRoute: SEARCH_ROUTES.thaprachan },
      { name: 'Wutdychonburi', url: 'https://wutdychonburi.com/', apiRoute: SEARCH_ROUTES.wutdychonburi },
      { name: 'Prapantip', url: 'https://www.prapantip.com/amulet/', apiRoute: SEARCH_ROUTES.prapantip },
      { name: 'G-Pra', url: 'https://www.g-pra.com/' },
      { name: 'UAmulet', url: 'https://uauction.uamulet.com/AuctionUClubTopList.aspx', apiRoute: SEARCH_ROUTES.uauction },
    ],
  },
  {
    label: 'สินค้าไอที / โน้ตบุ๊ก / สมาร์ทโฟน', ids: ['107', '109', '112'], sources: [
      { name: 'ShopBKK', url: 'https://www.shopbkk.com', apiRoute: SEARCH_ROUTES.shopbkk },
      { name: 'CompAsia', url: 'https://compasia.co.th', apiRoute: SEARCH_ROUTES.compasia },
      { name: 'Kaidee', url: 'https://www.kaidee.com', apiRoute: SEARCH_ROUTES.kaidee },
      { name: 'Pantipmarket (Mobile)', url: 'https://www.pantipmarket.com' },
      { name: '108 Accessory', url: 'http://www.108accessory.com/' },
    ],
  },
  {
    label: 'แบรนเนม / แว่นตา', ids: ['108', '110'], sources: [
      { name: 'Komehyo', url: 'https://www.komehyo.co.th/', apiRoute: SEARCH_ROUTES.komehyo },
      { name: 'Sasom', url: 'https://sasom.co.th/th', apiRoute: SEARCH_ROUTES.sasom },
      { name: 'Moppet Brandname', url: 'https://www.moppetbrandname.com/', apiRoute: SEARCH_ROUTES.moppet },
      { name: 'SF Brandname', url: 'https://sfbrandname.com/', apiRoute: SEARCH_ROUTES.sfbrandname },
      { name: 'Brandname Voyage', url: 'https://brandnamevoyage.com/', apiRoute: SEARCH_ROUTES.brandnamevoyage },
    ],
  },
  {
    label: 'เครื่องมือช่าง', ids: ['111'], sources: [
      { name: 'Kaidee (เครื่องมือช่าง)', url: 'https://www.kaidee.com/c296-appliances_decoration-accessories_and_tool_suppliers', apiRoute: SEARCH_ROUTES.kaidee },
      { name: 'Shopee (เครื่องมือช่าง)', url: 'https://shopee.co.th/search?keyword=%E0%B9%80%E0%B8%84%E0%B8%A3%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%87%E0%B9%80%E0%B8%9B%E0%B9%88%E0%B8%B2%E0%B8%A5%E0%B8%A1' },
      { name: 'Truck2Hand', url: 'https://www.truck2hand.com/category/cat_equipment/', apiRoute: SEARCH_ROUTES.truck2hand },
      { name: 'Facebook กลุ่ม 1', url: 'https://www.facebook.com/groups/198988708155849/' },
      { name: 'Facebook กลุ่ม 2', url: 'https://www.facebook.com/groups/4392804640788959/' },
      { name: 'Facebook กลุ่ม 3', url: 'https://www.facebook.com/groups/455495127955260/' },
    ],
  },
]
