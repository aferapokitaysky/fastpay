import { z } from "zod";

/**
 * Money is always represented as an integer count of kopecks (1/100 of the
 * major currency unit) on the wire — never floats. See
 * docs/api/FRONTEND_BACKEND_CONTRACT.md.
 */
export const MoneyKopecksSchema = z.number().int().nonnegative();

export type MoneyKopecks = z.infer<typeof MoneyKopecksSchema>;
