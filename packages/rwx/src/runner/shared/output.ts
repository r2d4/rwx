import type { AgentWriter } from "../../logging/agent-writer.ts";

export type OutputSink = {
  write: (chunk: string) => Promise<void>;
  flush: () => Promise<void>;
};

export const createOutputSink = (opts: {
  stdout: NodeJS.WritableStream;
  writer: AgentWriter | null;
  writerTransform?: (chunk: string) => string;
}): OutputSink => {
  const write = async (chunk: string): Promise<void> => {
    if (chunk.length === 0) {
      return;
    }
    opts.stdout.write(chunk);
    if (opts.writer) {
      const payload = opts.writerTransform ? opts.writerTransform(chunk) : chunk;
      await opts.writer.write(payload);
    }
  };

  const flush = async (): Promise<void> => {
    if (opts.writer) {
      await opts.writer.flush();
    }
  };

  return { write, flush };
};

export const stripAnsi = (value: string): string => {
  const esc = String.fromCharCode(27);
  return value.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
};
