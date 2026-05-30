import { NextResponse } from "next/server";
import { buildLaunchTransaction } from "@/lib/launch/build-transaction";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await buildLaunchTransaction({
      draft: body.draft,
      idempotencyKey: body.idempotencyKey,
      recentBlockhash: body.recentBlockhash
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
