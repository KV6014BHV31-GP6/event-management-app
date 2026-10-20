import { ApiError } from './api.mjs';

export const validPublicId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{21}$/.test(value);

/** Carry only an event identifier, never a caller-supplied destination URL. */
export function selectedPublicId(search) {
  const values = new URLSearchParams(search).getAll('event');
  return values.length === 1 && validPublicId(values[0]) ? values[0] : null;
}
function route(page, id) {
  if (!validPublicId(id)) throw new ApiError('validation', 'Choose a valid event.');
  return `./${page}.html?event=${encodeURIComponent(id)}`;
}
export const eventRoute = id => route('event', id);
export const registrationRoute = id => route('registration', id);
export const loginRoute = id => route('login', id);
export const signupRoute = id => route('signup', id);
