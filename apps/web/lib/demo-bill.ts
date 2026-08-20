import type { PublicBillResponse } from "@fastpay/contracts";

/**
 * Development-only fixture matching the shared API contract exactly.
 * Значення навмисно дзеркалять реальну відповідь `GET /v1/public/tables/:token/bill`:
 * сервер надсилає `percentOptions` без нуля (див. apps/api/src/routes/publicBill.ts),
 * а частково оплачений рахунок містить позицію зі статусом `paid`.
 */
export const demoBill: PublicBillResponse = {
  venue: { name: "GOODMAN", logoUrl: null }, table: { label: "02" },
  order: { id: "demo-order", status: "partially_paid", version: 2, currency: "UAH", updatedAt: new Date().toISOString(), outstandingFoodKopecks: 112000, items: [
    { id: "burger", name: "Бургер з трюфельним соусом", quantity: 1, unitPriceKopecks: 32000, remainingKopecks: 32000, paymentStatus: "unpaid" },
    { id: "fries", name: "Картопля фрі", quantity: 1, unitPriceKopecks: 14000, remainingKopecks: 14000, paymentStatus: "unpaid" },
    { id: "lemonade", name: "Лимонад цитрусовий", quantity: 1, unitPriceKopecks: 12000, remainingKopecks: 0, paymentStatus: "paid" },
    { id: "steak", name: "Стейк Ribeye", quantity: 1, unitPriceKopecks: 66000, remainingKopecks: 66000, paymentStatus: "unpaid" }
  ] },
  tips: { percentOptions: [5, 10, 15], customAllowed: true }
};
