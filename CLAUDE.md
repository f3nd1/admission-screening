# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

```bash
node server.js
```

Runs on `http://localhost:3000`. No build step required.

**Environment variables:**
- `OPENAI_API_KEY` — required for AI extraction; omit to run in mock/manual mode
- `OPENAI_MODEL` — defaults to `gpt-4.1-mini`
- `PORT` — defaults to `3000`

## Architecture

This is a dependency-free Node.js app (no npm packages). The flow for each assessment:

1. **Browser** (`public/`) collects applicant form data and file uploads, sends a JSON payload to `POST /api/assess`
2. **`server.js`** routes requests; for `/api/assess` it calls the extractor then the MER checker
3. **`lib/extractor.js`** — sends applicant data + file contents to the OpenAI Responses API (`/v1/responses`) and returns a structured `extracted` object. Falls back to a manual stub if no API key or on error.
4. **`lib/mer.js`** — deterministic rules engine that takes the `extracted` object and evaluates three criteria: academic qualification, English proficiency, and age. Returns per-criterion `{ status, basis, reasons, flags }` and a final `recommendation` string.
5. **`data/mer-rules.json`** — all thresholds, equivalency tables, and benchmark scores live here. The MER engine reads this at startup and the `/api/rules` endpoint exposes it for live editing via the UI.

### MER recommendation outcomes

`"Eligible"` | `"Not Eligible"` | `"Requires Interview"` | `"Requires English Placement Test"` | `"Requires Additional Documents"` | `"Requires Manual Review"`

### Academic entry pathways (evaluated in order)

1. GCE O-Level with ≥3 subject passes
2. ≥12 years formal education
3. Equivalency match → UCC Certificate in Management
4. Equivalency match → Pre-university or secondary leaving certificate
5. No formal qualification + ≥5 years work experience → interview pathway
6. Fallback: missing or fail

### Adding a new course

Add an entry under `courses` in `data/mer-rules.json` with at least `name` and `minimumAge`. The `assessApplicant` function in `lib/mer.js` falls back to `"dbm-elearning"` if the `courseId` is not found.

### Adding a new English benchmark

Add an entry under `englishBenchmarks` in `data/mer-rules.json`, then add a matching `source.includes(...)` branch in `evaluateEnglish` in `lib/mer.js`.

## Key data files

- `data/mer-rules.json` — live-editable via `/api/rules` PUT; governs all scoring thresholds and equivalency mappings
- `data/mock-applicant.json` — sample payload for manual testing
- `data/reference-guides/` — human-readable authoring notes explaining the equivalency tables
