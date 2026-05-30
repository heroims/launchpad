import { NextResponse } from "next/server";
import { generateLaunchDraft } from "@/lib/ai/providers";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const recommendation = await generateLaunchDraft(body);
    return NextResponse.json(recommendation);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
