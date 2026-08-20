import { PublicBillResponseSchema, type PublicBillResponse } from "@fastpay/contracts";
import { demoBill } from "./demo-bill";

export type PublicBillResult = { kind: "ready"; bill: PublicBillResponse } | { kind: "notFound" } | { kind: "unavailable" };

export async function getPublicBill(token: string): Promise<PublicBillResult> {
  if (token === "demo-table-02") return { kind: "ready", bill: demoBill };
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  try {
    const response = await fetch(`${apiUrl}/v1/public/tables/${encodeURIComponent(token)}/bill`, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (response.status === 404) return { kind: "notFound" };
    if (!response.ok) return { kind: "unavailable" };
    return { kind: "ready", bill: PublicBillResponseSchema.parse(await response.json()) };
  } catch { return { kind: "unavailable" }; }
}
