import type { RunConfig } from "../model.ts";
import { systemClock } from "../clock.ts";
import { createCheckpointer } from "../checkpoint/checkpointer.ts";
import { createConsoleOutput } from "../console/output.ts";
import { createFileLogger } from "../logging/logger.ts";
import { createSessionLogger, type SessionLogger } from "../logging/session-logger.ts";
import { createAgentWriter } from "../logging/agent-writer.ts";
import { runLoop } from "../loop/controller.ts";
import type { Logger, Verifier } from "../loop/types.ts";
import { runClaude } from "../runner/claude/claude-runner.ts";
import { runCodex } from "../runner/codex/codex-runner.ts";
import { createSessionStore } from "../session/store.ts";
import { ensureSession } from "../session/ensure.ts";
import { resolveWorkspaceRoot, resolvePath, defaultLogPath, tempLogPath } from "../shared/paths.ts";
import { slugify, logLabelForRun } from "../shared/slug.ts";
import { ok, type Result } from "../shared/result.ts";
import type { RunParsed } from "./run-config.ts";
import { runNoopVerify } from "../verify/noop-verifier.ts";
import { runCommandVerify } from "../verify/command-verifier.ts";
import { runClaudeAgentVerify } from "../verify/claude-agent.ts";
import { runCodexAgentVerify } from "../verify/codex-agent.ts";

export const runWithConfig = async (parsed: RunParsed): Promise<Result<void>> => {
  const cfg = parsed.config;
  const maxIterExplicit = parsed.maxIterExplicit;
  const maxMinsExplicit = parsed.maxMinsExplicit;

  if (cfg.verifyMode === "none" && !maxIterExplicit && !maxMinsExplicit) {
    cfg.maxIterations = 0;
    cfg.maxMinutes = 0;
  }

  const workspace = await resolveWorkspaceRoot();
  if (!workspace.ok) {
    return workspace;
  }
  const root = workspace.value.root;

  const store = createSessionStore();
  const ensured = await ensureSession({
    store,
    agent: cfg.agent,
    cwd: root,
    overrideId: parsed.sessionId,
  });
  if (!ensured.ok) {
    return ensured;
  }
  const sessionState = ensured.value.session;
  if (!ensured.value.created) {
    cfg.resumeSession = true;
  }

  const logSlug = slugify(cfg.prompt.length > 0 ? cfg.prompt : cfg.promptFile ?? "prompt");
  const logLabel = logLabelForRun(logSlug);

  let logger: Logger;
  let sessionLogger: SessionLogger | null = null;

  if (parsed.logExplicit) {
    const logPath = resolvePath(root, cfg.logPath);
    const loggerResult = await createFileLogger({
      path: logPath,
      format: cfg.logFormat,
    });
    if (!loggerResult.ok) {
      return loggerResult;
    }
    logger = loggerResult.value;
    cfg.logPath = logPath;
  } else if (cfg.agent === "codex" && sessionState.sessionId === "pending") {
    const logPath = tempLogPath(logLabel);
    const loggerResult = await createSessionLogger({
      path: logPath,
      format: cfg.logFormat,
    });
    if (!loggerResult.ok) {
      return loggerResult;
    }
    logger = loggerResult.value;
    sessionLogger = loggerResult.value;
    cfg.logPath = logPath;
  } else {
    const logPath = defaultLogPath(sessionState.sessionId, logLabel);
    const loggerResult = await createFileLogger({
      path: logPath,
      format: cfg.logFormat,
    });
    if (!loggerResult.ok) {
      return loggerResult;
    }
    logger = loggerResult.value;
    cfg.logPath = logPath;
  }

  logger.setLevel?.(cfg.logLevel);

  // Create console output for user-friendly stdout
  const consoleOutput = createConsoleOutput({
    stream: process.stdout,
    logPath: cfg.logPath,
    log: (message, meta) => {
      void logger.info(message, meta);
    },
  });

  const agentWriter = createAgentWriter({
    logger,
    agent: cfg.agent,
    stream: "stdout",
  });

  const onSessionId = async (sessionId: string): Promise<void> => {
    if (!sessionLogger) {
      return;
    }
    const nextPath = defaultLogPath(sessionId, logLabel);
    const rotated = await sessionLogger.maybeRotate(nextPath);
    if (!rotated.ok) {
      void logger.error("log_rotate_failed", {
        error: rotated.error.message,
        session_id: sessionId,
      });
      return;
    }
    if (rotated.value) {
      cfg.logPath = nextPath;
    }
  };

  const runner = {
    run: async (runCfg: RunConfig, session: typeof sessionState) => {
      if (runCfg.agent === "claude") {
        return runClaude(runCfg, session, {
          logger,
          stdout: process.stdout,
          agentWriter,
        });
      }
      return runCodex(runCfg, session, {
        logger,
        stdout: process.stdout,
        agentWriter,
        onSessionId: sessionLogger ? onSessionId : null,
        sessionStore: store,
      });
    },
  };

  const verifier: Verifier = {
    run: async (runCfg, session) => {
      if (runCfg.verifyMode === "none") {
        return runNoopVerify(runCfg, session);
      }
      if (runCfg.verifyMode === "command") {
        const writer = createTextEmitter(process.stdout, logger);
        return runCommandVerify(runCfg, session, writer);
      }
      if (session.agent === "claude") {
        return runClaudeAgentVerify(runCfg, session, {
          sessionStore: store,
          logger,
          stdout: process.stdout,
          agentWriter: createAgentWriter({
            logger,
            agent: "claude",
            stream: "verify",
          }),
        });
      }
      return runCodexAgentVerify(runCfg, session, {
        sessionStore: store,
        logger,
        stdout: process.stdout,
        agentWriter: createAgentWriter({
          logger,
          agent: "codex",
          stream: "verify",
        }),
      });
    },
  };

  const checkpointer = workspace.value.inGit ? createCheckpointer(root) : null;

  const result = await runLoop({
    runner,
    verifier,
    checkpointer,
    sessionStore: store,
    logger,
    console: consoleOutput,
    clock: systemClock,
  }, cfg);

  if (!result.ok) {
    return result;
  }
  return ok(undefined);
};

const createTextEmitter = (
  stdout: NodeJS.WritableStream,
  logger: Logger,
): ((chunk: string) => void) => {
  return (chunk: string) => {
    if (chunk.length === 0) {
      return;
    }
    stdout.write(chunk);
    void logger.debug("verify_output", { chunk });
  };
};
