import { runCommand } from "../shared/exec.ts";
import { isRecord } from "../shared/guards.ts";
import { err, ok, toError, type Result } from "../shared/result.ts";
import type { VerifyResult } from "../model.ts";

export type Checkpointer = {
  write: (
    iteration: number,
    sessionId: string,
    verify: VerifyResult,
    verifyMode: string,
  ) => Promise<Result<{ ref: string; shortSha: string }>>;
  list: (sessionId: string | null) => Promise<Result<CheckpointRef[]>>;
  show: (refOrIter: string) => Promise<Result<CheckpointRef>>;
};

export type CheckpointRef = {
  ref: string;
  shortSha: string;
  iteration: number;
  timestamp: string;
  sessionId: string;
  verifyExitCode: number;
  verifyTimedOut: boolean;
  verifyMode: string;
  verifyOutput: string;
};

export const createCheckpointer = (repoRoot: string): Checkpointer => {
  const git = async (args: string[]): Promise<Result<string>> => {
    const result = await runCommand({
      command: "git",
      args,
      cwd: repoRoot,
      env: withGitIdentity(process.env),
      timeoutMs: 0,
      onStdout: null,
      onStderr: null,
    });
    if (!result.ok) {
      return result;
    }
    if (result.value.exitCode !== 0) {
      return err(new Error(`git ${args.join(" ")} failed`));
    }
    return ok(result.value.stdout);
  };

  const headSha = async (): Promise<Result<string>> => {
    const result = await git(["rev-parse", "HEAD"]);
    if (!result.ok) {
      return result;
    }
    const sha = result.value.trim();
    if (sha.length === 0) {
      return err(new Error("empty sha"));
    }
    return ok(sha);
  };

  const headTree = async (): Promise<Result<string>> => {
    const result = await git(["show", "-s", "--format=%T", "HEAD"]);
    if (!result.ok) {
      return result;
    }
    const tree = result.value.trim();
    if (tree.length === 0) {
      return err(new Error("empty tree"));
    }
    return ok(tree);
  };

  const commitTree = async (
    tree: string,
    parent: string,
    message: string,
  ): Promise<Result<string>> => {
    const result = await runCommand({
      command: "git",
      args: ["commit-tree", tree, "-p", parent, "-m", message],
      cwd: repoRoot,
      env: withGitIdentity(process.env),
      timeoutMs: 0,
      onStdout: null,
      onStderr: null,
    });
    if (!result.ok) {
      return result;
    }
    if (result.value.exitCode !== 0) {
      return err(new Error("git commit-tree failed"));
    }
    const sha = result.value.stdout.trim();
    if (sha.length === 0) {
      return err(new Error("empty commit sha"));
    }
    return ok(sha);
  };

  const updateRef = async (ref: string, sha: string): Promise<Result<void>> => {
    const result = await git(["update-ref", ref, sha]);
    if (!result.ok) {
      return result;
    }
    return ok(undefined);
  };

  const refTimestamp = async (ref: string): Promise<Result<string>> => {
    const result = await git(["show", "-s", "--format=%cI", ref]);
    if (!result.ok) {
      return result;
    }
    return ok(result.value.trim());
  };

  const commitMessage = async (ref: string): Promise<Result<string>> => {
    const result = await git(["show", "-s", "--format=%B", ref]);
    if (!result.ok) {
      return result;
    }
    return ok(result.value);
  };

  const write = async (
    iteration: number,
    sessionId: string,
    verify: VerifyResult,
    verifyMode: string,
  ): Promise<Result<{ ref: string; shortSha: string }>> => {
    if (sessionId.length === 0) {
      return err(new Error("session id is required"));
    }
    const ref = `refs/rwx/${sessionId}/iter-${pad(iteration)}`;
    const head = await headSha();
    if (!head.ok) {
      return head;
    }
    const tree = await headTree();
    if (!tree.ok) {
      return tree;
    }
    const { message } = checkpointMessage(sessionId, iteration, verify, verifyMode);
    const commit = await commitTree(tree.value, head.value, message);
    if (!commit.ok) {
      return commit;
    }
    const update = await updateRef(ref, commit.value);
    if (!update.ok) {
      return update;
    }
    return ok({ ref, shortSha: shortSha(commit.value) });
  };

  const list = async (sessionId: string | null): Promise<Result<CheckpointRef[]>> => {
    const showResult = await runCommand({
      command: "git",
      args: ["show-ref"],
      cwd: repoRoot,
      env: withGitIdentity(process.env),
      timeoutMs: 0,
      onStdout: null,
      onStderr: null,
    });
    if (!showResult.ok) {
      return showResult;
    }
    if (showResult.value.exitCode === 1 && showResult.value.stdout.trim().length === 0) {
      return ok([]);
    }
    if (showResult.value.exitCode !== 0) {
      return err(new Error("git show-ref failed"));
    }
    const prefix = sessionId ? `refs/rwx/${sessionId}/` : "refs/rwx/";
    const refs: CheckpointRef[] = [];
    const lines = showResult.value.stdout.trim().split("\n");
    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }
      const [sha, ref] = splitOnce(line.trim(), " ");
      if (!sha || !ref || !ref.startsWith(prefix)) {
        continue;
      }
      const iter = parseIteration(ref);
      const timestampResult = await refTimestamp(ref);
      const timestamp = timestampResult.ok ? timestampResult.value : "";
      const metaResult = await refMeta(commitMessage, ref);
      const meta = metaResult.ok ? metaResult.value : emptyMeta();
      const sid = meta.sessionId.length > 0 ? meta.sessionId : sessionFromRef(ref);
      refs.push({
        ref,
        shortSha: shortSha(sha),
        iteration: iter,
        timestamp,
        sessionId: sid,
        verifyExitCode: meta.verifyExitCode,
        verifyTimedOut: meta.verifyTimedOut,
        verifyMode: meta.verifyMode,
        verifyOutput: meta.verifyOutput,
      });
    }
    refs.sort((a, b) => {
      if (a.sessionId === b.sessionId) {
        return a.iteration - b.iteration;
      }
      return a.sessionId < b.sessionId ? -1 : 1;
    });
    return ok(refs);
  };

  const show = async (refOrIter: string): Promise<Result<CheckpointRef>> => {
    const ref = refOrIter.startsWith("refs/") ? refOrIter : `refs/rwx/${refOrIter}`;
    const showResult = await git(["show-ref", ref]);
    if (!showResult.ok) {
      return showResult;
    }
    const [sha, fullRef] = splitOnce(showResult.value.trim(), " ");
    if (!sha || !fullRef) {
      return err(new Error("unexpected show-ref output"));
    }
    const iter = parseIteration(fullRef);
    const timestampResult = await refTimestamp(fullRef);
    const timestamp = timestampResult.ok ? timestampResult.value : "";
    const metaResult = await refMeta(commitMessage, fullRef);
    const meta = metaResult.ok ? metaResult.value : emptyMeta();
    const sid = meta.sessionId.length > 0 ? meta.sessionId : sessionFromRef(fullRef);
    return ok({
      ref: fullRef,
      shortSha: shortSha(sha),
      iteration: iter,
      timestamp,
      sessionId: sid,
      verifyExitCode: meta.verifyExitCode,
      verifyTimedOut: meta.verifyTimedOut,
      verifyMode: meta.verifyMode,
      verifyOutput: meta.verifyOutput,
    });
  };

  return { write, list, show };
};

