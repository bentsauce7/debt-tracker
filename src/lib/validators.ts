import { z } from 'zod';

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(v);
    return !isNaN(d.getTime()) && v === d.toISOString().slice(0, 10);
  }, 'must be a valid calendar date');

export const numericLike = z.union([z.number(), z.string()]).refine(
  (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n < 100_000_000;
  },
  { message: 'must be a non-negative finite number under 100,000,000' },
);
