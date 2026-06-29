# Admission Eligibility Checker

Admission screening web app for United Ceres College. It combines AI-assisted evidence extraction with a deterministic MER checker for the `Diploma in Business Management (E-Learning)` course.

## Features

- Upload multiple applicant files, including PDFs and images
- Manual applicant entry for name, age, country, course, notes, and written statement
- OpenAI-assisted fact extraction with a mock fallback mode
- Transparent rule-based MER evaluation
- Academic equivalency and English benchmark mapping stored in structured JSON
- Result dashboard with missing evidence, risk flags, final recommendation, and staff override
- Exportable plain-text assessment report

## Stack

- Backend: dependency-free Node.js HTTP server
- Frontend: vanilla HTML, CSS, and JavaScript
- AI: OpenAI Responses API via `OPENAI_API_KEY`

## Run

Use the bundled Node runtime if `node` is not on your shell path:

```bash
/Users/felixoking/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.js
```

Or if `node` is available:

```bash
node server.js
```

The app runs on `http://localhost:3000`.

## Environment variables

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
PORT=3000
```

If `OPENAI_API_KEY` is missing, the app still works in mock/manual mode and flags that AI extraction was skipped.

## Notes on file handling

- Images are sent to OpenAI for visual inspection when the API key is present.
- Text entered manually is always included in the extraction prompt.
- PDFs are accepted and listed in evidence, but this version does not do native PDF text extraction without an OCR or PDF parser. Those files are flagged for manual review unless the applicant or staff also provide supporting text.

## Project structure

- `server.js`: HTTP server and API routes
- `lib/extractor.js`: OpenAI extraction logic
- `lib/mer.js`: deterministic MER rules engine
- `data/mer-rules.json`: course rules, equivalencies, and benchmark tables
- `data/mock-applicant.json`: sample applicant payload
- `public/`: browser UI

## Future extension points

The codebase is organized so additional UCC programmes and later skills can be added without rewriting the current flow:

- Document Extractor
- MER Checker
- Qualification Equivalency
- English Proficiency Mapping
- Missing Evidence Detection
- Interview Review
- Admission Report Writer
- Staff Override and Decision Log
