/* ── STATE ───────────────────────────────────────────── */
const state = {
  queue: [],
  selectedId: null,
  step: 0,
  courses: {},
  merCache: {},         // applicant id → mer result
  decisionDraft: {},    // applicant id → selected decision label
  extracting: null,
  showNewForm: false,
  modalFiles: [],
  showSettings: false,
  aiConfig: {
    aiEnabled: false,
    analysisModel: "gpt-4.1-mini",
    utilityModel: "gpt-4o-mini",
    visionModel: "gpt-4o",
    temperature: 0.1
  },
  fetchedModels: []
};

/* ── THEME ───────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme || "minecraft");
  localStorage.setItem("ac_theme", theme || "minecraft");
  document.querySelectorAll(".theme-option").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.theme === (theme || "minecraft"));
  });
}

function loadTheme() {
  applyTheme(localStorage.getItem("ac_theme") || "minecraft");
}

/* ── HELPERS ─────────────────────────────────────────── */
function el(id) { return document.getElementById(id); }

function statusClass(status) {
  if (!status) return "pending";
  const s = status.toLowerCase();
  if (s.includes("eligible") && !s.includes("not") && !s.includes("conditional")) return "eligible";
  if (s.includes("conditional") || s.includes("evidence") || s.includes("interview") || s.includes("placement") || s.includes("review") || s.includes("manual")) return "conditional";
  if (s.includes("not eligible")) return "not-eligible";
  return "pending";
}

function statusLabel(status) {
  if (!status || status === "Pending") return "Pending";
  const s = status.toLowerCase();
  if (s.includes("eligible") && !s.includes("not") && !s.includes("conditional")) return "Eligible";
  if (s.includes("conditional") || s.includes("additional") || s.includes("evidence")) return "Conditional";
  if (s.includes("not eligible")) return "Not Eligible";
  if (s.includes("interview")) return "Interview";
  if (s.includes("placement")) return "English Test";
  if (s.includes("manual") || s.includes("review")) return "Manual Review";
  return status;
}

function recommendationClass(rec) {
  if (!rec) return "pending";
  const r = rec.toLowerCase();
  if (r === "eligible") return "eligible";
  if (r.includes("not eligible")) return "not-eligible";
  return "conditional";
}

function courseName(courseId) {
  const c = state.courses[courseId];
  return c ? c.name : courseId || "Unknown";
}

function getApplicant(id) {
  return state.queue.find(a => a.id === id) || null;
}

function confidenceClass(c) {
  if (!c) return "manual";
  const l = c.toLowerCase();
  if (l === "high") return "high";
  if (l === "medium") return "medium";
  if (l === "low") return "low";
  return "manual";
}

