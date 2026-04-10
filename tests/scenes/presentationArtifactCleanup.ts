import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VISUAL_ARTIFACT_FILE_PATTERNS = [
  /^artifacts-.*\.png$/i,
  /^review-.*\.png$/i,
  /^Screenshot.*\.png$/i,
  /^desktopcheck\.png$/i,
  /^mobilecheck.*\.png$/i,
  /^visual-.*\.(png|log)$/i,
  /^soak-.*\.(png|log)$/i,
  /^devserver.*\.log$/i,
  /^\.tmp-.*\.log$/i
] as const;

const VISUAL_ARTIFACT_DIRECTORY_PATTERNS = [
  /^\.tmp-.+/i
] as const;

const matchesAnyPattern = (value: string, patterns: readonly RegExp[]): boolean => (
  patterns.some((pattern) => pattern.test(value))
);

export const listPresentationArtifacts = (rootDir = process.cwd()): string[] => {
  const matches: string[] = [];

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isDirectory() && matchesAnyPattern(entry.name, VISUAL_ARTIFACT_DIRECTORY_PATTERNS)) {
      matches.push(entry.name);
      continue;
    }

    if (entry.isFile() && matchesAnyPattern(entry.name, VISUAL_ARTIFACT_FILE_PATTERNS)) {
      matches.push(entry.name);
    }
  }

  return matches.sort();
};

export const cleanupPresentationArtifacts = (rootDir = process.cwd()): string[] => {
  const removed = listPresentationArtifacts(rootDir);

  for (const entry of removed) {
    rmSync(join(rootDir, entry), { recursive: true, force: true });
  }

  return removed;
};

export const createPresentationArtifactFixtures = (rootDir = process.cwd()): string[] => {
  const created = [
    '.tmp-chrome-smoke',
    'artifacts-drift.png',
    'review-ambient.png',
    'mobilecheck-long-run.png',
    'visual-theme-pass.png'
  ];

  const staleCaptureDir = join(rootDir, '.tmp-chrome-smoke');
  mkdirSync(staleCaptureDir, { recursive: true });
  writeFileSync(join(staleCaptureDir, 'capture.png'), 'stale capture');
  writeFileSync(join(rootDir, 'artifacts-drift.png'), 'drift');
  writeFileSync(join(rootDir, 'review-ambient.png'), 'review');
  writeFileSync(join(rootDir, 'mobilecheck-long-run.png'), 'mobile');
  writeFileSync(join(rootDir, 'visual-theme-pass.png'), 'visual');

  return created;
};
