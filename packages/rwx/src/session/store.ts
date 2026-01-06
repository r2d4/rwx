import type { SessionState } from "../model.ts";
import { ok, type Result } from "../shared/result.ts";

export type SessionStore = {
  load: () => Promise<Result<SessionState | null>>;
  save: (state: SessionState) => Promise<Result<void>>;
};

export const createSessionStore = (): SessionStore => {
  let current: SessionState | null = null;

  const load = async (): Promise<Result<SessionState | null>> => {
    return ok(current);
  };

  const save = async (state: SessionState): Promise<Result<void>> => {
    const now = new Date().toISOString();
    const createdAt = state.createdAt.length > 0 ? state.createdAt : now;
    current = {
      ...state,
      createdAt,
      updatedAt: now,
    };
    return ok(undefined);
  };

  return { load, save };
};
