/**
 * Єдина точка форматування грошей у застосунку.
 *
 * Навмисно НЕ використовуємо `style: "currency"`: символ гривні залежить від версії ICU,
 * тому Node (SSR) віддає "320,00 ₴", а Chromium (клієнт) — "320,00 грн". Через це React
 * падав з hydration mismatch на кожній сумі, а гість бачив різні позначення валюти.
 * Форматуємо лише число (стабільне між середовищами) і додаємо символ самі.
 */
const NUMBER_FORMAT = new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const UAH_SYMBOL = "₴";

export const formatMoney = (amountKopecks: number) => `${NUMBER_FORMAT.format(amountKopecks / 100)} ${UAH_SYMBOL}`;
