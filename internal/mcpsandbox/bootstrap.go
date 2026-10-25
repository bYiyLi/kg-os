package mcpsandbox

const driverScript = `(() => {
  'use strict';
  const parse = JSON.parse.bind(JSON), stringify = JSON.stringify.bind(JSON);
  const keys = Reflect.ownKeys.bind(Reflect), descriptors = Object.getOwnPropertyDescriptors.bind(Object);
  const prototype = Object.getPrototypeOf.bind(Object), isArray = Array.isArray.bind(Array);
  const isFinite = Number.isFinite.bind(Number), create = Object.create.bind(Object), NativeError = Error;
  const stringSlice = Function.prototype.call.bind(String.prototype.slice);
  const plain = Object.prototype, arrayProto = Array.prototype;
  Object.freeze(plain); Object.freeze(arrayProto);
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const queue = [], pending = new Map();
  // Keep the host error receipt separate from mutable errors visible to scripts.
  const publicErrors = new WeakMap();
  const publicErrorGet = publicErrors.get.bind(publicErrors), publicErrorSet = publicErrors.set.bind(publicErrors);
  let next = 0, started = false, state = { done: false };
  const call = (method, ...args) => {
    // Serialize inside the guest: Go never receives JS objects, functions, or host handles.
    const params = stringify(args);
    if (typeof params !== 'string') throw new TypeError('SDK arguments must be JSON-compatible');
    return new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, {resolve, reject});
      queue.push({id, method, params});
    });
  };
  const stream = async function* (method, request) {
    const {streamId} = await call('stream-open', method, request);
    try {
      for (;;) {
        const next = await call('stream-next', streamId);
        if (next.done) return;
        yield next.value;
      }
    } finally {
      await call('stream-return', streamId);
    }
  };
  const freeze = Object.freeze;
  globalThis.ontology = freeze({
    read: (req) => call('ontology.read', req), patch: (req) => call('ontology.patch', req)
  });
  globalThis.object = freeze({
    read: (req) => call('object.read', req), readText: (req) => call('object.readText', req),
    patch: (req) => call('object.patch', req)
  });
  globalThis.graph = freeze({
    query: (req) => call('graph.query', req), execute: (req) => call('graph.execute', req),
    streamQuery: (req) => stream('graph.streamQuery', req),
    streamExecute: (req) => stream('graph.streamExecute', req)
  });
  globalThis.evolution = freeze({
    overview: () => call('evolution.overview'), get: (req) => call('evolution.get', req),
    ancestry: (req) => call('evolution.ancestry', req), history: (req) => call('evolution.history', req),
    diff: (req) => call('evolution.diff', req),
    state: freeze({
      create: (req) => call('evolution.state.create', req),
      setData: (req) => call('evolution.state.setData', req),
      clearData: (req) => call('evolution.state.clearData', req)
    }),
    branch: freeze({
      list: () => call('evolution.branch.list'),
      create: (req) => call('evolution.branch.create', req),
      delete: (req) => call('evolution.branch.delete', req)
    }),
    tag: freeze({
      list: () => call('evolution.tag.list'),
      create: (req) => call('evolution.tag.create', req),
      move: (req) => call('evolution.tag.move', req),
      delete: (req) => call('evolution.tag.delete', req)
    }),
    merge: freeze({
      list: (req) => call('evolution.merge.list', req ?? {}),
      get: (req) => call('evolution.merge.get', req),
      conflicts: (req) => call('evolution.merge.conflicts', req),
      start: (req) => call('evolution.merge.start', req),
      resolve: (req) => call('evolution.merge.resolve', req),
      finalize: (req) => call('evolution.merge.finalize', req),
      abort: (req) => call('evolution.merge.abort', req)
    })
  });
  const check = (v, stack = new Set(), depth = 0) => {
    if (depth > 64) throw new TypeError('JSON depth exceeded');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v !== 'object') throw new TypeError('Script result is not JSON-compatible');
    if (stack.has(v)) throw new TypeError('Circular reference');
    const array = isArray(v), proto = prototype(v);
    if (array ? proto !== arrayProto : proto !== plain && proto !== null)
      throw new TypeError('Script result must be a plain object');
    stack.add(v);
    // Serialize a descriptor snapshot, never the guest object's getters or hooks.
    const entries = descriptors(v), names = keys(entries), result = array ? [] : create(null);
    const length = array ? entries.length.value : 0;
    let count = 0;
    for (let position = 0; position < names.length; position++) {
      const name = names[position];
      if (typeof name !== 'string' || name === 'toJSON' || name === '__proto__')
        throw new TypeError('Unsupported result property');
      if (array && name === 'length') continue;
      const entry = entries[name];
      if (!entry || !('value' in entry)) throw new TypeError('Accessors not supported');
      if (array) {
        const index = +name;
        if (index < 0 || index >= length || index % 1 !== 0 || ''+index !== name)
          throw new TypeError('Unsupported array property');
        count++;
      } else if (!entry.enumerable) throw new TypeError('Non-enumerable result properties not supported');
      result[name] = check(entry.value, stack, depth+1);
    }
    if (array && count !== length)
      throw new TypeError('Sparse arrays not supported');
    stack.delete(v);
    return result;
  };
  const failure = (error) => {
    const publicError = publicErrorGet(error);
    let message = 'Script threw non-Error value';
    try {
      if (publicError) message = publicError.message;
      else if (error instanceof NativeError && typeof error.message === 'string') message = error.message;
    } catch(_) {}
    state = { done:true, ok:false, code:publicError ? publicError.code : 'SCRIPT_ERROR', message:stringSlice(message,0,1024) };
    if (publicError && publicError.detailsJSON) {
      try { state.details=check(parse(publicError.detailsJSON)); } catch(_) {}
    }
  };
  return freeze({
    start(code) {
      if (started) throw new Error('Invocation already started');
      started = true;
      try {
        const fn = new AsyncFunction(code);
        Promise.resolve(fn()).then(value => {
          try { state = {done:true, ok:true, result:check(value)}; }
          catch(err) { failure(err); }
        }, failure);
      } catch(error) { failure(error); }
      return '{}';
    },
    drain() { return stringify(queue.splice(0,32)); },
    deliver(idString, resultJSON, code, message, detailsJSON) {
      const id = Number(idString), p = pending.get(id);
      if (!p) return 'false';
      pending.delete(id);
      if (code) {
        const e = new NativeError(message || 'SDK operation failed');
        e.code = code;
        if (detailsJSON) e.details = parse(detailsJSON);
        publicErrorSet(e, {code, message:message || 'SDK operation failed', detailsJSON});
        p.reject(e);
      } else p.resolve(parse(resultJSON));
      return 'true';
    },
    status() { return stringify(state); }
  });
})()`
