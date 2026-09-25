import "server-only";
import { createGlobalServiceClient } from "../global/supabase";

export type ContextSearchResult = {
  node: {
    id: string;
    node_type: string;
    node_key: string;
    label: string;
    payload: Record<string, unknown>;
    importance: number;
    confidence: number;
    first_seen_at: string | null;
    last_seen_at: string | null;
  };
  relations: Array<{
    relation: string;
    direction: "out" | "in";
    label: string;
    nodeType: string;
    weight: number;
    evidenceCount: number;
  }>;
};

export async function searchContextGraph(query: string, limit = 8): Promise<ContextSearchResult[]> {
  const q = query.trim().slice(0, 120);
  if (!q) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 12);
  const client = createGlobalServiceClient();

  const { data: nodes, error } = await client
    .from("adspy_context_nodes")
    .select("id,node_type,node_key,label,payload,importance,confidence,first_seen_at,last_seen_at")
    .ilike("label", `%${q}%`)
    .order("importance", { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error("Context search failed: " + error.message);
  if (!nodes?.length) return [];

  const typedNodes = (nodes ?? []) as unknown as Array<{ id: string; node_type: string; node_key: string; label: string; payload: Record<string, unknown>; importance: number; confidence: number; first_seen_at: string | null; last_seen_at: string | null }>;
  const nodeIds = typedNodes.map((node) => String(node.id));
  const { data: edges, error: edgeError } = await client
    .from("adspy_context_edges")
    .select("from_node_id,to_node_id,relation,weight,evidence_count")
    .or(`from_node_id.in.(${nodeIds.join(",")}),to_node_id.in.(${nodeIds.join(",")})`)
    .order("weight", { ascending: false })
    .limit(200);

  if (edgeError) throw new Error("Context relation lookup failed: " + edgeError.message);

  const relatedIds = new Set<string>();
  for (const edge of edges ?? []) {
    const from = String(edge.from_node_id);
    const to = String(edge.to_node_id);
    if (nodeIds.includes(from)) relatedIds.add(to);
    if (nodeIds.includes(to)) relatedIds.add(from);
  }

  const missingRelatedIds = [...relatedIds].filter((id) => !nodeIds.includes(id));
  const { data: relatedNodes, error: relatedError } = missingRelatedIds.length
    ? await client
        .from("adspy_context_nodes")
        .select("id,node_type,label")
        .in("id", missingRelatedIds)
    : { data: [], error: null };

  if (relatedError) throw new Error("Context related-node lookup failed: " + relatedError.message);

  const labelById = new Map<string, { label: string; nodeType: string }>();
  for (const node of typedNodes) labelById.set(String(node.id), { label: String(node.label), nodeType: String(node.node_type) });
  for (const node of (relatedNodes ?? []) as unknown as Array<{ id: string; label: string; node_type: string }>) labelById.set(String(node.id), { label: String(node.label), nodeType: String(node.node_type) });

  const results = new Map<string, ContextSearchResult>(
    typedNodes.map((node) => [
      String(node.id),
      {
        node: {
          id: String(node.id),
          node_type: String(node.node_type),
          node_key: String(node.node_key),
          label: String(node.label),
          payload: node.payload ?? {},
          importance: Number(node.importance ?? 0),
          confidence: Number(node.confidence ?? 0),
          first_seen_at: node.first_seen_at ?? null,
          last_seen_at: node.last_seen_at ?? null,
        },
        relations: [],
      },
    ]),
  );

  for (const edge of edges ?? []) {
    const from = String(edge.from_node_id);
    const to = String(edge.to_node_id);
    const fromResult = results.get(from);
    const toResult = results.get(to);
    const toMeta = labelById.get(to);
    const fromMeta = labelById.get(from);

    if (fromResult && toMeta) {
      fromResult.relations.push({
        relation: String(edge.relation),
        direction: "out",
        label: toMeta.label,
        nodeType: toMeta.nodeType,
        weight: Number(edge.weight ?? 0),
        evidenceCount: Number(edge.evidence_count ?? 0),
      });
    }

    if (toResult && fromMeta) {
      toResult.relations.push({
        relation: String(edge.relation),
        direction: "in",
        label: fromMeta.label,
        nodeType: fromMeta.nodeType,
        weight: Number(edge.weight ?? 0),
        evidenceCount: Number(edge.evidence_count ?? 0),
      });
    }
  }

  return [...results.values()].map((result) => ({
    ...result,
    relations: result.relations.slice(0, 8),
  }));
}
