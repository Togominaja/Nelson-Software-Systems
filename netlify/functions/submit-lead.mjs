import { neon } from "@netlify/neon";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  if (cleanText(payload?.website, 100)) {
    return jsonResponse({ ok: true });
  }

  const name = cleanText(payload?.name, 120);
  const email = cleanText(payload?.email, 160).toLowerCase();
  const phone = cleanText(payload?.phone, 60);
  const company = cleanText(payload?.company, 160);
  const message = cleanText(payload?.message, 4000);
  const page = cleanText(payload?.page, 255);

  if (!name || !email || !phone || !message) {
    return jsonResponse({ ok: false, error: "Missing required fields" }, 400);
  }

  if (!EMAIL_PATTERN.test(email)) {
    return jsonResponse({ ok: false, error: "Invalid email address" }, 400);
  }

  try {
    const sql = neon();

    await sql`
      CREATE TABLE IF NOT EXISTS leads (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        company TEXT,
        message TEXT NOT NULL,
        page TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      INSERT INTO leads (name, email, phone, company, message, page)
      VALUES (
        ${name},
        ${email},
        ${phone || null},
        ${company || null},
        ${message},
        ${page || null}
      )
    `;

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("submit-lead error", error);
    return jsonResponse({ ok: false, error: "Unable to save lead" }, 500);
  }
};
