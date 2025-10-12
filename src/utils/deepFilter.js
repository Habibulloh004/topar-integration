/**
 * Deep filtering utilities for arrays of arbitrary nested objects.
 * Supports dot-paths across objects and arrays, or a global search across all primitives.
 */

function isObject(val) {
  return val !== null && typeof val === 'object';
}

function isPrimitive(val) {
  return (
    val === null ||
    val === undefined ||
    typeof val === 'string' ||
    typeof val === 'number' ||
    typeof val === 'boolean'
  );
}

/**
 * Collect all primitive values from an object/array tree.
 * @param {any} node
 * @param {any[]} acc
 */
function collectAllPrimitives(node, acc) {
  if (isPrimitive(node)) {
    acc.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectAllPrimitives(item, acc);
    return;
  }
  if (isObject(node)) {
    for (const key of Object.keys(node)) {
      collectAllPrimitives(node[key], acc);
    }
  }
}

/**
 * Return all values found at a dot-path within an object, traversing arrays.
 * Example: path "a.b.c" will traverse arrays at any segment by checking each element.
 * @param {any} node
 * @param {string[]} segments
 * @returns {any[]}
 */
function getValuesAtPath(node, segments) {
  if (!segments.length) return [node];
  const [head, ...tail] = segments;

  if (Array.isArray(node)) {
    // Explore each element, aggregate
    const agg = [];
    for (const el of node) {
      agg.push(...getValuesAtPath(el, segments));
    }
    return agg;
  }

  if (!isObject(node)) return [];

  // Regular object property
  const next = node[head];
  if (next === undefined) return [];
  return getValuesAtPath(next, tail);
}

/**
 * Convert a user path (supports a.b.c, a[].b, a[*].b, a[0].b) into segments.
 * Numeric and wildcard segments are ignored because traversal already explores arrays.
 * @param {string} path
 * @returns {string[]}
 */
function toSegments(path) {
  if (!path) return [];
  const tokens = String(path).match(/[^.\[\]]+/g) || [];
  // Drop numeric indices and wildcards like '*'
  return tokens.filter((t) => t !== '*' && !/^\d+$/.test(t));
}

/**
 * Default matcher: for strings, case-insensitive substring; for number/boolean, strict equality.
 * @param {any} candidate
 * @param {any} needle
 * @returns {boolean}
 */
function defaultMatch(candidate, needle) {
  if (candidate === undefined) return false;

  // Normalize string matching
  if (typeof needle === 'string') {
    const n = needle.trim().toLowerCase();
    if (!n) return false;
    if (typeof candidate === 'string') {
      return candidate.trim().toLowerCase().includes(n);
    }
    // allow matching stringified primitives
    if (typeof candidate === 'number' || typeof candidate === 'boolean') {
      return String(candidate).toLowerCase().includes(n);
    }
    return false;
  }

  // Non-string needle: perform trimmed/coerced comparisons when candidate is string
  if (typeof needle === 'number') {
    if (typeof candidate === 'number') return candidate === needle;
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed) return false;
      const asNum = Number(trimmed);
      return Number.isFinite(asNum) && asNum === needle;
    }
    return false;
  }

  if (typeof needle === 'boolean') {
    if (typeof candidate === 'boolean') return candidate === needle;
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim().toLowerCase();
      if (trimmed === 'true') return needle === true;
      if (trimmed === 'false') return needle === false;
      return false;
    }
    return false;
  }

  // Fallback strict equality for other primitive types
  if (isPrimitive(candidate) && isPrimitive(needle)) return candidate === needle;
  return false;
}

/**
 * Deep filter an array of items by a path and value, or by a global value.
 * - If called as deepFilter(items, 'a.b.c', value) => matches any item where any value at that path matches value.
 * - If called as deepFilter(items, valueOnly) => global search across all primitive values.
 * - If value is a function, it is treated as a predicate receiving (valueAtPath, item).
 *
 * @template T
 * @param {T[]} items
 * @param {string|any|((v:any, item:T)=>boolean)} pathOrValue
 * @param {any|((v:any, item:T)=>boolean)} [value]
 * @returns {T[]}
 */
export function deepFilter(items, pathOrValue, value) {
  const arr = Array.isArray(items) ? items : [items];

  // Determine mode
  const path = typeof value === 'undefined' && typeof pathOrValue !== 'string' ? null
             : typeof value === 'undefined' ? null
             : String(pathOrValue);

  const needle = typeof value === 'undefined' ? pathOrValue : value;

  const isPredicate = typeof needle === 'function';
  const segments = path ? toSegments(path) : null;

  const out = [];
  for (const item of arr) {
    let values;
    if (segments) {
      values = getValuesAtPath(item, segments);
    } else {
      const acc = [];
      collectAllPrimitives(item, acc);
      values = acc;
    }

    const matched = values.some((v) => {
      if (isPredicate) return needle(v, item);
      return defaultMatch(v, needle);
    });

    if (matched) out.push(item);
  }

  return out;
}

/**
 * Convenience helper for single-object search; returns true if object matches.
 * @param {any} obj
 * @param {string|any|Function} pathOrValue
 * @param {any|Function} [value]
 */
export function deepMatch(obj, pathOrValue, value) {
  return deepFilter([obj], pathOrValue, value).length > 0;
}

export default deepFilter;
