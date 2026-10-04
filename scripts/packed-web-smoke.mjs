import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const expectedBootHeader = "X-KGOS-Expected-Daemon-Boot";

function timedFetch(input, init) {
  return fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) });
}

function guardedFetch(boot) {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set(expectedBootHeader, boot);
    return timedFetch(input, { ...init, headers });
  };
}

async function assertEmbeddedApplication(endpoint, token) {
  const response = await timedFetch(endpoint + "/");
  assert.equal(response.status, 200, "packed daemon must serve its embedded index");
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  const html = await response.text();
  assert.match(html, /id=["']app["']/);
  assert.equal(html.includes("@vite/client"), false, "packed Web must use production assets");
  const assets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(
    (match) => match[1]
  );
  assert(
    assets.some((path) => path.endsWith(".js")),
    "packed index must reference built JS"
  );
  assert(
    assets.some((path) => path.endsWith(".css")),
    "packed index must reference built CSS"
  );
  const sources = await Promise.all(
    [...new Set(assets)].map(async (path) => {
      const url = new URL(path, endpoint);
      assert.equal(url.origin, new URL(endpoint).origin);
      const asset = await timedFetch(url);
      assert.equal(asset.status, 200, "packed embedded asset must be served: " + path);
      const source = await asset.text();
      assert.equal(source.includes(token), false, "embedded assets must not contain credentials");
      if (path.endsWith(".js")) {
        assert.match(asset.headers.get("content-type") ?? "", /javascript|ecmascript/);
        return source;
      }
      assert.match(asset.headers.get("content-type") ?? "", /text\/css/);
      return "";
    })
  );
  const application = sources.join("\n");
  for (const feature of [
    "/api/v1/web/data/info",
    "/api/v1/web/data/save",
    "/api/v1/web/cache/read",
    "/api/v1/graph/query",
    "/api/v1/object/patch",
    "/api/v1/evolution/merge/finalize",
    expectedBootHeader
  ]) {
    assert(application.includes(feature), "packed Web application is missing " + feature);
  }
}

export async function verifyPackedWebSmoke({
  smokeRoot,
  rootA,
  rootB,
  locatorA,
  locatorB,
  tokenA,
  tokenB
}) {
  // Import the installed tarball, not workspace sources or a development alias.
  const consumer = resolve(smokeRoot, "phase14-sdk-consumer.mjs");
  await writeFile(consumer, 'export { KGOSClient, KGOSDaemonError } from "@kgos/sdk";\n');
  const { KGOSClient, KGOSDaemonError } = await import(pathToFileURL(consumer).href);
  const client = (endpoint, token, boot) =>
    new KGOSClient({
      endpoint,
      token,
      fetch: boot === undefined ? timedFetch : guardedFetch(boot)
    });
  async function expectFailure(operation, code, status) {
    await assert.rejects(operation, (error) => {
      assert(error instanceof KGOSDaemonError, "packed SDK must decode daemon public errors");
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      return true;
    });
  }
  async function assertBootGuard(endpoint, token, rejectedBoot) {
    const current = client(endpoint, token);
    const before = await current.evolution.overview();
    const stale = client(endpoint, token, rejectedBoot);
    await expectFailure(
      () => stale.graph.execute({ branch: "main", cypher: "CREATE (:Phase14MustNotExecute)" }),
      "WEB_CONNECTION_CHANGED",
      409
    );
    await expectFailure(
      () => stale.evolution.state.create({ branch: "main", message: "must not execute" }),
      "WEB_CONNECTION_CHANGED",
      409
    );
    await expectFailure(() => stale.web.data.info(), "WEB_CONNECTION_CHANGED", 409);
    assert.equal((await current.evolution.overview()).state, before.state);
  }

  const webRoot = resolve(rootA, ".kgos", "web");
  await assert.rejects(stat(webRoot), { code: "ENOENT" });
  await assert.rejects(stat(resolve(rootB, ".kgos", "web")), { code: "ENOENT" });
  await assertEmbeddedApplication(locatorA.endpoint, tokenA);
  await expectFailure(
    () => client(locatorA.endpoint, randomUUID(), randomUUID()).web.data.info(),
    "AUTHENTICATION_FAILED",
    401
  );
  await assert.rejects(stat(webRoot), { code: "ENOENT" });

  const initial = client(locatorA.endpoint, tokenA);
  const before = await initial.evolution.overview();
  const info = await initial.web.data.info();
  const other = client(locatorB.endpoint, tokenB);
  const infoB = await other.web.data.info();
  assert.equal(info.storageStatus, "ready");
  assert.equal(infoB.storageStatus, "ready");
  assert.equal(info.formatVersion, 1);
  assert.equal(info.bindingStatus, "matched");
  assert.equal(info.databaseId, info.currentDatabaseId);
  assert.match(info.daemonBootId, /^[0-9a-f-]{36}$/);
  assert.notEqual(info.daemonBootId, infoB.daemonBootId);
  assert.notEqual(info.storeId, infoB.storeId);
  assert.notEqual(info.databaseId, infoB.databaseId);
  assert(Object.values(info.usage).every((value) => Number.isSafeInteger(value) && value >= 0));
  const current = client(locatorA.endpoint, tokenA, info.daemonBootId);
  await assertBootGuard(locatorA.endpoint, tokenA, randomUUID());

  const key = { storeId: info.storeId, kind: "editor", id: randomUUID() };
  const data = { version: 1, statement: "RETURN (", paramsText: "{\nunfinished" };
  const saved = await current.web.data.save({
    ...key,
    expectedRevision: null,
    mutationId: randomUUID(),
    data
  });
  assert.equal(saved.revision, "1");
  assert.equal(saved.deleted, false);
  assert.deepEqual((await current.web.data.read(key)).data, data);
  await expectFailure(() => other.web.data.read(key), "WEB_DATA_CHANGED", 409);
  await expectFailure(
    () => other.web.data.read({ ...key, storeId: infoB.storeId }),
    "WEB_DATA_NOT_FOUND",
    404
  );

  const deletedText = "phase14-deleted-body-" + randomUUID();
  const secondKey = { ...key, id: randomUUID() };
  const second = await current.web.data.save({
    ...secondKey,
    expectedRevision: null,
    mutationId: randomUUID(),
    data: { version: 1, statement: deletedText }
  });
  const firstPage = await current.web.data.list({
    storeId: info.storeId,
    kind: "editor",
    limit: 1
  });
  assert.equal(firstPage.items.length, 1);
  assert.equal(typeof firstPage.cursor, "string");
  assert.equal("data" in firstPage.items[0], false);

  const updated = await current.web.data.save({
    ...key,
    expectedRevision: saved.revision,
    mutationId: randomUUID(),
    data: { ...data, statement: "RETURN $value" }
  });
  assert.equal(updated.revision, "2");
  await expectFailure(
    () =>
      current.web.data.save({
        ...key,
        expectedRevision: saved.revision,
        mutationId: randomUUID(),
        data
      }),
    "WEB_DATA_CHANGED",
    409
  );
  const contestants = await Promise.allSettled(
    ["a", "b"].map((candidate) =>
      current.web.data.save({
        ...key,
        expectedRevision: updated.revision,
        mutationId: randomUUID(),
        data: { ...data, statement: "phase14-confirmed-cas-" + candidate }
      })
    )
  );
  assert.equal(contestants.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = contestants.find((result) => result.status === "rejected");
  assert(rejected.reason instanceof KGOSDaemonError);
  assert.equal(rejected.reason.code, "WEB_DATA_CHANGED");
  const confirmed = await current.web.data.read(key);
  const winner = contestants.find((result) => result.status === "fulfilled").value;
  assert.equal(confirmed.revision, "3");
  assert.deepEqual(confirmed, winner);
  const pageRequest = { storeId: info.storeId, kind: "editor", limit: 1, cursor: firstPage.cursor };
  const lastPage = await current.web.data.list(pageRequest);
  assert.deepEqual(await current.web.data.list(pageRequest), lastPage);
  assert.equal(lastPage.cursor, undefined);
  const snapshot = [...firstPage.items, ...lastPage.items];
  assert.deepEqual(new Set(snapshot.map((item) => item.id)), new Set([key.id, secondKey.id]));
  assert(snapshot.every((item) => item.revision === "1" && !item.deleted));

  const tombstone = await current.web.data.delete({
    ...secondKey,
    expectedRevision: second.revision,
    mutationId: randomUUID()
  });
  assert.equal(tombstone.revision, "2");
  assert.equal(tombstone.deleted, true);
  assert.equal(tombstone.data, null);
  assert.deepEqual(await current.web.data.read(secondKey), tombstone);
  await expectFailure(
    () =>
      current.web.data.save({
        ...secondKey,
        expectedRevision: null,
        mutationId: randomUUID(),
        data
      }),
    "WEB_DATA_CHANGED",
    409
  );

  const statement =
    "RETURN 9223372036854775807 AS big, $map AS businessMap, " +
    "vector([1.0,0.0],2,FLOAT64) AS vector, 9007199254740992.0 AS largeFloat, " +
    "-0.0 AS negativeZero";
  const params = { map: { $type: "Map", entries: { $type: "business", key: "v" } } };
  const query = await current.graph.query({ at: before.state, cypher: statement, params });
  assert.equal(query.state, before.state);
  assert.equal(query.rows.length, 1);
  assert.deepEqual(query.rows[0][0], { $type: "Integer", value: "9223372036854775807" });
  assert.deepEqual(query.rows[0][1], params.map);
  assert.equal(query.rows[0][2].$type, "Vector");
  assert.equal(query.rows[0][3], 9007199254740992);
  assert(Object.is(query.rows[0][4], -0));
  const frameKey = { storeId: info.storeId, kind: "frame", id: randomUUID() };
  const frameData = {
    version: 1,
    mode: "query",
    statement,
    params,
    readState: query.state,
    resultState: query.state,
    status: "complete",
    closed: false
  };
  const frame = await current.web.data.save({
    ...frameKey,
    expectedRevision: null,
    mutationId: randomUUID(),
    data: frameData
  });
  const cacheKey = { storeId: info.storeId, frameId: frame.id };
  const cache = {
    ...cacheKey,
    frameRevision: frame.revision,
    result: { ...query, valueEncoding: "lithograph-json-v1" }
  };
  assert.deepEqual(await current.web.cache.read(cacheKey), { hit: false });
  assert.deepEqual(await current.web.cache.write(cache), { stored: true });
  const restored = await current.web.cache.read(cacheKey);
  assert.equal(restored.hit, true);
  assert.deepEqual(restored.result, cache.result);
  await expectFailure(
    () =>
      current.web.cache.write({
        ...cache,
        result: {
          ...cache.result,
          rows: [[{ $type: "Integer", value: 7 }, ...query.rows[0].slice(1)]]
        }
      }),
    "INVALID_ARGUMENT",
    400
  );
  const viewport = await current.web.data.save({
    ...frameKey,
    expectedRevision: frame.revision,
    mutationId: randomUUID(),
    data: { ...frameData, viewport: { x: 1, y: 2 } }
  });
  assert.equal((await current.web.cache.read(cacheKey)).hit, true);
  await expectFailure(() => current.web.cache.write(cache), "WEB_DATA_CHANGED", 409);
  assert.deepEqual(await current.web.cache.clear({ storeId: info.storeId }), { cleared: 1 });
  assert.deepEqual(await current.web.cache.read(cacheKey), { hit: false });
  const latestCache = { ...cache, frameRevision: viewport.revision };
  assert.deepEqual(await current.web.cache.write(latestCache), { stored: true });
  const deletedFrame = await current.web.data.delete({
    ...frameKey,
    expectedRevision: viewport.revision,
    mutationId: randomUUID()
  });
  assert.equal(deletedFrame.data, null);
  assert.deepEqual(await current.web.cache.read(cacheKey), { hit: false });
  await expectFailure(() => current.web.cache.write(latestCache), "WEB_DATA_CHANGED", 409);

  const exported = await current.web.data.export();
  assert(exported instanceof Blob, "packed SDK export must return a Web Platform Blob");
  assert.equal(exported.type, "application/vnd.sqlite3");
  const bytes = Buffer.from(await exported.arrayBuffer());
  assert.equal(bytes.subarray(0, 16).toString("utf8"), "SQLite format 3\u0000");
  assert(bytes.includes(Buffer.from(confirmed.data.statement)));
  assert.equal(
    bytes.includes(Buffer.from(deletedText)),
    false,
    "compact export must remove deleted bodies"
  );
  assert.equal(bytes.includes(Buffer.from(tokenA)), false, "export must not include credentials");
  assert.equal((await current.evolution.overview()).state, before.state);
  assert.equal(
    (await readdir(webRoot)).some((name) => name.startsWith(".ui-export-")),
    false
  );
  if (process.platform !== "win32") {
    for (const [path, mode] of [
      [webRoot, 0o700],
      [resolve(webRoot, "cache"), 0o700],
      ...["ui.db", "ui.db-wal", "ui.db-shm"].map((name) => [resolve(webRoot, name), 0o600])
    ]) {
      assert.equal((await stat(path)).mode & 0o777, mode, "packed Web storage must be private");
    }
  }
  process.stdout.write("Packed SDK Web CRUD/CAS/cache/export/guard and embedded assets passed\n");
  return async (endpoint) => {
    const restarted = client(endpoint, tokenA);
    const restartInfo = await restarted.web.data.info();
    assert.notEqual(restartInfo.daemonBootId, info.daemonBootId);
    assert.equal(restartInfo.storeId, info.storeId);
    assert.equal(restartInfo.databaseId, info.databaseId);
    assert.deepEqual(await restarted.web.data.read(key), confirmed);
    assert.deepEqual(await restarted.web.data.read(frameKey), deletedFrame);
    await assertBootGuard(endpoint, tokenA, info.daemonBootId);
    process.stdout.write("Packed SDK Web restart recovery and previous-boot guard passed\n");
  };
}
