import "server-only";

export function getMetaGraphVersion() {
  const version = process.env.META_GRAPH_VERSION?.trim();
  if (!version) throw new Error("Missing META_GRAPH_VERSION.");
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("Invalid META_GRAPH_VERSION.");
  return version;
}
