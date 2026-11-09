// experiments/lpc-clothing-demo/node_modules/neverthrow/dist/index.es.js
var defaultErrorConfig = {
  withStackTrace: false
};
var createNeverThrowError = (message, result, config = defaultErrorConfig) => {
  const data = result.isOk() ? { type: "Ok", value: result.value } : { type: "Err", value: result.error };
  const maybeStack = config.withStackTrace ? new Error().stack : void 0;
  return {
    data,
    message,
    stack: maybeStack
  };
};
function __awaiter(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
function __values(o) {
  var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
  if (m) return m.call(o);
  if (o && typeof o.length === "number") return {
    next: function() {
      if (o && i >= o.length) o = void 0;
      return { value: o && o[i++], done: !o };
    }
  };
  throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __await(v) {
  return this instanceof __await ? (this.v = v, this) : new __await(v);
}
function __asyncGenerator(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g = generator.apply(thisArg, _arguments || []), i, q = [];
  return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function() {
    return this;
  }, i;
  function awaitReturn(f) {
    return function(v) {
      return Promise.resolve(v).then(f, reject);
    };
  }
  function verb(n, f) {
    if (g[n]) {
      i[n] = function(v) {
        return new Promise(function(a, b) {
          q.push([n, v, a, b]) > 1 || resume(n, v);
        });
      };
      if (f) i[n] = f(i[n]);
    }
  }
  function resume(n, v) {
    try {
      step(g[n](v));
    } catch (e) {
      settle(q[0][3], e);
    }
  }
  function step(r) {
    r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f, v) {
    if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]);
  }
}
function __asyncDelegator(o) {
  var i, p;
  return i = {}, verb("next"), verb("throw", function(e) {
    throw e;
  }), verb("return"), i[Symbol.iterator] = function() {
    return this;
  }, i;
  function verb(n, f) {
    i[n] = o[n] ? function(v) {
      return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v;
    } : f;
  }
}
function __asyncValues(o) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m = o[Symbol.asyncIterator], i;
  return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
    return this;
  }, i);
  function verb(n) {
    i[n] = o[n] && function(v) {
      return new Promise(function(resolve, reject) {
        v = o[n](v), settle(resolve, reject, v.done, v.value);
      });
    };
  }
  function settle(resolve, reject, d, v) {
    Promise.resolve(v).then(function(v2) {
      resolve({ value: v2, done: d });
    }, reject);
  }
}
var ResultAsync = class _ResultAsync {
  constructor(res) {
    this._promise = res;
  }
  static fromSafePromise(promise) {
    const newPromise = promise.then((value) => new Ok(value));
    return new _ResultAsync(newPromise);
  }
  static fromPromise(promise, errorFn) {
    const newPromise = promise.then((value) => new Ok(value)).catch((e) => new Err(errorFn(e)));
    return new _ResultAsync(newPromise);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromThrowable(fn, errorFn) {
    return (...args) => {
      return new _ResultAsync((() => __awaiter(this, void 0, void 0, function* () {
        try {
          return new Ok(yield fn(...args));
        } catch (error) {
          return new Err(errorFn ? errorFn(error) : error);
        }
      }))());
    };
  }
  static combine(asyncResultList) {
    return combineResultAsyncList(asyncResultList);
  }
  static combineWithAllErrors(asyncResultList) {
    return combineResultAsyncListWithAllErrors(asyncResultList);
  }
  map(f) {
    return new _ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
      if (res.isErr()) {
        return new Err(res.error);
      }
      return new Ok(yield f(res.value));
    })));
  }
  andThrough(f) {
    return new _ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
      if (res.isErr()) {
        return new Err(res.error);
      }
      const newRes = yield f(res.value);
      if (newRes.isErr()) {
        return new Err(newRes.error);
      }
      return new Ok(res.value);
    })));
  }
  andTee(f) {
    return new _ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
      if (res.isErr()) {
        return new Err(res.error);
      }
      try {
        yield f(res.value);
      } catch (e) {
      }
      return new Ok(res.value);
    })));
  }
  orTee(f) {
    return new _ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
      if (res.isOk()) {
        return new Ok(res.value);
      }
      try {
        yield f(res.error);
      } catch (e) {
      }
      return new Err(res.error);
    })));
  }
  mapErr(f) {
    return new _ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
      if (res.isOk()) {
        return new Ok(res.value);
      }
      return new Err(yield f(res.error));
    })));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  andThen(f) {
    return new _ResultAsync(this._promise.then((res) => {
      if (res.isErr()) {
        return new Err(res.error);
      }
      const newValue = f(res.value);
      return newValue instanceof _ResultAsync ? newValue._promise : newValue;
    }));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  orElse(f) {
    return new _ResultAsync(this._promise.then((res) => __awaiter(this, void 0, void 0, function* () {
      if (res.isErr()) {
        return f(res.error);
      }
      return new Ok(res.value);
    })));
  }
  match(ok2, _err) {
    return this._promise.then((res) => res.match(ok2, _err));
  }
  unwrapOr(t) {
    return this._promise.then((res) => res.unwrapOr(t));
  }
  /**
   * @deprecated will be removed in 9.0.0.
   *
   * You can use `safeTry` without this method.
   * @example
   * ```typescript
   * safeTry(async function* () {
   *   const okValue = yield* yourResult
   * })
   * ```
   * Emulates Rust's `?` operator in `safeTry`'s body. See also `safeTry`.
   */
  safeUnwrap() {
    return __asyncGenerator(this, arguments, function* safeUnwrap_1() {
      return yield __await(yield __await(yield* __asyncDelegator(__asyncValues(yield __await(this._promise.then((res) => res.safeUnwrap()))))));
    });
  }
  // Makes ResultAsync implement PromiseLike<Result>
  then(successCallback, failureCallback) {
    return this._promise.then(successCallback, failureCallback);
  }
  [Symbol.asyncIterator]() {
    return __asyncGenerator(this, arguments, function* _a() {
      const result = yield __await(this._promise);
      if (result.isErr()) {
        yield yield __await(errAsync(result.error));
      }
      return yield __await(result.value);
    });
  }
};
function errAsync(err2) {
  return new ResultAsync(Promise.resolve(new Err(err2)));
}
var fromPromise = ResultAsync.fromPromise;
var fromSafePromise = ResultAsync.fromSafePromise;
var fromAsyncThrowable = ResultAsync.fromThrowable;
var combineResultList = (resultList) => {
  let acc = ok([]);
  for (const result of resultList) {
    if (result.isErr()) {
      acc = err(result.error);
      break;
    } else {
      acc.map((list) => list.push(result.value));
    }
  }
  return acc;
};
var combineResultAsyncList = (asyncResultList) => ResultAsync.fromSafePromise(Promise.all(asyncResultList)).andThen(combineResultList);
var combineResultListWithAllErrors = (resultList) => {
  let acc = ok([]);
  for (const result of resultList) {
    if (result.isErr() && acc.isErr()) {
      acc.error.push(result.error);
    } else if (result.isErr() && acc.isOk()) {
      acc = err([result.error]);
    } else if (result.isOk() && acc.isOk()) {
      acc.value.push(result.value);
    }
  }
  return acc;
};
var combineResultAsyncListWithAllErrors = (asyncResultList) => ResultAsync.fromSafePromise(Promise.all(asyncResultList)).andThen(combineResultListWithAllErrors);
var Result;
(function(Result2) {
  function fromThrowable2(fn, errorFn) {
    return (...args) => {
      try {
        const result = fn(...args);
        return ok(result);
      } catch (e) {
        return err(errorFn ? errorFn(e) : e);
      }
    };
  }
  Result2.fromThrowable = fromThrowable2;
  function combine(resultList) {
    return combineResultList(resultList);
  }
  Result2.combine = combine;
  function combineWithAllErrors(resultList) {
    return combineResultListWithAllErrors(resultList);
  }
  Result2.combineWithAllErrors = combineWithAllErrors;
})(Result || (Result = {}));
function ok(value) {
  return new Ok(value);
}
function err(err2) {
  return new Err(err2);
}
var Ok = class {
  constructor(value) {
    this.value = value;
  }
  isOk() {
    return true;
  }
  isErr() {
    return !this.isOk();
  }
  map(f) {
    return ok(f(this.value));
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  mapErr(_f) {
    return ok(this.value);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  andThen(f) {
    return f(this.value);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  andThrough(f) {
    return f(this.value).map((_value) => this.value);
  }
  andTee(f) {
    try {
      f(this.value);
    } catch (e) {
    }
    return ok(this.value);
  }
  orTee(_f) {
    return ok(this.value);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  orElse(_f) {
    return ok(this.value);
  }
  asyncAndThen(f) {
    return f(this.value);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  asyncAndThrough(f) {
    return f(this.value).map(() => this.value);
  }
  asyncMap(f) {
    return ResultAsync.fromSafePromise(f(this.value));
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  unwrapOr(_v) {
    return this.value;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  match(ok2, _err) {
    return ok2(this.value);
  }
  safeUnwrap() {
    const value = this.value;
    return (function* () {
      return value;
    })();
  }
  _unsafeUnwrap(_) {
    return this.value;
  }
  _unsafeUnwrapErr(config) {
    throw createNeverThrowError("Called `_unsafeUnwrapErr` on an Ok", this, config);
  }
  // eslint-disable-next-line @typescript-eslint/no-this-alias, require-yield
  *[Symbol.iterator]() {
    return this.value;
  }
};
var Err = class {
  constructor(error) {
    this.error = error;
  }
  isOk() {
    return false;
  }
  isErr() {
    return !this.isOk();
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  map(_f) {
    return err(this.error);
  }
  mapErr(f) {
    return err(f(this.error));
  }
  andThrough(_f) {
    return err(this.error);
  }
  andTee(_f) {
    return err(this.error);
  }
  orTee(f) {
    try {
      f(this.error);
    } catch (e) {
    }
    return err(this.error);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  andThen(_f) {
    return err(this.error);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  orElse(f) {
    return f(this.error);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  asyncAndThen(_f) {
    return errAsync(this.error);
  }
  asyncAndThrough(_f) {
    return errAsync(this.error);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  asyncMap(_f) {
    return errAsync(this.error);
  }
  unwrapOr(v) {
    return v;
  }
  match(_ok, err2) {
    return err2(this.error);
  }
  safeUnwrap() {
    const error = this.error;
    return (function* () {
      yield err(error);
      throw new Error("Do not use this generator out of `safeTry`");
    })();
  }
  _unsafeUnwrap(config) {
    throw createNeverThrowError("Called `_unsafeUnwrap` on an Err", this, config);
  }
  _unsafeUnwrapErr(_) {
    return this.error;
  }
  *[Symbol.iterator]() {
    const self = this;
    yield self;
    return self;
  }
};
var fromThrowable = Result.fromThrowable;

// vendor/lpc/full-catalog/custom-animations.ts
var animationRowsLayout = {
  "thrust-n": 3,
  "thrust-w": 4,
  "thrust-s": 5,
  "thrust-e": 6,
  "walk-n": 7,
  "walk-w": 8,
  "walk-s": 9,
  "walk-e": 10,
  "slash-n": 11,
  "slash-w": 12,
  "slash-s": 13,
  "slash-e": 14,
  "backslash-n": 45,
  "backslash-w": 46,
  "backslash-s": 47,
  "backslash-e": 48,
  "halfslash-n": 49,
  "halfslash-w": 50,
  "halfslash-s": 51,
  "halfslash-e": 52,
  "sit-n": 29,
  "sit-w": 30,
  "sit-s": 31,
  "sit-e": 32
};
var customAnimations = {
  wheelchair: {
    frameSize: 64,
    frames: [
      ["sit-n,2", "sit-n,2"],
      ["sit-w,2", "sit-w,2"],
      ["sit-s,2", "sit-s,2"],
      ["sit-e,2", "sit-e,2"]
    ]
  },
  tool_rod: {
    frameSize: 128,
    frames: [
      [
        "thrust-n,0",
        "thrust-n,1",
        "thrust-n,2",
        "thrust-n,3",
        "thrust-n,4",
        "thrust-n,5",
        "thrust-n,4",
        "thrust-n,4",
        "thrust-n,4",
        "thrust-n,5",
        "thrust-n,4",
        "thrust-n,2",
        "thrust-n,3"
      ],
      [
        "thrust-w,0",
        "thrust-w,1",
        "thrust-w,2",
        "thrust-w,3",
        "thrust-w,4",
        "thrust-w,5",
        "thrust-w,4",
        "thrust-w,4",
        "thrust-w,4",
        "thrust-w,5",
        "thrust-w,4",
        "thrust-w,2",
        "thrust-w,3"
      ],
      [
        "thrust-s,0",
        "thrust-s,1",
        "thrust-s,2",
        "thrust-s,3",
        "thrust-s,4",
        "thrust-s,5",
        "thrust-s,4",
        "thrust-s,4",
        "thrust-s,4",
        "thrust-s,5",
        "thrust-s,4",
        "thrust-s,2",
        "thrust-s,3"
      ],
      [
        "thrust-e,0",
        "thrust-e,1",
        "thrust-e,2",
        "thrust-e,3",
        "thrust-e,4",
        "thrust-e,5",
        "thrust-e,4",
        "thrust-e,4",
        "thrust-e,4",
        "thrust-e,5",
        "thrust-e,4",
        "thrust-e,2",
        "thrust-e,3"
      ]
    ]
  },
  slash_128: {
    frameSize: 128,
    frames: [
      [
        "slash-n,0",
        "slash-n,1",
        "slash-n,2",
        "slash-n,3",
        "slash-n,4",
        "slash-n,5"
      ],
      [
        "slash-w,0",
        "slash-w,1",
        "slash-w,2",
        "slash-w,3",
        "slash-w,4",
        "slash-w,5"
      ],
      [
        "slash-s,0",
        "slash-s,1",
        "slash-s,2",
        "slash-s,3",
        "slash-s,4",
        "slash-s,5"
      ],
      [
        "slash-e,0",
        "slash-e,1",
        "slash-e,2",
        "slash-e,3",
        "slash-e,4",
        "slash-e,5"
      ]
    ]
  },
  backslash_128: {
    frameSize: 128,
    frames: [
      [
        "backslash-n,0",
        "backslash-n,1",
        "backslash-n,2",
        "backslash-n,3",
        "backslash-n,4",
        "backslash-n,5",
        "backslash-n,6",
        "backslash-n,7",
        "backslash-n,8",
        "backslash-n,9",
        "backslash-n,10",
        "backslash-n,11",
        "backslash-n,12"
      ],
      [
        "backslash-w,0",
        "backslash-w,1",
        "backslash-w,2",
        "backslash-w,3",
        "backslash-w,4",
        "backslash-w,5",
        "backslash-w,6",
        "backslash-w,7",
        "backslash-w,8",
        "backslash-w,9",
        "backslash-w,10",
        "backslash-w,11",
        "backslash-w,12"
      ],
      [
        "backslash-s,0",
        "backslash-s,1",
        "backslash-s,2",
        "backslash-s,3",
        "backslash-s,4",
        "backslash-s,5",
        "backslash-s,6",
        "backslash-s,7",
        "backslash-s,8",
        "backslash-s,9",
        "backslash-s,10",
        "backslash-s,11",
        "backslash-s,12"
      ],
      [
        "backslash-e,0",
        "backslash-e,1",
        "backslash-e,2",
        "backslash-e,3",
        "backslash-e,4",
        "backslash-e,5",
        "backslash-e,6",
        "backslash-e,7",
        "backslash-e,8",
        "backslash-e,9",
        "backslash-e,10",
        "backslash-e,11",
        "backslash-e,12"
      ]
    ]
  },
  halfslash_128: {
    frameSize: 128,
    frames: [
      [
        "halfslash-n,0",
        "halfslash-n,1",
        "halfslash-n,2",
        "halfslash-n,3",
        "halfslash-n,4",
        "halfslash-n,5"
      ],
      [
        "halfslash-w,0",
        "halfslash-w,1",
        "halfslash-w,2",
        "halfslash-w,3",
        "halfslash-w,4",
        "halfslash-w,5"
      ],
      [
        "halfslash-s,0",
        "halfslash-s,1",
        "halfslash-s,2",
        "halfslash-s,3",
        "halfslash-s,4",
        "halfslash-s,5"
      ],
      [
        "halfslash-e,0",
        "halfslash-e,1",
        "halfslash-e,2",
        "halfslash-e,3",
        "halfslash-e,4",
        "halfslash-e,5"
      ]
    ]
  },
  thrust_oversize: {
    frameSize: 192,
    frames: [
      [
        "thrust-n,0",
        "thrust-n,1",
        "thrust-n,2",
        "thrust-n,3",
        "thrust-n,4",
        "thrust-n,5",
        "thrust-n,6",
        "thrust-n,7"
      ],
      [
        "thrust-w,0",
        "thrust-w,1",
        "thrust-w,2",
        "thrust-w,3",
        "thrust-w,4",
        "thrust-w,5",
        "thrust-w,6",
        "thrust-w,7"
      ],
      [
        "thrust-s,0",
        "thrust-s,1",
        "thrust-s,2",
        "thrust-s,3",
        "thrust-s,4",
        "thrust-s,5",
        "thrust-s,6",
        "thrust-s,7"
      ],
      [
        "thrust-e,0",
        "thrust-e,1",
        "thrust-e,2",
        "thrust-e,3",
        "thrust-e,4",
        "thrust-e,5",
        "thrust-e,6",
        "thrust-e,7"
      ]
    ]
  },
  slash_oversize: {
    frameSize: 192,
    frames: [
      [
        "slash-n,0",
        "slash-n,1",
        "slash-n,2",
        "slash-n,3",
        "slash-n,4",
        "slash-n,5"
      ],
      [
        "slash-w,0",
        "slash-w,1",
        "slash-w,2",
        "slash-w,3",
        "slash-w,4",
        "slash-w,5"
      ],
      [
        "slash-s,0",
        "slash-s,1",
        "slash-s,2",
        "slash-s,3",
        "slash-s,4",
        "slash-s,5"
      ],
      [
        "slash-e,0",
        "slash-e,1",
        "slash-e,2",
        "slash-e,3",
        "slash-e,4",
        "slash-e,5"
      ]
    ]
  },
  walk_128: {
    skipFirstFrameInPreview: true,
    frameSize: 128,
    frames: [
      [
        "walk-n,0",
        "walk-n,1",
        "walk-n,2",
        "walk-n,3",
        "walk-n,4",
        "walk-n,5",
        "walk-n,6",
        "walk-n,7",
        "walk-n,8"
      ],
      [
        "walk-w,0",
        "walk-w,1",
        "walk-w,2",
        "walk-w,3",
        "walk-w,4",
        "walk-w,5",
        "walk-w,6",
        "walk-w,7",
        "walk-w,8"
      ],
      [
        "walk-s,0",
        "walk-s,1",
        "walk-s,2",
        "walk-s,3",
        "walk-s,4",
        "walk-s,5",
        "walk-s,6",
        "walk-s,7",
        "walk-s,8"
      ],
      [
        "walk-e,0",
        "walk-e,1",
        "walk-e,2",
        "walk-e,3",
        "walk-e,4",
        "walk-e,5",
        "walk-e,6",
        "walk-e,7",
        "walk-e,8"
      ]
    ]
  },
  thrust_128: {
    frameSize: 128,
    frames: [
      [
        "thrust-n,0",
        "thrust-n,1",
        "thrust-n,2",
        "thrust-n,3",
        "thrust-n,4",
        "thrust-n,5",
        "thrust-n,6",
        "thrust-n,7"
      ],
      [
        "thrust-w,0",
        "thrust-w,1",
        "thrust-w,2",
        "thrust-w,3",
        "thrust-w,4",
        "thrust-w,5",
        "thrust-w,6",
        "thrust-w,7"
      ],
      [
        "thrust-s,0",
        "thrust-s,1",
        "thrust-s,2",
        "thrust-s,3",
        "thrust-s,4",
        "thrust-s,5",
        "thrust-s,6",
        "thrust-s,7"
      ],
      [
        "thrust-e,0",
        "thrust-e,1",
        "thrust-e,2",
        "thrust-e,3",
        "thrust-e,4",
        "thrust-e,5",
        "thrust-e,6",
        "thrust-e,7"
      ]
    ]
  },
  slash_reverse_oversize: {
    frameSize: 192,
    frames: [
      [
        "slash-n,5",
        "slash-n,4",
        "slash-n,3",
        "slash-n,2",
        "slash-n,1",
        "slash-n,0"
      ],
      [
        "slash-w,5",
        "slash-w,4",
        "slash-w,3",
        "slash-w,2",
        "slash-w,1",
        "slash-w,0"
      ],
      [
        "slash-s,5",
        "slash-s,4",
        "slash-s,3",
        "slash-s,2",
        "slash-s,1",
        "slash-s,0"
      ],
      [
        "slash-e,5",
        "slash-e,4",
        "slash-e,3",
        "slash-e,2",
        "slash-e,1",
        "slash-e,0"
      ]
    ]
  },
  whip_oversize: {
    frameSize: 192,
    frames: [
      [
        "slash-n,0",
        "slash-n,1",
        "slash-n,4",
        "slash-n,5",
        "slash-n,3",
        "slash-n,2",
        "slash-n,2",
        "slash-n,1"
      ],
      [
        "slash-w,0",
        "slash-w,1",
        "slash-w,5",
        "slash-w,4",
        "slash-w,3",
        "slash-w,3",
        "slash-w,3",
        "slash-w,2"
      ],
      [
        "slash-s,0",
        "slash-s,1",
        "slash-s,5",
        "slash-s,4",
        "slash-s,3",
        "slash-s,3",
        "slash-s,2",
        "slash-w,1"
      ],
      [
        "slash-e,0",
        "slash-e,1",
        "slash-e,5",
        "slash-e,4",
        "slash-e,3",
        "slash-e,3",
        "slash-e,3",
        "slash-e,2"
      ]
    ]
  },
  tool_whip: {
    frameSize: 192,
    frames: [
      [
        "slash-n,0",
        "slash-n,1",
        "slash-n,4",
        "slash-n,5",
        "slash-n,3",
        "slash-n,2",
        "slash-n,2",
        "slash-n,1"
      ],
      [
        "slash-w,0",
        "slash-w,1",
        "slash-w,5",
        "slash-w,4",
        "slash-w,3",
        "slash-w,3",
        "slash-w,3",
        "slash-w,2"
      ],
      [
        "slash-s,0",
        "slash-s,1",
        "slash-s,5",
        "slash-s,4",
        "slash-s,3",
        "slash-s,3",
        "slash-s,2",
        "slash-s,1"
      ],
      [
        "slash-e,0",
        "slash-e,1",
        "slash-e,5",
        "slash-e,4",
        "slash-e,3",
        "slash-e,3",
        "slash-e,3",
        "slash-e,2"
      ]
    ]
  },
  tool_axe: {
    frameSize: 128,
    sourceSingleAnimation: true,
    frames: [
      [
        "slash-n,5",
        "slash-n,5",
        "slash-n,4",
        "slash-n,4",
        "slash-n,3",
        "slash-n,1",
        "slash-n,0",
        "slash-n,0",
        "slash-n,0",
        "slash-n,0"
      ],
      [
        "slash-w,5",
        "slash-w,5",
        "slash-w,4",
        "slash-w,4",
        "slash-w,3",
        "slash-w,1",
        "slash-w,0",
        "slash-w,0",
        "slash-w,0",
        "slash-w,0"
      ],
      [
        "slash-s,5",
        "slash-s,5",
        "slash-s,4",
        "slash-s,4",
        "slash-s,3",
        "slash-s,1",
        "slash-s,0",
        "slash-s,0",
        "slash-s,0",
        "slash-s,0"
      ],
      [
        "slash-e,5",
        "slash-e,5",
        "slash-e,4",
        "slash-e,4",
        "slash-e,3",
        "slash-e,1",
        "slash-e,0",
        "slash-e,0",
        "slash-e,0",
        "slash-e,0"
      ]
    ]
  },
  tool_hammer: {
    frameSize: 128,
    sourceSingleAnimation: true,
    frames: [
      [
        "slash-n,5",
        "slash-n,5",
        "slash-n,4",
        "slash-n,4",
        "slash-n,1",
        "slash-n,0",
        "slash-n,0",
        "slash-n,0",
        "slash-n,0"
      ],
      [
        "slash-w,5",
        "slash-w,5",
        "slash-w,4",
        "slash-w,4",
        "slash-w,1",
        "slash-w,0",
        "slash-w,0",
        "slash-w,0",
        "slash-w,0"
      ],
      [
        "slash-s,5",
        "slash-s,5",
        "slash-s,4",
        "slash-s,4",
        "slash-s,1",
        "slash-s,0",
        "slash-s,0",
        "slash-s,0",
        "slash-s,0"
      ],
      [
        "slash-e,5",
        "slash-e,5",
        "slash-e,4",
        "slash-e,4",
        "slash-e,1",
        "slash-e,0",
        "slash-e,0",
        "slash-e,0",
        "slash-e,0"
      ]
    ]
  }
};
var customAnimationSize = (customAnimation) => ({
  width: customAnimation.frameSize * customAnimation.frames[0].length,
  height: customAnimation.frameSize * customAnimation.frames.length
});
var customAnimationBase = (custAnim) => custAnim.frames[0][0].split(",")[0].split("-")[0];

// vendor/lpc/full-catalog/extracted.ts
function variantToFilename(variant) {
  return variant.replaceAll(" ", "_");
}
var es6DynamicTemplate = (templateString, templateVariables) => templateString.replace(
  /\${(.*?)}/g,
  (_, g) => templateVariables[g] ?? `\${${g}}`
);
var FRAME_SIZE = 64;
var BODY_TYPES = [
  "male",
  "female",
  "teen",
  "child",
  "muscular",
  "pregnant"
];
var ANIMATIONS = [
  { value: "spellcast", label: "Spellcast" },
  { value: "thrust", label: "Thrust" },
  { value: "walk", label: "Walk" },
  { value: "slash", label: "Slash" },
  { value: "shoot", label: "Shoot" },
  { value: "hurt", label: "Hurt" },
  { value: "climb", label: "Climb" },
  { value: "idle", label: "Idle" },
  { value: "jump", label: "Jump" },
  { value: "sit", label: "Sit" },
  { value: "emote", label: "Emote" },
  { value: "run", label: "Run" },
  { value: "watering", label: "Watering", noExport: true },
  { value: "combat", label: "Combat Idle", folderName: "combat_idle" },
  {
    value: "1h_slash",
    label: "1-Handed Slash",
    folderName: "backslash",
    noExport: true
  },
  {
    value: "1h_backslash",
    label: "1-Handed Backslash",
    folderName: "backslash"
  },
  {
    value: "1h_halfslash",
    label: "1-Handed Halfslash",
    folderName: "halfslash"
  }
];
var ANIMATION_OFFSETS = {
  spellcast: 0,
  thrust: 4 * FRAME_SIZE,
  walk: 8 * FRAME_SIZE,
  slash: 12 * FRAME_SIZE,
  shoot: 16 * FRAME_SIZE,
  hurt: 20 * FRAME_SIZE,
  climb: 21 * FRAME_SIZE,
  idle: 22 * FRAME_SIZE,
  jump: 26 * FRAME_SIZE,
  sit: 30 * FRAME_SIZE,
  emote: 34 * FRAME_SIZE,
  run: 38 * FRAME_SIZE,
  combat_idle: 42 * FRAME_SIZE,
  backslash: 46 * FRAME_SIZE,
  halfslash: 50 * FRAME_SIZE
};
var ANIMATION_CONFIGS = {
  spellcast: { row: 0, num: 4, cycle: [0, 1, 2, 3, 4, 5, 6] },
  thrust: { row: 4, num: 4, cycle: [0, 1, 2, 3, 4, 5, 6, 7] },
  walk: { row: 8, num: 4, cycle: [1, 2, 3, 4, 5, 6, 7, 8] },
  slash: { row: 12, num: 4, cycle: [0, 1, 2, 3, 4, 5] },
  shoot: { row: 16, num: 4, cycle: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  hurt: { row: 20, num: 1, cycle: [0, 1, 2, 3, 4, 5] },
  climb: { row: 21, num: 1, cycle: [0, 1, 2, 3, 4, 5] },
  idle: { row: 22, num: 4, cycle: [0, 0, 1] },
  jump: { row: 26, num: 4, cycle: [0, 1, 2, 3, 4, 1] },
  sit: {
    row: 30,
    num: 4,
    cycle: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]
  },
  emote: {
    row: 34,
    num: 4,
    cycle: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]
  },
  run: { row: 38, num: 4, cycle: [0, 1, 2, 3, 4, 5, 6, 7] },
  watering: { row: 4, num: 4, cycle: [0, 1, 4, 4, 4, 4, 5] },
  combat: { row: 42, num: 4, cycle: [0, 0, 1] },
  "1h_slash": { row: 46, num: 4, cycle: [0, 1, 2, 3, 4, 5, 6] },
  "1h_backslash": {
    row: 46,
    num: 4,
    cycle: [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12]
  },
  "1h_halfslash": { row: 50, num: 4, cycle: [0, 1, 2, 3, 4, 5] }
};
function getHashParamsforSelections(catalog, selections, bodyType) {
  const params = {};
  params.sex = bodyType;
  const aliasMetadata = catalog.getAliasMetadata().unwrapOr({});
  for (const [typeName, selection] of Object.entries(selections)) {
    const meta = catalog.getItemLite(selection.itemId).unwrapOr(null);
    if (!meta || !meta.type_name) {
      const name = selection.name.split(" (")[0];
      const nameAndVariant = name.replaceAll(" ", "_") + (selection.variant ? `_${selection.variant}` : "");
      const aliasType = aliasMetadata[typeName];
      if (!aliasType) continue;
      const aliasMeta = aliasType?.[nameAndVariant];
      if (aliasMeta && aliasMeta.typeName) {
        params[aliasMeta.typeName] = `${aliasMeta.name}_${aliasMeta.variant}`;
      } else {
        const anyAliasMeta = aliasType?.[`*`];
        if (!anyAliasMeta || !anyAliasMeta.typeName) {
          continue;
        }
        params[anyAliasMeta.typeName] = nameAndVariant;
      }
    } else {
      const subMeta = selection.subId !== null && selection.subId !== void 0 ? meta.recolors?.[selection.subId] : void 0;
      const key = subMeta?.type_name ?? meta.type_name;
      const namePart = (subMeta?.label ?? meta.name).replaceAll(" ", "_");
      const variantPart = selection.variant ?? "";
      const recolorPart = selection.recolor ?? "";
      const uscorePart = variantPart || recolorPart ? "_" : "";
      const splitPart = variantPart && recolorPart ? "|" : "";
      const value = namePart + uscorePart + variantPart + splitPart + recolorPart;
      params[key] = value;
    }
  }
  return params;
}
function getSpritePath(catalog, itemId, variant, recolors, bodyType, animName, layerNum = 1, selections = {}, meta = null) {
  if (!meta) {
    const r = catalog.getItemMerged(itemId);
    if (r.isErr()) return err(r.error);
    meta = r.value;
  }
  const layerKey = `layer_${layerNum}`;
  const layer = meta.layers?.[layerKey];
  if (!layer) return err({ kind: "missing-layer", layerNum });
  let basePath = layer[bodyType];
  if (!basePath) return err({ kind: "missing-bodytype-path", bodyType });
  if (basePath.includes("${")) {
    basePath = replaceInPath(catalog, basePath, selections, meta, bodyType);
  }
  if (!variant && !recolors) {
    const parts = itemId.split("_");
    variant = parts[parts.length - 1];
  }
  const animation = pathDeps.animations.find((a) => a.value === animName);
  if (animation?.folderName) {
    animName = animation.folderName;
  }
  const fileName = !recolors ? `/${pathDeps.variantToFilename(variant)}` : "";
  return ok(`spritesheets/${basePath}${animName}${fileName}.png`);
}
function getNameWithoutVariant(nameAndVariant, itemsForType) {
  let variant = "";
  const nameAndVariantPath = nameAndVariant.split("_");
  const l = nameAndVariantPath.length;
  const names = itemsForType || [];
  const variants = names.flatMap((n) => n.variants || []).map((v2) => v2.toLowerCase());
  const recolors = names.flatMap((n) => n.recolors?.[0]?.variants || []).map((v2) => v2.toLowerCase());
  let j = l;
  let v = 0;
  while (--j > 0) {
    const part = nameAndVariantPath.slice(j, l).join("_");
    const hasPart = (flatMap, part2) => flatMap?.includes(part2.toLowerCase());
    if (hasPart(variants, part) || hasPart(recolors, part)) {
      variant = part;
      v = j;
    }
  }
  const name = variant ? nameAndVariantPath.slice(0, v).join("_") : nameAndVariantPath.slice(0, l - 1).join("_");
  return name;
}
function replaceInPath(catalog, path, selections, meta, bodyType = "male") {
  if (path.includes("${")) {
    const hashParams = getHashParamsforSelections(
      catalog,
      selections || {},
      bodyType
    );
    const replacements = Object.fromEntries(
      Object.entries(hashParams).map(([typeName, nameAndVariant]) => {
        const name = _getNameWithoutVariant(catalog, typeName, nameAndVariant);
        const replacement = meta.replace_in_path[typeName]?.[name];
        if (path.includes(`\${${typeName}}`) && !replacement) {
          pathDeps.debugLog(
            `Warning: No replacement found for ${typeName}="${name}" in path template.`
          );
        }
        return [typeName, replacement];
      })
    );
    return pathDeps.es6DynamicTemplate(path, replacements);
  }
  return path;
}
function _getNameWithoutVariant(catalog, typeName, nameAndVariant) {
  const indexes = catalog.getMetadataIndexes().unwrapOr(null);
  const itemsForType = indexes?.byTypeName?.[typeName] ?? [];
  return getNameWithoutVariant(nameAndVariant, itemsForType);
}
function logIfNotFound(itemId) {
  return (err2) => {
    if (err2.kind === "not-found") {
      console.error("Item metadata not found:", itemId);
    }
    return err2;
  };
}
function getSortedLayers(catalog, itemId, standardOnly = false) {
  return catalog.getItemMerged(itemId).mapErr(logIfNotFound(itemId)).map((meta) => {
    const layersList = [];
    for (let layerNum = 1; layerNum < 10; layerNum++) {
      const layerKey = `layer_${layerNum}`;
      const layer = meta.layers[layerKey];
      if (!layer) break;
      if (standardOnly && layer.custom_animation) continue;
      layersList.push({ layerNum, zPos: layer.zPos ?? 100 });
    }
    return layersList;
  });
}
function getSortedLayersWithCustomFallback(catalog, itemId) {
  return getSortedLayers(catalog, itemId, true).andThen(
    (layers) => layers.length === 0 ? getSortedLayers(catalog, itemId) : ok(layers)
  );
}
function getSortedLayersByAnim(catalog, itemId, customOnly = false) {
  return catalog.getItemMerged(itemId).mapErr(logIfNotFound(itemId)).map((meta) => {
    const animsList = {};
    for (let layerNum = 1; layerNum < 10; layerNum++) {
      const layerKey = `layer_${layerNum}`;
      const layer = meta.layers[layerKey];
      if (!layer) break;
      if (customOnly && !layer.custom_animation) continue;
      const animName = layer.custom_animation || "standard";
      if (!animsList[animName]) {
        animsList[animName] = [];
      }
      animsList[animName].push({ layerNum, zPos: layer.zPos ?? 100 });
    }
    const result = {};
    for (const animName in animsList) {
      result[animName] = animsList[animName].sort((a, b) => a.zPos - b.zPos).map((layer, index) => ({
        layerNum: layer.layerNum,
        animLayerNum: index + 1,
        zPos: layer.zPos
      }));
    }
    return result;
  });
}
function getLayersToLoad(catalog, meta, bodyType, selections, variant = null) {
  const layer1 = meta.layers["layer_1"];
  const hasCustomAnimation = layer1?.custom_animation;
  const layer1CustomAnimation = hasCustomAnimation ? layer1.custom_animation : null;
  const layersToLoad = [];
  for (let layerNum = 1; layerNum < 10; layerNum++) {
    const layer = meta.layers[`layer_${layerNum}`];
    if (!layer) break;
    let layerPath = layer[bodyType];
    if (!layerPath) continue;
    if (layer1CustomAnimation) {
      if (layer.custom_animation !== layer1CustomAnimation) {
        continue;
      }
    }
    if (layerPath.includes("${")) {
      layerPath = replaceInPath(catalog, layerPath, selections, meta, bodyType);
    }
    const hasCustomAnim = layer.custom_animation;
    let imagePath;
    const variantFileName = variant !== null ? `${variantToFilename(variant)}` : "";
    if (hasCustomAnim) {
      if (!variantFileName && layerPath.endsWith("/")) {
        continue;
      }
      imagePath = `spritesheets/${layerPath}${variantFileName}.png`;
    } else {
      const defaultAnim = meta.animations.includes("walk") ? "walk" : meta.animations[0];
      imagePath = `spritesheets/${layerPath}${defaultAnim}${variantFileName ? `/${variantFileName}` : ""}.png`;
    }
    layersToLoad.push({
      zPos: layer.zPos ?? 100,
      path: imagePath
    });
  }
  return layersToLoad.sort((a, b) => a.zPos - b.zPos);
}
function liteOrNull(catalog, itemId) {
  return catalog.getItemLite(itemId).unwrapOr(null);
}
function paletteMetaOrNull(catalog) {
  return catalog.getPaletteMetadata().unwrapOr(null);
}
function parseRecolorKey(catalog, recolorKey, palette) {
  if (!recolorKey) recolorKey = palette?.base ?? "";
  const [recolor, parsedVersion, parsedMaterial] = recolorKey.split(".").reverse();
  let version = parsedVersion;
  let material = parsedMaterial;
  if (!material) {
    if (version && paletteMetaOrNull(catalog)?.materials?.[version]) {
      material = version;
      version = void 0;
    } else {
      material = palette?.material;
    }
  }
  if (!version) {
    version = palette?.default;
  }
  return [material, version, recolor];
}
function getBasePalette(catalog, material, base = null, source = null) {
  const materialMeta = paletteMetaOrNull(catalog)?.materials?.[material];
  if (!materialMeta) {
    console.error(`Palettes for ${material} not found`);
    return err({ kind: "material-not-found", material });
  }
  if (source !== null) {
    return ok([materialMeta.default, base ?? materialMeta.base, source]);
  }
  const [version, recolor] = base ? base.split(".") : [materialMeta.default, materialMeta.base];
  const colors = materialMeta.palettes[version]?.[recolor];
  return ok([version, recolor, colors]);
}
function getTargetPalette(catalog, material, targetColor) {
  const paletteMeta = paletteMetaOrNull(catalog);
  let materialMeta = paletteMeta?.materials?.[material];
  if (!materialMeta) {
    console.error(`Palettes for ${material} not found`);
    return err({ kind: "material-not-found", material });
  }
  const [newMat, version, recolor] = parseRecolorKey(
    catalog,
    targetColor,
    materialMeta
  );
  if (newMat) {
    const newMaterialMeta = paletteMeta?.materials?.[newMat];
    if (newMaterialMeta) {
      material = newMat;
      materialMeta = newMaterialMeta;
    }
  }
  const colors = version !== void 0 ? materialMeta.palettes[version]?.[recolor] : null;
  if (!colors) {
    console.error(
      `Palette colors for ${material}.${version}.${recolor} not found`
    );
    return err({ kind: "colors-not-found", material, version, recolor });
  }
  return ok(colors);
}
function getPalettesFromMeta(catalog, meta) {
  if (!meta || !meta.recolors) return err({ kind: "no-recolors-on-item" });
  const sources = {};
  for (const palette of meta.recolors) {
    const [version, source, colors] = getBasePalette(
      catalog,
      palette.material,
      palette.base ?? null,
      palette.source ?? null
    )._unsafeUnwrap();
    sources[palette.type_name ?? meta.type_name] = {
      material: palette.material,
      version: version || (palette.default ?? ""),
      source,
      colors
    };
  }
  return ok(sources);
}
function fixMissingRecolor(catalog, itemId, recolor, typeName = null) {
  const metaResult = catalog.getItemLite(itemId);
  if (metaResult.isErr()) return err(metaResult.error);
  const meta = metaResult.value;
  const palette = meta.recolors.find((r) => r.type_name === typeName);
  if (!palette) return err({ kind: "no-palette-for-type", typeName });
  if (palette.variants?.includes(recolor)) {
    return ok(recolor);
  }
  const materialMeta = paletteMetaOrNull(catalog)?.materials?.[palette.material];
  const [, , parsedRecolor] = parseRecolorKey(catalog, recolor, materialMeta);
  for (const variant of palette.variants ?? []) {
    const parts = variant.split(".");
    if (parts.length > 1 && parts.includes(parsedRecolor ?? recolor)) {
      return ok(variant);
    } else if (parsedRecolor === variant) {
      return ok(variant);
    }
  }
  return err({ kind: "no-matching-variant", recolor });
}
function getBodyColor(catalog, itemId, selections) {
  const metaResult = catalog.getItemLite(itemId);
  if (metaResult.isErr()) return err(metaResult.error);
  const meta = metaResult.value;
  if (!meta.matchBodyColor) return err({ kind: "match-body-color-disabled" });
  for (const [, selection] of Object.entries(selections)) {
    const subMeta = liteOrNull(catalog, selection.itemId);
    if (subMeta && subMeta.matchBodyColor && selection.recolor) {
      return ok(selection.recolor);
    }
  }
  return err({ kind: "no-body-colored-selection" });
}
function getMultiRecolors(catalog, itemId, selections, matchBodyColorEnabled = true) {
  const meta = liteOrNull(catalog, itemId);
  if (!meta) return null;
  const types = [meta.type_name];
  for (const recolor of meta.recolors) {
    if (recolor.type_name && !types.includes(recolor.type_name)) {
      types.push(recolor.type_name);
    }
  }
  const recolors = {};
  for (const [, selection] of Object.entries(selections)) {
    const subMeta = liteOrNull(catalog, selection.itemId);
    const typeName = (selection.subId !== null && selection.subId !== void 0 ? subMeta?.recolors?.[selection.subId]?.type_name : void 0) ?? subMeta?.type_name ?? meta.type_name;
    if (!subMeta || !subMeta.type_name || !types.includes(typeName) || !subMeta.recolors.length)
      continue;
    const verifiedRecolor = fixMissingRecolor(
      catalog,
      itemId,
      selection.recolor ?? "",
      !selection.subId ? null : typeName
    ).unwrapOr(null);
    if (verifiedRecolor) {
      if (selection.subId) {
        recolors[typeName] = verifiedRecolor;
      } else if (selection.recolor) {
        recolors[subMeta.type_name] = verifiedRecolor;
      }
    }
  }
  if (meta.matchBodyColor && matchBodyColorEnabled) {
    const bodyColor = getBodyColor(catalog, itemId, selections).unwrapOr(null);
    if (bodyColor) recolors[meta.type_name] = bodyColor;
  }
  return Object.keys(recolors).length > 0 ? recolors : null;
}
function get2DContext(canvas, willReadFrequently = false) {
  const ctx = canvas.getContext("2d", { willReadFrequently });
  if (!ctx) {
    throw new Error(
      "Failed to get 2D context (canvas may already have a different context type)"
    );
  }
  ctx.imageSmoothingEnabled = false;
  return ctx;
}
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}
function buildColorMap(sourcePalette, targetPalette) {
  const colorPairs = [];
  for (let i = 0; i < sourcePalette.length; i++) {
    const sourceRgb = hexToRgb(sourcePalette[i]);
    const targetRgb = hexToRgb(targetPalette[i]);
    if (sourceRgb && targetRgb) {
      colorPairs.push({ source: sourceRgb, target: targetRgb });
    }
  }
  return colorPairs;
}
function findMatchingColor(r, g, b, colorPairs, tolerance = 1) {
  for (const pair of colorPairs) {
    const dr = Math.abs(r - pair.source.r);
    const dg = Math.abs(g - pair.source.g);
    const db = Math.abs(b - pair.source.b);
    if (dr <= tolerance && dg <= tolerance && db <= tolerance) {
      return pair.target;
    }
  }
  return null;
}
function recolorImageCPU(sourceImage, paletteMappings) {
  const canvas = document.createElement("canvas");
  canvas.width = sourceImage.width;
  canvas.height = sourceImage.height;
  const ctx = get2DContext(canvas);
  ctx.drawImage(sourceImage, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const colorPairs = [];
  for (const { source, target } of paletteMappings) {
    const pairs = buildColorMap(source, target);
    for (const p of pairs) colorPairs.push(p);
  }
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a === 0) continue;
    const newColor = findMatchingColor(r, g, b, colorPairs);
    if (newColor) {
      pixels[i] = newColor.r;
      pixels[i + 1] = newColor.g;
      pixels[i + 2] = newColor.b;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
function applyTransparencyMaskToCanvas(canvas, ctx) {
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height), pix = imgData.data, n = pix.length;
  for (let i = 0; i < n; i += 4) {
    const a = pix[i + 3];
    if (a > 0) {
      const r = pix[i];
      const g = pix[i + 1];
      const b = pix[i + 2];
      if (r === 255 && g === 44 && b === 230) {
        pix[i + 3] = 0;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}
function drawFrameToFrame(destCtx, destPos, destFrameSize, src, srcPos, srcFrameSize) {
  if (srcFrameSize === destFrameSize) {
    destCtx.drawImage(
      src,
      srcPos.x,
      srcPos.y,
      srcFrameSize,
      srcFrameSize,
      destPos.x,
      destPos.y,
      destFrameSize,
      destFrameSize
    );
  } else {
    const offset = (destFrameSize - srcFrameSize) / 2;
    destCtx.drawImage(
      src,
      srcPos.x,
      srcPos.y,
      srcFrameSize,
      srcFrameSize,
      destPos.x + offset,
      destPos.y + offset,
      srcFrameSize,
      srcFrameSize
    );
  }
}
function drawFramesToCustomAnimation(customAnimationContext, customAnimationDefinition, offsetY, src) {
  const frameSize = customAnimationDefinition.frameSize;
  const isSingleAnimation = src.height <= 256;
  for (let i = 0; i < customAnimationDefinition.frames.length; ++i) {
    const frames = customAnimationDefinition.frames[i];
    for (let j = 0; j < frames.length; ++j) {
      const frameSpec = frames[j];
      const [srcRowName, srcColumnStr] = frameSpec.split(",");
      const srcColumn = parseInt(srcColumnStr);
      let srcRow;
      if (isSingleAnimation) {
        const direction = srcRowName.split("-")[1];
        const directionMap = { n: 0, w: 1, s: 2, e: 3 };
        srcRow = directionMap[direction] || 0;
      } else {
        srcRow = animationRowsLayout ? animationRowsLayout[srcRowName] : i;
      }
      const srcX = FRAME_SIZE * srcColumn;
      const srcY = FRAME_SIZE * srcRow;
      const destX = frameSize * j;
      const destY = frameSize * i + offsetY;
      drawFrameToFrame(
        customAnimationContext,
        { x: destX, y: destY },
        frameSize,
        src,
        { x: srcX, y: srcY },
        FRAME_SIZE
      );
    }
  }
}
function drawSingleAnimSpriteToCustomAnimation(ctx, customAnimDef, offsetY, src) {
  const frameSize = customAnimDef.frameSize;
  const srcFrameSize = Math.round(src.height / 4);
  const directionMap = { n: 0, w: 1, s: 2, e: 3 };
  for (let i = 0; i < customAnimDef.frames.length; i++) {
    const frames = customAnimDef.frames[i];
    for (let j = 0; j < frames.length; j++) {
      const frameSpec = frames[j];
      const [srcRowName, srcColumnStr] = frameSpec.split(",");
      const srcColumn = parseInt(srcColumnStr);
      const direction = srcRowName.split("-")[1];
      const srcRow = directionMap[direction] ?? 0;
      const srcX = srcFrameSize * srcColumn;
      const srcY = srcFrameSize * srcRow;
      const destX = frameSize * j;
      const destY = frameSize * i + offsetY;
      drawFrameToFrame(
        ctx,
        { x: destX, y: destY },
        frameSize,
        src,
        { x: srcX, y: srcY },
        srcFrameSize
      );
    }
  }
}
var pathDeps = { variantToFilename, es6DynamicTemplate, animations: ANIMATIONS, debugLog: () => {
} };
export {
  ANIMATIONS,
  ANIMATION_CONFIGS,
  ANIMATION_OFFSETS,
  BODY_TYPES,
  FRAME_SIZE,
  animationRowsLayout,
  applyTransparencyMaskToCanvas,
  customAnimationBase,
  customAnimationSize,
  customAnimations,
  drawFrameToFrame,
  drawFramesToCustomAnimation,
  drawSingleAnimSpriteToCustomAnimation,
  err,
  es6DynamicTemplate,
  fixMissingRecolor,
  get2DContext,
  getBasePalette,
  getBodyColor,
  getHashParamsforSelections,
  getLayersToLoad,
  getMultiRecolors,
  getNameWithoutVariant,
  getPalettesFromMeta,
  getSortedLayers,
  getSortedLayersByAnim,
  getSortedLayersWithCustomFallback,
  getSpritePath,
  getTargetPalette,
  ok,
  parseRecolorKey,
  recolorImageCPU,
  replaceInPath,
  variantToFilename
};
