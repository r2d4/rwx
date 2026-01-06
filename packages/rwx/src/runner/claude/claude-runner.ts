import {
  query,
  type Options,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { AgentResult, RunConfig, SessionState } from "../../model.ts";
import { parseExtraArgs } from "../../shared/pass-through.ts";
import { resolvePrompt } from "../../shared/prompt.ts";
import { err, ok, toError, type Result } from "../../shared/result.ts";
import type { Logger } from "../../loop/types.ts";
import type { AgentWriter } from "../../logging/agent-writer.ts";
import { createOutputSink, stripAnsi } from "../shared/output.ts";
import { createClaudeMessageFormatter } from "../shared/message-formatter.ts";

export type ClaudeRunnerDeps = {
  logger: Logger | null;
  stdout: NodeJS.WritableStream;
  agentWriter: AgentWriter | null;
};

export const runClaude = async (
  cfg: RunConfig,
  session: SessionState,
  deps: ClaudeRunnerDeps,
): Promise<Result<AgentResult>> => {
  if (session.agent !== "claude") {
    return err(new Error("session agent is not claude"));
  }
  if (session.sessionId.length === 0) {
    return err(new Error("session id is required"));
  }
  const promptResult = await resolvePrompt({
    prompt: cfg.prompt,
    promptFile: cfg.promptFile,
  });
  if (!promptResult.ok) {
    return promptResult;
  }

  const parsed = parseExtraArgs(cfg.passThroughArgs);
  const options: Options = {
    cwd: session.cwd,
    includePartialMessages: true,
    extraArgs: parsed.args,
  };

  if (cfg.maxTurns > 0) {
    options.maxTurns = cfg.maxTurns;
  }

  if (cfg.resumeSession && session.sessionId !== "pending") {
    options.resume = session.sessionId;
  } else {
    options.extraArgs = {
      ...options.extraArgs,
      "session-id": session.sessionId,
    };
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

  if (deps.logger) {
    void deps.logger.debug("agent_command", {
      agent: "claude",
      session_id: session.sessionId,
      cmd: "claude (sdk)",
    });
  }

  const queryResult = await Promise.resolve()
    .then(() => ok(query({ prompt: promptResult.value, options })))
    .catch((error) => err(toError(error)));
  if (!queryResult.ok) {
    return queryResult;
  }

  const iterator = queryResult.value[Symbol.asyncIterator]();
  let latestSessionId: string | null = null;

  while (true) {
    const nextResult = await iterator
      .next()
      .then((value) => ok(value))
      .catch((error) => err(toError(error)));
    if (!nextResult.ok) {
      await output.flush();
      return err(nextResult.error);
    }
    if (nextResult.value.done) {
      break;
    }
    const message: SDKMessage = nextResult.value.value;
    const formatted = formatter.format(message);
    if (formatted.sessionId) {
      latestSessionId = formatted.sessionId;
    }
    if (deps.logger) {
      void deps.logger.debug("agent_message", {
        agent: "claude",
        ...formatted.debug,
      });
    }
    for (const chunk of formatted.chunks) {
      await output.write(chunk);
    }
  }

  await output.flush();

  if (latestSessionId && latestSessionId !== session.sessionId) {
    session.sessionId = latestSessionId;
  }

  return ok({ exitCode: 0 });
};

const isTty = (stream: NodeJS.WritableStream): boolean => {
  return "isTTY" in stream && Boolean(stream.isTTY);
};
