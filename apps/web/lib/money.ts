/**
 * Єдина точка форматування грошей у застосунку.
 *
 * Не використовуємо `style: "currency"` напряму: символ гривні залежить від версії ICU,
 * тому Node (SSR) міг віддавати "320,00 ₴", а Chromium (клієнт) — "320,00 грн". React
 * падав з hydration mismatch на кожній сумі, а гість бачив різні позначення валюти.
 * `formatToParts` бере вже локалізовані числові частини (стабільні між середовищами)
 * і підміняє лише саму частину-символ на "₴", зберігаючи порядок/пробіли з локалі.
 */
export const formatMoney = (amountKopecks: number) =>
  new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH" })
    .formatToParts(amountKopecks / 100)
    .map((part) => (part.type === "currency" ? "₴" : part.value))
    .join("");
