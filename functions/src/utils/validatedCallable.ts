import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";

export const callableDataSchema = z.record(z.string(), z.unknown());

export function validateCallableData<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpsError(
      "invalid-argument",
      "De payload van deze actie is ongeldig.",
      result.error.flatten(),
    );
  }
  return result.data;
}
