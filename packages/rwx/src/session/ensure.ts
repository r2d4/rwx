import { randomUUID } from "node:crypto";
import type { Agent, SessionState } from "../model.ts";
import { err, ok, type Result } from "../shared/result.ts";
import type { SessionStore } from "./store.ts";

const newSessionId = (agent: Agent): string => {
  if (agent === "codex") {
    return "pending";
  }
  return randomUUID();
};

export const ensureSession = async (opts: {
  store: SessionStore;
  agent: Agent;
  cwd: string;
  overrideId: string | null;
}): Promise<Result<{ session: SessionState; created: boolean }>> => {
  const loaded = await opts.store.load();
  if (!loaded.ok) {
    return loaded;
  }
  if (loaded.value && loaded.value.agent === opts.agent) {
    if (opts.overrideId && loaded.value.sessionId !== opts.overrideId) {
      return err(
        new Error(
          `session id mismatch (${loaded.value.sessionId} vs ${opts.overrideId})`,
        ),
      );
    }
    if (loaded.value.cwd.length === 0) {
      const updated: SessionState = { ...loaded.value, cwd: opts.cwd };
      const saved = await opts.store.save(updated);
      if (!saved.ok) {
        return saved;
      }
      return ok({ session: updated, created: false });
    }
    return ok({ session: loaded.value, created: false });
  }
  const sessionId = opts.overrideId ?? newSessionId(opts.agent);
  const session: SessionState = {
    sessionId,
    agent: opts.agent,
    cwd: opts.cwd,
    createdAt: "",
    updatedAt: "",
    claude: opts.agent === "claude" ? {
      transcriptPath: "",
      verifySessionId: "",
      verifyTranscriptPath: "",
    } : null,
    codex: opts.agent === "codex" ? {
      sessionFile: "",
      verifySessionId: "",
      verifySessionFile: "",
    } : null,
  };
  const saved = await opts.store.save(session);
  if (!saved.ok) {
    return saved;
  }
  return ok({ session, created: true });
};
