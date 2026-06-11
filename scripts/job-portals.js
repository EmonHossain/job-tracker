/**
 * Shared job portal names, hostnames, and DOM selectors.
 */
globalThis.JOB_PORTALS = [
  {
    name: "LinkedIn",
    hosts: ["linkedin.com"],
    selectors: {
      description: [
        ".jobs-description__content",
        ".jobs-box__html-content",
        "#job-details"
      ],
      title: [".job-details-jobs-unified-top-card__job-title", "h1"],
      company: [
        ".job-details-jobs-unified-top-card__company-name",
        ".topcard__org-name-link"
      ],
      location: [
        ".job-details-jobs-unified-top-card__primary-description-container",
        ".topcard__flavor--bullet"
      ]
    }
  },
  {
    name: "Indeed",
    hosts: ["indeed.com"],
    selectors: {
      description: ["#jobDescriptionText", ".jobsearch-JobComponent-description"],
      title: ["h1[data-testid='jobsearch-JobInfoHeader-title']", "h1"],
      company: [
        "[data-testid='inlineHeader-companyName']",
        "[data-company-name='true']"
      ],
      location: [
        "[data-testid='job-location']",
        "[data-testid='inlineHeader-companyLocation']"
      ]
    }
  },
  {
    name: "Glassdoor",
    hosts: ["glassdoor.com", "glassdoor.co.uk"],
    selectors: {
      description: [
        "[data-test='jobDescriptionContent']",
        ".JobDetails_jobDescription__"
      ],
      title: ["[data-test='job-title']", "h1"],
      company: [
        "[data-test='employer-name']",
        ".EmployerProfile_employerName__"
      ],
      location: ["[data-test='location']", ".JobDetails_location__"]
    }
  },
  {
    name: "ZipRecruiter",
    hosts: ["ziprecruiter.com"],
    selectors: {
      description: [".job_description", "[data-testid='job-description']"],
      title: ["h1.job_title", "h1"],
      company: [".hiring_company", "[data-testid='company-name']"],
      location: [".location", "[data-testid='job-location']"]
    }
  },
  {
    name: "Monster",
    hosts: ["monster.com"],
    selectors: {
      description: ["#JobDescription", "[data-testid='svx-job-description']"],
      title: ["[data-testid='jobTitle']", "h1"],
      company: ["[data-testid='company']", ".company"],
      location: ["[data-testid='jobLocation']", ".location"]
    }
  },
  {
    name: "Greenhouse",
    hosts: ["greenhouse.io"],
    selectors: {
      description: ["#content", ".job__description", "[data-mapped='true']"],
      title: [".app-title", "h1"],
      company: [".company-name", ".job__company"],
      location: [".location", ".job__location"]
    }
  },
  {
    name: "Lever",
    hosts: ["lever.co"],
    selectors: {
      description: [".section-wrapper.page-full-width", ".posting-page"],
      title: [".posting-headline h2", "h1"],
      company: [".main-header-logo img", ".posting-categories .team"],
      location: [".posting-categories .location"]
    }
  },
  {
    name: "Workday",
    hosts: ["myworkdayjobs.com"],
    selectors: {
      description: [
        "[data-automation-id='jobPostingDescription']",
        "[data-automation-id='jobPostingPage']"
      ],
      title: ["[data-automation-id='jobPostingHeader']", "h1"],
      company: [
        "[data-automation-id='company']",
        "meta[property='og:site_name']"
      ],
      location: [
        "[data-automation-id='locations']",
        "[data-automation-id='location']"
      ]
    }
  }
];
