import { Codex, type Thread, type ThreadEvent, type ThreadOptions } from "@openai/codex-sdk";
import { randomUUID } from "node:crypto";
import type { RunConfig, SessionState, VerifyResult } from "../model.ts";
import { buildVerifyPrompt, parseVerifyOutput } from "./agent-output.ts";
import { resolveVerifyPrompt } from "./agent-prompt.ts";
import { parseExtraArgs, toApprovalMode, toSandboxMode } from "../shared/pass-through.ts";
import { resolvePrompt } from "../shared/prompt.ts";
import { err, ok, toError, type Result } from "../shared/result.ts";
import type { Logger, SessionStore } from "../loop/types.ts";
import type { AgentWriter } from "../logging/agent-writer.ts";
import { createOutputSink, stripAnsi } from "../runner/shared/output.ts";
import { createCodexMessageFormatter } from "../runner/shared/message-formatter.ts";

export type CodexVerifyDeps = {
  sessionStore: SessionStore;
  logger: Logger | null;
  stdout: NodeJS.WritableStream;
  agentWriter: AgentWriter | null;
};

export const runCodexAgentVerify = async (
  cfg: RunConfig,
  session: SessionState,
  deps: CodexVerifyDeps,
): Promise<Result<VerifyResult>> => {
  if (session.agent !== "codex") {
    return err(new Error("session agent is not codex"));
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
  if (!updatedSession.codex) {
    updatedSession = {
      ...updatedSession,
      codex: {
        sessionFile: "",
        verifySessionId: "",
        verifySessionFile: "",
      },
    };
  }
  if (updatedSession.codex && updatedSession.codex.verifySessionId.length === 0) {
    updatedSession = {
      ...updatedSession,
      codex: {
        ...updatedSession.codex,
        verifySessionId: randomUUID(),
      },
    };
    const saved = await deps.sessionStore.save(updatedSession);
    if (!saved.ok) {
      return saved;
    }
  }

  const verifySessionId = updatedSession.codex
    ? updatedSession.codex.verifySessionId
    : "";

  const prompt = buildVerifyPrompt(
    verifyPromptResult.value,
    userPromptResult.value,
  );

  const parsed = parseExtraArgs(cfg.passThroughArgs);
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

  const codex = new Codex();
  const thread: Thread =
    cfg.resumeVerifySession && verifySessionId.length > 0
      ? codex.resumeThread(verifySessionId, threadOptions)
      : codex.startThread(threadOptions);

  if (deps.logger) {
    void deps.logger.debug("agent_command", {
      agent: "codex",
      session_id: verifySessionId,
      cmd: "codex",
    });
  }

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

  let streamed;
  try {
    streamed = await thread.runStreamed(prompt, { signal: abortController?.signal });
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
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

  const collectedOutput: string[] = [];
  let exitCode = 0;
  let latestThreadId: string | null = null;

  for await (const event of streamed.events) {
    const threadEvent: ThreadEvent = event;
    if (threadEvent.type === "thread.started") {
      latestThreadId = threadEvent.thread_id;
    }
    if (threadEvent.type === "turn.failed" || threadEvent.type === "error") {
      exitCode = 1;
    }
    const formatted = formatter.format(threadEvent);
    if (formatted.sessionId) {
      latestThreadId = formatted.sessionId;
    }
    if (deps.logger) {
      void deps.logger.debug("agent_message", {
        agent: "codex",
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

  if (latestThreadId && updatedSession.codex) {
    if (updatedSession.codex.verifySessionId !== latestThreadId) {
      updatedSession = {
        ...updatedSession,
        codex: {
          ...updatedSession.codex,
          verifySessionId: latestThreadId,
        },
      };
      const saved = await deps.sessionStore.save(updatedSession);
      if (!saved.ok) {
        return saved;
      }
    }
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

  const verifyExit = parsedOutput.value.success ? 0 : 1;
  const combinedExit = exitCode === 0 ? verifyExit : exitCode;

  return ok({
    exitCode: combinedExit,
    timedOut,
    outputTail: parsedOutput.value.message,
  });
};

const isTty = (stream: NodeJS.WritableStream): boolean => {
  return "isTTY" in stream && Boolean(stream.isTTY);
};
