import { z } from "zod";
import { compactSchema, generateBatchSummaryWithGlm } from "../../../lib/glm";
import {
  readJson,
  credentials,
  modelConfig,
  errResponse,
} from "../../../lib/server";
export const runtime = "nodejs";
export const maxDuration = 110;
const input = z
  .object({
    ...credentials,
    items: z.array(compactSchema.strict()).min(1).max(20),
  })
  .strict();
export async function POST(req: Request) {
  try {
    const data = input.parse(await readJson(req));
    return Response.json(
      {
        summary: await generateBatchSummaryWithGlm(
          data.items,
          modelConfig(data, req),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errResponse(e);
  }
}
