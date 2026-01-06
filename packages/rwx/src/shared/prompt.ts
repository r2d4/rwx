import { readFile } from "node:fs/promises";
import { err, ok, toError, type Result } from "./result.ts";

export const resolvePrompt = async (opts: {
  prompt: string;
  promptFile: string | null;
}): Promise<Result<string>> => {
  if (opts.prompt.trim().length > 0) {
    return ok(opts.prompt);
  }
  if (!opts.promptFile) {
    return err(new Error("prompt is required"));
  }
  const readResult = await readFile(opts.promptFile, "utf8")
    .then((data) => ok(data))
    .catch((error) => err(toError(error)));
  if (!readResult.ok) {
    return readResult;
  }
  return ok(readResult.value);
};
