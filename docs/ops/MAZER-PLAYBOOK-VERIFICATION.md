# Mazer Playbook Verification

This repo publishes repo-owned verification truth in `exports/mazer.playbook.verification.report.v1.json`.

ATLAS root consumes that artifact read-only. The repo remains `adopted` for adoption posture, and root promotes it to `verification_status=verified` only when this report and the repo-owned adoption evidence are both green.

## Verification Scope

- verification kind: `targeted`
- current result: `verified`
- last verified at: `2026-04-18T06:42:43Z`

Covered by this report:

- repo-owned adoption export validity and owner-contract id coverage
- repo-owned verification report validity, scope, and evidence references
- repo-local architecture check, automated test suite, and production build path for this convergence slice

Explicitly outside this report:

- Lifeline, `_stack`, or ATLAS-root operator boundaries
- manual blessing review, proposal execution, or broader product certification outside the convergence slice

## Reproducible Commands

Run the repo-owned validation path in this order:

```bash
npm run test:playbook-verification
npm run test:playbook-adoption
npm run verify
```

Interpretation:

- `npm run test:playbook-verification` proves the repo-owned verification report still matches the ATLAS root schema and declared command path.
- `npm run test:playbook-adoption` proves the repo-owned adoption export still aligns to the Playbook owner contract.
- `npm run verify` is the canonical repo-local verification bridge for the targeted Mazer convergence slice.

## Evidence

- `exports/mazer.playbook.adoption.evidence.v1.json`
- `exports/mazer.playbook.verification.report.v1.json`
- `tests/playbook-adoption-evidence.test.mjs`
- `tests/playbook-verification-report.test.mjs`
- `docs/COMMANDS.md`
- `package.json`
