import { neon } from "@netlify/neon";
import nodemailer from "nodemailer";

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

function envValue(name, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

async function sendLeadNotification({ name, email, phone, company, message, page }) {
  const smtpUser = envValue("SMTP_USER");
  const smtpPass = envValue("SMTP_PASS");
  if (!smtpUser || !smtpPass) {
    return { emailSent: false, emailError: "email_not_configured" };
  }

  const smtpHost = envValue("SMTP_HOST", "smtp.gmail.com");
  const smtpPort = Number(envValue("SMTP_PORT", "465"));
  const smtpSecure = envValue("SMTP_SECURE", smtpPort === 465 ? "true" : "false") !== "false";
  const notifyTo = envValue("NOTIFY_TO", smtpUser);
  const notifyFrom = envValue("NOTIFY_FROM", smtpUser);

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const subject = `New website lead: ${name}`;
  const text = [
    "New lead submitted from your website.",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    `Company: ${company || "-"}`,
    `Page: ${page || "-"}`,
    `Submitted: ${new Date().toISOString()}`,
    "",
    "Message:",
    message,
  ].join("\n");

  try {
    await transporter.sendMail({
      to: notifyTo,
      from: notifyFrom,
      replyTo: email,
      subject,
      text,
    });
    return { emailSent: true };
  } catch (error) {
    console.error("lead email send error", error);
    return { emailSent: false, emailError: "email_send_failed" };
  }
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
  const consent = payload?.consent === true;

  if (!name || !email || !phone || !message || !consent) {
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
        phone TEXT NOT NULL,
        company TEXT,
        message TEXT NOT NULL,
        consent BOOLEAN NOT NULL DEFAULT false,
        page TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS consent BOOLEAN NOT NULL DEFAULT false
    `;

    await sql`
      INSERT INTO leads (name, email, phone, company, message, consent, page)
      VALUES (
        ${name},
        ${email},
        ${phone},
        ${company || null},
        ${message},
        ${consent},
        ${page || null}
      )
    `;

    const emailStatus = await sendLeadNotification({
      name,
      email,
      phone,
      company,
      message,
      page,
    });

    return jsonResponse({ ok: true, ...emailStatus });
  } catch (error) {
    console.error("submit-lead error", error);
    return jsonResponse({ ok: false, error: "Unable to save lead" }, 500);
  }
};
