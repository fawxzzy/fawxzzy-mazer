import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');

const clampMetric = (value) => Number(Math.min(1, Math.max(0, Number(value) || 0)).toFixed(4));

const stableSerialize = (value) => {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(String(value));
};

const hashStableValue = (value) => {
  const serialized = stableSerialize(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const parseCliArgs = (argv = process.argv.slice(2)) => {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
};

const relativeFromRepo = (absolutePath) => absolutePath.startsWith(REPO_ROOT)
  ? absolutePath.slice(REPO_ROOT.length + 1).replace(/\\/g, '/')
  : absolutePath.replace(/\\/g, '/');

const pathExists = async (filePath) => {
  try {
    await readFile(filePath, 'utf8');
    return true;
  } catch {
    return false;
  }
};

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

const writeJson = async (filePath, value) => {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

export {
  REPO_ROOT,
  clampMetric,
  hashStableValue,
  pathExists,
  parseCliArgs,
  readJson,
  relativeFromRepo,
  stableSerialize,
  writeJson
};
