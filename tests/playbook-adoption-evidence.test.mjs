import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const exportsDir = path.join(repoRoot, "exports");
const evidencePath = path.join(exportsDir, "mazer.playbook.adoption.evidence.v1.json");
const schemaPath = path.join(exportsDir, "repo.playbook.adoption.evidence.schema.v1.json");
const playbookContractPath = path.resolve(
  repoRoot,
  "..",
  "fawxzzy-playbook",
  "exports",
  "playbook.contract.example.v1.json"
);

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveRef(schema, ref) {
  if (!ref.startsWith("#/")) {
    throw new Error(`Unsupported $ref: ${ref}`);
  }

  return ref
    .slice(2)
    .split("/")
    .reduce((value, segment) => value?.[segment], schema);
}

function validateNode(schemaRoot, schemaNode, value, valuePath = "$") {
  const errors = [];

  if (schemaNode?.$ref) {
    return validateNode(schemaRoot, resolveRef(schemaRoot, schemaNode.$ref), value, valuePath);
  }

  if (Array.isArray(schemaNode?.enum) && !schemaNode.enum.includes(value)) {
    errors.push(`${valuePath} must be one of: ${schemaNode.enum.join(", ")}`);
    return errors;
  }

  if (schemaNode?.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return [`${valuePath} must be an object`];
    }

    const required = Array.isArray(schemaNode.required) ? schemaNode.required : [];
    for (const key of required) {
      if (!(key in value)) {
        errors.push(`${valuePath}.${key} is required`);
      }
    }

    const properties = schemaNode.properties ?? {};
    if (schemaNode.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          errors.push(`${valuePath}.${key} is not allowed`);
        }
      }
    }

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value) {
        errors.push(...validateNode(schemaRoot, propertySchema, value[key], `${valuePath}.${key}`));
      }
    }

    return errors;
  }

  if (schemaNode?.type === "array") {
    if (!Array.isArray(value)) {
      return [`${valuePath} must be an array`];
    }

    if (typeof schemaNode.minItems === "number" && value.length < schemaNode.minItems) {
      errors.push(`${valuePath} must have at least ${schemaNode.minItems} items`);
    }

    if (schemaNode.items) {
      value.forEach((item, index) => {
        errors.push(...validateNode(schemaRoot, schemaNode.items, item, `${valuePath}[${index}]`));
      });
    }

    return errors;
  }

  if (schemaNode?.type === "string") {
    if (typeof value !== "string") {
      return [`${valuePath} must be a string`];
    }

    if (typeof schemaNode.minLength === "number" && value.length < schemaNode.minLength) {
      errors.push(`${valuePath} must be at least ${schemaNode.minLength} characters`);
    }

    return errors;
  }

  if (schemaNode?.type === "boolean" && typeof value !== "boolean") {
    return [`${valuePath} must be a boolean`];
  }

  return errors;
}

function mapById(items, fieldName) {
  const map = new Map();
  for (const item of items) {
    assert.equal(typeof item.id, "string", `${fieldName} item must have an id`);
    assert.equal(map.has(item.id), false, `${fieldName} id ${item.id} must be unique`);
    map.set(item.id, item);
  }
  return map;
}

function collectForbiddenKeys(value, forbiddenKeys, seen = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectForbiddenKeys(item, forbiddenKeys, seen));
    return seen;
  }

  if (!value || typeof value !== "object") {
    return seen;
  }

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) {
      seen.push(key);
    }
    collectForbiddenKeys(child, forbiddenKeys, seen);
  }

  return seen;
}

test("mazer adoption export validates against the repo-local schema", () => {
  const schema = loadJson(schemaPath);
  const evidence = loadJson(evidencePath);
  const errors = validateNode(schema, schema, evidence);

  assert.deepEqual(errors, []);
});

