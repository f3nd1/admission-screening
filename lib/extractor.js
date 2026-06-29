const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function trimDataUrl(dataUrl) {
  return typeof dataUrl === "string" && dataUrl.startsWith("data:")
    ? dataUrl
    : null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function manualFallback(payload, message) {
  const applicant = payload.applicant || {};
  return {
    applicantName: applicant.name || null,
    age: toNumber(applicant.age),
    dateOfBirth: null,
    country: applicant.country || null,
    educationSystem: applicant.country || null,
    highestQualification: null,
    yearsFormalEducation: null,
    subjectsPassedCount: null,
    passedSubjects: [],
    englishQualification: null,
    englishScore: null,
    englishGrade: null,
    workExperienceYears: null,
    missingEvidence: ["AI extraction unavailable or incomplete. Manual document review required."],
    explanation: message
  };
}

function buildPrompt(payload) {
  const applicant = payload.applicant || {};
  const effectiveFiles = payload.processedFiles || payload.files || [];
  const fileDescriptions = effectiveFiles.map((file, index) => {
    const preview = file.extractedText || file.rawText || file.textPreview || "";
    const logText = Array.isArray(file.processingLogs) && file.processingLogs.length
      ? ` Processing log: ${file.processingLogs.join(" ")}`
      : "";
    return `${index + 1}. ${file.name} (${file.type}, ${file.size} bytes). Extracted text preview: ${preview.slice(0, 2400)}.${logText}`;
  });

  return [
    "Extract admissions screening facts from the provided applicant information and evidence.",
    "Return strict JSON only with these keys:",
    "applicantName, age, dateOfBirth, country, educationSystem, highestQualification, yearsFormalEducation, subjectsPassedCount, passedSubjects, englishQualification, englishScore, englishGrade, workExperienceYears, missingEvidence, explanation",
    "Rules:",
    "- Extract facts only. Do not make the final admissions decision.",
    "- Use null when evidence is missing or unclear.",
    "- missingEvidence must be an array of short strings.",
    "- passedSubjects must be an array of strings.",
    "- explanation must briefly explain what evidence was found and what remains unclear.",
    "",
    `Applicant name: ${applicant.name || ""}`,
    `Applicant age: ${applicant.age || ""}`,
    `Applicant country: ${applicant.country || ""}`,
    `Staff notes: ${applicant.notes || ""}`,
    `Written application text: ${applicant.applicationText || ""}`,
    "Files:",
    fileDescriptions.join("\n") || "No files provided."
  ].join("\n");
}

async function callOpenAI(payload, apiKey, model) {
  const prompt = buildPrompt(payload);
  const content = [{ type: "input_text", text: prompt }];

  for (const file of payload.files || []) {
    const imageUrl = trimDataUrl(file.dataUrl);
    if (imageUrl && String(file.type || "").startsWith("image/")) {
      content.push({
        type: "input_image",
        image_url: imageUrl
      });
    }
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You extract admissions evidence into structured JSON. Never add markdown fences."
            }
          ]
        },
        {
          role: "user",
          content
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "admission_extraction",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              applicantName: { type: ["string", "null"] },
              age: { type: ["number", "null"] },
              dateOfBirth: { type: ["string", "null"] },
              country: { type: ["string", "null"] },
              educationSystem: { type: ["string", "null"] },
              highestQualification: { type: ["string", "null"] },
              yearsFormalEducation: { type: ["number", "null"] },
              subjectsPassedCount: { type: ["number", "null"] },
              passedSubjects: {
                type: "array",
                items: { type: "string" }
              },
              englishQualification: { type: ["string", "null"] },
              englishScore: { type: ["number", "string", "null"] },
              englishGrade: { type: ["string", "null"] },
              workExperienceYears: { type: ["number", "null"] },
              missingEvidence: {
                type: "array",
                items: { type: "string" }
              },
              explanation: { type: "string" }
            },
            required: [
              "applicantName",
              "age",
              "dateOfBirth",
              "country",
              "educationSystem",
              "highestQualification",
              "yearsFormalEducation",
              "subjectsPassedCount",
              "passedSubjects",
              "englishQualification",
              "englishScore",
              "englishGrade",
              "workExperienceYears",
              "missingEvidence",
              "explanation"
            ]
          }
        }
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${text}`);
  }

  const json = await response.json();
  const rawText =
    json.output_text ||
    json.output?.[0]?.content?.find((item) => item.type === "output_text")?.text ||
    "";
  return JSON.parse(rawText);
}

async function extractApplicantFacts(payload, options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  const model = options.model || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const enrichedPayload = {
    ...payload,
    processedFiles: options.processedFiles || payload.files || []
  };
  if (!apiKey) {
    return manualFallback(
      enrichedPayload,
      "No OpenAI API key is configured. AI extraction was skipped and manual fields were used where available."
    );
  }

  try {
    return await callOpenAI(enrichedPayload, apiKey, model);
  } catch (error) {
    return manualFallback(
      enrichedPayload,
      `AI extraction failed: ${error.message}. Manual review is required.`
    );
  }
}

module.exports = {
  extractApplicantFacts
};
