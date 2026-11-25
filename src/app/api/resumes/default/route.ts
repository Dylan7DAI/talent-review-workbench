import { defaultMarkdown } from "../../../../lib/default-data";
export async function GET() {
  return Response.json({ markdown: await defaultMarkdown() });
}
