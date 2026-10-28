export const DOMAIN_TITLE = "Work";

export function mockDomainResponse(target: string, init?: RequestInit): object {
  if (typeof init?.body !== "string") throw new Error("Missing public Domain read request");
  const request = JSON.parse(init.body) as { at: string; refs?: string[] };
  if (target.includes("/ontology/read"))
    return {
      state: request.at,
      results: [
        {
          kind: "overview",
          items: [
            { kind: "domain", ref: "domain:Work", name: DOMAIN_TITLE },
            { kind: "domain", ref: "domain:Projects", name: "Projects" }
          ],
          total: 2,
          markdown: ""
        }
      ]
    };
  return {
    state: request.at,
    results: (request.refs ?? []).map((ref) => ({
      kind: "domain",
      ref,
      value: { name: ref.slice(7), includes: ref === "domain:Work" ? ["domain:Projects"] : [] }
    }))
  };
}
