const MIN_DESCRIPTION_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 100000;
const SCAN_DELAY_MS = 350;

const GENERIC_DESCRIPTION_SELECTORS = [
  "[data-testid*='job-description' i]",
  "[data-test*='job-description' i]",
  "[class*='job-description' i]",
  "[id*='job-description' i]",
  "article"
];

let lastUrl = location.href;
let lastJobSignature = "";
let scanTimer;

/**
 * Normalizes extracted text while preserving meaningful paragraph breaks.
 */
function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Converts an HTML fragment into normalized plain text.
 */
function htmlToText(html) {
  const documentFragment = new DOMParser().parseFromString(String(html || ""), "text/html");
  return cleanText(documentFragment.body.textContent);
}

/**
 * Extracts readable content from a DOM element based on its element type.
 */
function elementValue(element) {
  if (!element) {
    return "";
  }
  if (element.tagName === "META") {
    return cleanText(element.content);
  }
  if (element.tagName === "IMG") {
    return cleanText(element.alt);
  }
  return cleanText(element.innerText || element.textContent || element.value);
}

/**
 * Returns the first non-empty value found by an ordered selector list.
 */
function firstValue(selectors) {
  for (const selector of selectors || []) {
    const value = elementValue(document.querySelector(selector));
    if (value) {
      return value;
    }
  }
  return "";
}

/**
 * Recursively searches parsed JSON-LD data for a JobPosting object.
 */
function findJobPosting(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item);
      if (found) {
        return found;
      }
    }
    return null;
  }

  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  if (types.some((type) => String(type).toLowerCase() === "jobposting")) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findJobPosting(child);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Extracts a job from structured JobPosting JSON-LD when available.
 */
function getStructuredJob() {
  const scripts = document.querySelectorAll("script[type='application/ld+json']");
  for (const script of scripts) {
    try {
      const posting = findJobPosting(JSON.parse(script.textContent));
      if (!posting) {
        continue;
      }

      const address = posting.jobLocation?.address || posting.applicantLocationRequirements;
      const locationText =
        typeof address === "string"
          ? address
          : [
              address?.addressLocality,
              address?.addressRegion,
              address?.addressCountry
            ]
              .filter(Boolean)
              .join(", ");

      const description = htmlToText(posting.description);
      if (description.length < MIN_DESCRIPTION_LENGTH) {
        continue;
      }

      return {
        title: cleanText(posting.title),
        company: cleanText(posting.hiringOrganization?.name),
        location: cleanText(locationText),
        description,
        externalId: cleanText(
          typeof posting.identifier === "string"
            ? posting.identifier
            : posting.identifier?.value
        )
      };
    } catch {
      // Some sites include non-JSON data in JSON-LD tags; ignore those blocks.
    }
  }
  return null;
}

/**
 * Selects the portal-specific DOM selector configuration for the current host.
 */
function getPortalSelectors() {
  const hostname = location.hostname.toLowerCase();
  const portal = globalThis.JOB_PORTALS.find((candidate) =>
    candidate.hosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`)
    )
  );
  return portal?.selectors;
}

/**
 * Extracts a job from portal-specific or generic page elements.
 */
function getDomJob() {
  const selectors = getPortalSelectors();
  const descriptionSelectors = [
    ...(selectors?.description || []),
    ...GENERIC_DESCRIPTION_SELECTORS
  ];

  let description = "";
  for (const selector of descriptionSelectors) {
    const candidate = elementValue(document.querySelector(selector));
    if (candidate.length >= MIN_DESCRIPTION_LENGTH) {
      description = candidate;
      break;
    }
  }

  if (!description) {
    return null;
  }

  return {
    title:
      firstValue(selectors?.title) ||
      cleanText(document.querySelector("meta[property='og:title']")?.content) ||
      cleanText(document.title),
    company:
      firstValue(selectors?.company) ||
      cleanText(document.querySelector("meta[property='og:site_name']")?.content),
    location: firstValue(selectors?.location),
    description,
    externalId: ""
  };
}

/**
 * Collects and normalizes the best available job data for the current page.
 */
function collectJob() {
  const job = getStructuredJob() || getDomJob();
  if (!job) {
    return null;
  }
  return {
    ...job,
    description: job.description.slice(0, MAX_DESCRIPTION_LENGTH),
    url: location.href
  };
}

/**
 * Creates a compact signature used to avoid sending duplicate job detections.
 */
function jobSignature(job) {
  return JSON.stringify([job.url, job.title, job.company, job.description.length]);
}

/**
 * Detects navigation changes and sends newly extracted jobs to the background worker.
 */
function scanForJob() {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    lastJobSignature = "";
    chrome.runtime.sendMessage({ type: "PAGE_CHANGED", url: lastUrl }).catch(() => {});
  }

  const job = collectJob();
  if (!job) {
    return;
  }

  const signature = jobSignature(job);
  if (signature === lastJobSignature) {
    return;
  }

  lastJobSignature = signature;
  chrome.runtime.sendMessage({ type: "JOB_DETECTED", job }).catch(() => {});
}

/**
 * Debounces page scans triggered by rapid DOM mutations.
 */
function scheduleScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scanForJob, SCAN_DELAY_MS);
}

/**
 * Returns the label when the clicked control represents a supported Apply action.
 */
function getApplyAction(target) {
  const control = target.closest(
    "button, a, [role='button'], input[type='button'], input[type='submit']"
  );
  if (!control) {
    return "";
  }

  const labels = [
    control.innerText,
    control.value,
    control.getAttribute("aria-label"),
    control.getAttribute("title")
  ]
    .map(cleanText)
    .filter(Boolean);

  const applyLabel = labels.find((label) =>
    /^(easy apply|apply|apply now|apply for (this|the) job|start application|submit application)$/i.test(
      label
    )
  );

  return applyLabel?.slice(0, 200) || "";
}

/**
 * Captures Apply clicks before portal navigation can unload the current page.
 */
document.addEventListener(
  "click",
  (event) => {
    const actionText = getApplyAction(event.target);
    if (!actionText) {
      return;
    }

    const job = collectJob();
    chrome.runtime
      .sendMessage({ type: "APPLY_CLICKED", actionText, job })
      .catch(() => {});
  },
  true
);

/**
 * Schedules a new scan whenever a portal dynamically changes page content.
 */
new MutationObserver(scheduleScan).observe(document.documentElement, {
  childList: true,
  subtree: true
});

/**
 * Responds to background requests for an immediate job-page scan.
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SCAN_FOR_JOB") {
    scheduleScan();
  }
});

/**
 * Periodically checks for SPA navigation or page updates missed by mutations.
 */
setInterval(scanForJob, 2000);

/**
 * Performs the initial scan after the content script loads.
 */
scanForJob();
