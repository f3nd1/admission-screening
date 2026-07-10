const path = require("path");
const { spawn } = require("child_process");

const PYTHON_BIN =
  "/Users/felixoking/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const PDF_SCRIPT = path.join(__dirname, "..", "scripts", "extract_pdf_text.py");

function normalize(value) {
  return String(value || "").trim();
}

function readJsonProcess(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Process exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

async function extractPdfText(file) {
  if (!file.base64) {
    return {
      extractedText: "",
      logs: ["PDF extraction skipped because no file data was provided."]
    };
  }
  const result = await readJsonProcess(PYTHON_BIN, [PDF_SCRIPT], {
    base64: file.base64
  });
  const text = normalize(result.text);
  const logs = [
    `PDF processed locally with ${result.pageCount || 0} page(s).`,
    text ? "Embedded PDF text extracted successfully." : "No embedded PDF text detected."
  ];
  return {
    extractedText: text,
    logs
  };
}

async function extractImageTextWithOpenAI(file, options) {
  if (!options.apiKey) {
    return {
      extractedText: "",
      logs: ["Image OCR skipped because no OpenAI API key is configured."]
    };
  }
  if (!file.dataUrl) {
    return {
      extractedText: "",
      logs: ["Image OCR skipped because no image data was provided."]
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`
    },
    body: JSON.stringify({
      model: options.visionModel || options.model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "Extract the visible document text as plain text. Do not summarize. Preserve line breaks where possible."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `OCR this applicant evidence file: ${file.name}`
            },
            {
              type: "input_image",
              image_url: file.dataUrl
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Image OCR failed: ${text}`);
  }

  const json = await response.json();
  const extractedText =
    normalize(json.output_text) ||
    normalize(
      json.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")
        ?.text
    );

  return {
    extractedText,
    logs: [
      `Image OCR completed with model ${options.model}.`,
      extractedText ? "Text was extracted from the image." : "No readable text detected in the image."
    ]
  };
}

async function processSingleFile(file, options) {
  const type = String(file.type || "");
  const processed = {
    ...file,
    extractedText: "",
    processingLogs: []
  };

  if (type.startsWith("text/") || file.name?.toLowerCase().endsWith(".txt")) {
    processed.extractedText = normalize(file.rawText || file.textPreview || "");
    processed.processingLogs.push(
      processed.extractedText
        ? "Plain text file loaded directly."
        : "Text file was uploaded but no readable text was found."
    );
    return processed;
  }

  if (type === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf")) {
    const result = await extractPdfText(file);
    processed.extractedText = result.extractedText;
    processed.processingLogs.push(...result.logs);
    if (!processed.extractedText) {
      processed.processingLogs.push(
        "Scanned PDF OCR is not available locally. Use an OpenAI-readable image export or provide transcript text."
      );
    }
    return processed;
  }

  if (type.startsWith("image/")) {
    const result = await extractImageTextWithOpenAI(file, options);
    processed.extractedText = result.extractedText;
    processed.processingLogs.push(...result.logs);
    return processed;
  }

  processed.processingLogs.push("Unsupported file type for automatic text extraction.");
  return processed;
}

async function processEvidenceFiles(files, options) {
  const processedFiles = [];
  for (const file of files || []) {
    try {
      processedFiles.push(await processSingleFile(file, options));
    } catch (error) {
      processedFiles.push({
        ...file,
        extractedText: "",
        processingLogs: [`Processing failed: ${error.message}`]
      });
    }
  }
  return processedFiles;
}

module.exports = {
  processEvidenceFiles
};
