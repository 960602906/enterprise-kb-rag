"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().max(120).optional(),
});

export type AuthErrorKey =
  | "invalidCredentials"
  | "registerDisabled"
  | "registerInvalid"
  | "emailTaken"
  | "signInAfterRegisterFailed";

export type AuthFormState = {
  error?: AuthErrorKey;
  ok?: boolean;
};

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const parsed = credentialsSchema.safeParse({ email, password });
  if (!parsed.success) {
    return { error: "invalidCredentials" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/overview",
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "invalidCredentials" };
    }
    // Next.js redirect throws; rethrow so navigation works
    throw err;
  }
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (process.env.DISABLE_REGISTER === "true") {
    return { error: "registerDisabled" };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  const parsed = credentialsSchema
    .extend({ password: z.string().min(8), name: z.string().max(120).optional() })
    .safeParse({ email, password, name: name || undefined });

  if (!parsed.success) {
    return { error: "registerInvalid" };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  if (existing) {
    return { error: "emailTaken" };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.insert(users).values({
    email: parsed.data.email,
    name: parsed.data.name || parsed.data.email.split("@")[0],
    passwordHash,
  });

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/overview",
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "signInAfterRegisterFailed" };
    }
    throw err;
  }
}
