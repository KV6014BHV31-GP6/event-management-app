/** The controller prevents a slow older page request from replacing a newer one. */
export function createEventsController({ api, onChange, pageSize = 6 }) {
  let state = { status: 'idle', page: 1, pageSize, result: null, error: null };
  let request = null;
  let revision = 0;
  function update(next) { state = { ...state, ...next }; onChange(state); }
  return {
    get state() { return state; },
    async load(page = state.page, nextPageSize = state.pageSize) {
      request?.abort();
      request = new AbortController();
      const current = ++revision;
      update({ status: 'loading', page, pageSize: nextPageSize, error: null, result: null });
      try {
        let result = await api.getEvents({ page, pageSize: nextPageSize, signal: request.signal });
        // A deletion can make the last page disappear. Fetch the new last page once.
        if (current !== revision) return;
        if (result.total_pages > 0 && page > result.total_pages) {
          page = result.total_pages;
          result = await api.getEvents({ page, pageSize: nextPageSize, signal: request.signal });
        }
        if (current !== revision) return;
        update({ status: 'ready', result, page, error: null });
      } catch (error) {
        if (current !== revision || error.kind === 'aborted') return;
        update({ status: 'error', error, result: null });
      }
    },
  };
}

export function paginationModel(result) {
  const { total_count: total, page, page_size: pageSize, total_pages: pages, data } = result;
  return {
    first: total && data.length ? (page - 1) * pageSize + 1 : 0,
    last: total && data.length ? (page - 1) * pageSize + data.length : 0,
    total,
    pages,
    page: pages ? page : 0,
    hasPrevious: page > 1 && pages > 0,
    hasNext: page < pages,
  };
}