/* ── API ─────────────────────────────────────────────── */
async function api(method, url, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url.replace(/^\//, ""), opts);
  return res.json();
}

async function loadQueue() {
  const data = await api("GET", "/api/queue");
  state.queue = Array.isArray(data) ? data : [];
}

async function loadRules() {
  const data = await api("GET", "/api/rules");
  state.courses = data.courses || {};
}

async function saveApplicant(applicant) {
  const data = await api("PUT", `/api/queue/${applicant.id}`, applicant);
  const idx = state.queue.findIndex(a => a.id === applicant.id);
  if (idx !== -1) state.queue[idx] = data;
}

async function runExtraction(id) {
  const data = await api("POST", `/api/queue/${id}/extract`, { settings: getAiCallSettings() });
  return data;
}

async function runMer(id, facts) {
  const data = await api("POST", `/api/queue/${id}/mer`, { facts });
  return data;
}

async function createApplicant(body) {
  const data = await api("POST", "/api/queue", body);
  state.queue.push(data);
  return data;
}

async function loadAiConfig() {
  const data = await api("GET", "/api/ai-config");
  state.aiConfig = { ...state.aiConfig, ...data };
}

async function saveAiConfig(patch) {
  const data = await api("PUT", "/api/ai-config", patch);
  if (data.ok) state.aiConfig = { ...state.aiConfig, ...data.config };
  return data;
}

/* ── SETTINGS PANEL ──────────────────────────────────── */
function showSettingsView() {
  state.showSettings = true;
  el("settingsView").style.display = "block";
  el("workspace").style.display = "none";
  el("mainEmpty").style.display = "none";
  el("btnHeaderSettings").classList.add("active");
  populateSettingsUI();
}

function hideSettingsView() {
  state.showSettings = false;
  el("settingsView").style.display = "none";
  el("btnHeaderSettings").classList.remove("active");
  if (state.selectedId) {
    el("workspace").style.display = "block";
  } else {
    el("mainEmpty").style.display = "flex";
  }
}

function populateSettingsUI() {
  // Theme
  applyTheme(localStorage.getItem("ac_theme") || "minecraft");

  // AI config
  const cfg = state.aiConfig;
  el("aiEnabledToggle").checked = Boolean(cfg.aiEnabled);
  el("temperatureRange").value = cfg.temperature !== undefined ? cfg.temperature : 0.1;
  el("temperatureDisplay").textContent = Number(el("temperatureRange").value).toFixed(2);

  const storedKey = localStorage.getItem("ac_openai_key") || "";
  el("aiKeyInput").value = storedKey ? "••••••••" : "";

  populateModelDropdowns(state.fetchedModels);
}

function populateModelDropdowns(models) {
  const cfg = state.aiConfig;
  const selIds = ["analysisModelSelect", "utilityModelSelect", "visionModelSelect"];
  const cfgKeys = ["analysisModel", "utilityModel", "visionModel"];

  selIds.forEach((selId, i) => {
    const sel = el(selId);
    const current = cfg[cfgKeys[i]];
    if (models.length > 0) {
      sel.innerHTML = models
        .filter(m => m.id.startsWith("gpt"))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(m => `<option value="${esc(m.id)}" ${m.id === current ? "selected" : ""}>${esc(m.id)}</option>`)
        .join("");
    } else {
      // Show the saved value as a placeholder option
      sel.innerHTML = `<option value="${esc(current)}">${esc(current)}</option>`;
    }
  });
}

function getAiSettingsFromUI() {
  return {
    aiEnabled: el("aiEnabledToggle").checked,
    analysisModel: el("analysisModelSelect").value,
    utilityModel: el("utilityModelSelect").value,
    visionModel: el("visionModelSelect").value,
    temperature: parseFloat(el("temperatureRange").value)
  };
}

/* Returns the AI options object to pass to the extract endpoint */
function getAiCallSettings() {
  const key = localStorage.getItem("ac_openai_key") || "";
  return {
    aiEnabled: state.aiConfig.aiEnabled,
    openAIApiKey: key || undefined,
    analysisModel: state.aiConfig.analysisModel,
    utilityModel: state.aiConfig.utilityModel,
    visionModel: state.aiConfig.visionModel,
    temperature: state.aiConfig.temperature
  };
}

/* ── RENDER SIDEBAR ──────────────────────────────────── */
function renderSidebar() {
  const list = el("sidebarList");
  list.innerHTML = "";
  state.queue.forEach(a => {
    const row = document.createElement("div");
    row.className = "sidebar-row" + (a.id === state.selectedId ? " active" : "");
    row.dataset.id = a.id;
    const cls = statusClass(a.status);
    const lbl = statusLabel(a.status);
    row.innerHTML = `
      <div class="sidebar-row-top">
        <span class="sidebar-row-name">${esc(a.name)}</span>
        <span class="status-pill ${cls}">${esc(lbl)}</span>
      </div>
      <div class="sidebar-row-course">${esc(courseName(a.courseId))}</div>`;
    row.addEventListener("click", () => selectApplicant(a.id));
    list.appendChild(row);
  });
}

/* ── RENDER CONTEXT BAR ──────────────────────────────── */
function renderContextBar(a) {
  el("ctxName").textContent = a.name;
  el("ctxMeta").textContent = `${courseName(a.courseId)} · ${a.country || "—"}`;
  const pill = el("ctxPill");
  const cls = statusClass(a.status);
  pill.className = "recommendation-pill " + cls;
  pill.textContent = statusLabel(a.status);
}

/* ── SELECT APPLICANT ────────────────────────────────── */
function selectApplicant(id) {
  state.selectedId = id;
  state.step = 0;
  if (state.showSettings) hideSettingsView();
  renderSidebar();
  el("mainEmpty").style.display = "none";
  el("workspace").style.display = "block";
  const a = getApplicant(id);
  renderContextBar(a);
  renderTabs();
  renderStep(a);
}

/* ── RENDER TABS ─────────────────────────────────────── */
function renderTabs() {
  document.querySelectorAll(".step-tab").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.step) === state.step);
  });
}

