const fs = require("fs");
const path = require("path");

const RULES_PATH = path.join(__dirname, "..", "data", "mer-rules.json");
let rules = readRulesFile();

function readRulesFile() {
  return JSON.parse(fs.readFileSync(RULES_PATH, "utf8"));
}

function getRules() {
  return rules;
}

function saveRules(nextRules) {
  rules = nextRules;
  fs.writeFileSync(RULES_PATH, `${JSON.stringify(nextRules, null, 2)}\n`, "utf8");
  return rules;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function findEducationEquivalency(qualification) {
  const text = normalize(qualification);
  if (!text) return null;
  return getRules().educationEquivalencies.find((entry) =>
    entry.match.some((term) => text.includes(term))
  ) || null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isAcceptedGrade(grade, acceptedGrades) {
  return acceptedGrades.includes(String(grade || "").trim().toUpperCase());
}

function evaluateAcademic(extracted) {
  const reasons = [];
  const flags = [];

  const subjectsPassed = toNumber(extracted.subjectsPassedCount);
  if (
    subjectsPassed !== null &&
    subjectsPassed >= 3 &&
    normalize(extracted.highestQualification).includes("o-level")
  ) {
    reasons.push("Evidence indicates at least 3 GCE O-Level subject passes.");
    return { status: "pass", basis: "gce_o_level_3_passes", reasons, flags };
  }

  const yearsFormalEducation = toNumber(extracted.yearsFormalEducation);
  if (yearsFormalEducation !== null && yearsFormalEducation >= 12) {
    reasons.push(`Evidence indicates ${yearsFormalEducation} years of formal education.`);
    return { status: "pass", basis: "twelve_years_formal_education", reasons, flags };
  }

  const equivalency = findEducationEquivalency(extracted.highestQualification);
  if (equivalency?.countsAsUccManagementCertificate) {
    reasons.push("Qualification matches UCC Certificate in Management pathway.");
    return { status: "pass", basis: "ucc_management_certificate", reasons, flags };
  }

  if (equivalency?.countsAsPreUniversity || equivalency?.countsAsSecondaryLeaving) {
    reasons.push(`Qualification matched equivalency benchmark: ${extracted.highestQualification}.`);
    return { status: "pass", basis: "equivalent_qualification", reasons, flags };
  }

  const workExperienceYears = toNumber(extracted.workExperienceYears);
  const hasFormalQualification =
    normalize(extracted.highestQualification) !== "" || yearsFormalEducation !== null;
  if (!hasFormalQualification && workExperienceYears !== null && workExperienceYears >= 5) {
    reasons.push(
      `Applicant reports ${workExperienceYears} years of work experience without formal qualification evidence.`
    );
    flags.push("Interview review required under experiential entry pathway.");
    return { status: "interview", basis: "no_formal_with_five_years_experience", reasons, flags };
  }

  if (!hasFormalQualification) {
    flags.push("Formal academic qualification evidence is missing or unclear.");
    return { status: "missing", basis: null, reasons, flags };
  }

  reasons.push("Academic evidence does not meet any current entry pathway.");
  return { status: "fail", basis: null, reasons, flags };
}

function evaluateEnglish(extracted) {
  const reasons = [];
  const flags = [];
  const source = normalize(extracted.englishQualification);
  const score = extracted.englishScore;
  const parsedScore = typeof score === "number" ? score : toNumber(score);
  const grade = String(extracted.englishGrade || "").trim().toUpperCase();
  const benchmarks = getRules().englishBenchmarks;

  if (source.includes("ielts") && parsedScore !== null) {
    if (parsedScore >= benchmarks.ielts.minimum) {
      reasons.push(`IELTS score ${parsedScore} meets the minimum of ${benchmarks.ielts.minimum}.`);
      return { status: "pass", basis: "ielts_5_5", reasons, flags };
    }
    flags.push(
      "English requirement not met, recommend UCC English Placement Test or English Course pathway."
    );
    return { status: "test_required", basis: null, reasons, flags };
  }

  if ((source.includes("ucc placement") || source.includes("placement test")) && parsedScore !== null) {
    if (parsedScore >= benchmarks.ucc_placement_test.minimum) {
      reasons.push(
        `UCC Placement Test score ${parsedScore} meets the minimum of ${benchmarks.ucc_placement_test.minimum}.`
      );
      return { status: "pass", basis: "ucc_placement_70", reasons, flags };
    }
    flags.push(
      "English requirement not met, recommend UCC English Placement Test or English Course pathway."
    );
    return { status: "test_required", basis: null, reasons, flags };
  }

  if (source.includes("pte") && parsedScore !== null) {
    if (parsedScore >= benchmarks.pte_academic.minimum) {
      reasons.push(`PTE Academic score ${parsedScore} meets the benchmark.`);
      return { status: "pass", basis: "equivalent_english", reasons, flags };
    }
    flags.push(
      "English requirement not met, recommend UCC English Placement Test or English Course pathway."
    );
    return { status: "test_required", basis: null, reasons, flags };
  }

  if (source.includes("toefl") && parsedScore !== null) {
    if (parsedScore >= benchmarks.toefl_ibt.minimum) {
      reasons.push(`TOEFL iBT score ${parsedScore} meets the benchmark.`);
      return { status: "pass", basis: "equivalent_english", reasons, flags };
    }
    flags.push(
      "English requirement not met, recommend UCC English Placement Test or English Course pathway."
    );
    return { status: "test_required", basis: null, reasons, flags };
  }

  if (source.includes("duolingo") && parsedScore !== null) {
    if (parsedScore >= benchmarks.duolingo.minimum) {
      reasons.push(`Duolingo score ${parsedScore} meets the benchmark.`);
      return { status: "pass", basis: "equivalent_english", reasons, flags };
    }
    flags.push(
      "English requirement not met, recommend UCC English Placement Test or English Course pathway."
    );
    return { status: "test_required", basis: null, reasons, flags };
  }

  if (source.includes("igcse english first")) {
    if (isAcceptedGrade(grade, benchmarks.igcse_english_first_language.acceptedGrades)) {
      reasons.push(`IGCSE English First Language grade ${grade} meets the benchmark.`);
      return { status: "pass", basis: "equivalent_english", reasons, flags };
    }
    flags.push(
      "English requirement not met, recommend UCC English Placement Test or English Course pathway."
    );
    return { status: "test_required", basis: null, reasons, flags };
  }

  if (source.includes("igcse english second")) {
    if (isAcceptedGrade(grade, benchmarks.igcse_english_second_language.acceptedGrades)) {
      reasons.push(`IGCSE English Second Language grade ${grade} meets the benchmark.`);
      return { status: "pass", basis: "equivalent_english", reasons, flags };
    }
    flags.push(
      "English requirement not met, recommend UCC English Placement Test or English Course pathway."
    );
    return { status: "test_required", basis: null, reasons, flags };
  }

  if (source.includes("o-level english") || source.includes("gce o-level english")) {
    if (isAcceptedGrade(grade, benchmarks.gce_o_level_english.acceptedGrades)) {
      reasons.push(`GCE O-Level English grade ${grade} meets the benchmark.`);
      return { status: "pass", basis: "equivalent_english", reasons, flags };
    }
    flags.push(
      "English requirement not met, recommend UCC English Placement Test or English Course pathway."
    );
    return { status: "test_required", basis: null, reasons, flags };
  }

  if (source.includes("ucc english course level 3")) {
    reasons.push("Applicant completed UCC English Course Level 3.");
    return { status: "pass", basis: "ucc_english_level_3", reasons, flags };
  }

  if (!source && parsedScore === null && !grade) {
    flags.push("English evidence is missing or unclear.");
    return { status: "missing", basis: null, reasons, flags };
  }

  reasons.push("English evidence was found but could not be matched confidently to an accepted benchmark.");
  flags.push("Equivalent English qualification requires manual review.");
  return { status: "manual_review", basis: null, reasons, flags };
}

function evaluateAge(extracted, course) {
  const age = toNumber(extracted.age);
  if (age === null) {
    return {
      status: "missing",
      reasons: [],
      flags: ["Age or date of birth evidence is missing or unclear."]
    };
  }
  if (age >= course.minimumAge) {
    return {
      status: "pass",
      reasons: [`Applicant age ${age} meets the minimum age of ${course.minimumAge}.`],
      flags: []
    };
  }
  return {
    status: "fail",
    reasons: [`Applicant age ${age} is below the minimum age of ${course.minimumAge}.`],
    flags: []
  };
}

function finalRecommendation(academic, english, age, missingEvidence) {
  const statuses = [academic.status, english.status, age.status];
  if (statuses.includes("fail")) return "Not Eligible";
  if (statuses.includes("interview")) return "Requires Interview";
  if (statuses.includes("test_required")) return "Requires English Placement Test";
  if (missingEvidence.length > 0 || statuses.includes("missing")) return "Requires Additional Documents";
  if (statuses.includes("manual_review")) return "Requires Manual Review";
  return "Eligible";
}

function listMissingEvidence(extracted, files) {
  const missing = [];
  if (!files.length) missing.push("No supporting files uploaded.");
  if (!normalize(extracted.highestQualification)) missing.push("Highest qualification evidence.");
  if (
    !normalize(extracted.englishQualification) &&
    extracted.englishScore == null &&
    !normalize(extracted.englishGrade)
  ) {
    missing.push("English evidence or test result.");
  }
  if (extracted.age == null) missing.push("Age or date of birth evidence.");
  return unique(missing);
}

function deriveFileWarnings(files) {
  const warnings = [];
  for (const file of files) {
    if (file.type === "application/pdf" && !normalize(file.textPreview)) {
      warnings.push(
        `PDF file "${file.name}" may require OCR or manual review because no text preview was available.`
      );
    }
    if (!normalize(file.type)) {
      warnings.push(`File "${file.name}" has an unknown file type.`);
    }
  }
  return unique(warnings);
}

function assessApplicant(payload) {
  const activeRules = getRules();
  const course = activeRules.courses[payload.applicant.courseId] || activeRules.courses["dbm-elearning"];
  const extracted = payload.extracted;
  const files = payload.files || [];

  const academic = evaluateAcademic(extracted);
  const english = evaluateEnglish(extracted);
  const age = evaluateAge(extracted, course);
  const missingEvidence = listMissingEvidence(extracted, files);
  const riskFlags = unique([
    ...academic.flags,
    ...english.flags,
    ...age.flags,
    ...deriveFileWarnings(files),
    ...(Array.isArray(extracted.missingEvidence) ? extracted.missingEvidence : [])
  ]);
  const recommendation = finalRecommendation(academic, english, age, missingEvidence);

  return {
    course,
    applicantSummary: {
      name: payload.applicant.name || extracted.applicantName || "Unknown Applicant",
      age: extracted.age,
      country: extracted.country || payload.applicant.country || "Unknown",
      course: course.name,
      notes: payload.applicant.notes || ""
    },
    evidenceSummary: files.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      preview: file.textPreview || ""
    })),
    extracted,
    checks: {
      academic,
      english,
      age
    },
    missingEvidence,
    riskFlags,
    recommendation,
    aiExplanation: extracted.explanation || "No AI explanation available.",
    structuredRules: activeRules
  };
}

module.exports = {
  getRules,
  saveRules,
  assessApplicant
};
