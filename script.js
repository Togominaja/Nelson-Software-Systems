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