test("mazer adoption export covers the live Playbook contract ids explicitly", () => {
  const evidence = loadJson(evidencePath);
  const contract = loadJson(playbookContractPath);
  const repoRole = evidence.repo.role;

  assert.equal(evidence.contract_claim.contract_id, contract.contract_id);
  assert.equal(evidence.contract_claim.contract_version, contract.contract_version);

  const evidencePatterns = mapById(evidence.implemented_patterns, "implemented_patterns");
  const evidenceChecks = mapById(evidence.adoption_checks, "adoption_checks");
  const contractPatterns = mapById(contract.patterns, "contract.patterns");
  const contractChecks = mapById(contract.adoption_checks, "contract.adoption_checks");

  assert.deepEqual(
    [...evidencePatterns.keys()].sort(),
    [...contractPatterns.keys()].sort(),
    "Every Playbook contract pattern must be represented explicitly in the repo-local export"
  );
  assert.deepEqual(
    [...evidenceChecks.keys()].sort(),
    [...contractChecks.keys()].sort(),
    "Every Playbook adoption check must be represented explicitly in the repo-local export"
  );

  for (const pattern of evidence.implemented_patterns) {
    const contractPattern = contractPatterns.get(pattern.id);
    assert.ok(contractPattern, `Pattern ${pattern.id} must exist in the Playbook contract`);

    const applicableRoles = contractPattern.applicable_roles ?? [];
    const isRoleRequired =
      contractPattern.class === "core_required" ||
      (contractPattern.class === "role_required" && applicableRoles.includes(repoRole));

    if (pattern.status === "not_applicable") {
      assert.equal(
        isRoleRequired,
        false,
        `Pattern ${pattern.id} cannot be marked not_applicable for repo role ${repoRole}`
      );
      assert.ok(pattern.notes?.length, `Pattern ${pattern.id} must explain why it is not applicable`);
    } else if (isRoleRequired) {
      assert.notEqual(
        pattern.status,
        "missing",
        `Required pattern ${pattern.id} must not be missing for repo role ${repoRole}`
      );
    }
  }

  for (const adoptionCheck of evidence.adoption_checks) {
    const contractCheck = contractChecks.get(adoptionCheck.id);
    assert.ok(adoptionCheck, `Adoption check ${adoptionCheck.id} must exist in the repo-local export`);
    assert.ok(contractCheck, `Adoption check ${adoptionCheck.id} must exist in the Playbook contract`);

    const requiredForRole = Array.isArray(contractCheck.required_for) && contractCheck.required_for.includes(repoRole);
    if (adoptionCheck.status === "not_applicable") {
      assert.equal(
        requiredForRole,
        false,
        `Adoption check ${adoptionCheck.id} cannot be marked not_applicable for repo role ${repoRole}`
      );
      assert.ok(adoptionCheck.notes?.length, `Adoption check ${adoptionCheck.id} must explain why it is not applicable`);
    } else if (requiredForRole) {
      assert.notEqual(
        adoptionCheck.status,
        "missing",
        `Required adoption check ${adoptionCheck.id} must not be missing for repo role ${repoRole}`
      );
    }
  }
});

test("mazer continuity posture keeps transcripts trace-only and links root operator state by reference", () => {
  const evidence = loadJson(evidencePath);
  const contract = loadJson(playbookContractPath);
  const serialized = JSON.stringify(evidence);
  const forbiddenKeys = new Set([
    "blessing_state",
    "session_state",
    "waiting_on",
    "approval_receipt_ref",
    "execution_receipt_ref"
  ]);

  assert.equal(evidence.summary.adoption_status, "adopted");
  assert.equal(evidence.summary.verification_state, "targeted");
  assert.equal(evidence.summary.continuity_status, "structured");
  assert.equal(evidence.continuity.structured_handoff_required, true);
  assert.equal(evidence.continuity.transcript_role, "trace_only");
  assert.equal(evidence.contract_claim.source_repo_id, "playbook");
  assert.equal(evidence.verification_commands.includes("npm run test:playbook-adoption"), true);
  assert.equal(
    evidence.summary.initiative_refs.includes("initiative-mazer-d2-learning-scorer"),
    true,
    "The live Mazer initiative must be referenced explicitly"
  );
  assert.equal(
    evidence.evidence_refs.includes("docs/memory/initiatives/initiative-mazer-d2-learning-scorer.json"),
    true,
    "The root-owned initiative surface must be referenced directly"
  );
  assert.equal(
    evidence.evidence_refs.includes(
      "runtime/atlas/proposed-sessions/session-proposed-mazer-d2-fixed-blessed-id-soak/session.manifest.json"
    ),
    true,
    "The root-owned proposal surface must be referenced directly"
  );
  assert.equal(
    serialized.includes("root-owned") && serialized.includes("session-proposed-mazer-d2-fixed-blessed-id-soak"),
    true,
    "The export must explain the root-owned proposal linkage explicitly"
  );
  assert.deepEqual(
    collectForbiddenKeys(evidence, forbiddenKeys, []),
    [],
    "Repo-local evidence must not duplicate canonical proposal or blessing state fields"
  );
  assert.equal(contract.continuity_requirements.raw_transcript_role, "trace_only");
  assert.equal(contract.continuity_requirements.raw_transcript_is_primary_memory, false);
});
