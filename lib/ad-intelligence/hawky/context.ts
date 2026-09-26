import "server-only";
import { createHash } from "node:crypto";
import type { CompetitorAd } from "../types";
import { createGlobalServiceClient } from "../global/supabase";

type ContextNode = {
  node_type: string;
  node_key: string;
  label: string;
  payload: Record<string, unknown>;
  importance: number;
  confidence: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
};

type ContextEdge = {
  from_key: string;
  to_key: string;
  relation: string;
  weight: number;
  evidence_count: number;
};

type StoredNode = Pick<ContextNode, "node_key" | "importance" | "confidence" | "first_seen_at" | "last_seen_at">;
type StoredNodeId = { id: string; node_key: string };
type StoredEdge = { from_node_id: string; to_node_id: string; relation: string; weight: number; evidence_count: number };

const clean = (value?: string | null) => String(value ?? "").replace(/\s+/g, " ").trim();
const norm = (value?: string | null) => clean(value).toLocaleLowerCase();
const key = (type: string, value: string) => type + ":" + createHash("sha256").update(norm(value)).digest("hex").slice(0, 32);

function opening(ad: CompetitorAd): string | null {
  const text = clean(ad.primaryText || ad.headline || ad.description);
  return text ? text.split(/[.!?।！？]/)[0]?.trim().slice(0, 120) || null : null;
}

