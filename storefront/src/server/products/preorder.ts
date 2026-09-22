import { z } from "zod";

const preorderSettingsSchema = z
  .object({
    preorderEnabled: z.preprocess(
      (value) => value === "on" || value === "true",
      z.boolean(),
    ),
    preorderEtaText: z.preprocess(
      (value) => {
        const text = String(value ?? "").trim();
        return text || null;
      },
      z.string().min(2).max(120).nullable(),
    ),
    preorderLimit: z.preprocess(
      (value) => {
        const text = String(value ?? "").trim();
        return text ? Number(text) : null;
      },
      z.number().int().positive().max(10_000).nullable(),
    ),
  })
  .superRefine((input, context) => {
    if (!input.preorderEnabled) return;
    if (!input.preorderEtaText) {
      context.addIssue({
        code: "custom",
        path: ["preorderEtaText"],
        message: "Estimasi preorder wajib diisi",
      });
    }
    if (input.preorderLimit === null) {
      context.addIssue({
        code: "custom",
        path: ["preorderLimit"],
        message: "Batas preorder wajib diisi",
      });
    }
  });

export function parsePreorderSettings(input: Record<string, unknown>) {
  const parsed = preorderSettingsSchema.parse(input);
  if (!parsed.preorderEnabled) {
    return {
      preorderEnabled: false,
      preorderEtaText: null,
      preorderLimit: null,
    };
  }
  return parsed;
}
