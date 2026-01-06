import { err, ok, toError, type Result } from "./result.ts";

export const parseJson = async (text: string): Promise<Result<unknown>> => {
  return Promise.resolve(text)
    .then((value) => ok(JSON.parse(value)))
    .catch((error) => err(toError(error)));
};
