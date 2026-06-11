importScripts("job-portals.js");

const JOB_KEY_PREFIX = "job:";
const STATUS_KEY_PREFIX = "status:";
const ENDPOINT_KEY = "remoteServerUrl";

/**
 * Returns the configured portal whose host matches the supplied URL.
 */
function getPortal(urlString) {
  try {
    const hostname = new URL(urlString).hostname.toLowerCase();
    return globalThis.JOB_PORTALS.find((portal) =>
      portal.hosts.some(
        (host) => hostname === host || hostname.endsWith(`.${host}`)
      )
    );
  } catch {
    return undefined;
  }
}

/**
 * Builds the session-storage key for a tab's temporary job record.
 */
function jobKey(tabId) {
  return `${JOB_KEY_PREFIX}${tabId}`;
}

/**
 * Builds the session-storage key for a tab's current extension status.
 */
function statusKey(tabId) {
  return `${STATUS_KEY_PREFIX}${tabId}`;
}

/**
 * Stores a user-facing processing status for the specified tab.
 */
async function setStatus(tabId, status, message) {
  await chrome.storage.session.set({
    [statusKey(tabId)]: {
      status,
      message,
      updatedAt: new Date().toISOString()
    }
  });
}

/**
 * Removes temporary job data and optionally its status for a tab.
 */
async function clearTabMemory(tabId, clearStatus = false) {
  const keys = [jobKey(tabId)];
  if (clearStatus) {
    keys.push(statusKey(tabId));
  }
  await chrome.storage.session.remove(keys);
}

/**
 * Validates and stores an extracted job posting in tab-scoped session storage.
 */
async function saveDetectedJob(tabId, job) {
  const portal = getPortal(job.url);
  if (!portal || !job.description) {
    return;
  }

  const storedJob = {
    title: job.title || "Untitled job",
    company: job.company || "",
    location: job.location || "",
    description: job.description,
    externalId: job.externalId || "",
    url: job.url,
    portal: portal.name,
    detectedAt: new Date().toISOString()
  };

  await chrome.storage.session.set({ [jobKey(tabId)]: storedJob });
  await setStatus(tabId, "detected", `${storedJob.title} at ${storedJob.company || portal.name}`);
}

/**
 * Validates the remote endpoint and enforces secure transport outside localhost.
 */
function validateEndpoint(endpoint) {
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error("Enter a valid server URL.");
  }

  const isLocalhost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(isLocalhost && parsed.protocol === "http:")) {
    throw new Error("Use HTTPS, or HTTP only for localhost.");
  }
  return parsed.toString();
}

/**
 * Sends an applied job to the configured server and manages its temporary state.
 */
async function submitAppliedJob(tabId, actionText, fallbackJob) {
  let stored = await chrome.storage.session.get(jobKey(tabId));
  let job = stored[jobKey(tabId)];

  if (!job && fallbackJob?.description) {
    await saveDetectedJob(tabId, fallbackJob);
    stored = await chrome.storage.session.get(jobKey(tabId));
    job = stored[jobKey(tabId)] || fallbackJob;
  }

  if (!job?.description) {
    await setStatus(tabId, "error", "Apply was detected, but no job description was found.");
    return { ok: false, error: "No detected job is available." };
  }

  const settings = await chrome.storage.local.get(ENDPOINT_KEY);
  let endpoint;
  try {
    endpoint = validateEndpoint(settings[ENDPOINT_KEY] || "");
  } catch (error) {
    await setStatus(tabId, "error", error.message);
    return { ok: false, error: error.message };
  }

  await setStatus(tabId, "sending", "Sending applied job...");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "job_applied",
        appliedAt: new Date().toISOString(),
        applyAction: actionText || "Apply",
        job
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}.`);
    }

    await clearTabMemory(tabId);
    await setStatus(tabId, "sent", "Applied job sent. Temporary job data was removed.");
    return { ok: true };
  } catch (error) {
    const message =
      error.name === "AbortError" ? "Server request timed out." : error.message;
    await setStatus(tabId, "error", `${message} Temporary job data was kept for retry.`);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Initializes the endpoint setting when the extension is first installed.
 */
chrome.runtime.onInstalled.addListener(async () => {
  const settings = await chrome.storage.local.get(ENDPOINT_KEY);
  if (settings[ENDPOINT_KEY] === undefined) {
    await chrome.storage.local.set({ [ENDPOINT_KEY]: "" });
  }
});

/**
 * Clears stale tab data after navigation and requests a fresh portal scan.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url) {
    return;
  }

  if (!getPortal(changeInfo.url)) {
    void clearTabMemory(tabId, true);
    return;
  }

  // A URL change may represent another job in a single-page application.
  void clearTabMemory(tabId);
  setTimeout(() => {
    chrome.tabs.sendMessage(tabId, { type: "SCAN_FOR_JOB" }).catch(() => {});
  }, 600);
});

/**
 * Destroys all temporary data associated with a closed tab.
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  void clearTabMemory(tabId, true);
});

/**
 * Routes messages between content scripts, the popup, and background operations.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? message.tabId;

  if (message.type === "JOB_DETECTED" && sender.tab?.id !== undefined) {
    void saveDetectedJob(sender.tab.id, message.job);
    return false;
  }

  if (message.type === "PAGE_CHANGED" && sender.tab?.id !== undefined) {
    void clearTabMemory(sender.tab.id);
    return false;
  }

  if (message.type === "APPLY_CLICKED" && sender.tab?.id !== undefined) {
    void submitAppliedJob(sender.tab.id, message.actionText, message.job).then(sendResponse);
    return true;
  }

  if (message.type === "GET_TAB_STATUS" && Number.isInteger(tabId)) {
    void chrome.storage.session
      .get([jobKey(tabId), statusKey(tabId)])
      .then((result) =>
        sendResponse({
          job: result[jobKey(tabId)] || null,
          status: result[statusKey(tabId)] || null
        })
      );
    return true;
  }

  if (message.type === "RETRY_SUBMISSION" && Number.isInteger(tabId)) {
    void submitAppliedJob(tabId, "Manual retry").then(sendResponse);
    return true;
  }

  return false;
});
