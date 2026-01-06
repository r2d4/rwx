import type { RunConfig, SessionState, VerifyResult } from "../model.ts";
import { ok, type Result } from "../shared/result.ts";

export const runNoopVerify = async (
  _cfg: RunConfig,
  _session: SessionState,
): Promise<Result<VerifyResult>> => {
  return ok({
    exitCode: 1,
    timedOut: false,
    outputTail: "verification disabled",
  });
};
