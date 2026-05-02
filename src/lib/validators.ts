import { z } from 'zod';

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(v);
    return !isNaN(d.getTime()) && v === d.toISOString().slice(0, 10);
  }, 'must be a valid calendar date');

export const numericLike = z.union([z.number(), z.string()]).refine(
  (v) => Number.isFinite(Number(v)) && Number(v) >= 0,
  { message: 'must be a non-negative finite number' },
);
