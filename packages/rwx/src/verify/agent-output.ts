import { err, ok, type Result } from "../shared/result.ts";

export type ParsedOutput = {
  success: boolean;
  message: string;
};

const PASS_MARKER = "RWX_PASS";
const FAIL_MARKER = "RWX_FAIL";

export const parseVerifyOutput = (output: string): Result<ParsedOutput> => {
  // Search for markers anywhere in output
  const passIdx = output.lastIndexOf(PASS_MARKER);
  const failIdx = output.lastIndexOf(FAIL_MARKER);

  if (passIdx === -1 && failIdx === -1) {
    return err(new Error(`no ${PASS_MARKER} or ${FAIL_MARKER} marker found`));
  }

  // Use whichever marker appears last
  if (passIdx > failIdx) {
    const afterMarker = output.slice(passIdx + PASS_MARKER.length);
    const message = afterMarker.split("\n")[0].trim();
    return ok({ success: true, message });
  }

  const afterMarker = output.slice(failIdx + FAIL_MARKER.length);
  const message = afterMarker.split("\n")[0].trim();
  return ok({ success: false, message });
};

export const buildVerifyPrompt = (
  verifyPrompt: string,
  userPrompt: string,
): string => {
  return [
    `Verify task completion. Output "${PASS_MARKER} <reason>" or "${FAIL_MARKER} <reason>".`,
    "",
    `Criteria: ${verifyPrompt}`,
    "",
    `Task: ${userPrompt}`,
  ].join("\n");
};
