import { webDb } from "../web-db";

export class WebNotSupportedError extends Error {
  constructor(feature: string) {
    super(`"${feature}" is not available in web mode`);
    this.name = "WebNotSupportedError";
  }
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export function boolToInt(v: boolean | undefined): number {
  return v ? 1 : 0;
}

export function intToBool(v: unknown): boolean {
  return v === 1 || v === true;
}

export function nullIfUndefined(v: unknown): unknown {
  return v === undefined ? null : v;
}

export function requireProjectId(): string {
  const id = webDb.getProjectId();
  if (!id) throw new Error("No project is open");
  return id;
}

export { projectApi } from "./project";
export { bookshelfApi } from "./bookshelf";
export { canonApi } from "./canon";
export { outlineApi } from "./outline";
export { chapterApi } from "./chapter";
export { compilerApi } from "./compiler";
export { ledgerApi } from "./ledger";
export { backupApi } from "./backup";
export { retconApi } from "./retcon";
export { snapshotApi } from "./snapshot";
export { deAiRulesApi } from "./deai-rules";
export { templateApi } from "./template";
export { llmApi } from "./llm";
export { agentApi } from "./agent";
export { orchestratorApi } from "./orchestrator";
export { taskApi } from "./task";
export { sharedResourcesApi } from "./shared-resources";
export { worldApi } from "./world";
export { writingSessionApi } from "./writing-session";
export { crashRecoveryApi } from "./crash-recovery";
export { complianceApi } from "./compliance";
export { ragApi } from "./rag";