type Meta = {
  sessionId: string;
  iteration: number;
  verifyExitCode: number;
  verifyTimedOut: boolean;
  verifyMode: string;
  verifyOutput: string;
};

const emptyMeta = (): Meta => ({
  sessionId: "",
  iteration: 0,
  verifyExitCode: 0,
  verifyTimedOut: false,
  verifyMode: "",
  verifyOutput: "",
});

const checkpointMessage = (
  sessionId: string,
  iteration: number,
  verify: VerifyResult,
  verifyMode: string,
): { message: string; meta: Meta } => {
  const meta: Meta = {
    sessionId,
    iteration,
    verifyExitCode: verify.exitCode,
    verifyTimedOut: verify.timedOut,
    verifyMode,
    verifyOutput: verify.outputTail,
  };
  const payload = JSON.stringify({
    session_id: sessionId,
    iteration,
    verify_exit_code: verify.exitCode,
    verify_timed_out: verify.timedOut,
    verify_mode: verifyMode,
    verify_output: verify.outputTail,
  });
  return { message: `rwx checkpoint\n${payload}\n`, meta };
};

const refMeta = async (
  commitMessage: (ref: string) => Promise<Result<string>>,
  ref: string,
): Promise<Result<Meta>> => {
  const msgResult = await commitMessage(ref);
  if (!msgResult.ok) {
    return msgResult;
  }
  const lines = msgResult.value.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    const parsed = await parseJson(trimmed);
    if (!parsed.ok) {
      continue;
    }
    const meta = parsedMeta(parsed.value);
    if (meta.ok) {
      return meta;
    }
  }
  return ok(emptyMeta());
};

