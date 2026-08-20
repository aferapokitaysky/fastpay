import type { PublicBillResponse } from "@fastpay/contracts";

/** Development-only fixture matching the shared API contract exactly. */
export const demoBill: PublicBillResponse = {
  venue: { name: "GOODMAN", logoUrl: null }, table: { label: "02" },
  order: { id: "demo-order", status: "bill_requested", version: 1, currency: "UAH", updatedAt: new Date().toISOString(), outstandingFoodKopecks: 124000, items: [
    { id: "burger", name: "Бургер з трюфельним соусом", quantity: 1, unitPriceKopecks: 32000, remainingKopecks: 32000, paymentStatus: "unpaid" },
    { id: "fries", name: "Картопля фрі", quantity: 1, unitPriceKopecks: 14000, remainingKopecks: 14000, paymentStatus: "unpaid" },
    { id: "lemonade", name: "Лимонад цитрусовий", quantity: 1, unitPriceKopecks: 12000, remainingKopecks: 12000, paymentStatus: "unpaid" },
    { id: "steak", name: "Стейк Ribeye", quantity: 1, unitPriceKopecks: 66000, remainingKopecks: 66000, paymentStatus: "unpaid" }
  ] },
  tips: { percentOptions: [0, 5, 10, 15], customAllowed: true }
};
