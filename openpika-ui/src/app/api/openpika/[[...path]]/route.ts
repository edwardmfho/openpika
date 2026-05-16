// Catch-all proxy for OpenPika REST API (non-chat endpoints)
import { NextRequest } from "next/server";

const OPENPIKA_URL = process.env.OPENPIKA_URL || "http://localhost:8080";

async function proxy(req: NextRequest, path: string): Promise<Response> {
  const url = new URL(req.url);
  const target = `${OPENPIKA_URL}/${path}${url.search}`;

  const init: RequestInit = {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer sk-local",
    },
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.text();
    if (body) (init as RequestInit & { body: string }).body = body;
  }

  try {
    const upstream = await fetch(target, init);
    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function segments(req: NextRequest): string {
  return req.nextUrl.pathname.replace("/api/openpika/", "").replace("/api/openpika", "") || "health";
}

export async function GET(req: NextRequest) { return proxy(req, segments(req)); }
export async function POST(req: NextRequest) { return proxy(req, segments(req)); }
export async function PATCH(req: NextRequest) { return proxy(req, segments(req)); }
export async function PUT(req: NextRequest) { return proxy(req, segments(req)); }
export async function DELETE(req: NextRequest) { return proxy(req, segments(req)); }
