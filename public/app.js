const state = {
  files: [],
  rules: null,
  assessment: null
};

const form = document.getElementById("assessmentForm");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const apiStatus = document.getElementById("apiStatus");
const courseSelect = document.getElementById("courseSelect");
const emptyState = document.getElementById("emptyState");
const resultsEl = document.getElementById("results");
const submitButton = document.getElementById("submitButton");
const loadMockButton = document.getElementById("loadMockButton");
const copyReportButton = document.getElementById("copyReportButton");
const downloadReportButton = document.getElementById("downloadReportButton");
const staffOverride = document.getElementById("staffOverride");

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function statusBadge(status) {
  const normalized = String(status || "").toLowerCase();
  let cls = "manual";
  if (normalized === "pass") cls = "pass";
  else if (normalized === "fail") cls = "fail";
  else if (normalized === "interview") cls = "interview";
  else if (normalized === "missing") cls = "missing";
  else if (normalized === "test_required") cls = "test";
  return `<span class="badge ${cls}">${escapeHtml(normalized.replaceAll("_", " "))}</span>`;
}

async function fileToPayload(file) {
  const dataUrl = await new Promise((resolve) => {
    if (!file.type.startsWith("image/")) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

  const textPreview = await new Promise((resolve) => {
    if (file.type.startsWith("text/")) {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").slice(0, 4000));
      reader.onerror = () => resolve("");
      reader.readAsText(file);
      return;
    }
    resolve("");
  });

  return {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    dataUrl,
    textPreview
  };
}

function renderFiles() {
  if (!state.files.length) {
    fileList.className = "file-list empty";
    fileList.textContent = "No files selected.";
    return;
  }

  fileList.className = "file-list";
  fileList.innerHTML = state.files
    .map(
      (file) =>
        `<span class="file-pill">${escapeHtml(file.name)} <small>${Math.round(file.size / 1024)} KB</small></span>`
    )
    .join("");
}

function formPayload() {
  const formData = new FormData(form);
  return {
    applicant: {
      name: formData.get("name"),
      age: formData.get("age"),
      country: formData.get("country"),
      courseId: formData.get("courseId"),
      notes: formData.get("notes"),
      applicationText: formData.get("applicationText")
    },
    files: state.files
  };
}

function listMarkup(items) {
  if (!items || !items.length) return `<p>None</p>`;
  return `<ul class="list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderAssessment(assessment) {
  state.assessment = assessment;
  emptyState.classList.add("hidden");
  resultsEl.classList.remove("hidden");
  copyReportButton.disabled = false;
  downloadReportButton.disabled = false;

  document.getElementById("recommendation").textContent = assessment.recommendation;
  document.getElementById("courseName").textContent = assessment.course.name;
  document.getElementById("intake").textContent = assessment.course.intake;

  document.getElementById("applicantSummary").innerHTML = `
    <div class="kv">
      <div><span>Name</span><strong>${escapeHtml(assessment.applicantSummary.name)}</strong></div>
      <div><span>Age</span><strong>${escapeHtml(assessment.applicantSummary.age ?? "Unknown")}</strong></div>
      <div><span>Country</span><strong>${escapeHtml(assessment.applicantSummary.country)}</strong></div>
      <div><span>Course</span><strong>${escapeHtml(assessment.applicantSummary.course)}</strong></div>
      <div><span>Override</span><strong>${escapeHtml(staffOverride.value || "None")}</strong></div>
    </div>
  `;

  document.getElementById("evidenceSummary").innerHTML = assessment.evidenceSummary.length
    ? assessment.evidenceSummary
        .map(
          (item) => `
            <p><strong>${escapeHtml(item.name)}</strong><br>${escapeHtml(item.type)} · ${Math.round(item.size / 1024)} KB</p>
          `
        )
        .join("")
    : "<p>No uploaded evidence.</p>";

  document.getElementById("merChecklist").innerHTML = [
    {
      label: "Academic Requirement",
      check: assessment.checks.academic
    },
    {
      label: "English Requirement",
      check: assessment.checks.english
    },
    {
      label: "Age Requirement",
      check: assessment.checks.age
    }
  ]
    .map(
      ({ label, check }) => `
        <section>
          <strong>${escapeHtml(label)}</strong><br>
          ${statusBadge(check.status)}
          ${listMarkup(check.reasons)}
        </section>
      `
    )
    .join("");

  document.getElementById("missingEvidence").innerHTML = listMarkup(assessment.missingEvidence);
  document.getElementById("riskFlags").innerHTML = listMarkup(assessment.riskFlags);
  document.getElementById("aiExplanation").innerHTML = `<p>${escapeHtml(assessment.aiExplanation)}</p>`;
}

function buildReport() {
  if (!state.assessment) return "";
  const a = state.assessment;
  const evidenceLines = a.evidenceSummary.length
    ? a.evidenceSummary.map((item) => `- ${item.name} (${item.type})`)
    : ["- None"];
  const missingLines = a.missingEvidence.length
    ? a.missingEvidence.map((item) => `- ${item}`)
    : ["- None"];
  const riskLines = a.riskFlags.length
    ? a.riskFlags.map((item) => `- ${item}`)
    : ["- None"];
  return [
    "Admission Assessment Report",
    `Date of assessment: ${new Date().toLocaleString()}`,
    "",
    "Applicant Details",
    `Name: ${a.applicantSummary.name}`,
    `Age: ${a.applicantSummary.age ?? "Unknown"}`,
    `Country: ${a.applicantSummary.country}`,
    `Course checked: ${a.course.name}`,
    `Intake: ${a.course.intake}`,
    "",
    "MER Checklist",
    `Academic: ${a.checks.academic.status}`,
    `English: ${a.checks.english.status}`,
    `Age: ${a.checks.age.status}`,
    "",
    "Evidence Found",
    ...evidenceLines,
    "",
    "Evidence Missing",
    ...missingLines,
    "",
    "Risk Flags",
    ...riskLines,
    "",
    `Final Recommendation: ${a.recommendation}`,
    `Staff Override: ${staffOverride.value || "None"}`,
    "",
    "AI Explanation",
    a.aiExplanation,
    "",
    "Staff Notes",
    a.applicantSummary.notes || "None"
  ].join("\n");
}

async function loadConfig() {
  const config = await fetchJson("/api/config");
  apiStatus.innerHTML = config.hasOpenAIKey
    ? `OpenAI enabled<br><strong>${escapeHtml(config.model)}</strong>`
    : "OpenAI key missing. Assessments will run in mock/manual extraction mode.";
}

async function loadRules() {
  const rules = await fetchJson("/api/rules");
  state.rules = rules;
  courseSelect.innerHTML = Object.values(rules.courses)
    .map((course) => `<option value="${escapeHtml(course.id)}">${escapeHtml(course.name)}</option>`)
    .join("");
}

async function loadMock() {
  const mock = await fetchJson("/api/mock");
  form.elements.name.value = mock.applicant.name;
  form.elements.age.value = mock.applicant.age;
  form.elements.country.value = mock.applicant.country;
  form.elements.courseId.value = mock.applicant.courseId;
  form.elements.notes.value = mock.applicant.notes;
  form.elements.applicationText.value = mock.applicant.applicationText;
  state.files = mock.files;
  renderFiles();
}

fileInput.addEventListener("change", async (event) => {
  const selected = Array.from(event.target.files || []);
  state.files = [];
  for (const file of selected) {
    state.files.push(await fileToPayload(file));
  }
  renderFiles();
});

submitButton.addEventListener("click", async () => {
  submitButton.disabled = true;
  submitButton.textContent = "Assessing...";
  try {
    const payload = formPayload();
    const response = await fetchJson("/api/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    renderAssessment(response.assessment);
  } catch (error) {
    alert(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Run Assessment";
  }
});

loadMockButton.addEventListener("click", () => {
  loadMock().catch((error) => alert(error.message));
});

copyReportButton.addEventListener("click", async () => {
  const report = buildReport();
  await navigator.clipboard.writeText(report);
  copyReportButton.textContent = "Copied";
  setTimeout(() => {
    copyReportButton.textContent = "Copy Report";
  }, 1200);
});

downloadReportButton.addEventListener("click", () => {
  const blob = new Blob([buildReport()], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "admission-assessment-report.txt";
  link.click();
  URL.revokeObjectURL(url);
});

Promise.all([loadConfig(), loadRules()]).catch((error) => {
  apiStatus.textContent = error.message;
});
