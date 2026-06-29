const http = require("http");
const fs = require("fs");
const path = require("path");
const { extractApplicantFacts } = require("./lib/extractor");
const { assessApplicant, rules } = require("./lib/mer");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const MOCK_FILE = path.join(__dirname, "data", "mock-applicant.json");

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

    const extracted = await extractApplicantFacts(payload);
    const merged = mergeApplicantAndExtraction(payload.applicant, extracted);
    const assessment = assessApplicant({
      applicant: payload.applicant,
      files: payload.files || [],
      extracted: merged
    });

    sendJson(res, 200, {
      ok: true,
      usedOpenAI: Boolean(process.env.OPENAI_API_KEY),
      assessment
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error.message || "Assessment failed."
    });
  }
}

function handleMock(res) {
  const mock = JSON.parse(fs.readFileSync(MOCK_FILE, "utf8"));
  sendJson(res, 200, mock);
}

function handleRules(res) {
  sendJson(res, 200, rules);
}

function handleConfig(res) {
  sendJson(res, 200, {
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini"
  });
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
  if (req.url === "/api/mock" && req.method === "GET") return handleMock(res);
  if (req.url === "/api/assess" && req.method === "POST") return handleAssess(req, res);

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Admission Eligibility Checker running on http://${HOST}:${PORT}`);
});
