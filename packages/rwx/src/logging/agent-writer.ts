import type { Logger } from "../loop/types.ts";
import { ok, type Result } from "../shared/result.ts";

export type AgentWriter = {
  write: (chunk: string) => Promise<Result<void>>;
  flush: () => Promise<Result<void>>;
};

export const createAgentWriter = (opts: {
  logger: Logger;
  agent: string;
  stream: string;
}): AgentWriter => {
  let buffer = "";

  const writeLine = async (line: string): Promise<Result<void>> => {
    // Log to file
    await opts.logger.debug("agent_output", {
      agent: opts.agent,
      stream: opts.stream,
      line,
    });
    return ok(undefined);
  };

  const write = async (chunk: string): Promise<Result<void>> => {
    if (chunk.length === 0) {
      return ok(undefined);
    }
    // Buffer for logging complete lines (stdout handled by OutputSink)
    buffer += chunk;
    while (true) {
      const index = buffer.indexOf("\n");
      if (index < 0) {
        break;
      }
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      const result = await writeLine(line);
      if (!result.ok) {
        return result;
      }
    }
    return ok(undefined);
  };

  const flush = async (): Promise<Result<void>> => {
    const rest = buffer.trimEnd();
    buffer = "";
    if (rest.length === 0) {
      return ok(undefined);
    }
    return writeLine(rest);
  };

  return { write, flush };
};
