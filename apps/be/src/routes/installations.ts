import { getStore } from "../store";
import { badRequest, json } from "../utils";

export async function handleInstallationsSync(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON");
  }
  const repos = (body as { repos?: unknown })?.repos;
  if (!Array.isArray(repos) || repos.length === 0) {
    return badRequest("Body must include repos: [{owner, name, fullName}]");
  }
  const store = getStore();
  let created = 0;
  for (const r of repos as Array<{ owner?: unknown; name?: unknown; fullName?: unknown }>) {
    const owner = typeof r.owner === "string" ? r.owner.trim() : "";
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const fullName = typeof r.fullName === "string" ? r.fullName.trim() : `${owner}/${name}`;
    if (!owner || !name) continue;
    await store.ensureRepository({ owner, name, fullName });
    created++;
  }
  return json({ synced: created });
}
