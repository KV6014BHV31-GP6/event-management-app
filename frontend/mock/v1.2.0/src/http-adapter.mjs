import { OPERATIONS, operationPath } from './operations.mjs';

export class IntegrationError extends Error {
  constructor(kind, message, details = {}) {
    super(message);
    this.name = 'IntegrationError';
    this.kind = kind;
    Object.assign(this, details);
  }
}

const fail = (kind, message, details) => new IntegrationError(kind, message, details);
function synchronous(value) {
  if (value != null && typeof value.then === 'function') {
    // Observe rejected promises even though asynchronous contracts are unsupported.
    Promise.resolve(value).catch(() => {});
    throw new Error('Contract functions must be synchronous');
  }
  return value;
}

async function resolveAuthHeaders(authHeaders, name, timeoutMs) {
  if (!authHeaders) return {};
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => authHeaders(name)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(fail('timeout', 'Auth-header preparation timed out before transmission.', { outcome: 'none' })), timeoutMs);
      })
    ]);
  } finally { clearTimeout(timer); }
}

/** Transport scaffold only. Contract code must be supplied after real evidence review. */
export function createHttpAdapter({ baseURL, contracts = {}, fetchImpl = globalThis.fetch, timeoutMs = 8000,
  credentials = 'omit', credentialsReviewed = false, authHeaders } = {}) {
  let base;
  try { base = new URL(baseURL); } catch { throw fail('configuration', 'An explicit baseURL is required.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && local)) || base.username || base.password || base.search || base.hash) {
    throw fail('configuration', 'Use HTTPS or local HTTP, without URL credentials, query or fragment.');
  }
  if (!['omit', 'same-origin', 'include'].includes(credentials) || (credentials !== 'omit' && credentialsReviewed !== true)) {
    throw fail('configuration', 'Credential transmission requires explicit review and opt-in.');
  }
  if (typeof fetchImpl !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || (authHeaders !== undefined && typeof authHeaders !== 'function')) {
    throw fail('configuration', 'Invalid fetch, timeout or auth-header configuration.');
  }
  const prefix = base.href.replace(/\/$/, '');
  return Object.freeze({
    mode: 'http',
    async invoke(name, { params = {}, input } = {}) {
      const op = OPERATIONS[name];
      const contract = contracts[name];
      if (!op || !contract || typeof contract.evidenceRef !== 'string' || !contract.evidenceRef.trim() || contract.authReviewed !== true ||
        !['validateRequest', 'toWire', 'validateResponse', 'fromWire'].every(key => typeof contract[key] === 'function') || contract.responseType !== 'json') {
        throw fail('contract_gate', 'Operation blocked: reviewed JSON contract, evidence, auth decision, validators and mappers are required.');
      }
      let path, body;
      try {
        path = operationPath(name, params);
        if (synchronous(contract.validateRequest(input, params)) !== true) throw new Error('Request rejected');
        const wire = synchronous(contract.toWire(input, params));
        if (op.method === 'GET' && wire !== undefined) throw new Error('GET body is not supported');
        body = wire === undefined ? undefined : JSON.stringify(wire);
      } catch {
        throw fail('request_validation', 'Request or field mapping failed before transmission.');
      }
      let headers;
      try {
        headers = new Headers(await resolveAuthHeaders(authHeaders, name, timeoutMs));
        headers.set('Accept', 'application/json');
        if (body !== undefined) headers.set('Content-Type', 'application/json');
      } catch (error) {
        if (error instanceof IntegrationError && error.kind === 'timeout') throw error;
        throw fail('configuration', 'Auth-header configuration failed before transmission.');
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const isWrite = op.method !== 'GET';
      const outcome = isWrite ? 'unknown' : 'none';
      try {
        const response = await fetchImpl(prefix + path, {
          method: op.method, headers, body, credentials, signal: controller.signal, redirect: 'error'
        });
        if (!response.ok) throw fail('http', `HTTP ${response.status}; no automatic retry.`, { status: response.status, outcome });
        let raw;
        try {
          if (response.status === 204) raw = null;
          else {
            const mediaType = (response.headers.get('Content-Type') ?? '').split(';', 1)[0].trim();
            if (!/^application\/(?:[\w.-]+\+)?json$/i.test(mediaType)) {
              throw fail('unexpected_content_type', 'Expected the reviewed JSON response format.', { outcome });
            }
            raw = await response.json();
          }
        } catch (error) {
          if (error instanceof IntegrationError) throw error;
          if (controller.signal.aborted) throw fail('timeout', 'Response timed out; write outcome may be unknown.', { outcome });
          throw fail('malformed_json', 'Response JSON could not be decoded.', { outcome });
        }
        try {
          if (synchronous(contract.validateResponse(raw)) !== true) throw new Error('Response rejected');
          const data = synchronous(contract.fromWire(raw));
          return { mode: 'http', operation: name, data, evidenceRef: contract.evidenceRef };
        } catch { throw fail('response_validation', 'Response did not pass the reviewed contract or mapper.', { outcome }); }
      } catch (error) {
        if (error instanceof IntegrationError) throw error;
        if (controller.signal.aborted) throw fail('timeout', 'Request timed out; write outcome may be unknown.', { outcome });
        throw fail('network', 'Transport failed; no mock fallback and no automatic retry.', { outcome });
      } finally { clearTimeout(timer); }
    }
  });
}
