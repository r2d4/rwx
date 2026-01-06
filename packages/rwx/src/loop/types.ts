import type { AgentResult, RunConfig, SessionState, VerifyResult } from "../model.ts";
import type { Result } from "../shared/result.ts";

export type Runner = {
  run: (cfg: RunConfig, session: SessionState) => Promise<Result<AgentResult>>;
};

export type Verifier = {
  run: (cfg: RunConfig, session: SessionState) => Promise<Result<VerifyResult>>;
};

export type Checkpointer = {
  write: (
    iteration: number,
    sessionId: string,
    verify: VerifyResult,
    verifyMode: string,
  ) => Promise<Result<{ ref: string }>>;
};

export type SessionStore = {
  load: () => Promise<Result<SessionState | null>>;
  save: (state: SessionState) => Promise<Result<void>>;
};

export type Logger = {
  info: (message: string, meta: Record<string, unknown>) => Promise<Result<void>>;
  warn: (message: string, meta: Record<string, unknown>) => Promise<Result<void>>;
  error: (message: string, meta: Record<string, unknown>) => Promise<Result<void>>;
  debug: (message: string, meta: Record<string, unknown>) => Promise<Result<void>>;
  setLevel?: (level: string) => void;
};

export type Clock = {
  nowMs: () => number;
};
