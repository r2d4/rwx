import { spawn } from "node:child_process";
import { err, ok, toError, type Result } from "./result.ts";

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
};

export type RunCommandInput = {
  command: string;
  args: string[];
  cwd: string | null;
  env: NodeJS.ProcessEnv | null;
  timeoutMs: number;
  onStdout: ((chunk: string) => void) | null;
  onStderr: ((chunk: string) => void) | null;
};

export const runCommand = (input: RunCommandInput): Promise<Result<CommandResult>> => {
  return new Promise((resolve) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd ?? undefined,
      env: input.env ?? process.env,
      stdio: "pipe",
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const finish = (result: Result<CommandResult>) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const timer =
      input.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, input.timeoutMs)
        : null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
      }
    };

    child.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      if (input.onStdout) {
        input.onStdout(text);
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      if (input.onStderr) {
        input.onStderr(text);
      }
    });

    child.on("error", (error) => {
      cleanup();
      finish(err(toError(error)));
    });

    child.on("close", (code) => {
      cleanup();
      const exitCode = typeof code === "number" ? code : timedOut ? 1 : 0;
      finish(
        ok({
          stdout,
          stderr,
          exitCode,
          timedOut,
        }),
      );
    });
  });
};
