import { neon } from "@netlify/neon";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request body" }, 400);
  }

  const path = cleanText(payload?.path, 255);
  if (!path) {
    return jsonResponse({ ok: false, error: "Missing path" }, 400);
  }

  const referrer = cleanText(payload?.referrer, 500);
  const sessionId = cleanText(payload?.sessionId, 120);
  const userAgent = cleanText(request.headers.get("user-agent"), 500);

  try {
    const sql = neon();

    await sql`
      CREATE TABLE IF NOT EXISTS pageviews (
        id BIGSERIAL PRIMARY KEY,
        path TEXT NOT NULL,
        referrer TEXT,
        session_id TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      INSERT INTO pageviews (path, referrer, session_id, user_agent)
      VALUES (
        ${path},
        ${referrer || null},
        ${sessionId || null},
        ${userAgent || null}
      )
    `;

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("track-pageview error", error);
    return jsonResponse({ ok: false, error: "Unable to save pageview" }, 500);
  }
};
