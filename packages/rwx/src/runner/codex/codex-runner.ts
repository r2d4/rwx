import { Codex, type Thread, type ThreadEvent, type ThreadOptions } from "@openai/codex-sdk";
import type { AgentResult, RunConfig, SessionState } from "../../model.ts";
import { parseExtraArgs, toApprovalMode, toSandboxMode } from "../../shared/pass-through.ts";
import { resolvePrompt } from "../../shared/prompt.ts";
import { err, ok, toError, type Result } from "../../shared/result.ts";
import type { Logger, SessionStore } from "../../loop/types.ts";
import type { AgentWriter } from "../../logging/agent-writer.ts";
import { createOutputSink, stripAnsi } from "../shared/output.ts";
import { createCodexMessageFormatter } from "../shared/message-formatter.ts";

export type CodexRunnerDeps = {
  logger: Logger | null;
  stdout: NodeJS.WritableStream;
  agentWriter: AgentWriter | null;
  onSessionId: ((sessionId: string) => Promise<void>) | null;
  sessionStore: SessionStore;
};

export const runCodex = async (
  cfg: RunConfig,
  session: SessionState,
  deps: CodexRunnerDeps,
): Promise<Result<AgentResult>> => {
  if (session.agent !== "codex") {
    return err(new Error("session agent is not codex"));
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

  const codex = new Codex();
  const approvalPolicy = cfg.dangerouslyAllowAll
    ? "never"
    : toApprovalMode(parsed.approvalPolicy) ?? "never";
  const sandboxMode = cfg.dangerouslyAllowAll
    ? "danger-full-access"
    : toSandboxMode(parsed.sandboxMode) ?? "workspace-write";

  const threadOptions: ThreadOptions = {
    workingDirectory: session.cwd.length > 0 ? session.cwd : undefined,
    approvalPolicy,
    sandboxMode,
    networkAccessEnabled: cfg.dangerouslyAllowAll ? true : undefined,
  };

  const thread: Thread =
    cfg.resumeSession && session.sessionId !== "pending"
      ? codex.resumeThread(session.sessionId, threadOptions)
      : codex.startThread(threadOptions);

  if (deps.logger) {
    void deps.logger.debug("agent_command", {
      agent: "codex",
      session_id: session.sessionId,
      cmd: "codex (sdk)",
    });
  }

  let streamed;
  try {
    streamed = await thread.runStreamed(promptResult.value);
  } catch (error) {
    return err(toError(error));
  }

  const output = createOutputSink({
    stdout: deps.stdout,
    writer: deps.agentWriter,
    writerTransform: stripAnsi,
  });
  const formatter = createCodexMessageFormatter({
    color: isTty(deps.stdout),
  });

  let latestSessionId: string | null = null;
  let exitCode = 0;

  for await (const event of streamed.events) {
    const threadEvent: ThreadEvent = event;
    if (threadEvent.type === "thread.started") {
      latestSessionId = threadEvent.thread_id;
    }
    if (threadEvent.type === "turn.failed" || threadEvent.type === "error") {
      exitCode = 1;
    }
    const formatted = formatter.format(threadEvent);
    if (formatted.sessionId) {
      latestSessionId = formatted.sessionId;
    }
    if (deps.logger) {
      void deps.logger.debug("agent_message", {
        agent: "codex",
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
    const saved = await deps.sessionStore.save({ ...session });
    if (!saved.ok) {
      return saved;
    }
    if (deps.onSessionId) {
      await deps.onSessionId(latestSessionId);
    }
  }

  return ok({ exitCode });
};

const isTty = (stream: NodeJS.WritableStream): boolean => {
  return "isTTY" in stream && Boolean(stream.isTTY);
};
