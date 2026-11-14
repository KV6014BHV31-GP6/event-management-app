// Development server with a loopback-only CLI. No build or npm install is required.
import http from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import {dirname, extname, isAbsolute, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TYPES = {'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.md':'text/plain; charset=utf-8',
  '.webmanifest':'application/manifest+json'};
const MAX_BODY = 1024 * 1024;
const MAX_V2_FILE_BODY = 8 * 1024 * 1024 + 64 * 1024;
const V2_ID = '[0-7][0-9A-HJKMNP-TV-Z]{25}';
const V2_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const V2_EVENT = '[A-Za-z0-9_-]{21}';
const OP_ID = '[A-Za-z0-9_-]{1,128}';
const ACCOUNT_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const recoveryCapabilityRoute = path => new RegExp(`^/api/v2/operations/account-recovery/challenges/${ACCOUNT_UUID}/(?:reset|receipts/${ACCOUNT_UUID})$`).test(path);
const accountRoute = path => path === '/api/v2/operations/me/profile' || path.startsWith('/api/v2/operations/me/profile/') || path.startsWith('/api/v2/operations/account-recovery/');
const operationsAllowed = (method, path) => {
  const suffix = path.slice('/api/v2/operations'.length);
  if (method === 'GET') return [
    '^/me/profile$', `^/me/profile/receipts/${ACCOUNT_UUID}$`,
    `^/account-recovery/challenges/${ACCOUNT_UUID}/(?:demo-message|receipts/${ACCOUNT_UUID})$`,
    '^/(accounts|outbox)$', `^/(receipts|referrals)/${OP_ID}$`,
    `^/registrations/${V2_ID}$`, `^/guest-access/challenges/${OP_ID}/demo-message$`,
    `^/events/${V2_EVENT}(?:/(leaders|promotion|stats|outreach|roster|closeout))?$`,
    `^/events/${V2_EVENT}/attendance/${OP_ID}$`,
  ].some(pattern => new RegExp(pattern).test(suffix));
  if (method !== 'POST') return false;
  return [
    '^/(me/profile|account-recovery/challenges)$', `^/account-recovery/challenges/${ACCOUNT_UUID}/reset$`,
    '^/(accounts|events|guest-access/challenges)$', `^/accounts/${V2_ID}/access$`,
    `^/guest-access/challenges/${OP_ID}/verify$`, `^/outbox/${OP_ID}/retry$`,
    `^/offers/${OP_ID}/(accept|decline)$`, `^/registrations/${V2_ID}/(review|correction|cancel)$`,
    `^/events/${V2_EVENT}/(edit|publish|postpone|resume|cancel|leaders|applications|promotion|instruction|outreach|alerts|reminders|attendance|walkins|closeout)$`,
    `^/events/${V2_EVENT}/(promotion/(approve|pause)|offers/reconcile|attendance/intents)$`,
    `^/events/${V2_EVENT}/leaders/${V2_ID}$`, `^/events/${V2_EVENT}/attendance/${OP_ID}/discard$`,
  ].some(pattern => new RegExp(pattern).test(suffix));
};
const v2Allowed = (method, path) => {
  if (path.startsWith('/api/v2/operations/')) return operationsAllowed(method, path);
  if (method === 'POST' && path === '/api/v2/files') return true;
  if (['GET', 'HEAD'].includes(method) && new RegExp(`^/api/v2/files/${V2_ID}/content$`).test(path)) return true;
  if (method === 'GET' && ['/api/v2/me/events', '/api/v2/me/registrations', '/api/v2/analytics/registrations'].includes(path)) return true;
  if (method === 'POST' && new RegExp(`^/api/v2/registrations/${V2_ID}/cancel$`).test(path)) return true;
  if (method === 'POST' && new RegExp(`^/api/v2/events/${V2_EVENT}/offline-batches$`).test(path)) return true;
  return method === 'GET' && new RegExp(`^/api/v2/events/${V2_EVENT}/(?:offline-batches|offline-submissions)/${V2_UUID}$`).test(path);
};
const IMAGE_TYPES = {'.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.webp':'image/webp', '.gif':'image/gif'};
const hasImageSignature = (bytes, extension) => {
  if (extension === '.png') return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (extension === '.jpg' || extension === '.jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (extension === '.gif') return ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'));
  return extension === '.webp' && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
};
const json = (response, status, detail) => {
  response.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
  response.end(JSON.stringify({detail}));
};

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const DNS_HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function createRequestOriginGuard(trustedHttpsOrigin = null) {
  let trusted = null;
  if (trustedHttpsOrigin !== null) {
    const invalid = new Error('trustedHttpsOrigin must be a canonical HTTPS origin for a non-loopback host.');
    if (typeof trustedHttpsOrigin !== 'string') throw invalid;
    try { trusted = new URL(trustedHttpsOrigin); }
    catch { throw invalid; }

    const validHostname = trusted.hostname.startsWith('[')
      || (trusted.hostname.length <= 253 && DNS_HOSTNAME.test(trusted.hostname));
    // Reject alternate spellings and URL components discarded by origin serialization.
    if (trusted.protocol !== 'https:' || !validHostname || LOOPBACK_HOST.test(trusted.host)
        || trusted.port === '0'
        || (trustedHttpsOrigin !== trusted.origin && trustedHttpsOrigin !== trusted.origin + '/')) {
      throw invalid;
    }
  }

  return request => {
    const host = request.headers.host || '';
    const origin = request.headers.origin;
    if (host === trusted?.host) {
      if (request.headersDistinct.host?.length !== 1) return 'Local host required.';
      if (origin === trusted.origin || (origin === undefined && ['GET', 'HEAD'].includes(request.method))) return null;
      return 'Same-origin requests required.';
    }
    if (!LOOPBACK_HOST.test(host)) return 'Local host required.';
    if (origin && origin !== 'http://' + host) return 'Same-origin requests required.';
    return null;
  };
}

