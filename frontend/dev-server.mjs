// Loopback-only development server. No build or npm install is required.
import http from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import {dirname, extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TYPES = {'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.md':'text/plain; charset=utf-8'};
const MAX_BODY = 1024 * 1024;
const json = (response, status, detail) => {
  response.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
  response.end(JSON.stringify({detail}));
};

export function createDevServer({upstream = 'http://127.0.0.1:8000', root = ROOT, timeout = 15000} = {}) {
  const target = new URL(upstream);
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
      || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('BACKEND_URL must be a loopback HTTP origin, e.g. http://127.0.0.1:8000');
  }
  return http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    try {
      // Reject cross-site writes to the local proxy. Bind remains loopback-only.
      const host = request.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) return json(response, 403, 'Local host required.');
      if (request.headers.origin && request.headers.origin !== `http://${host}`) return json(response, 403, 'Same-origin requests required.');
      const rawPath = (request.url || '/').split('?')[0];
      const decoded = decodeURIComponent(rawPath);
      if (decoded.split('/').some(p => p === '..' || p.startsWith('.')) || decoded.includes('\\')) return json(response, 403, 'Path not allowed.');
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname.startsWith('/api/v1/')) {
        if (!['GET', 'HEAD', 'POST'].includes(request.method)) return json(response, 405, 'Method not supported by this development proxy.');
        const parts = []; let size = 0;
        for await (const part of request) {
          size += part.length;
          if (size > MAX_BODY) return json(response, 413, 'Request too large.');
          parts.push(part);
        }
        const headers = {'Accept':'application/json'};
        for (const name of ['content-type', 'authorization']) if (request.headers[name]) headers[name] = request.headers[name];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
          const result = await fetch(new URL(url.pathname + url.search, target), {
            method:request.method, headers, redirect:'manual', signal:controller.signal,
            body:['GET','HEAD'].includes(request.method) ? undefined : Buffer.concat(parts)
          });
          const data = Buffer.from(await result.arrayBuffer());
          response.writeHead(result.status, {'Content-Type':result.headers.get('content-type') || 'application/json'});
          response.end(request.method === 'HEAD' ? undefined : data);
        } catch (error) {
          json(response, controller.signal.aborted ? 504 : 502,
            controller.signal.aborted ? 'The backend request timed out. Please retry.' : 'The backend is unavailable. Start the API server and retry.');
        } finally { clearTimeout(timer); }
        return;
      }
      if (!['GET','HEAD'].includes(request.method)) return json(response, 405, 'Method not allowed.');
      // Existing launcher links also point at public, tracked documentation.
      const staticRoot = decoded.startsWith('/docs/') ? resolve(root, '../docs') : resolve(root);
      const relativePath = decoded.startsWith('/docs/') ? decoded.slice('/docs'.length) : decoded;
      let file = resolve(staticRoot, '.' + relativePath);
      if (file !== staticRoot && !file.startsWith(staticRoot + sep)) return json(response, 403, 'Path not allowed.');
      if ((await stat(file)).isDirectory()) {
        if (!url.pathname.endsWith('/')) { response.writeHead(302, {Location:url.pathname + '/' + url.search}); response.end(); return; }
        file = resolve(file, 'index.html');
      }
      const canonical = await realpath(file);
      if (!canonical.startsWith(await realpath(staticRoot) + sep) || !TYPES[extname(file)]) return json(response, 403, 'File not served.');
      response.writeHead(200, {'Content-Type':TYPES[extname(file)]});
      response.end(request.method === 'HEAD' ? undefined : await readFile(file));
    } catch (error) {
      if (!response.headersSent) json(response, error instanceof URIError ? 400 : 404, 'Resource not found.');
      else response.end();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const server = createDevServer({upstream:process.env.BACKEND_URL || 'http://127.0.0.1:8000'});
  server.listen(port, '127.0.0.1', () => console.log(`ROSE frontend: http://127.0.0.1:${port}/live/`));
}
