const ENDPOINT_KEY = "remoteServerUrl";

const statusDot = document.querySelector("#status-dot");
const statusTitle = document.querySelector("#status-title");
const statusMessage = document.querySelector("#status-message");
const jobCard = document.querySelector("#job-card");
const jobTitle = document.querySelector("#job-title");
const jobMeta = document.querySelector("#job-meta");
const jobDescription = document.querySelector("#job-description");
const retryButton = document.querySelector("#retry-button");
const settingsForm = document.querySelector("#settings-form");
const endpointInput = document.querySelector("#endpoint");
const settingsMessage = document.querySelector("#settings-message");

let activeTabId;

/**
 * Renders the active tab's job and processing state in the popup.
 */
function renderStatus(status, job) {
  const state = status?.status || (job ? "detected" : "idle");
  statusDot.className = `status-dot ${state}`;
  retryButton.classList.toggle("hidden", state !== "error" || !job);

  const titles = {
    idle: "No job detected",
    detected: "Job description saved temporarily",
    sending: "Sending applied job",
    sent: "Applied job sent",
    error: "Action needed"
  };
  statusTitle.textContent = titles[state] || "Job Tracker";
  statusMessage.textContent =
    status?.message ||
    "Open a supported job posting. Data is removed when its tab closes.";

  if (!job) {
    jobCard.classList.add("hidden");
    return;
  }

  jobTitle.textContent = job.title;
  jobMeta.textContent = [job.company, job.location, job.portal]
    .filter(Boolean)
    .join(" · ");
  jobDescription.textContent = job.description;
  jobCard.classList.remove("hidden");
}

/**
 * Loads endpoint settings and temporary job data for the active browser tab.
 */
async function loadPopup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id;

  const settings = await chrome.storage.local.get(ENDPOINT_KEY);
  endpointInput.value = settings[ENDPOINT_KEY] || "";

  if (!Number.isInteger(activeTabId)) {
    renderStatus(null, null);
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "GET_TAB_STATUS",
    tabId: activeTabId
  });
  renderStatus(response?.status, response?.job);
}

/**
 * Validates and saves the remote server endpoint submitted by the user.
 */
settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const endpoint = endpointInput.value.trim();

  if (endpoint) {
    try {
      const parsed = new URL(endpoint);
      const isLocalhost =
        parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      if (parsed.protocol !== "https:" && !(isLocalhost && parsed.protocol === "http:")) {
        throw new Error();
      }
    } catch {
      settingsMessage.textContent = "Use a valid HTTPS URL, or HTTP for localhost.";
      settingsMessage.className = "form-message error-text";
      return;
    }
  }

  await chrome.storage.local.set({ [ENDPOINT_KEY]: endpoint });
  settingsMessage.textContent = endpoint ? "Endpoint saved." : "Endpoint cleared.";
  settingsMessage.className = "form-message success-text";
});

/**
 * Retries a failed job submission using the active tab's temporary job data.
 */
retryButton.addEventListener("click", async () => {
  if (!Number.isInteger(activeTabId)) {
    return;
  }

  retryButton.disabled = true;
  const response = await chrome.runtime.sendMessage({
    type: "RETRY_SUBMISSION",
    tabId: activeTabId
  });
  retryButton.disabled = false;

  if (!response?.ok) {
    settingsMessage.textContent = response?.error || "Could not send the job.";
    settingsMessage.className = "form-message error-text";
  }
  await loadPopup();
});

/**
 * Initializes the popup when its document finishes loading.
 */
void loadPopup();
