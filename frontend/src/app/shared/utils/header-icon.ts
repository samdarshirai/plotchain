// Material Symbols name for a table header, guessed from its column key (e.g. 'paymentDate').
const RULES: [RegExp, string][] = [
  [/date|bookedon|paidon|expires|logged|cancelledon|createdat|time|^on$/, 'calendar_today'],
  [/mobile|phone/, 'call'],
  [/(sno|no|number)$/, 'tag'],
  [/associateid|code|batch|^ticket$|^id$|userid/, 'badge'],
  [/name$|buyer$|user|customer|^by$/, 'person'],
  [/associate|holder|sponsor|team|members?/, 'groups'],
  [/rank/, 'military_tech'],
  [/email/, 'mail'],
  [/locationmap/, 'pin_drop'],
  [/map$/, 'map'],
  [/city|state|location/, 'location_on'],
  [/project/, 'apartment'],
  [/type$|category/, 'category'],
  [/plot/, 'landscape'],
  [/area|roadsize/, 'square_foot'],
  [/discount|percent|rate%/, 'percent'],
  [/remaining|^rest$|balance/, 'account_balance_wallet'],
  [/rate/, 'sell'],
  [/extra|price|total|amount|paid|business|value|income|payout|bonus|cost|expense|fee|commission|tds|net|gross|loan/, 'payments'],
  [/status/, 'flag'],
  [/bank|ifsc/, 'account_balance'],
  [/mode/, 'credit_card'],
  [/txn|receipt|invoice|ledger/, 'receipt_long'],
  [/detail/, 'info'],
  [/subject|title|headline/, 'subject'],
  [/response|message/, 'chat'],
  [/reason|remark|note|description/, 'notes'],
  [/select/, 'check_box'],
  [/action|print/, 'more_horiz'],
];

export function headerIcon(key: string): string {
  const k = key.toLowerCase();
  return RULES.find(([re]) => re.test(k))?.[1] ?? 'label';
}
