import http from 'node:http';
import { URL } from 'node:url';

function addResHelpers(res) {
  res.status = function (code) {
    this.statusCode = code;
    return this;
  };
  res.json = function (obj) {
    const raw = JSON.stringify(obj);
    this.writeHead(this.statusCode || 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(raw),
      'Access-Control-Allow-Origin': '*',
    });
    this.end(raw);
  };
  res.send = function (body) {
    if (typeof body === 'object') return this.json(body);
    const text = String(body ?? '');
    this.writeHead(this.statusCode || 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
      'Access-Control-Allow-Origin': '*',
    });
    this.end(text);
  };
  return res;
}

// Compile paths like "/items/:id" to a regex and capture keys
function compilePath(path) {
  if (path instanceof RegExp) return { regex: path, keys: [] };
  const keys = [];
  const parts = String(path)
    .split('/')
    .map((seg) => {
      if (!seg) return '';
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  const regex = new RegExp('^' + parts + '$');
  return { regex, keys };
}

async function parseBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({ raw: '', json: undefined });
      const raw = Buffer.concat(chunks).toString('utf8');
      const ct = (req.headers['content-type'] || '').toLowerCase();
      if (ct.includes('application/json')) {
        try {
          const json = raw ? JSON.parse(raw) : undefined;
          resolve({ raw, json });
        } catch (e) {
          reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
        }
      } else {
        resolve({ raw, json: undefined });
      }
    });
    req.on('error', reject);
  });
}

export function createApp() {
  const routes = [];

  function register(method, path, handler) {
    const { regex, keys } = compilePath(path);
    routes.push({ method: method.toUpperCase(), path, handler, regex, keys });
  }

  function get(path, handler) { register('GET', path, handler); }
  function post(path, handler) { register('POST', path, handler); }
  function put(path, handler) { register('PUT', path, handler); }
  function patch(path, handler) { register('PATCH', path, handler); }
  function del(path, handler) { register('DELETE', path, handler); }

  function matchRoute(method, pathname) {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.regex.exec(pathname);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => (params[k] = m[i + 1]));
        return { route: r, params };
      }
    }
    return null;
  }

  function listen(port, cb) {
    const server = http.createServer(async (req, res) => {
      // CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Content-Length': '0',
        });
        return res.end();
      }

      const url = new URL(req.url, `http://localhost:${port}`);
      const match = matchRoute(req.method, url.pathname);
      const enhancedRes = addResHelpers(res);

      if (!match) {
        enhancedRes.status(404).send('Not Found');
        return;
      }

      const { route, params } = match;
      const reqLike = {
        method: req.method,
        url: req.url,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        params,
        headers: req.headers,
        raw: req,
      };

      // Parse body for non-GET/HEAD/OPTIONS
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        try {
          const { raw, json } = await parseBody(req);
          reqLike.bodyRaw = raw;
          reqLike.body = json;
        } catch (e) {
          const code = e?.statusCode || 400;
          return enhancedRes.status(code).json({ ok: false, error: e.message || 'Bad Request' });
        }
      }

      try {
        const ret = route.handler(reqLike, enhancedRes);
        if (ret && typeof ret.then === 'function') await ret;
      } catch (err) {
        enhancedRes.status(500).json({ ok: false, error: err?.message || String(err) });
      }
    });
    server.listen(port, cb);
    return server;
  }

  return { get, post, put, patch, delete: del, listen };
}

export default createApp;
