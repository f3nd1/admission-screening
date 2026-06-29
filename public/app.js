const state = {
  files: [],
  rules: null,
  assessment: null,
  settings: {
    aiEnabled: true,
    openAIApiKey: "",
    model: "gpt-4.1-mini"
  },
  config: null,
  availableModels: [],
  references: [],
  selectedReference: null,
  documentProcessing: []
};

const SETTINGS_STORAGE_KEY = "admission-checker-settings";

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
const apiKeyInput = document.getElementById("apiKeyInput");
const aiEnabledInput = document.getElementById("aiEnabledInput");
const saveSettingsButton = document.getElementById("saveSettingsButton");
const clearSettingsButton = document.getElementById("clearSettingsButton");
const settingsStatus = document.getElementById("settingsStatus");
const fetchModelsButton = document.getElementById("fetchModelsButton");
const modelSelect = document.getElementById("modelSelect");
const navTabs = Array.from(document.querySelectorAll(".nav-tab"));
const views = Array.from(document.querySelectorAll(".view"));
const referenceList = document.getElementById("referenceList");
const referenceTitle = document.getElementById("referenceTitle");
const referencePath = document.getElementById("referencePath");
const referenceContent = document.getElementById("referenceContent");
const courseEditorSelect = document.getElementById("courseEditorSelect");
const editorCourseId = document.getElementById("editorCourseId");
const editorCourseName = document.getElementById("editorCourseName");
const editorIntake = document.getElementById("editorIntake");
const editorMinimumAge = document.getElementById("editorMinimumAge");
const editorAcademicCriteria = document.getElementById("editorAcademicCriteria");
const editorEnglishCriteria = document.getElementById("editorEnglishCriteria");
const newCourseButton = document.getElementById("newCourseButton");
const saveCourseButton = document.getElementById("saveCourseButton");
const processingLog = document.getElementById("processingLog");
const extractedTextViewer = document.getElementById("extractedTextViewer");

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

