import { NextRequest, NextResponse } from "next/server";
import { COPY } from "@/lib/copy";
import { isAllowedAssetUrl } from "@/lib/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.NETLIFY_PRIVATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: COPY.errors.unauthorized }, { status: 500 });
  }

  const url = request.nextUrl.searchParams.get("url");
  if (!url || !isAllowedAssetUrl(url)) {
    return NextResponse.json({ error: COPY.errors.invalidUrl }, { status: 400 });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "image/*",
      },
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: COPY.errors.proxy }, { status: upstream.status || 502 });
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("private-image-proxy", error);
    return NextResponse.json({ error: COPY.errors.proxy }, { status: 502 });
  }
}
