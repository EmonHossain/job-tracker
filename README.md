# Job Tracker Chrome Extension

This Manifest V3 extension watches supported job portals, extracts the current
job posting, and keeps it only in tab-scoped session storage.

## Behavior

1. The background worker compares tab URLs with supported portal base domains.
2. The content script extracts `JobPosting` JSON-LD or portal-specific page
   content and sends the job to the background worker.
3. The background worker stores the job under its tab ID in
   `chrome.storage.session`.
4. Clicking an Apply control sends the job to the configured remote endpoint.
5. A successful response removes the stored job description.
6. Closing the tab or navigating away from a supported portal removes the
   temporary job description.
7. Failed requests keep the temporary job so the popup can retry.

## Supported portals

- LinkedIn
- Indeed
- Glassdoor
- ZipRecruiter
- Monster
- Greenhouse
- Lever
- Workday

## Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this project folder.
4. Open the extension popup and configure an HTTPS server endpoint.

HTTP endpoints are accepted only for `localhost` or `127.0.0.1`.

## Server request

The endpoint receives a `POST` request with JSON:

```json
{
  "event": "job_applied",
  "appliedAt": "2026-06-11T12:00:00.000Z",
  "applyAction": "Apply",
  "job": {
    "title": "Software Engineer",
    "company": "Example Company",
    "location": "Berlin",
    "description": "Full job description...",
    "externalId": "12345",
    "url": "https://example-job-portal.test/jobs/12345",
    "portal": "Example Portal",
    "detectedAt": "2026-06-11T11:59:00.000Z"
  }
}
```

Any HTTP `2xx` response is treated as success. Other responses and network
failures keep the temporary job for retry.
