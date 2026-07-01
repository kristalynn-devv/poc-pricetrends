/** Batch-search API routes — single registry for route → default category mapping. */
export const SEARCH_ROUTES = {
  chrono24: '/api/chrono24-search',
  auctionhouse: '/api/auctionhouse-search',
  radiumwatch: '/api/radiumwatch-search',
  siamwatchclub: '/api/siamwatchclub-search',
  komehyo: '/api/komehyo-search',
  thaprachan: '/api/thaprachan-search',
  wutdychonburi: '/api/wutdychonburi-search',
  prapantip: '/api/prapantip-search',
  uauction: '/api/uauction-search',
  shopbkk: '/api/shopbkk-search',
  compasia: '/api/compasia-search',
  kaidee: '/api/kaidee-search',
  sasom: '/api/sasom-search',
  moppet: '/api/moppet-search',
  sfbrandname: '/api/sfbrandname-search',
  brandnamevoyage: '/api/brandnamevoyage-search',
  truck2hand: '/api/truck2hand-search',
} as const

export type SearchRouteKey = keyof typeof SEARCH_ROUTES
export type SearchRoutePath = (typeof SEARCH_ROUTES)[SearchRouteKey]

/** Default categoryId per search route (when group has multiple ids). */
export const SEARCH_ROUTE_CATEGORY: Record<SearchRoutePath, string> = {
  [SEARCH_ROUTES.chrono24]: '103',
  [SEARCH_ROUTES.auctionhouse]: '103',
  [SEARCH_ROUTES.radiumwatch]: '103',
  [SEARCH_ROUTES.siamwatchclub]: '103',
  [SEARCH_ROUTES.komehyo]: '103',
  [SEARCH_ROUTES.thaprachan]: '106',
  [SEARCH_ROUTES.wutdychonburi]: '106',
  [SEARCH_ROUTES.prapantip]: '106',
  [SEARCH_ROUTES.uauction]: '106',
  [SEARCH_ROUTES.shopbkk]: '107',
  [SEARCH_ROUTES.compasia]: '107',
  [SEARCH_ROUTES.kaidee]: '107',
  [SEARCH_ROUTES.sasom]: '108',
  [SEARCH_ROUTES.moppet]: '108',
  [SEARCH_ROUTES.sfbrandname]: '108',
  [SEARCH_ROUTES.brandnamevoyage]: '108',
  [SEARCH_ROUTES.truck2hand]: '111',
}
