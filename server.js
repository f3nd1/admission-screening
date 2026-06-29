const http = require("http");
const fs = require("fs");
const path = require("path");
const { extractApplicantFacts } = require("./lib/extractor");
const { processEvidenceFiles } = require("./lib/document-processing");
const { assessApplicant, getRules, saveRules } = require("./lib/mer");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const MOCK_FILE = path.join(__dirname, "data", "mock-applicant.json");
const REFERENCES_DIR = path.join(__dirname, "data", "reference-guides");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        reject(new Error("Request body exceeds 25MB."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function mergeApplicantAndExtraction(applicant, extracted) {
  return {
    ...extracted,
    applicantName: extracted.applicantName || applicant.name || null,
    age: extracted.age ?? (applicant.age === "" ? null : Number(applicant.age)),
    country: extracted.country || applicant.country || null
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Request payload is missing.";
  }
  if (!payload.applicant || typeof payload.applicant !== "object") {
    return "Applicant details are required.";
  }
  if (!payload.applicant.courseId) {
    return "Course selection is required.";
  }
  return null;
}

function sanitizeReferenceName(name) {
  return String(name || "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .trim();
}

function serveStatic(req, res) {
  const requestedPath = req.url === "/" ? "/index.html" : req.url;
  const safeRelativePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  const filePath = path.join(PUBLIC_DIR, safeRelativePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

async function handleAssess(req, res) {
  try {
    const payload = await parseBody(req);
    const validationError = validatePayload(payload);
    if (validationError) {
      sendJson(res, 400, { error: validationError });
      return;
    }

    const aiEnabled = payload.settings?.aiEnabled !== false;
    const apiKey = payload.settings?.openAIApiKey || process.env.OPENAI_API_KEY || null;
    const model = payload.settings?.model || process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const processedFiles = await processEvidenceFiles(payload.files || [], {
      apiKey: aiEnabled ? apiKey : null,
      model
    });
    const extracted = aiEnabled
      ? await extractApplicantFacts(payload, {
          apiKey,
          model,
          processedFiles
        })
      : {
          applicantName: payload.applicant.name || null,
          age: payload.applicant.age === "" ? null : Number(payload.applicant.age),
          dateOfBirth: null,
          country: payload.applicant.country || null,
          educationSystem: payload.applicant.country || null,
          highestQualification: null,
          yearsFormalEducation: null,
          subjectsPassedCount: null,
          passedSubjects: [],
          englishQualification: null,
          englishScore: null,
          englishGrade: null,
          workExperienceYears: null,
          missingEvidence: ["AI extraction disabled. Manual document review required."],
          explanation: "AI extraction is disabled in settings. Only manual applicant fields were used."
        };
    const merged = mergeApplicantAndExtraction(payload.applicant, extracted);
    const assessment = assessApplicant({
      applicant: payload.applicant,
      files: processedFiles,
      extracted: merged
    });

    sendJson(res, 200, {
      ok: true,
      usedOpenAI: Boolean(aiEnabled && apiKey),
      assessment,
      documentProcessing: processedFiles.map((file) => ({
        name: file.name,
        type: file.type,
        extractedText: file.extractedText || "",
        processingLogs: file.processingLogs || []
      }))
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error.message || "Assessment failed."
    });
  }
}

async function handleModels(req, res) {
  try {
    const payload = await parseBody(req);
    const apiKey = payload?.openAIApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      sendJson(res, 400, { error: "OpenAI API key is required to fetch models." });
      return;
    }

    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      sendJson(res, response.status, { error: `Failed to fetch models: ${text}` });
      return;
    }

    const json = await response.json();
    sendJson(res, 200, {
      data: Array.isArray(json.data) ? json.data : []
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Failed to fetch models." });
  }
}

function handleMock(res) {
  const mock = JSON.parse(fs.readFileSync(MOCK_FILE, "utf8"));
  sendJson(res, 200, mock);
}

function handleRules(res) {
  sendJson(res, 200, getRules());
}

function handleConfig(res) {
  sendJson(res, 200, {
    hasServerOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini"
  });
}

function handleMerConfig(res) {
  sendJson(res, 200, getRules());
}

async function handleMerConfigSave(req, res) {
  try {
    const payload = await parseBody(req);
    if (!payload || typeof payload !== "object" || !payload.courses || typeof payload.courses !== "object") {
      sendJson(res, 400, { error: "Invalid MER configuration payload." });
      return;
    }
    const nextRules = {
      ...getRules(),
      ...payload
    };
    saveRules(nextRules);
    sendJson(res, 200, { ok: true, rules: nextRules });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Failed to save MER settings." });
  }
}

function handleReferenceFiles(req, res) {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const requestedName = sanitizeReferenceName(url.searchParams.get("name"));
    const files = fs
      .readdirSync(REFERENCES_DIR)
      .filter((file) => file.endsWith(".md"))
      .sort();

    if (requestedName) {
      if (!files.includes(requestedName)) {
        sendJson(res, 404, { error: "Reference file not found." });
        return;
      }
      const filePath = path.join(REFERENCES_DIR, requestedName);
      const content = fs.readFileSync(filePath, "utf8");
      sendJson(res, 200, {
        name: requestedName,
        path: filePath,
        content
      });
      return;
    }

    sendJson(res, 200, {
      files: files.map((file) => ({
        name: file,
        path: path.join(REFERENCES_DIR, file)
      }))
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Failed to load reference files." });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (req.url === "/api/config" && req.method === "GET") return handleConfig(res);
  if (req.url === "/api/rules" && req.method === "GET") return handleRules(res);
  if (req.url === "/api/mer-config" && req.method === "GET") return handleMerConfig(res);
  if (req.url === "/api/mer-config" && req.method === "POST") return handleMerConfigSave(req, res);
  if (req.url === "/api/mock" && req.method === "GET") return handleMock(res);
  if (req.url === "/api/models" && req.method === "POST") return handleModels(req, res);
  if (req.url.startsWith("/api/reference-files") && req.method === "GET") return handleReferenceFiles(req, res);
  if (req.url === "/api/assess" && req.method === "POST") return handleAssess(req, res);

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Admission Eligibility Checker running on http://${HOST}:${PORT}`);
});
