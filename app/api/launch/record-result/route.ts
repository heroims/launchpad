import { NextResponse } from "next/server";
import { updateLaunchRecord } from "@/lib/launch/repository";

export async function POST(request: Request) {
  const body = await request.json();
  const record = updateLaunchRecord(body.launchRecordId, {
    signature: body.signature,
    status: body.status,
    errorMessage: body.errorMessage
  });

  if (!record) {
    return NextResponse.json({ error: "Launch record not found" }, { status: 404 });
  }

  return NextResponse.json(record);
}
