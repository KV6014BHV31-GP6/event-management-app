// Paths are transcribed from Austin's handoff dated 2026-10-11.
// Presence here records a claim, not a verified server contract.
export const OPERATIONS = Object.freeze({
  createUser: { method: 'POST', path: '/users' },
  getUser: { method: 'GET', path: '/users/{id}' },
  updateUser: { method: 'PUT', path: '/users/{id}' },
  createEvent: { method: 'POST', path: '/events' },
  getEvent: { method: 'GET', path: '/events/{public_id}' },
  createRegistration: { method: 'POST', path: '/register' },
  getRegistration: { method: 'GET', path: '/register/{id}' },
  updateRegistration: { method: 'PUT', path: '/register/{id}' },
  generateBrochure: { method: 'POST', path: '/api/v1/events/{eventId}/brochures/generations' },
  getRegistrationForm: { method: 'GET', path: '/api/v1/events/{eventId}/registration-form' },
  login: { method: 'POST', path: '/auth/login' }
});
for (const operation of Object.values(OPERATIONS)) Object.freeze(operation);

export function operationPath(name, params = {}) {
  const operation = OPERATIONS[name];
  if (!operation) throw new Error('Unknown operation');
  return operation.path.replace(/\{([^}]+)\}/g, (_, key) => {
    const value = params[key];
    if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '' || ['.', '..'].includes(String(value))) {
      throw new Error(`Missing or invalid path parameter: ${key}`);
    }
    return encodeURIComponent(String(value));
  });
}
