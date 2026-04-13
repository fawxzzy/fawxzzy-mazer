declare module '../../scripts/check-architecture.mjs' {
  export interface ArchitectureViolation {
    rule: string;
    file: string;
    message: string;
  }

  export function collectArchitectureViolations(
    sourceFiles: Map<string, string> | Record<string, string>
  ): ArchitectureViolation[];

  export function formatArchitectureViolations(
    violations: readonly ArchitectureViolation[]
  ): string;

  export function checkArchitecture(
    sourceFiles?: Map<string, string> | Record<string, string>
  ): true;
}
