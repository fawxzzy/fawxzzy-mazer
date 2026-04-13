import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const readVisualProofConfig = async (repoRoot) => {
  const configPath = resolve(repoRoot, 'playwright.visual.config.json');
  const content = await readFile(configPath, 'utf8');
  return JSON.parse(content);
};
