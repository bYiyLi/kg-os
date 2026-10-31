export const SEARCH_LIMIT = 50;
export const RECENT_LIMIT = 200;
export const INDEX_LIMIT = 16;
export const NEIGHBOR_LIMIT = 25;
export const RELATED_ROWS_LIMIT = 600;

// Element identities are allocation-order surrogates, not knowledge timestamps.
// Decimal lengths are ordered first so n:99 never sorts after n:100.
export const recentQuery = `MATCH (n)
WHERE NOT n:__kgos_internal
RETURN n ORDER BY size(elementId(n)) DESC, elementId(n) DESC LIMIT $limit`;

export const keywordQuery = `MATCH (n)
WHERE NOT n:__kgos_internal
  AND any(key IN keys(n) WHERE CASE WHEN n[key] IS :: STRING
    THEN toLower(n[key]) CONTAINS toLower($query) ELSE false END)
RETURN n ORDER BY elementId(n) LIMIT $limit`;

export const indexQuery = `SHOW ALL INDEXES YIELD name,type,entityType,labelsOrTypes
WHERE entityType='NODE' AND type=$type
RETURN name,type,labelsOrTypes ORDER BY name LIMIT ${String(INDEX_LIMIT + 1)}`;

export const fulltextQuery = `CALL db.index.fulltext.queryNodes($index,$query,{limit:$limit})
YIELD node,score WHERE NOT node:__kgos_internal
RETURN node,score ORDER BY score DESC,elementId(node) LIMIT $limit`;

export const semanticQuery = `CALL db.index.semantic.queryNodes($index,$query,{limit:$limit})
YIELD node,score WHERE NOT node:__kgos_internal
RETURN node,score ORDER BY score DESC,elementId(node) LIMIT $limit`;

// One graph request per index family, rather than one HTTP request per index.
// UNWIND invokes each index's own Top-K before combining its scored rows.
export const fulltextBatchQuery = `UNWIND $indexes AS indexName
CALL db.index.fulltext.queryNodes(indexName,$query,{limit:$limit})
YIELD node,score WHERE NOT node:__kgos_internal
RETURN indexName,node,score ORDER BY indexName,score DESC,elementId(node)`;

export const semanticBatchQuery = `UNWIND $indexes AS indexName
CALL db.index.semantic.queryNodes(indexName,$query,{limit:$limit})
YIELD node,score WHERE NOT node:__kgos_internal
RETURN indexName,node,score ORDER BY indexName,score DESC,elementId(node)`;

// Bound each source's fan-out inside one Cypher query, not one HTTP call per
// candidate. rank preserves the current relevance order of the frontier.
export const relatedQuery = `UNWIND $seeds AS seed
CALL (seed) {
  MATCH (n)-[r]-(m)
  WHERE elementId(n)=seed.id AND NOT n:__kgos_internal AND NOT m:__kgos_internal
  RETURN n,r,m ORDER BY elementId(r) LIMIT $perSeed
}
RETURN n,r,m,seed.rank AS priority ORDER BY priority,elementId(r) LIMIT $limit`;

export const neighborQuery = `MATCH (n)-[r]-(m)
WHERE elementId(n)=$id AND NOT n:__kgos_internal AND NOT m:__kgos_internal
RETURN n,r,m ORDER BY elementId(r),elementId(m) LIMIT $limit`;

export const connectQuery = `MATCH (a)-[r]->(b)
WHERE elementId(a) IN $ids AND elementId(b) IN $ids
  AND NOT a:__kgos_internal AND NOT b:__kgos_internal
RETURN a,r,b ORDER BY elementId(r) LIMIT $limit`;
