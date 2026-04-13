import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const readVisualProofConfig = async (repoRoot, configPath = 'playwright.visual.config.json') => {
  const resolvedPath = resolve(repoRoot, configPath);
  const content = await readFile(resolvedPath, 'utf8');
  return JSON.parse(content);
};
