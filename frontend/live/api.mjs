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
const publicId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{21}$/.test(value);
const ulid = value => typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
const signupTimestamp = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) || !validDate(value)) return false;
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(day.valueOf()) && day.toISOString().slice(0, 10) === value.slice(0, 10);
};
const registrationFields = ['first_name', 'last_name', 'gender', 'date_of_birth', 'phone', 'address', 'national_id', 'income_band_code', 'marriage_status', 'medical_record'];

function validateEvent(value) {
  validateEventPage({ data: [value], total_count: 1, total_pages: 1, page: 1, page_size: 1 }, 1, 1);
  if (!Number.isSafeInteger(value.id) || value.id < 1 || !publicId(value.public_id)
    || !nonemptyString(value.organizer_id) || !nonnegativeInteger(value.online_quota)
    || !nonnegativeInteger(value.offline_quota) || !validDate(value.created_at) || !validDate(value.updated_at)
    || new Date(value.end_time) <= new Date(value.start_time)) throw contractError();
  return value;
}

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
  async function request(path, { method = 'GET', body, token, signal, expectedStatus, operation, eventId } = {}) {
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
        if (operation && [400, 404].includes(response.status)) {
          let failure;
          try { failure = await response.json(); } catch (error) { if (controller.signal.aborted) throw error; /* Never echo an untrusted response. */ }
          const detail = failure?.detail;
          if (operation === 'signup' && response.status === 400 && detail === 'Username is already registered.') {
            throw new ApiError('duplicate', 'This username is already registered. Log in or choose another username.', 400);
          }
          if (operation !== 'signup' && response.status === 400 && detail === 'Invalid identifier structure. Expected a 21-character public NanoID ID.') {
            throw new ApiError('validation', 'Choose a valid event.', 400);
          }
          const notFound = `Event with public identifier '${eventId}' was not found${operation === 'registration' ? '.' : ''}`;
          if (operation !== 'signup' && response.status === 404 && detail === notFound) throw new ApiError('not_found', 'This event could not be found. Choose another event.', 404);
          if (operation === 'registration' && response.status === 400) {
            const errors = new Map([
              ['This participant already holds an active registration record for this event.', ['duplicate', 'An application already exists for this participant and event. Please do not submit it again.']],
              ['Registration full. Online quota limits for this event are exhausted.', ['full', 'This event is not accepting more online applications. Choose another event.']],
              ['Registration rejected. This event is not currently accepting entries.', ['inactive', 'This event is not currently accepting applications. Choose another event.']],
            ]);
            if (errors.has(detail)) { const [kind, message] = errors.get(detail); throw new ApiError(kind, message, 400); }
          }
        }
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
    async createUser(payload) {
      const { username, password } = payload ?? {};
      if (typeof username !== 'string' || typeof password !== 'string') throw new ApiError('validation', 'Enter your username and password.');
      const data = await request('/users', { method: 'POST', body: { username, password }, expectedStatus: 201, operation: 'signup' });
      if (!data || typeof data !== 'object' || !/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(data.id)
        || data.username !== username || data.role !== 'user'
        || !signupTimestamp(data.created_at) || !signupTimestamp(data.updated_at)
        || Object.hasOwn(data, 'password') || Object.hasOwn(data, 'password_hash')) throw contractError();
      const { id, role, created_at, updated_at } = data;
      return { id, username, role, created_at, updated_at };
    },
    async getEvents({ page = 1, pageSize = 6, keyword = '', signal } = {}) {
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new ApiError('validation', 'Choose a valid event page and page size.');
      }
      if (typeof keyword !== 'string') throw new ApiError('validation', 'Enter a search term.');
      const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (keyword) query.set('keyword', keyword);
      const data = await request(`/events?${query}`, { signal });
      return validateEventPage(data, page, pageSize);
    },
    async getEvent(id, { signal } = {}) {
      if (!publicId(id)) throw new ApiError('validation', 'Choose a valid event.');
      const data = validateEvent(await request(`/events/${id}`, { signal, expectedStatus: 200, operation: 'detail', eventId: id }));
      if (data.public_id !== id) throw contractError();
      return data;
    },
    async registerForEvent(id, payload, token) {
      if (!publicId(id)) throw new ApiError('validation', 'Choose a valid event.');
      if (!nonemptyString(token)) throw new ApiError('unauthorized', 'Please log in to continue.', 401);
      const body = Object.fromEntries(registrationFields.map(key => [key, key === 'medical_record' ? payload[key] ?? null : payload[key]]));
      const data = await request(`/events/${id}/registrations`, { method: 'POST', token, body,
        expectedStatus: 201, operation: 'registration', eventId: id });
      if (!data || !ulid(data.id) || !ulid(data.participant_id)
        || !Number.isSafeInteger(data.event_id) || data.event_id < 1
        || !(data.created_by_user_id === null || ulid(data.created_by_user_id))
        || data.channel !== 'online' || data.status !== 'pending'
        || !validDate(data.created_at) || !validDate(data.updated_at)
        || registrationFields.some(key => data[key] !== body[key])) throw contractError();
      return data;
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
