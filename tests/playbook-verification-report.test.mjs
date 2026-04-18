import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const atlasRoot = path.resolve(repoRoot, "..", "..");
const reportPath = path.join(repoRoot, "exports", "mazer.playbook.verification.report.v1.json");
const schemaPath = path.join(atlasRoot, "schemas", "atlas.playbook.verification.report.v1.json");
const adoptionEvidencePath = path.join(repoRoot, "exports", "mazer.playbook.adoption.evidence.v1.json");
const commandsDocPath = path.join(repoRoot, "docs", "COMMANDS.md");
const verificationDocPath = path.join(repoRoot, "docs", "ops", "MAZER-PLAYBOOK-VERIFICATION.md");
const packageJsonPath = path.join(repoRoot, "package.json");

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

function matchesType(expectedType, value) {
  if (expectedType === "array") {
    return Array.isArray(value);
  }
  if (expectedType === "object") {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  if (expectedType === "null") {
    return value === null;
  }
  return typeof value === expectedType;
}

function validateNode(schemaRoot, schemaNode, value, valuePath = "$") {
  const errors = [];

  if (!schemaNode) {
    return errors;
  }

  if (schemaNode.$ref) {
    return validateNode(schemaRoot, resolveRef(schemaRoot, schemaNode.$ref), value, valuePath);
  }

  if (Array.isArray(schemaNode.allOf)) {
    for (const branch of schemaNode.allOf) {
      errors.push(...validateNode(schemaRoot, branch, value, valuePath));
    }
  }

  if (Array.isArray(schemaNode.enum) && !schemaNode.enum.includes(value)) {
    errors.push(`${valuePath} must be one of: ${schemaNode.enum.join(", ")}`);
    return errors;
  }

  if (Array.isArray(schemaNode.type)) {
    if (!schemaNode.type.some((expectedType) => matchesType(expectedType, value))) {
      errors.push(`${valuePath} must be one of the allowed types: ${schemaNode.type.join(", ")}`);
      return errors;
    }
  } else if (typeof schemaNode.type === "string" && !matchesType(schemaNode.type, value)) {
    errors.push(`${valuePath} must be a ${schemaNode.type}`);
    return errors;
  }

  if (schemaNode.type === "object" || (Array.isArray(schemaNode.type) && matchesType("object", value))) {
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
  }

  if (schemaNode.type === "array" || (Array.isArray(schemaNode.type) && matchesType("array", value))) {
    if (typeof schemaNode.minItems === "number" && value.length < schemaNode.minItems) {
      errors.push(`${valuePath} must have at least ${schemaNode.minItems} items`);
    }

    if (schemaNode.items) {
      value.forEach((item, index) => {
        errors.push(...validateNode(schemaRoot, schemaNode.items, item, `${valuePath}[${index}]`));
      });
    }
  }

  if (
    (schemaNode.type === "string" || (Array.isArray(schemaNode.type) && matchesType("string", value))) &&
    typeof schemaNode.minLength === "number" &&
    value.length < schemaNode.minLength
  ) {
    errors.push(`${valuePath} must be at least ${schemaNode.minLength} characters`);
  }

  return errors;
}

test("mazer verification report validates against the ATLAS root schema", () => {
  const schema = loadJson(schemaPath);
  const report = loadJson(reportPath);
  const errors = validateNode(schema, schema, report);

  assert.deepEqual(errors, []);
});

test("mazer verification report keeps the targeted verified claim explicit", () => {
  const report = loadJson(reportPath);
  const adoptionEvidence = loadJson(adoptionEvidencePath);

  assert.equal(report.repo.repo_id, "mazer");
  assert.equal(report.summary.adoption_status, "adopted");
  assert.equal(report.summary.verification_status, "verified");
  assert.equal(report.scope.verification_kind, adoptionEvidence.summary.verification_state);
  assert.deepEqual(report.summary.blocking_gaps, []);
  assert.ok(report.summary.last_verified_at);
  assert.ok(report.scope.covered_surfaces.length > 0);
});

test("mazer verification report references the live repo command surface", () => {
  const report = loadJson(reportPath);
  const packageJson = loadJson(packageJsonPath);
  const commandsDoc = fs.readFileSync(commandsDocPath, "utf8");
  const verificationDoc = fs.readFileSync(verificationDocPath, "utf8");
  const commands = report.criteria.verification_path.commands;

  assert.deepEqual(commands, [
    "npm run test:playbook-verification",
    "npm run test:playbook-adoption",
    "npm run verify"
  ]);

  for (const command of commands) {
    const scriptName = command.replace("npm run ", "");
    assert.ok(packageJson.scripts[scriptName], `${scriptName} must exist in package.json`);
    assert.ok(commandsDoc.includes(command), `${command} must be documented in docs/COMMANDS.md`);
    assert.ok(verificationDoc.includes(command), `${command} must be documented in the verification doc`);
  }
});