const parseJson = async (value: string): Promise<Result<unknown>> => {
  return Promise.resolve(value)
    .then((text) => ok(JSON.parse(text)))
    .catch((error) => err(toError(error)));
};

const parsedMeta = (value: unknown): Result<Meta> => {
  if (!isRecord(value)) {
    return err(new Error("meta must be object"));
  }
  const sessionId = typeof value.session_id === "string" ? value.session_id : "";
  const iteration = typeof value.iteration === "number" ? value.iteration : 0;
  const verifyExitCode =
    typeof value.verify_exit_code === "number" ? value.verify_exit_code : 0;
  const verifyTimedOut =
    typeof value.verify_timed_out === "boolean" ? value.verify_timed_out : false;
  const verifyMode =
    typeof value.verify_mode === "string" ? value.verify_mode : "";
  const verifyOutput =
    typeof value.verify_output === "string" ? value.verify_output : "";
  return ok({
    sessionId,
    iteration,
    verifyExitCode,
    verifyTimedOut,
    verifyMode,
    verifyOutput,
  });
};

const pad = (value: number): string => {
  const text = value.toString();
  return text.padStart(4, "0");
};

const shortSha = (sha: string): string => {
  return sha.length <= 7 ? sha : sha.slice(0, 7);
};

const sessionFromRef = (ref: string): string => {
  const parts = ref.split("/");
  for (let i = 0; i + 2 < parts.length; i += 1) {
    if (parts[i] === "rwx") {
      return parts[i + 1];
    }
  }
  return "";
};

const parseIteration = (ref: string): number => {
  const parts = ref.split("/");
  const last = parts[parts.length - 1] ?? "";
  if (!last.startsWith("iter-")) {
    return 0;
  }
  const value = Number.parseInt(last.replace("iter-", ""), 10);
  return Number.isNaN(value) ? 0 : value;
};

const splitOnce = (value: string, sep: string): [string, string] => {
  const index = value.indexOf(sep);
  if (index < 0) {
    return [value, ""];
  }
  return [value.slice(0, index), value.slice(index + sep.length)];
};

const withGitIdentity = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const next: NodeJS.ProcessEnv = { ...env };
  if (!next.GIT_AUTHOR_NAME) {
    next.GIT_AUTHOR_NAME = "rwx";
  }
  if (!next.GIT_AUTHOR_EMAIL) {
    next.GIT_AUTHOR_EMAIL = "rwx@local";
  }
  if (!next.GIT_COMMITTER_NAME) {
    next.GIT_COMMITTER_NAME = "rwx";
  }
  if (!next.GIT_COMMITTER_EMAIL) {
    next.GIT_COMMITTER_EMAIL = "rwx@local";
  }
  return next;
};
