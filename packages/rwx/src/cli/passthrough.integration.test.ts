import { Parser } from "@oclif/core"
import { describe, expect, it } from "vitest"
import { buildRunFlags, runArgs } from "./run-flags.ts"

describe("cli passthrough", () => {
  it("accepts arguments after --", async () => {
    const output = await Parser.parse(
      ["--dangerous", "prompt", "--", "-c", "model_reasoning_effort=low"],
      {
        args: runArgs,
        flags: buildRunFlags(false),
        strict: false,
        "--": true,
      },
    )

    expect(output.args.prompt).toBe("prompt")
    expect(output.argv).toEqual(
      expect.arrayContaining(["-c", "model_reasoning_effort=low"]),
    )
  })
})