/* ── STEP PANELS ─────────────────────────────────────── */
function showStep(n) {
  for (let i = 0; i < 5; i++) {
    el(`step${i}`).style.display = i === n ? "block" : "none";
  }
}

function renderStep(a) {
  renderTabs();
  showStep(state.step);
  switch (state.step) {
    case 0: renderIntake(a); break;
    case 1: renderExtraction(a); break;
    case 2: renderMer(a); break;
    case 3: renderDecision(a); break;
    case 4: renderReport(a); break;
  }
}

/* ── STEP 1: INTAKE ──────────────────────────────────── */
function renderIntake(a) {
  const grid = el("intakeGrid");
  const fields = [
    ["Full Name", a.name],
    ["Age", a.age || "—"],
    ["Nationality", a.country || "—"],
    ["Programme Applied", courseName(a.courseId)]
  ];
  grid.innerHTML = fields.map(([label, value]) => `
    <div>
      <div class="intake-field-label">${esc(label)}</div>
      <div class="intake-field-value">${esc(String(value))}</div>
    </div>`).join("");

  el("intakeNotes").innerHTML = a.notes
    ? `<div class="intake-field-label">Notes</div><p>${esc(a.notes)}</p>`
    : "";

  el("intakeStatement").innerHTML = a.writtenStatement
    ? `<p>${esc(a.writtenStatement)}</p>`
    : "";

  const files = el("intakeFiles");
  files.innerHTML = (a.files || []).map(f => `
    <div class="file-chip">
      <span class="file-chip-type">${esc(f.kindLabel || "FILE")}</span>
      ${esc(f.name)}
    </div>`).join("") || "<span style='color:#9AA1AB;font-size:13px'>No evidence files attached.</span>";
}

/* ── STEP 2: EXTRACTION ──────────────────────────────── */
function renderExtraction(a) {
  const hasKey = false; // server will tell us via extract response
  el("extractionBanner").textContent = a.extractionRun
    ? "AI-assisted extraction completed — review and edit fields below before proceeding."
    : "Click Run Extraction to extract applicant facts from the intake form data.";

  if (!a.extractionRun) {
    el("extractionEmpty").style.display = "flex";
    el("extractionTable").style.display = "none";
  } else {
    el("extractionEmpty").style.display = "none";
    el("extractionTable").style.display = "block";
    renderExtractionRows(a);
  }
}

const FACT_FIELDS = [
  { key: "applicantName", label: "Full Name", textarea: false },
  { key: "age", label: "Age", textarea: false },
  { key: "country", label: "Nationality", textarea: false },
  { key: "highestQualification", label: "Prior Qualification", textarea: false },
  { key: "subjectsPassedCount", label: "Credit Passes Count", textarea: false },
  { key: "englishQualification", label: "English Evidence Type", textarea: false },
  { key: "englishScore", label: "English Score", textarea: false },
  { key: "identityVerified", label: "Identity Verified", textarea: false },
  { key: "writtenStatement", label: "Written Statement", textarea: true }
];

function renderExtractionRows(a) {
  const rows = el("extractionRows");
  const facts = a.facts || {};
  rows.innerHTML = FACT_FIELDS.map(f => {
    const fact = facts[f.key] || { value: "", confidence: "Manual entry", source: "—" };
    const cls = confidenceClass(fact.confidence);
    const inputEl = f.textarea
      ? `<textarea class="extraction-textarea" data-key="${f.key}" rows="3">${esc(fact.value || "")}</textarea>`
      : `<input class="extraction-input" data-key="${f.key}" type="text" value="${esc(fact.value || "")}" />`;
    return `
      <div class="extraction-row">
        <div class="extraction-row-meta">
          <span class="extraction-row-label">${esc(f.label)}</span>
          <span class="extraction-row-source">${esc(fact.source || "—")}</span>
        </div>
        <div>${inputEl}</div>
        <div><span class="confidence-badge ${cls}">${esc(fact.confidence || "Manual entry")}</span></div>
      </div>`;
  }).join("");

  rows.querySelectorAll("[data-key]").forEach(inp => {
    inp.addEventListener("change", () => onFactEdit(a.id, inp.dataset.key, inp.value));
  });
}

