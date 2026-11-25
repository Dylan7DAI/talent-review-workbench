import { z } from "zod";
import {
  readJson,
  credentials,
  modelConfig,
  errResponse,
} from "../../../lib/server";
import { parseResumesMarkdown } from "../../../lib/parser";
import { computeCandidateEvaluation } from "../../../lib/scoring";
import { evaluateCandidateWithGlm, ModelError } from "../../../lib/glm";
import { weightSchema } from "../../../lib/types";
export const runtime = "nodejs";
export const maxDuration = 110;
const input = z
  .object({
    ...credentials,
    raw: z.string().min(1),
    id: z
      .string()
      .regex(/^\d+(?:-\d+)?$/)
      .max(32),
    weights: weightSchema.optional(),
  })
  .strict();
export async function POST(req: Request) {
  try {
    const data = input.parse(await readJson(req));
    const config = modelConfig(data, req);
    const { candidates } = parseResumesMarkdown(data.raw);
    if (candidates.length !== 1)
      throw new ModelError("此接口每次仅接受一份简历。", 400);
    const candidate = { ...candidates[0], id: data.id };
    const output = await evaluateCandidateWithGlm(candidate, config);
    return Response.json(
      {
        evaluation: computeCandidateEvaluation(candidate, output, data.weights),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errResponse(e);
  }
}