export function createDevServer({upstream = 'http://127.0.0.1:8000', root = ROOT, timeout = 15000,
  uploadRoot = null, trustedHttpsOrigin = null} = {}) {
  const checkRequestOrigin = createRequestOriginGuard(trustedHttpsOrigin);
  const target = new URL(upstream);
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
      || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('BACKEND_URL must be a loopback HTTP origin, e.g. http://127.0.0.1:8000');
  }
  if (uploadRoot !== null && (typeof uploadRoot !== 'string' || !isAbsolute(uploadRoot))) {
    throw new Error('UPLOAD_DIR must be an explicit absolute local image directory.');
  }
  const uploads = uploadRoot === null ? null : resolve(uploadRoot);
  return http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    try {
      const originError = checkRequestOrigin(request);
      if (originError) return json(response, 403, originError);
      const rawPath = (request.url || '/').split('?')[0];
      const decoded = decodeURIComponent(rawPath);
      if (decoded.split('/').some(p => p === '..' || p.startsWith('.')) || decoded.includes('\\')) return json(response, 403, 'Path not allowed.');
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname.startsWith('/api/v1/') || url.pathname.startsWith('/api/v2/')) {
        const v2 = url.pathname.startsWith('/api/v2/');
        const eventPatch = request.method === 'PATCH' && /^\/api\/v1\/events\/[A-Za-z0-9_-]{21}$/.test(rawPath);
        if (v2 ? !v2Allowed(request.method, rawPath) : !['GET', 'HEAD', 'POST'].includes(request.method) && !eventPatch) return json(response, 405, 'Method or route not supported by this development proxy.');
        if (accountRoute(rawPath) && url.search) return json(response, 400, 'Account operations do not accept query parameters.');
        const bodyLimit = request.method === 'POST' && rawPath === '/api/v2/files' ? MAX_V2_FILE_BODY : MAX_BODY;
        const parts = []; let size = 0;
        for await (const part of request) {
          size += part.length;
          if (size > bodyLimit) return json(response, 413, 'Request too large.');
          parts.push(part);
        }
        const headers = {'Accept':'application/json'};
        for (const name of ['content-type', 'authorization', 'x-guest-grant', 'x-demo-challenge', 'x-application-key']) if (request.headers[name]) headers[name] = request.headers[name];
        if (recoveryCapabilityRoute(rawPath) && request.headers['x-account-recovery']) headers['x-account-recovery'] = request.headers['x-account-recovery'];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
          const result = await fetch(new URL(url.pathname + url.search, target), {
            method:request.method, headers, redirect:'manual', signal:controller.signal,
            body:['GET','HEAD'].includes(request.method) ? undefined : Buffer.concat(parts)
          });
          const data = Buffer.from(await result.arrayBuffer());
          const responseHeaders = {'Content-Type':result.headers.get('content-type') || 'application/json'};
          if (request.method === 'POST' && recoveryCapabilityRoute(rawPath) && rawPath.endsWith('/reset') && result.status === 200) {
            // Propagate only the successful reset's same-host refresh-cookie deletion.
            // Generic cookie forwarding and refresh/login cookie integration stay unchanged.
            const deletions = result.headers.getSetCookie().filter(cookie => /^refresh_token=(?:""|);/i.test(cookie)
              && /(?:^|;)\s*Max-Age=0(?:;|$)/i.test(cookie) && /(?:^|;)\s*Path=\/(?:;|$)/i.test(cookie)
              && !/(?:^|;)\s*Domain=/i.test(cookie));
            if (deletions.length) responseHeaders['Set-Cookie'] = deletions;
          }
          if (v2 && /\/content$/.test(rawPath) && result.headers.get('content-disposition')) responseHeaders['Content-Disposition'] = result.headers.get('content-disposition');
          response.writeHead(result.status, responseHeaders);
          response.end(request.method === 'HEAD' ? undefined : data);
        } catch (error) {
          const write = !['GET', 'HEAD'].includes(request.method);
          json(response, controller.signal.aborted ? 504 : 502,
            write ? 'The write result is unknown. Do not submit it again until the result has been checked.'
              : controller.signal.aborted ? 'The backend request timed out. Please retry.' : 'The backend is unavailable. Start the API server and retry.');
        } finally { clearTimeout(timer); }
        return;
      }
      if (!['GET','HEAD'].includes(request.method)) return json(response, 405, 'Method not allowed.');
      if (decoded === '/uploads' || decoded.startsWith('/uploads/')) {
        if (!uploads) return json(response, 404, 'Local image serving is not configured.');
        // Separate opt-in directory; never fall through to the app/backend root.
        const imagePath = decoded.slice('/uploads/'.length);
        if (!imagePath || /[:\u0000-\u001f]/.test(imagePath)) return json(response, 403, 'Image path not allowed.');
        const file = resolve(uploads, imagePath);
        if (!file.startsWith(uploads + sep)) return json(response, 403, 'Image path not allowed.');
        const extension = extname(file).toLowerCase();
        if (!IMAGE_TYPES[extension]) return json(response, 403, 'Image type not served.');
        const canonicalRoot = await realpath(uploads);
        const canonicalFile = await realpath(file);
        if (!canonicalFile.startsWith(canonicalRoot + sep) || !(await stat(canonicalFile)).isFile()) {
          return json(response, 403, 'Image path not allowed.');
        }
        const data = await readFile(canonicalFile);
        if (!hasImageSignature(data, extension)) return json(response, 403, 'Image content does not match its type.');
        response.writeHead(200, {'Content-Type':IMAGE_TYPES[extension], 'Content-Length':data.length});
        response.end(request.method === 'HEAD' ? undefined : data);
        return;
      }
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
  const server = createDevServer({upstream:process.env.BACKEND_URL || 'http://127.0.0.1:8000', uploadRoot:process.env.UPLOAD_DIR || null});
  server.listen(port, '127.0.0.1', () => console.log(`ROSE frontend: http://127.0.0.1:${port}/live/`));
}
