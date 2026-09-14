import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  clientIp,
  envInt,
  hitRateLimit,
  rateLimitedResponse,
} from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(120),
});

/**
 * Local registration for MVP.
 * Set DISABLE_REGISTER=true to block (e.g. when SSO is enabled).
 */
export async function POST(req: Request) {
  if (process.env.DISABLE_REGISTER === "true") {
    return NextResponse.json(
      { error: "Registration disabled" },
      { status: 403 },
    );
  }

  const limited = hitRateLimit({
    key: `register:${clientIp(req)}`,
    limit: envInt("REGISTER_RATE_LIMIT_PER_MIN", 5),
  });
  if (!limited.ok) return rateLimitedResponse(limited);

  try {
    const body = schema.parse(await req.json());
    const email = body.email.toLowerCase();

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const [user] = await db
      .insert(users)
      .values({
        email,
        name: body.name,
        passwordHash,
      })
      .returning({ id: users.id, email: users.email, name: users.name });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Register failed" }, { status: 500 });
  }
}
