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

function envValueAny(names, fallback = "") {
  for (const name of names) {
    const value = envValue(name);
    if (value) {
      return value;
    }
  }

  return fallback;
}

function cleanErrorText(value, maxLength = 220) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

async function sendLeadNotification({ name, email, phone, company, message, page }) {
  const smtpUser = envValueAny([
    "SMTP_USER",
    "GMAIL_USER",
    "EMAIL_USER",
    "MAIL_USER",
  ]);
  const smtpPassRaw = envValueAny([
    "SMTP_PASS",
    "SMTP_PASSWORD",
    "GMAIL_APP_PASSWORD",
    "GMAIL_APP_PASS",
    "EMAIL_PASS",
    "MAIL_PASS",
  ]);
  if (!smtpUser || !smtpPassRaw) {
    return { emailSent: false, emailError: "email_not_configured" };
  }

  const smtpHost = envValueAny(["SMTP_HOST", "MAIL_HOST"], "smtp.gmail.com");
  const smtpPort = Number(envValueAny(["SMTP_PORT", "MAIL_PORT"], "465"));
  if (!Number.isFinite(smtpPort) || smtpPort <= 0) {
    return { emailSent: false, emailError: "invalid_smtp_port" };
  }
  const smtpSecure = envValue("SMTP_SECURE", smtpPort === 465 ? "true" : "false") !== "false";
  const isGmailSmtp = /gmail/i.test(smtpHost) || /@gmail\.com$/i.test(smtpUser);
  const smtpPass = isGmailSmtp ? smtpPassRaw.replace(/\s+/g, "") : smtpPassRaw;
  const notifyTo = envValueAny(
    ["NOTIFY_TO", "LEADS_NOTIFY_TO", "CONTACT_NOTIFY_TO"],
    smtpUser
  );
  const notifyFromRaw = envValueAny(["NOTIFY_FROM", "LEADS_NOTIFY_FROM"], smtpUser);
  const notifyFromName = envValueAny(
    ["NOTIFY_FROM_NAME", "LEADS_NOTIFY_FROM_NAME"],
    "TurboTurtle"
  );
  const notifyFrom = isGmailSmtp ? smtpUser : notifyFromRaw;
  const fromHeader = notifyFromName
    ? `"${notifyFromName}" <${notifyFrom}>`
    : notifyFrom;

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
      from: fromHeader,
      replyTo: email,
      subject,
      text,
    });
    return { emailSent: true };
  } catch (error) {
    const errorCode = cleanErrorText(String(error?.code || ""), 80);
    const responseCode =
      typeof error?.responseCode === "number" ? error.responseCode : null;
    const command = cleanErrorText(String(error?.command || ""), 120);
    const detail = cleanErrorText(String(error?.message || ""));

    console.error("lead email send error", {
      code: errorCode || null,
      responseCode,
      command: command || null,
      detail: detail || null,
    });

    return {
      emailSent: false,
      emailError: "email_send_failed",
      emailErrorCode: errorCode || null,
      emailResponseCode: responseCode,
      emailErrorDetail: detail || null,
    };
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
