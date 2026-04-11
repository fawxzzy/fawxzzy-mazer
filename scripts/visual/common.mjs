import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);

export const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
export const STACK_ROOT = resolve(REPO_ROOT, '..', '..');
export const CAPTURE_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-visual');
export const DEFAULT_BASE_URL = 'http://127.0.0.1:4173';
export const DEFAULT_CAPTURE_TIMEOUT_MS = 20_000;
export const DEFAULT_PREVIEW_TIMEOUT_MS = 30_000;
export const SESSION_POINTER_PATH = resolve(CAPTURE_ROOT, 'latest-session.txt');
export const VISUAL_CAPTURE_CONFIG = Object.freeze({
  enabled: true,
  forceInstallMode: 'available'
});

export const TARGETS = Object.freeze([
  {
    id: 'root',
    path: '/',
    viewport: { width: 1280, height: 720 }
  },
  {
    id: 'theme-noir',
    path: '/?theme=noir',
    viewport: { width: 1280, height: 720 }
  },
  {
    id: 'theme-vellum',
    path: '/?theme=vellum',
    viewport: { width: 1280, height: 720 }
  },
  {
    id: 'theme-aurora',
    path: '/?theme=aurora',
    viewport: { width: 1280, height: 720 }
  },
  {
    id: 'obs-monolith',
    path: '/?profile=obs&chrome=none&theme=monolith',
    viewport: { width: 1920, height: 1080 }
  },
  {
    id: 'tv-noir',
    path: '/?profile=tv&theme=noir',
    viewport: { width: 1920, height: 1080 }
  },
  {
    id: 'mobile-aurora',
    path: '/?profile=mobile&theme=aurora',
    viewport: { width: 390, height: 844 }
  }
]);

const SESSION_ID_SAFE = /[^a-z0-9-]/gi;

export const parseCliArgs = (argv = process.argv.slice(2)) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith('--')) {
      continue;
    }

    const body = entry.slice(2);
    const equalsIndex = body.indexOf('=');
    if (equalsIndex >= 0) {
      const key = body.slice(0, equalsIndex);
      const value = body.slice(equalsIndex + 1);
      args[key] = value;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[body] = next;
      index += 1;
      continue;
    }

    args[body] = true;
  }

  return args;
};

export const resolveSessionId = (providedValue) => {
  if (typeof providedValue === 'string' && providedValue.trim().length > 0) {
    return providedValue.trim().replace(SESSION_ID_SAFE, '-').replace(/-+/g, '-');
  }

  return new Date().toISOString().replace(/[:.]/g, '-');
};

export const normalizeBaseUrl = (value) => {
  const raw = typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : DEFAULT_BASE_URL;
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};

export const parseIntegerArg = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const ensureDir = async (directoryPath) => {
  await mkdir(directoryPath, { recursive: true });
  return directoryPath;
};

export const writeJson = async (filePath, value) => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

export const writeSessionPointer = async (sessionId) => {
  await ensureDir(CAPTURE_ROOT);
  await writeFile(SESSION_POINTER_PATH, `${sessionId}\n`, 'utf8');
};

export const resolveSessionPaths = (sessionId, label) => {
  const sessionDir = resolve(CAPTURE_ROOT, sessionId);
  const captureDir = resolve(sessionDir, label);
  const metricsDir = resolve(sessionDir, 'metrics');
  return {
    sessionDir,
    captureDir,
    metricsDir,
    previewLogPath: resolve(sessionDir, 'preview.log'),
    summaryPath: resolve(metricsDir, `${label}-summary.json`)
  };
};

export const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