async function onFactEdit(id, key, value) {
  const a = getApplicant(id);
  if (!a) return;
  if (!a.facts) a.facts = {};
  if (!a.facts[key]) a.facts[key] = { value: "", confidence: "Manual entry", source: "manual" };
  a.facts[key].value = value;
  a.facts[key].confidence = "Manual entry";
  await saveApplicant(a);
  // Re-run MER live
  const mer = await runMer(id, a.facts);
  state.merCache[id] = mer;
  // Update recommendation pill + sidebar status
  const rec = mer.recommendation || "";
  a.status = rec;
  renderContextBar(a);
  renderSidebar();
}

/* ── STEP 3: MER ─────────────────────────────────────── */
async function renderMer(a) {
  let mer = state.merCache[a.id];
  if (!mer && a.extractionRun) {
    mer = await runMer(a.id, a.facts);
    state.merCache[a.id] = mer;
  }
  if (!mer) {
    el("merRecommendationBanner").innerHTML = `<div class="mer-recommendation-banner pending"><div class="mer-banner-eyebrow">SYSTEM RECOMMENDATION</div><div class="mer-banner-outcome">Awaiting Extraction</div><div class="mer-banner-detail">Run extraction first to evaluate MER rules.</div></div>`;
    el("merRulesCard").innerHTML = "";
    el("riskFlagsCard").style.display = "none";
    return;
  }

  const rec = mer.recommendation || "Requires Manual Review";
  const cls = recommendationClass(rec);
  el("merRecommendationBanner").innerHTML = `
    <div class="mer-recommendation-banner ${cls}">
      <div class="mer-banner-eyebrow">SYSTEM RECOMMENDATION</div>
      <div class="mer-banner-outcome ${cls}">${esc(rec)}</div>
      <div class="mer-banner-detail">${esc(merSummaryLine(mer))}</div>
    </div>`;

  const checks = mer.checks || {};
  const RULES = [
    { key: "age", name: "Minimum Age", requirement: "Must be 17 years or older" },
    { key: "academic", name: "Academic Qualification", requirement: "GCE O-Level (3 passes), 12 years formal education, or equivalent" },
    { key: "english", name: "English Proficiency", requirement: "IELTS 5.5 or equivalent" },
    { key: "identity", name: "Identity Verification", requirement: "Valid identity document required" }
  ];

  el("merRulesCard").innerHTML = RULES.map(r => {
    const check = checks[r.key] || {};
    const status = check.status || "missing";
    const icon = status === "pass" ? "✓" : status === "fail" ? "✕" : "–";
    const statusText = status === "pass" ? "Met" : status === "fail" ? "Not Met" : "Evidence Missing";
    const detail = (check.reasons || [check.basis]).filter(Boolean).join("; ") || "—";
    return `
      <div class="mer-rule-row">
        <div class="mer-rule-icon ${status}">${icon}</div>
        <div class="mer-rule-body">
          <div class="mer-rule-header">
            <span class="mer-rule-name">${esc(r.name)}</span>
            <span class="mer-rule-status ${status}">${esc(statusText)}</span>
          </div>
          <div class="mer-rule-requirement">${esc(r.requirement)}</div>
          <div class="mer-rule-detail">${esc(detail)}</div>
        </div>
      </div>`;
  }).join("");

  const flags = mer.riskFlags || [];
  if (flags.length > 0) {
    el("riskFlagsCard").style.display = "block";
    el("riskFlagsList").innerHTML = flags.map(f => `<li>${esc(f)}</li>`).join("");
  } else {
    el("riskFlagsCard").style.display = "none";
  }
}

function merSummaryLine(mer) {
  const checks = mer.checks || {};
  const failing = [];
  if (checks.age?.status !== "pass") failing.push("age");
  if (checks.academic?.status !== "pass") failing.push("academic qualification");
  if (checks.english?.status !== "pass") failing.push("English proficiency");
  if (checks.identity?.status !== "pass") failing.push("identity verification");
  if (failing.length === 0) return "All minimum entry requirements have been met.";
  return `Issues with: ${failing.join(", ")}.`;
}

/* ── STEP 4: DECISION ────────────────────────────────── */
function renderDecision(a) {
  const mer = state.merCache[a.id];
  const rec = mer?.recommendation || null;
  const recClass = recommendationClass(rec);

  el("decisionRecommendationBanner").innerHTML = `
    <div class="decision-recommendation-banner ${recClass}">
      System recommendation: <strong>${esc(rec || "Not yet evaluated")}</strong>
    </div>`;

  // Reset button selection
  const draft = state.decisionDraft[a.id] || null;
  document.querySelectorAll(".decision-btn").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.decision === draft);
  });

  el("mismatchWarning").style.display = "none";
  el("decisionNotes").value = "";
  el("btnLogDecision").disabled = !draft;

  renderDecisionLog(a);
}

