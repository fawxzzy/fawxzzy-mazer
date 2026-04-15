export const REPO_ROOT: string;
export function hashStableValue(value: unknown): string;
export function parseCliArgs(argv?: string[]): Record<string, string | boolean>;
export function pathExists(path: string): Promise<boolean>;
export function readJson<T = unknown>(filePath: string): Promise<T>;
export function relativeFromRepo(absolutePath: string): string;
export function stableSerialize(value: unknown): string;
export function writeJson(filePath: string, value: unknown): Promise<void>;
