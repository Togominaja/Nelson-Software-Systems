const yearNode = document.getElementById("year");
if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

const revealNodes = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries, observerRef) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observerRef.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.2,
      rootMargin: "0px 0px -40px 0px",
    }
  );

  revealNodes.forEach((node, index) => {
    node.style.transitionDelay = `${Math.min(index * 80, 240)}ms`;
    observer.observe(node);
  });
} else {
  revealNodes.forEach((node) => node.classList.add("visible"));
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const inPageLinks = document.querySelectorAll('a[href^="#"]');

inPageLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");
    if (!href || href === "#") {
      return;
    }

    const target = document.querySelector(href);
    if (!target) {
      return;
    }

    event.preventDefault();
    target.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });

    target.classList.remove("section-flash");
    requestAnimationFrame(() => {
      target.classList.add("section-flash");
    });
    window.setTimeout(() => {
      target.classList.remove("section-flash");
    }, 1300);
  });
});

const FUNCTION_BASE = "/.netlify/functions";

function setFormStatus(formNode, message, state) {
  const statusNode = formNode.querySelector(".js-form-status");
  if (!statusNode) {
    return;
  }

  statusNode.textContent = message;
  if (state) {
    statusNode.dataset.state = state;
  } else {
    delete statusNode.dataset.state;
  }
}

function getFormMessage(formNode, key, fallback) {
  const value = formNode.getAttribute(`data-msg-${key}`);
  if (typeof value !== "string") {
    return fallback;
  }

  const cleanValue = value.trim();
  return cleanValue.length > 0 ? cleanValue : fallback;
}

function getFieldValue(formNode, fieldName) {
  const field = formNode.elements.namedItem(fieldName);
  if (!field || typeof field.value !== "string") {
    return "";
  }

  return field.value.trim();
}

function getCheckboxChecked(formNode, fieldName) {
  const field = formNode.elements.namedItem(fieldName);
  return Boolean(field && field.checked === true);
}

function readFormData(formNode) {
  return {
    name: getFieldValue(formNode, "name"),
    email: getFieldValue(formNode, "email"),
    phone: getFieldValue(formNode, "phone"),
    company: getFieldValue(formNode, "company"),
    message: getFieldValue(formNode, "message"),
    website: getFieldValue(formNode, "website"),
    consent: getCheckboxChecked(formNode, "consent"),
    page: window.location.pathname,
  };
}

const leadForms = document.querySelectorAll(".js-lead-form");

async function submitLeadToDatabase(leadData) {
  const response = await fetch(`${FUNCTION_BASE}/submit-lead`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(leadData),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Unable to submit lead to database");
  }
  return payload;
}

leadForms.forEach((formNode) => {
  formNode.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = formNode.querySelector('button[type="submit"]');
    const leadData = readFormData(formNode);
    const missingMessage = getFormMessage(
      formNode,
      "missing",
      "Please fill in all required fields and accept the consent checkbox."
    );
    const sendingMessage = getFormMessage(formNode, "sending", "Sending...");
    const warningMessage = getFormMessage(
      formNode,
      "warning",
      "Request received and saved. Email notification is not configured yet."
    );
    const successMessage = getFormMessage(
      formNode,
      "success",
      "Thanks. I received your request and will reply soon."
    );
    const errorMessage = getFormMessage(
      formNode,
      "error",
      "Could not submit right now. Please email me at sbravatti.nelson@gmail.com."
    );

    if (
      !leadData.name ||
      !leadData.email ||
      !leadData.phone ||
      !leadData.message ||
      !leadData.consent
    ) {
      setFormStatus(formNode, missingMessage, "error");
      return;
    }

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
      }
      setFormStatus(formNode, sendingMessage, "");

      const submitResult = await submitLeadToDatabase(leadData);

      formNode.reset();
      if (submitResult.emailSent === false) {
        setFormStatus(formNode, warningMessage, "warning");
      } else {
        setFormStatus(formNode, successMessage, "success");
      }
    } catch (error) {
      setFormStatus(formNode, errorMessage, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
      }
    }
  });
});

function getSessionId() {
  const key = "nss_session_id";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) {
      return existing;
    }

    const next =
      window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return "";
  }
}

async function trackPageView() {
  try {
    const pageViewKey = `nss_pageview_${window.location.pathname}`;
    if (window.sessionStorage.getItem(pageViewKey)) {
      return;
    }
    window.sessionStorage.setItem(pageViewKey, "1");

    await fetch(`${FUNCTION_BASE}/track-pageview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: window.location.pathname,
        referrer: document.referrer || "",
        sessionId: getSessionId(),
      }),
    });
  } catch {
    // Intentionally ignored to avoid impacting the user experience.
  }
}

trackPageView();