function renderDecisionLog(a) {
  const log = el("decisionLog");
  const entries = (a.decisionLog || []);
  if (entries.length === 0) {
    log.innerHTML = "";
    return;
  }
  log.innerHTML = entries.map(entry => {
    const cls = statusClass(entry.decisionLabel);
    const colorMap = { eligible: "#2F7A4D", conditional: "#B4790C", "not-eligible": "#B23A2E", pending: "#6B7280" };
    const color = colorMap[cls] || "#6B7280";
    return `
      <div class="decision-log-card">
        <div class="decision-log-card-top">
          <span class="decision-log-label" style="background:${color}1a;color:${color}">${esc(entry.decisionLabel)}</span>
          <span class="decision-log-meta">${esc(entry.timestamp)} · Reviewed by ${esc(entry.staff)}</span>
        </div>
        ${entry.reason ? `<div class="decision-log-reason">${esc(entry.reason)}</div>` : ""}
      </div>`;
  }).join("");
}

/* ── STEP 5: REPORT ──────────────────────────────────── */
function renderReport(a) {
  const text = generateReport(a);
  el("reportPre").textContent = text;
}

function generateReport(a) {
  const mer = state.merCache[a.id];
  const checks = mer?.checks || {};
  const rec = mer?.recommendation || "Not yet evaluated";
  const lastDecision = (a.decisionLog || [])[0];
  const RULES = [
    { key: "age", name: "Minimum Age" },
    { key: "academic", name: "Academic Qualification" },
    { key: "english", name: "English Proficiency" },
    { key: "identity", name: "Identity Verification" }
  ];

  const line = (l) => l;
  const sep = "─".repeat(60);

  const ruleLines = RULES.map(r => {
    const c = checks[r.key] || {};
    const tag = c.status === "pass" ? "[PASS]" : c.status === "fail" ? "[FAIL]" : "[MISSING]";
    const detail = (c.reasons || [c.basis]).filter(Boolean).join("; ") || "No data";
    return `  ${tag.padEnd(10)}${r.name}\n             ${detail}`;
  });

  const flags = (mer?.riskFlags || []).map(f => `  ! ${f}`);

  const lines = [
    "UNITED CERES COLLEGE",
    "Admissions Office — Eligibility Assessment Report",
    sep,
    "",
    `Applicant:   ${a.name}`,
    `Programme:   ${courseName(a.courseId)}`,
    `Nationality: ${a.country || "—"}`,
    `Age:         ${a.age || "—"}`,
    `Report date: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
    "",
    sep,
    "MER EVALUATION",
    sep,
    ...ruleLines,
    "",
    ...(flags.length > 0 ? [sep, "RISK FLAGS", sep, ...flags, ""] : []),
    sep,
    "RECOMMENDATION",
    sep,
    `  ${rec}`,
    "",
    sep,
    "STAFF DECISION",
    sep,
    lastDecision
      ? `  ${lastDecision.decisionLabel}\n  Reviewed by: ${lastDecision.staff}\n  Date: ${lastDecision.timestamp}${lastDecision.reason ? `\n  Notes: ${lastDecision.reason}` : ""}`
      : "  Pending review",
    "",
    sep
  ];
  return lines.join("\n");
}

/* ── MODAL ───────────────────────────────────────────── */
function openModal() {
  state.modalFiles = [];
  el("mName").value = "";
  el("mAge").value = "";
  el("mCountry").value = "";
  el("mNotes").value = "";
  el("mStatement").value = "";
  populateModalCourseSelect();
  renderModalFileChips();
  el("modalScrim").style.display = "flex";
}

function closeModal() {
  el("modalScrim").style.display = "none";
}

function populateModalCourseSelect() {
  const sel = el("mCourse");
  sel.innerHTML = Object.values(state.courses).map(c =>
    `<option value="${esc(c.id)}">${esc(c.name)}</option>`
  ).join("");
}

function renderModalFileChips() {
  el("modalFileChips").innerHTML = state.modalFiles.map((f, i) => `
    <div class="modal-file-chip">
      <span class="file-chip-type">${esc(f.kindLabel)}</span>
      ${esc(f.name)}
      <button class="modal-file-chip-remove" data-idx="${i}" type="button">×</button>
    </div>`).join("");
  el("modalFileChips").querySelectorAll("[data-idx]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.modalFiles.splice(Number(btn.dataset.idx), 1);
      renderModalFileChips();
    });
  });
}

const MOCK_FILE_NAMES = ["transcript.pdf", "passport_scan.jpg", "ielts_certificate.pdf", "bank_statement.pdf", "certificate.doc", "evidence.pdf"];
let mockFileIdx = 0;
function attachMockFile() {
  const name = MOCK_FILE_NAMES[mockFileIdx++ % MOCK_FILE_NAMES.length];
  const ext = name.split(".").pop().toUpperCase();
  const kindLabel = ext === "JPG" || ext === "PNG" ? "IMG" : ext === "DOC" || ext === "DOCX" ? "DOC" : "PDF";
  state.modalFiles.push({ name, kindLabel });
  renderModalFileChips();
}

async function submitNewApplicant() {
  const name = el("mName").value.trim();
  const courseId = el("mCourse").value;
  if (!name || !courseId) return;
  const applicant = await createApplicant({
    name,
    age: el("mAge").value ? Number(el("mAge").value) : null,
    country: el("mCountry").value.trim() || null,
    courseId,
    notes: el("mNotes").value.trim(),
    writtenStatement: el("mStatement").value.trim(),
    files: state.modalFiles
  });
  closeModal();
  renderSidebar();
  selectApplicant(applicant.id);
}

/* ── ESCAPE ──────────────────────────────────────────── */
function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── INIT ────────────────────────────────────────────── */
async function init() {
  loadTheme();
  await Promise.all([loadQueue(), loadRules(), loadAiConfig()]);
  renderSidebar();

  // Tab navigation
  document.querySelectorAll(".step-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      state.step = Number(btn.dataset.step);
      const a = getApplicant(state.selectedId);
      if (a) renderStep(a);
    });
  });

  // New applicant button
  el("btnNewApplicant").addEventListener("click", openModal);
  el("btnModalCancel").addEventListener("click", closeModal);
  el("modalScrim").addEventListener("click", e => { if (e.target === el("modalScrim")) closeModal(); });
  el("btnModalAdd").addEventListener("click", submitNewApplicant);
  el("btnAttach").addEventListener("click", attachMockFile);

  // ── SETTINGS ──────────────────────────────────────────
  el("btnHeaderSettings").addEventListener("click", () => {
    if (state.showSettings) hideSettingsView();
    else showSettingsView();
  });

  // Theme picker
  document.querySelectorAll(".theme-option").forEach(btn => {
    btn.addEventListener("click", () => applyTheme(btn.dataset.theme));
  });

  // AI toggle
  el("aiEnabledToggle").addEventListener("change", () => {
    state.aiConfig.aiEnabled = el("aiEnabledToggle").checked;
  });

  // Temperature slider
  el("temperatureRange").addEventListener("input", () => {
    el("temperatureDisplay").textContent = Number(el("temperatureRange").value).toFixed(2);
  });

  // Save key
  el("btnSaveKey").addEventListener("click", () => {
    const key = el("aiKeyInput").value.trim();
    if (key && !key.startsWith("••")) {
      localStorage.setItem("ac_openai_key", key);
      el("aiKeyInput").value = "••••••••";
    }
  });

  // Clear key
  el("btnClearKey").addEventListener("click", () => {
    localStorage.removeItem("ac_openai_key");
    el("aiKeyInput").value = "";
  });

  // Fetch models
  el("btnFetchModels").addEventListener("click", async () => {
    const key = localStorage.getItem("ac_openai_key") || el("aiKeyInput").value.trim();
    if (!key || key.startsWith("••")) {
      el("fetchModelsStatus").textContent = "Enter and save a key first.";
      return;
    }
    el("fetchModelsStatus").textContent = "Fetching…";
    try {
      const data = await api("POST", "/api/models", { openAIApiKey: key });
      if (data.data && Array.isArray(data.data)) {
        state.fetchedModels = data.data;
        populateModelDropdowns(data.data);
        el("fetchModelsStatus").textContent = `${data.data.filter(m => m.id.startsWith("gpt")).length} models loaded.`;
      } else {
        el("fetchModelsStatus").textContent = data.error || "Unexpected response.";
      }
    } catch (e) {
      el("fetchModelsStatus").textContent = "Failed: " + e.message;
    }
  });

  // Save AI settings
  el("btnSaveAiConfig").addEventListener("click", async () => {
    const patch = getAiSettingsFromUI();
    const result = await saveAiConfig(patch);
    if (result.ok) {
      el("aiSaveStatus").textContent = "Saved.";
      setTimeout(() => { el("aiSaveStatus").textContent = ""; }, 2000);
    } else {
      el("aiSaveStatus").textContent = result.error || "Save failed.";
    }
  });

  // Extraction
  el("btnRunExtraction").addEventListener("click", async () => {
    const a = getApplicant(state.selectedId);
    if (!a || state.extracting === a.id) return;
    state.extracting = a.id;
    el("btnRunExtraction").style.display = "none";
    el("extractionSpinner").style.display = "block";
    try {
      const result = await runExtraction(a.id);
      if (result.ok) {
        a.facts = result.facts;
        a.extractionRun = true;
        // Update local queue
        const idx = state.queue.findIndex(x => x.id === a.id);
        if (idx !== -1) state.queue[idx] = { ...state.queue[idx], facts: result.facts, extractionRun: true };
        el("extractionBanner").textContent = result.usedAI
          ? "AI-assisted extraction completed — review and edit fields below before proceeding."
          : "No OPENAI_API_KEY configured — AI extraction skipped. Fields populated from intake form data.";
        el("extractionEmpty").style.display = "none";
        el("extractionTable").style.display = "block";
        renderExtractionRows(a);
      }
    } finally {
      state.extracting = null;
      el("btnRunExtraction").style.display = "block";
      el("extractionSpinner").style.display = "none";
    }
  });

  // Decision buttons
  document.querySelectorAll(".decision-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const a = getApplicant(state.selectedId);
      if (!a) return;
      const prev = state.decisionDraft[a.id];
      state.decisionDraft[a.id] = prev === btn.dataset.decision ? null : btn.dataset.decision;
      document.querySelectorAll(".decision-btn").forEach(b =>
        b.classList.toggle("selected", b.dataset.decision === state.decisionDraft[a.id])
      );
      const draft = state.decisionDraft[a.id];
      el("btnLogDecision").disabled = !draft;
      // Mismatch check
      const mer = state.merCache[a.id];
      const rec = mer?.recommendation || "";
      const recCls = recommendationClass(rec);
      const draftCls = draft ? (
        draft.toLowerCase().includes("approve") ? "eligible" :
        draft.toLowerCase().includes("conditional") ? "conditional" : "not-eligible"
      ) : null;
      el("mismatchWarning").style.display = (draftCls && draftCls !== recCls) ? "block" : "none";
    });
  });

  el("btnLogDecision").addEventListener("click", async () => {
    const a = getApplicant(state.selectedId);
    if (!a) return;
    const draft = state.decisionDraft[a.id];
    if (!draft) return;
    const reason = el("decisionNotes").value.trim();
    const entry = {
      decisionLabel: draft,
      staff: "Felix Oking",
      reason,
      timestamp: new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    };
    a.decisionLog = [entry, ...(a.decisionLog || [])];
    // Map decision to status
    const cls = draft.toLowerCase().includes("approve") ? "Eligible" :
                draft.toLowerCase().includes("conditional") ? "Conditional" : "Not Eligible";
    a.status = cls;
    await saveApplicant(a);
    state.decisionDraft[a.id] = null;
    el("decisionNotes").value = "";
    el("btnLogDecision").disabled = true;
    document.querySelectorAll(".decision-btn").forEach(b => b.classList.remove("selected"));
    renderDecisionLog(a);
    renderContextBar(a);
    renderSidebar();
  });

  // Report buttons
  el("btnCopyReport").addEventListener("click", () => {
    const a = getApplicant(state.selectedId);
    if (!a) return;
    const text = generateReport(a);
    navigator.clipboard.writeText(text).then(() => {
      const btn = el("btnCopyReport");
      const orig = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  });

  el("btnDownloadReport").addEventListener("click", () => {
    const a = getApplicant(state.selectedId);
    if (!a) return;
    const text = generateReport(a);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `eligibility-report-${a.name.replace(/\s+/g, "-").toLowerCase()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  });
}

init();
