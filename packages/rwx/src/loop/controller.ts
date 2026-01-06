import type { RunConfig, RunResult, SessionState, VerifyResult } from "../model.ts";
import type { ConsoleOutput } from "../console/output.ts";
import { err, ok, type Result } from "../shared/result.ts";
import type { Checkpointer, Clock, Logger, Runner, SessionStore, Verifier } from "./types.ts";

export type ControllerDeps = {
  runner: Runner;
  verifier: Verifier;
  checkpointer: Checkpointer | null;
  sessionStore: SessionStore;
  logger: Logger;
  console: ConsoleOutput;
  clock: Clock;
};

export const runLoop = async (
  deps: ControllerDeps,
  cfg: RunConfig,
): Promise<Result<RunResult>> => {
  const startMs = deps.clock.nowMs();
  const initial = await deps.sessionStore.load();
  if (!initial.ok) {
    return initial;
  }
  if (!initial.value) {
    return err(new Error("loop controller: session not initialized"));
  }

  deps.console.sessionStart(
    initial.value.sessionId,
    initial.value.agent,
    cfg.verifyMode,
  );

  let iterations = 0;
  let resumeMain = cfg.resumeSession;
  let resumeVerify = cfg.resumeVerifySession;
  let agentErrorStreak = 0;

  while (true) {
    const iterStartMs = deps.clock.nowMs();
    iterations += 1;
    const sessionResult = await deps.sessionStore.load();
    if (!sessionResult.ok) {
      return sessionResult;
    }
    if (!sessionResult.value) {
      return err(new Error("loop controller: session not initialized"));
    }
    let session: SessionState = sessionResult.value;

    void deps.logger.debug("iteration_start", {
      iteration: iterations,
      session_id: session.sessionId,
    });

    const runCfg: RunConfig = {
      ...cfg,
      resumeSession: resumeMain,
      resumeVerifySession: resumeVerify,
    };

    if (cfg.verifyMode === "command") {
      void deps.logger.debug("verify_command", {
        shell: cfg.verifyShell,
        cmd: cfg.verifyCmd ?? "",
      });
    }

    const agentResult = await deps.runner.run(runCfg, session);
    const agentErr = agentResult.ok ? null : agentResult.error;
    deps.console.agentExit(session.agent, agentErr ?? undefined);
    if (!agentResult.ok) {
      void deps.logger.warn("agent_run_error", {
        error: agentResult.error.message,
        session_id: session.sessionId,
      });
      agentErrorStreak += 1;
    } else {
      agentErrorStreak = 0;
    }
    if (!resumeMain) {
      resumeMain = true;
    }

    const refreshed = await deps.sessionStore.load();
    if (!refreshed.ok) {
      return refreshed;
    }
    if (refreshed.value) {
      if (refreshed.value.sessionId !== session.sessionId) {
        void deps.logger.debug("session_update", {
          session_id: refreshed.value.sessionId,
          prior_session: session.sessionId,
          iteration: iterations,
        });
      }
      session = refreshed.value;
    }

    const verifyResult = await deps.verifier.run(runCfg, session);
    if (!verifyResult.ok) {
      void deps.logger.error("verify_exec_failed", {
        error: verifyResult.error.message,
        session_id: session.sessionId,
      });
      return verifyResult;
    }
    if (cfg.verifyMode === "agent" && !resumeVerify) {
      resumeVerify = true;
    }

    let checkpointRef = "";
    if (deps.checkpointer) {
      const latestSession = await deps.sessionStore.load();
      if (!latestSession.ok) {
        return latestSession;
      }
      if (!latestSession.value) {
        return err(new Error("loop controller: session not initialized"));
      }
      session = latestSession.value;
      const checkpointResult = await deps.checkpointer.write(
        iterations,
        session.sessionId,
        verifyResult.ok ? verifyResult.value : emptyVerifyResult(),
        cfg.verifyMode,
      );
      if (!checkpointResult.ok) {
        void deps.logger.error("checkpoint_failed", {
          error: checkpointResult.error.message,
          session_id: session.sessionId,
        });
        return checkpointResult;
      }
      checkpointRef = checkpointResult.value.ref;
    }

    const iterElapsedMs = deps.clock.nowMs() - iterStartMs;
    const verifyValue: VerifyResult = verifyResult.ok
      ? verifyResult.value
      : emptyVerifyResult();

    // Print verification result and iteration status
    if (cfg.verifyMode !== "none") {
      const verifyStatus = verifyValue.exitCode === 0 ? "pass" : "fail";
      deps.console.verification(verifyStatus, verifyValue);
    }
    deps.console.iteration(iterations, formatDuration(iterElapsedMs), checkpointRef || undefined);

    if (agentErr && agentErrorStreak >= 3) {
      const error = new Error(
        `agent error limit reached (${agentErrorStreak}): ${agentErr.message}`,
      );
      void deps.logger.error("agent_error_limit", {
        error: error.message,
        session_id: session.sessionId,
        agent_error_streak: agentErrorStreak,
      });
      return err(error);
    }

    if (verifyValue.exitCode === 0 && !verifyValue.timedOut) {
      deps.console.sessionComplete("success", iterations, formatDuration(deps.clock.nowMs() - startMs));
      return ok({
        status: "success",
        iterations,
        elapsedMs: deps.clock.nowMs() - startMs,
        lastVerifyExitCode: verifyValue.exitCode,
        lastCheckpointRef: checkpointRef,
      });
    }

    if (reachedLimits(cfg, iterations, deps.clock.nowMs() - startMs)) {
      deps.console.sessionComplete("limit", iterations, formatDuration(deps.clock.nowMs() - startMs));
      return ok({
        status: "limit",
        iterations,
        elapsedMs: deps.clock.nowMs() - startMs,
        lastVerifyExitCode: verifyValue.exitCode,
        lastCheckpointRef: checkpointRef,
      });
    }
  }
};

const reachedLimits = (
  cfg: RunConfig,
  iterations: number,
  elapsedMs: number,
): boolean => {
  if (cfg.maxIterations > 0 && iterations >= cfg.maxIterations) {
    return true;
  }
  if (cfg.maxMinutes > 0) {
    const maxMs = cfg.maxMinutes * 60_000;
    if (elapsedMs >= maxMs) {
      return true;
    }
  }
  return false;
};

const emptyVerifyResult = (): VerifyResult => ({
  exitCode: 1,
  timedOut: false,
  outputTail: "verification disabled",
});

const formatDuration = (ms: number): string => {
  if (ms <= 0) {
    return "0s";
  }
  const seconds = Math.floor(ms / 1000);
  const millis = ms % 1000;
  if (seconds < 60) {
    return `${seconds}.${String(millis).padStart(3, "0")}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m${remainder}s`;
};