function setActiveView(viewId) {
  navTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewId);
  });
  views.forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });
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

  const base64 = await new Promise((resolve) => {
    if (
      !(file.type.startsWith("image/") ||
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf"))
    ) {
      return resolve(null);
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const parts = result.split(",");
      resolve(parts[1] || null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

  const rawText = await new Promise((resolve) => {
    if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
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
    base64,
    rawText,
    textPreview: String(rawText || "").slice(0, 4000)
  };
}

function renderFiles() {
  if (!state.files.length) {
    fileList.className = "file-list empty";
    fileList.textContent = "No files selected.";
    return;
  }

  fileList.className = "file-list";
  fileList.innerHTML =
    `<p>${state.files.length} file(s) selected.</p>` +
    state.files
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
    settings: state.settings,
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
    { label: "Academic Requirement", check: assessment.checks.academic },
    { label: "English Requirement", check: assessment.checks.english },
    { label: "Age Requirement", check: assessment.checks.age }
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
  renderDocumentProcessing();
}

function renderDocumentProcessing() {
  if (!state.documentProcessing.length) {
    processingLog.innerHTML = "<p>No document processing log available.</p>";
    extractedTextViewer.innerHTML = "<p>No extracted text available.</p>";
    return;
  }

  processingLog.innerHTML = state.documentProcessing
    .map(
      (item) => `
        <div class="processing-entry">
          <strong>${escapeHtml(item.name)}</strong>
          ${listMarkup(item.processingLogs || [])}
        </div>
      `
    )
    .join("");

  extractedTextViewer.innerHTML = state.documentProcessing
    .map(
      (item) => `
        <div class="processing-entry">
          <strong>${escapeHtml(item.name)}</strong>
          <div class="text-block">${escapeHtml(item.extractedText || "No extracted text available.")}</div>
        </div>
      `
    )
    .join("");
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
  const riskLines = a.riskFlags.length ? a.riskFlags.map((item) => `- ${item}`) : ["- None"];
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

function readStoredSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.settings.aiEnabled = parsed.aiEnabled !== false;
    state.settings.openAIApiKey =
      typeof parsed.openAIApiKey === "string" ? parsed.openAIApiKey : "";
    state.settings.model =
      typeof parsed.model === "string" && parsed.model ? parsed.model : "gpt-4.1-mini";
  } catch {
    state.settings = {
      aiEnabled: true,
      openAIApiKey: "",
      model: "gpt-4.1-mini"
    };
  }
}

function preferredModelIds(models) {
  const allowPrefixes = ["gpt-", "o", "chatgpt-"];
  return models.filter((model) => allowPrefixes.some((prefix) => model.id.startsWith(prefix)));
}

function renderModelOptions() {
  const fallbackModels = [
    { id: "gpt-4.1-mini" },
    { id: "gpt-4.1" },
    { id: "gpt-5-mini" },
    { id: "gpt-5" }
  ];
  const models = state.availableModels.length ? preferredModelIds(state.availableModels) : fallbackModels;
  const options = models.length ? [...models] : [...fallbackModels];
  if (!options.some((item) => item.id === state.settings.model)) {
    options.unshift({ id: state.settings.model });
  }
  modelSelect.innerHTML = options
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)}</option>`)
    .join("");
  modelSelect.value = state.settings.model || "gpt-4.1-mini";
}

function syncSettingsInput() {
  aiEnabledInput.checked = state.settings.aiEnabled;
  apiKeyInput.value = state.settings.openAIApiKey;
  renderModelOptions();
}

function renderSettingsStatus() {
  const model = state.settings.model || state.config?.model || "gpt-4.1-mini";
  if (!state.settings.aiEnabled) {
    settingsStatus.textContent = "AI disabled";
    apiStatus.textContent = "AI extraction is disabled. Assessments will run in manual/rule-based mode.";
    return;
  }
  if (state.settings.openAIApiKey) {
    settingsStatus.textContent = "Browser key saved";
    apiStatus.innerHTML = `OpenAI enabled from browser settings<br><strong>${escapeHtml(model)}</strong>`;
    return;
  }
  if (state.config?.hasServerOpenAIKey) {
    settingsStatus.textContent = "Server key active";
    apiStatus.innerHTML = `OpenAI enabled on server<br><strong>${escapeHtml(model)}</strong>`;
    return;
  }
  settingsStatus.textContent = "Not configured";
  apiStatus.textContent = "OpenAI key missing. Assessments will run in mock/manual extraction mode.";
}

function saveSettings() {
  state.settings.aiEnabled = aiEnabledInput.checked;
  state.settings.openAIApiKey = apiKeyInput.value.trim();
  state.settings.model = modelSelect.value || state.settings.model || "gpt-4.1-mini";
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
  renderSettingsStatus();
}

function clearSettings() {
  state.settings = {
    aiEnabled: true,
    openAIApiKey: "",
    model: state.config?.model || "gpt-4.1-mini"
  };
  window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
  syncSettingsInput();
  renderSettingsStatus();
}

function renderCourses() {
  if (!state.rules) return;
  const courses = Object.values(state.rules.courses);
  courseSelect.innerHTML = courses
    .map((course) => `<option value="${escapeHtml(course.id)}">${escapeHtml(course.name)}</option>`)
    .join("");
  courseEditorSelect.innerHTML = courses
    .map((course) => `<option value="${escapeHtml(course.id)}">${escapeHtml(course.name)}</option>`)
    .join("");
  if (courses.length && !courses.some((course) => course.id === courseEditorSelect.value)) {
    courseEditorSelect.value = courses[0].id;
  }
  if (courses.length && !courses.some((course) => course.id === courseSelect.value)) {
    courseSelect.value = courses[0].id;
  }
  renderSelectedCourse();
}

function renderSelectedCourse() {
  if (!state.rules) return;
  const selectedId = courseEditorSelect.value;
  const course = state.rules.courses[selectedId];
  if (!course) return;
  editorCourseId.value = course.id || "";
  editorCourseName.value = course.name || "";
  editorIntake.value = course.intake || "";
  editorMinimumAge.value = course.minimumAge ?? "";
  editorAcademicCriteria.value = (course.academicCriteria || [])
    .map((item) => item.label)
    .join("\n");
  editorEnglishCriteria.value = (course.englishCriteria || [])
    .map((item) => item.label)
    .join("\n");
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function criteriaFromLines(prefix, text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label, index) => ({
      id: `${prefix}_${index + 1}`,
      label
    }));
}

async function saveCourseEditor() {
  const courseId = slugify(editorCourseId.value || editorCourseName.value);
  if (!courseId) throw new Error("Course ID or course name is required.");
  const nextCourse = {
    id: courseId,
    name: editorCourseName.value.trim(),
    intake: editorIntake.value.trim(),
    minimumAge: Number(editorMinimumAge.value || 0),
    academicCriteria: criteriaFromLines("academic", editorAcademicCriteria.value),
    englishCriteria: criteriaFromLines("english", editorEnglishCriteria.value)
  };
  const nextRules = {
    ...state.rules,
    courses: {
      ...state.rules.courses,
      [courseId]: nextCourse
    }
  };
  const response = await fetchJson("/api/mer-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nextRules)
  });
  state.rules = response.rules;
  renderCourses();
  courseEditorSelect.value = courseId;
  courseSelect.value = courseId;
  renderSelectedCourse();
}

function startNewCourse() {
  editorCourseId.value = "";
  editorCourseName.value = "";
  editorIntake.value = "";
  editorMinimumAge.value = "";
  editorAcademicCriteria.value = "";
  editorEnglishCriteria.value = "";
}

async function loadConfig() {
  state.config = await fetchJson("/api/config");
  if (!state.settings.model) {
    state.settings.model = state.config.model || "gpt-4.1-mini";
  }
  renderSettingsStatus();
}

async function loadRules() {
  state.rules = await fetchJson("/api/mer-config");
  renderCourses();
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
  state.documentProcessing = [];
  renderFiles();
  renderDocumentProcessing();
}

async function fetchAvailableModels() {
  const key = apiKeyInput.value.trim() || state.settings.openAIApiKey;
  if (!key && !state.config?.hasServerOpenAIKey) {
    throw new Error("Enter an OpenAI API key or configure one on the server before fetching models.");
  }
  const response = await fetchJson("/api/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ openAIApiKey: key })
  });
  state.availableModels = Array.isArray(response.data)
    ? response.data.slice().sort((a, b) => a.id.localeCompare(b.id))
    : [];
  if (
    state.availableModels.length &&
    !state.availableModels.some((item) => item.id === state.settings.model)
  ) {
    const inferred = preferredModelIds(state.availableModels)[0]?.id || state.availableModels[0].id;
    state.settings.model = inferred;
  }
  renderModelOptions();
  saveSettings();
}

async function loadReferenceFiles() {
  const response = await fetchJson("/api/reference-files");
  state.references = response.files || [];
  renderReferenceList();
  if (state.references.length) {
    await selectReference(state.references[0].name);
  }
}

function renderReferenceList() {
  if (!state.references.length) {
    referenceList.innerHTML = "<p>No reference markdown files found.</p>";
    return;
  }
  referenceList.innerHTML = state.references
    .map(
      (file) => `
        <button class="reference-item${state.selectedReference === file.name ? " active" : ""}" type="button" data-reference-name="${escapeHtml(file.name)}">
          ${escapeHtml(file.name)}
        </button>
      `
    )
    .join("");
  Array.from(referenceList.querySelectorAll("[data-reference-name]")).forEach((button) => {
    button.addEventListener("click", () => {
      selectReference(button.dataset.referenceName).catch((error) => alert(error.message));
    });
  });
}

async function selectReference(name) {
  const response = await fetchJson(`/api/reference-files?name=${encodeURIComponent(name)}`);
  state.selectedReference = response.name;
  referenceTitle.textContent = response.name;
  referencePath.textContent = response.path;
  referenceContent.textContent = response.content;
  renderReferenceList();
}

fileInput.addEventListener("change", async (event) => {
  const selected = Array.from(event.target.files || []);
  const nextFiles = [];
  for (const file of selected) {
    nextFiles.push(await fileToPayload(file));
  }
  state.files = [...state.files, ...nextFiles];
  state.documentProcessing = [];
  renderFiles();
  renderDocumentProcessing();
  event.target.value = "";
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
    state.documentProcessing = response.documentProcessing || [];
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

saveSettingsButton.addEventListener("click", () => {
  saveSettings();
});

clearSettingsButton.addEventListener("click", () => {
  clearSettings();
});

apiKeyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveSettings();
  }
});

aiEnabledInput.addEventListener("change", () => {
  saveSettings();
});

modelSelect.addEventListener("change", () => {
  saveSettings();
});

fetchModelsButton.addEventListener("click", async () => {
  fetchModelsButton.disabled = true;
  fetchModelsButton.textContent = "Fetching...";
  try {
    await fetchAvailableModels();
    fetchModelsButton.textContent = "Fetched";
  } catch (error) {
    alert(error.message);
    fetchModelsButton.textContent = "Fetch Available Models";
  } finally {
    setTimeout(() => {
      fetchModelsButton.disabled = false;
      fetchModelsButton.textContent = "Fetch Available Models";
    }, 900);
  }
});

navTabs.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveView(button.dataset.view);
  });
});

courseEditorSelect.addEventListener("change", () => {
  renderSelectedCourse();
});

newCourseButton.addEventListener("click", () => {
  startNewCourse();
});

saveCourseButton.addEventListener("click", async () => {
  saveCourseButton.disabled = true;
  saveCourseButton.textContent = "Saving...";
  try {
    await saveCourseEditor();
    saveCourseButton.textContent = "Saved";
  } catch (error) {
    alert(error.message);
    saveCourseButton.textContent = "Save Course";
  } finally {
    setTimeout(() => {
      saveCourseButton.disabled = false;
      saveCourseButton.textContent = "Save Course";
    }, 900);
  }
});

readStoredSettings();
syncSettingsInput();

Promise.all([loadConfig(), loadRules(), loadReferenceFiles()]).catch((error) => {
  apiStatus.textContent = error.message;
});
