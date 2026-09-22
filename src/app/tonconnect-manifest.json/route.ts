import { NextRequest, NextResponse } from "next/server";
import { APP_RUNTIME } from "@/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    request.headers.get("origin") ||
    `${request.nextUrl.protocol}//${request.headers.get("host")}`;

  const normalized = origin.replace(/\/$/, "");

  return NextResponse.json(
    {
      url: normalized,
      name: APP_RUNTIME.appName,
      iconUrl: `${normalized}/icon.png`,
      termsOfUseUrl: `${normalized}/`,
      privacyPolicyUrl: `${normalized}/`,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    },
  );
}
