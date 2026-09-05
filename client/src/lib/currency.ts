// 币种符号映射：未知币种回退为"代码+空格"前缀，保证任何 currency 值都有合理显示
const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: "¥",
  USD: "$",
  EUR: "€",
  JPY: "JP¥",
  GBP: "£",
};

export function currencySymbol(currency?: string | null): string {
  if (!currency) return CURRENCY_SYMBOLS.CNY;
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency} `;
}
