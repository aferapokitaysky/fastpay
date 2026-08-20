import { formatMoney } from "../lib/money";

export function Money({ amountKopecks, size = "md" }: { amountKopecks: number; size?: "lg" | "md" }) {
  return <span className={size === "lg" ? "money money-lg" : "money"}>{formatMoney(amountKopecks)}</span>;
}
