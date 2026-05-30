import { NextResponse } from "next/server";
import { prepareSkillLaunch } from "@/lib/skill/prepare-launch";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await prepareSkillLaunch(body);
    return NextResponse.json(result, { status: result.validation.ok ? 200 : 422 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
