import { NextResponse } from "next/server";
import { buildLaunchTransaction } from "@/lib/launch/build-transaction";
import { resolveBuildRecentBlockhash } from "@/lib/launch/recent-blockhash";
import { resolveSolanaRpcUrl } from "@/lib/launch/rpc";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await buildLaunchTransaction({
      draft: body.draft,
      idempotencyKey: body.idempotencyKey,
      recentBlockhash: await resolveBuildRecentBlockhash({
        requestedBlockhash: body.recentBlockhash,
        rpcUrl: resolveSolanaRpcUrl()
      })
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
