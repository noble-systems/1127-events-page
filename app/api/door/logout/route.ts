import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DOOR_COOKIE } from "@/lib/door-auth";

export async function POST() {
  const jar = await cookies();
  jar.delete(DOOR_COOKIE);
  return NextResponse.json({ ok: true });
}
