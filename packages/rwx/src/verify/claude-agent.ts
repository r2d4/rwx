import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
import type { RunConfig, SessionState, VerifyResult } from "../model.ts";
import { buildVerifyPrompt, parseVerifyOutput } from "./agent-output.ts";
import { resolveVerifyPrompt } from "./agent-prompt.ts";
import { parseExtraArgs } from "../shared/pass-through.ts";
import { resolvePrompt } from "../shared/prompt.ts";
import { err, ok, toError, type Result } from "../shared/result.ts";
import type { Logger, SessionStore } from "../loop/types.ts";
import type { AgentWriter } from "../logging/agent-writer.ts";
import { createOutputSink, stripAnsi } from "../runner/shared/output.ts";
import { createClaudeMessageFormatter } from "../runner/shared/message-formatter.ts";

export type ClaudeVerifyDeps = {
  sessionStore: SessionStore;
  logger: Logger | null;
  stdout: NodeJS.WritableStream;
  agentWriter: AgentWriter | null;
};

export const runClaudeAgentVerify = async (
  cfg: RunConfig,
  session: SessionState,
  deps: ClaudeVerifyDeps,
): Promise<Result<VerifyResult>> => {
  if (session.agent !== "claude") {
    return err(new Error("session agent is not claude"));
  }
  if (cfg.verifyMode !== "agent") {
    return err(new Error("verify mode is not agent"));
  }

  const userPromptResult = await resolvePrompt({
    prompt: cfg.prompt,
    promptFile: cfg.promptFile,
  });
  if (!userPromptResult.ok) {
    return userPromptResult;
  }
  const verifyPromptResult = await resolveVerifyPrompt({
    prompt: cfg.verifyAgentPrompt,
    promptFile: cfg.verifyAgentPromptFile,
  });
  if (!verifyPromptResult.ok) {
    return verifyPromptResult;
  }

  let updatedSession = session;
  if (!updatedSession.claude) {
    updatedSession = {
      ...updatedSession,
      claude: {
        transcriptPath: "",
        verifySessionId: "",
        verifyTranscriptPath: "",
      },
    };
  }
  if (updatedSession.claude && updatedSession.claude.verifySessionId.length === 0) {
    updatedSession = {
      ...updatedSession,
      claude: {
        ...updatedSession.claude,
        verifySessionId: randomUUID(),
      },
    };
    const saved = await deps.sessionStore.save(updatedSession);
    if (!saved.ok) {
      return saved;
    }
  }

  const verifySessionId = updatedSession.claude
    ? updatedSession.claude.verifySessionId
    : randomUUID();

  const prompt = buildVerifyPrompt(
    verifyPromptResult.value,
    userPromptResult.value,
  );

  const parsed = parseExtraArgs(cfg.passThroughArgs);
  const options: Options = {
    cwd: session.cwd,
    includePartialMessages: true,
    extraArgs: parsed.args,
  };
  if (cfg.maxTurns > 0) {
    options.maxTurns = cfg.maxTurns;
  }
  if (cfg.resumeVerifySession) {
    options.resume = verifySessionId;
  } else {
    options.extraArgs = { ...options.extraArgs, "session-id": verifySessionId };
  }
  if (cfg.dangerouslyAllowAll) {
    options.permissionMode = "bypassPermissions";
    options.allowDangerouslySkipPermissions = true;
  } else if (!parsed.hasPermissionMode) {
    options.permissionMode = "dontAsk";
  }

  const output = createOutputSink({
    stdout: deps.stdout,
    writer: deps.agentWriter,
    writerTransform: stripAnsi,
  });
  const formatter = createClaudeMessageFormatter({
    color: isTty(deps.stdout),
  });

  let timedOut = false;
  const abortController =
    cfg.verifyTimeoutSec > 0 ? new AbortController() : undefined;
  const timeoutId =
    cfg.verifyTimeoutSec > 0
      ? setTimeout(() => {
          timedOut = true;
          abortController?.abort();
        }, cfg.verifyTimeoutSec * 1000)
      : null;
  if (abortController) {
    options.abortController = abortController;
  }
  if (deps.logger) {
    void deps.logger.debug("agent_command", {
      agent: "claude",
      session_id: verifySessionId,
      cmd: "claude (sdk verify)",
    });
  }

  const queryResult = await Promise.resolve()
    .then(() => ok(query({ prompt, options })))
    .catch((error) => err(toError(error)));
  if (!queryResult.ok) {
    return queryResult;
  }

  const collectedOutput: string[] = [];
  const iterator = queryResult.value[Symbol.asyncIterator]();

  while (true) {
    const nextResult = await iterator
      .next()
      .then((value) => ok(value))
      .catch((error) => err(toError(error)));
    if (!nextResult.ok) {
      await output.flush();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      return err(nextResult.error);
    }
    if (nextResult.value.done) {
      break;
    }
    const message: SDKMessage = nextResult.value.value;
    const formatted = formatter.format(message);
    if (deps.logger) {
      void deps.logger.debug("agent_message", {
        agent: "claude",
        verify: true,
        ...formatted.debug,
      });
    }
    for (const chunk of formatted.chunks) {
      collectedOutput.push(stripAnsi(chunk));
      await output.write(chunk);
    }
  }

  await output.flush();
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  const fullOutput = collectedOutput.join("");
  const parsedOutput = parseVerifyOutput(fullOutput);
  if (!parsedOutput.ok) {
    return ok({
      exitCode: 1,
      timedOut,
      outputTail: parsedOutput.error.message,
    });
  }

  const exitCode = parsedOutput.value.success ? 0 : 1;
  return ok({
    exitCode,
    timedOut,
    outputTail: parsedOutput.value.message,
  });
};

const isTty = (stream: NodeJS.WritableStream): boolean => {
  return "isTTY" in stream && Boolean(stream.isTTY);
};
