/** Development-only fixture. The production route will receive this shape from packages/contracts. */
export const demoBill = {
  venue: { name: "GOODMAN" }, table: { label: "02" },
  items: [
    { id: "burger", name: "Бургер з трюфельним соусом", detail: "1 × 320,00 ₴", amountKopecks: 32000, icon: "🍔" },
    { id: "fries", name: "Картопля фрі", detail: "1 × 140,00 ₴", amountKopecks: 14000, icon: "🍟" },
    { id: "lemonade", name: "Лимонад цитрусовий", detail: "1 × 120,00 ₴", amountKopecks: 12000, icon: "🍋" },
    { id: "steak", name: "Стейк Ribeye", detail: "1 × 660,00 ₴", amountKopecks: 66000, icon: "🥩" }
  ],
  tipOptions: [0, 5, 10, 15]
};
