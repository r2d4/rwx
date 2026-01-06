import type { VerifyResult } from "../model.ts";
import * as colors from "./colors.ts";

export type ConsoleOutput = {
  write: (text: string) => void;
  agentExit: (agent: string, error?: Error) => void;
  verification: (status: "pass" | "fail", result: VerifyResult) => void;
  iteration: (iteration: number, elapsed: string, checkpoint?: string) => void;
  sessionStart: (sessionId: string, agent: string, verifyMode: string) => void;
  sessionComplete: (status: string, iterations: number, elapsed: string) => void;
};

export type ConsoleOutputDeps = {
  stream: NodeJS.WritableStream;
  logPath?: string;
  log?: (message: string, meta: Record<string, unknown>) => void;
};

export const createConsoleOutput = (deps: ConsoleOutputDeps): ConsoleOutput => {
  const color = colors.supportsColor(deps.stream);

  const c = (code: string, text: string): string => {
    return color ? colors.c(code, text) : text;
  };

  const write = (text: string): void => {
    deps.stream.write(text);
  };

  const agentExit = (agent: string, error?: Error): void => {
    if (error) {
      const text = `${c(colors.red, "error")} ${c(colors.dim, `[${agent}]`)} ${error.message}`;
      write(`\n${text}\n`);
      if (deps.logPath) {
        write(`${c(colors.dim, `log: ${deps.logPath}`)}\n`);
      }
      deps.log?.("agent_exit", {
        agent,
        error: error.message,
        log_path: deps.logPath,
      });
    } else {
      const text = `${c(colors.dim, `exit [${agent}]`)}`;
      write(`\n${text}\n`);
      deps.log?.("agent_exit", { agent });
    }
  };

  const verification = (status: "pass" | "fail", result: VerifyResult): void => {
    const statusColor = status === "pass" ? colors.green : colors.red;
    const header = `${c(statusColor, `verification:${status}`)} ${c(colors.dim, "[rwx]")}`;

    const lines: string[] = [];
    if (result.outputTail) {
      lines.push(result.outputTail);
    }
    if (result.timedOut) {
      lines.push("(timed out)");
    }

    if (lines.length === 0) {
      write(`${header}\n\n`);
    } else {
      const body = lines.map((line) => `  ${line}`).join("\n");
      write(`${header}\n${c(colors.dim, body)}\n\n`);
    }

    deps.log?.("verification", {
      status,
      exit_code: result.exitCode,
      timed_out: result.timedOut,
      output: result.outputTail,
    });
  };

  const iteration = (iter: number, elapsed: string, checkpoint?: string): void => {
    const parts = [`iteration ${iter}`, elapsed];
    if (checkpoint) {
      parts.push(checkpoint);
    }
    const text = parts.join(" · ");
    write(`${c(colors.dim, text)}\n\n`);

    deps.log?.("iteration_complete", {
      iteration: iter,
      elapsed,
      checkpoint: checkpoint || undefined,
    });
  };

  const sessionStart = (sessionId: string, agent: string, verifyMode: string): void => {
    const text = `${c(colors.cyan, "session")} ${c(colors.dim, `[${agent}]`)} ${c(colors.dim, sessionId.slice(0, 8))}`;
    write(`${text}\n`);

    deps.log?.("session_start", {
      session_id: sessionId,
      agent,
      verify_mode: verifyMode,
    });
  };

  const sessionComplete = (status: string, iterations: number, elapsed: string): void => {
    const statusColor = status === "success" ? colors.green : colors.yellow;
    const text = `${c(statusColor, status)} ${c(colors.dim, `${iterations} iterations · ${elapsed}`)}`;
    write(`${text}\n\n`);

    deps.log?.("session_complete", {
      status,
      iterations,
      elapsed,
    });
  };

  return {
    write,
    agentExit,
    verification,
    iteration,
    sessionStart,
    sessionComplete,
  };
};
