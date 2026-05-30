import { NextResponse } from "next/server";
import { validateLaunchDraft } from "@/lib/launch/validator";

export async function POST(request: Request) {
  const body = await request.json();
  const result = await validateLaunchDraft(body.draft ?? body);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
