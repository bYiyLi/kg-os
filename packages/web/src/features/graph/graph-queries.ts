export const SEARCH_LIMIT = 50;
export const INDEX_LIMIT = 16;
export const NEIGHBOR_LIMIT = 25;

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

export const neighborQuery = `MATCH (n)-[r]-(m)
WHERE elementId(n)=$id AND NOT n:__kgos_internal AND NOT m:__kgos_internal
RETURN n,r,m ORDER BY elementId(r),elementId(m) LIMIT $limit`;

export const connectQuery = `MATCH (a)-[r]->(b)
WHERE elementId(a) IN $ids AND elementId(b) IN $ids
  AND NOT a:__kgos_internal AND NOT b:__kgos_internal
RETURN a,r,b ORDER BY elementId(r) LIMIT $limit`;
