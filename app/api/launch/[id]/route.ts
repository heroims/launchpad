import { NextResponse } from "next/server";
import { getRecordById } from "@/lib/launch/repository";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = getRecordById(id);

  if (!record) {
    return NextResponse.json({ error: "Launch record not found" }, { status: 404 });
  }

  return NextResponse.json(record);
}
