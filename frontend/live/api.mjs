/** The live client speaks only to the reviewed same-origin backend contract. */
export class ApiError extends Error {
  constructor(kind, message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

const contractError = () => new ApiError('contract', 'The server returned an unexpected response. Please try again.');
const nonemptyString = value => typeof value === 'string' && value.trim().length > 0;
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0;
const validDate = value => typeof value === 'string' && Number.isFinite(new Date(value).valueOf());

export function validateEventPage(value, page, pageSize) {
  if (!value || !Array.isArray(value.data)
    || !nonnegativeInteger(value.total_count) || !nonnegativeInteger(value.total_pages)
    || value.page !== page || value.page_size !== pageSize
    || value.total_pages !== Math.ceil(value.total_count / pageSize)
    || value.data.length > pageSize || value.data.length > value.total_count) throw contractError();
  for (const event of value.data) {
    if (!event || !nonemptyString(event.public_id) || typeof event.title !== 'string'
      || typeof event.location !== 'string' || !nonemptyString(event.status)
      || !(event.overview === null || typeof event.overview === 'string')
      || !validDate(event.start_time) || !validDate(event.end_time)) throw contractError();
  }
  return value;
}

export function createApi({ fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  async function request(path, { method = 'GET', body, token, signal, expectedStatus } = {}) {
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel();
    signal?.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const headers = { Accept: 'application/json' };
      if (body) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetchImpl(`/api/v1${path}`, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error',
      });
      if (!response.ok) {
        if (response.status === 401) throw new ApiError('unauthorized', 'Your login has expired. Please log in again.', 401);
        if (response.status === 403) throw new ApiError('forbidden', 'Your account cannot access this request.', 403);
        if (response.status === 422) throw new ApiError('validation', 'Please check your details and try again.', 422);
        if (response.status === 429) throw new ApiError('rate_limit', 'Too many requests. Please wait a moment and try again.', 429);
        throw new ApiError('server', 'The service is temporarily unavailable. Please try again.', response.status);
      }
      if (expectedStatus !== undefined && response.status !== expectedStatus) throw contractError();
      try { return await response.json(); }
      catch (error) {
        if (controller.signal.aborted) throw error;
        throw contractError();
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (signal?.aborted) throw new ApiError('aborted', 'Request cancelled.');
      if (timedOut) throw new ApiError('timeout', 'The server took too long to respond. Please try again.');
      throw new ApiError('network', 'We couldn’t reach the server. Check your connection and try again.');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
    }
  }

  return {
    async getEvents({ page = 1, pageSize = 6, signal } = {}) {
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new ApiError('validation', 'Choose a valid event page and page size.');
      }
      const data = await request(`/events?page=${page}&pageSize=${pageSize}`, { signal });
      return validateEventPage(data, page, pageSize);
    },
    async login({ username, password }, { signal } = {}) {
      let data;
      try { data = await request('/auth/login', { method: 'POST', body: { username, password }, signal }); }
      catch (error) {
        if (error.kind === 'unauthorized') throw new ApiError('unauthorized', 'Incorrect username or password. Please try again.', 401);
        throw error;
      }
      if (!data || !nonemptyString(data.access_token) || /\s/.test(data.access_token)
        || typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer') throw contractError();
      return data.access_token;
    },
    async createEvent(payload, token) {
      if (!nonemptyString(token)) throw new ApiError('unauthorized', 'Please log in to continue.', 401);
      const { title, overview, location, start_time, end_time, online_quota, offline_quota } = payload;
      const data = await request('/events', {
        method: 'POST', token, expectedStatus: 201,
        body: { title, overview, location, start_time, end_time, online_quota, offline_quota },
      });
      validateEventPage({ data: [data], total_count: 1, total_pages: 1, page: 1, page_size: 1 }, 1, 1);
      if (!Number.isSafeInteger(data.id) || data.id < 1 || data.public_id.length !== 21
        || !nonemptyString(data.title) || !nonemptyString(data.location) || !nonemptyString(data.organizer_id)
        || !nonnegativeInteger(data.online_quota) || !nonnegativeInteger(data.offline_quota)
        || !validDate(data.created_at) || !validDate(data.updated_at)
        || new Date(data.end_time) <= new Date(data.start_time)) throw contractError();
      return data;
    },
    async getMe(token, { signal } = {}) {
      if (!nonemptyString(token)) throw new ApiError('unauthorized', 'Please log in to continue.', 401);
      const data = await request('/users/me', { token, signal });
      if (!data || !nonemptyString(data.id) || !nonemptyString(data.username)
        || !['user', 'organizer', 'leader'].includes(data.role)) throw contractError();
      return data;
    },
  };
}