function landingDomain(value?: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function addNode(map: Map<string, ContextNode>, node: ContextNode) {
  const current = map.get(node.node_key);
  if (!current) {
    map.set(node.node_key, node);
    return;
  }
  current.importance = Math.max(current.importance, node.importance);
  current.confidence = Math.max(current.confidence, node.confidence);
  if (!current.first_seen_at || (node.first_seen_at && node.first_seen_at < current.first_seen_at)) current.first_seen_at = node.first_seen_at;
  if (!current.last_seen_at || (node.last_seen_at && node.last_seen_at > current.last_seen_at)) current.last_seen_at = node.last_seen_at;
}

export async function upsertAdSpyContextGraph(ads: CompetitorAd[]): Promise<{ nodes: number; edges: number }> {
  if (!ads.length) return { nodes: 0, edges: 0 };

  const nodes = new Map<string, ContextNode>();
  const edges = new Map<string, ContextEdge>();
  const now = new Date().toISOString();

  const connect = (from: string, to: string, relation: string, weight = 1) => {
    const id = from + "|" + to + "|" + relation;
    const current = edges.get(id);
    if (current) {
      current.evidence_count += 1;
      current.weight = Math.max(current.weight, weight);
      return;
    }
    edges.set(id, { from_key: from, to_key: to, relation, weight, evidence_count: 1 });
  };

  for (const ad of ads.slice(0, 250)) {
    const advValue = clean(ad.advertiserId || ad.advertiserName);
    if (!advValue) continue;

    const creativeKey = key("creative", ad.platform + ":" + ad.id);
    const advertiserKey = key("advertiser", ad.platform + ":" + advValue);

    addNode(nodes, {
      node_type: "creative",
      node_key: creativeKey,
      label: clean(ad.headline || ad.advertiserName || "Creative"),
      payload: {
        platform: ad.platform,
        creativeId: ad.id,
        advertiserName: ad.advertiserName ?? null,
        creativeType: ad.creativeType ?? null,
      },
      importance: ad.isActive === false ? 0.45 : 0.7,
      confidence: ad.advertiserId ? 0.98 : 0.82,
      first_seen_at: ad.firstSeen ?? null,
      last_seen_at: ad.lastSeen ?? now,
    });

    addNode(nodes, {
      node_type: "advertiser",
      node_key: advertiserKey,
      label: clean(ad.advertiserName || advValue),
      payload: { platform: ad.platform, advertiserId: ad.advertiserId ?? null },
      importance: 0.8,
      confidence: ad.advertiserId ? 0.98 : 0.82,
      first_seen_at: ad.firstSeen ?? null,
      last_seen_at: ad.lastSeen ?? now,
    });

    connect(creativeKey, advertiserKey, "BELONGS_TO", 1);

    const relations: Array<[string, string, string, number]> = [
      ["format", clean(ad.creativeType), "USES_FORMAT", 0.9],
      ["hook", opening(ad) ?? "", "USES_HOOK", 0.78],
      ["offer", clean(ad.offer), "USES_OFFER", 0.82],
      ["creator", clean(ad.creatorName), "USES_CREATOR", 0.95],
      ["landing_domain", landingDomain(ad.landingPage) ?? "", "LANDS_ON", 0.98],
    ];

    for (const [type, label, relation, weight] of relations) {
      if (!label) continue;
      const nodeKey = key(type, label);
      addNode(nodes, {
        node_type: type,
        node_key: nodeKey,
        label,
        payload:
          type === "hook"
            ? { derivedFrom: "primary_text_or_headline" }
            : type === "creator"
              ? { partnershipType: ad.partnershipType ?? "unknown" }
              : {},
        importance: type === "format" ? 0.5 : type === "hook" ? 0.65 : type === "offer" ? 0.62 : type === "creator" ? 0.55 : 0.4,
        confidence: type === "hook" ? 0.74 : type === "offer" ? 0.82 : type === "creator" ? 0.95 : 0.99,
        first_seen_at: ad.firstSeen ?? null,
        last_seen_at: ad.lastSeen ?? now,
      });
      connect(creativeKey, nodeKey, relation, weight);
    }
  }

  const client = createGlobalServiceClient();
  const nodeKeys = [...nodes.keys()];

  // Preserve historical node state rather than overwriting it with the latest batch.
  const { data: existingNodes, error: existingNodeError } = await client
    .from("adspy_context_nodes")
    .select("node_key,importance,confidence,first_seen_at,last_seen_at")
    .in("node_key", nodeKeys);
  if (existingNodeError) throw new Error("Context node history lookup failed: " + existingNodeError.message);

  const existingByKey = new Map<string, StoredNode>(
    ((existingNodes ?? []) as unknown as StoredNode[]).map((row) => [row.node_key, row]),
  );

  for (const node of nodes.values()) {
    const old = existingByKey.get(node.node_key);
    if (!old) continue;
    node.importance = Math.max(node.importance, Number(old.importance ?? 0));
    node.confidence = Math.max(node.confidence, Number(old.confidence ?? 0));
    if (!node.first_seen_at || (old.first_seen_at && old.first_seen_at < node.first_seen_at)) node.first_seen_at = old.first_seen_at;
    if (!node.last_seen_at || (old.last_seen_at && old.last_seen_at > node.last_seen_at)) node.last_seen_at = old.last_seen_at;
  }

  const nodeRows = [...nodes.values()];
  for (let i = 0; i < nodeRows.length; i += 200) {
    const { error } = await client.from("adspy_context_nodes").upsert(nodeRows.slice(i, i + 200), { onConflict: "node_key" });
    if (error) throw new Error("Context node upsert failed: " + error.message);
  }

  const { data: stored, error: lookupError } = await client
    .from("adspy_context_nodes")
    .select("id,node_key")
    .in("node_key", nodeKeys);
  if (lookupError) throw new Error("Context node lookup failed: " + lookupError.message);

  const ids = new Map<string, string>(((stored ?? []) as unknown as StoredNodeId[]).map((row) => [row.node_key, row.id]));
  const currentEdgeRows = [...edges.values()]
    .map((edge) => ({
      from_node_id: ids.get(edge.from_key),
      to_node_id: ids.get(edge.to_key),
      relation: edge.relation,
      weight: edge.weight,
      evidence_count: edge.evidence_count,
      last_seen_at: now,
    }))
    .filter((row): row is { from_node_id: string; to_node_id: string; relation: string; weight: number; evidence_count: number; last_seen_at: string } => Boolean(row.from_node_id && row.to_node_id));

  // Accumulate evidence counts across collections instead of resetting them per batch.
  const relevantIds = new Set<string>();
  for (const row of currentEdgeRows) {
    relevantIds.add(row.from_node_id);
    relevantIds.add(row.to_node_id);
  }
  const idList = [...relevantIds];
  const { data: existingEdges, error: existingEdgeError } = idList.length
    ? await client.from("adspy_context_edges").select("from_node_id,to_node_id,relation,weight,evidence_count").or(`from_node_id.in.(${idList.join(",")}),to_node_id.in.(${idList.join(",")})`)
    : { data: [], error: null };
  if (existingEdgeError) throw new Error("Context edge history lookup failed: " + existingEdgeError.message);

  const existingEdgeMap = new Map<string, StoredEdge>();
  for (const row of (existingEdges ?? []) as unknown as StoredEdge[]) {
    existingEdgeMap.set(row.from_node_id + "|" + row.to_node_id + "|" + row.relation, row);
  }

  for (const row of currentEdgeRows) {
    const identity = row.from_node_id + "|" + row.to_node_id + "|" + row.relation;
    const previous = existingEdgeMap.get(identity);
    if (previous) {
      row.evidence_count += Number(previous.evidence_count ?? 0);
      row.weight = Math.max(row.weight, Number(previous.weight ?? 0));
    }
  }

  for (let i = 0; i < currentEdgeRows.length; i += 300) {
    const { error } = await client.from("adspy_context_edges").upsert(currentEdgeRows.slice(i, i + 300), { onConflict: "from_node_id,to_node_id,relation" });
    if (error) throw new Error("Context edge upsert failed: " + error.message);
  }

  return { nodes: nodeRows.length, edges: currentEdgeRows.length };
}
