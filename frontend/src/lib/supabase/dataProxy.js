import api from '../../services/authService';

function wrapProxyError(err, action) {
  if (!err.response) {
    throw new Error(
      `Cannot reach backend for ${action}. Start the backend: cd backend && npm start (port 10000).`
    );
  }
  throw new Error(err.response?.data?.message || err.message || `${action} failed`);
}

/**
 * Read table rows via backend Postgres proxy (default data path).
 */
export async function proxyFetchTable(table, { orderBy, ascending = true } = {}) {
  const params = {};
  if (orderBy) {
    params.orderBy = orderBy;
    params.ascending = ascending ? 'true' : 'false';
  }
  try {
    const { data } = await api.get(`/data/${encodeURIComponent(table)}`, { params });
    return data || [];
  } catch (err) {
    wrapProxyError(err, `fetch ${table}`);
  }
}

export async function proxyCountTable(table, { role } = {}) {
  const params = role ? { role } : {};
  try {
    const { data } = await api.get(`/data/${encodeURIComponent(table)}/count`, { params });
    return data?.count ?? 0;
  } catch (err) {
    wrapProxyError(err, `count ${table}`);
  }
}

export async function proxyInsertRow(table, payload) {
  const { data } = await api.post(`/data/${encodeURIComponent(table)}`, payload);
  return data;
}

export async function proxyUpdateRow(table, matchColumn, matchValue, payload) {
  const { data } = await api.put(
    `/data/${encodeURIComponent(table)}/${encodeURIComponent(matchColumn)}/${encodeURIComponent(matchValue)}`,
    payload
  );
  return data;
}

export async function proxyDeleteRow(table, matchColumn, matchValue) {
  await api.delete(
    `/data/${encodeURIComponent(table)}/${encodeURIComponent(matchColumn)}/${encodeURIComponent(matchValue)}`
  );
}
