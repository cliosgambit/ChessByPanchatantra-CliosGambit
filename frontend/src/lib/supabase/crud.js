import { supabase } from '../supabaseClient';
import { handleSupabaseError } from './errors';
import { isBackendDataProxyEnabled } from './config';
import {
  proxyCountTable,
  proxyDeleteRow,
  proxyFetchTable,
  proxyInsertRow,
  proxyUpdateRow,
} from './dataProxy';

function isInvalidApiKeyError(error) {
  return (error?.message || '').toLowerCase().includes('invalid api key');
}

async function withProxyFallback(table, supabaseFn, proxyFn) {
  if (isBackendDataProxyEnabled()) {
    return proxyFn();
  }
  try {
    return await supabaseFn();
  } catch (err) {
    if (isInvalidApiKeyError(err)) {
      console.warn(`[crud] Supabase key rejected for ${table}, falling back to /api/data`);
      return proxyFn();
    }
    throw err;
  }
}

export async function fetchTable(table, { select = '*', orderBy, ascending = true } = {}) {
  return withProxyFallback(
    table,
    async () => {
      let query = supabase.from(table).select(select);
      if (orderBy) query = query.order(orderBy, { ascending });
      const { data, error } = await query;
      if (error) throw handleSupabaseError(error, `fetchTable(${table})`);
      return data || [];
    },
    () => proxyFetchTable(table, { orderBy, ascending })
  );
}

export async function fetchTablePaginated(
  table,
  { select = '*', page = 1, pageSize = 25, orderBy, ascending = true, filters } = {}
) {
  return withProxyFallback(
    table,
    async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = supabase.from(table).select(select, { count: 'exact' });
      if (orderBy) query = query.order(orderBy, { ascending });
      if (filters) query = filters(query);
      const { data, error, count } = await query.range(from, to);
      if (error) throw handleSupabaseError(error, `fetchTablePaginated(${table})`);
      return {
        data: data || [],
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    },
    async () => {
      const all = await proxyFetchTable(table, { orderBy, ascending });
      const start = (page - 1) * pageSize;
      const data = all.slice(start, start + pageSize);
      return {
        data,
        total: all.length,
        page,
        pageSize,
        totalPages: Math.ceil(all.length / pageSize),
      };
    }
  );
}

export async function countTable(table, { filters, role } = {}) {
  return withProxyFallback(
    table,
    async () => {
      let query = supabase.from(table).select('*', { count: 'exact', head: true });
      if (filters) query = filters(query);
      const { count, error } = await query;
      if (error) throw handleSupabaseError(error, `countTable(${table})`);
      return count ?? 0;
    },
    () => proxyCountTable(table, role ? { role } : {})
  );
}

export async function insertRow(table, payload) {
  return withProxyFallback(
    table,
    async () => {
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw handleSupabaseError(error, `insertRow(${table})`);
      return data;
    },
    () => proxyInsertRow(table, payload)
  );
}

export async function updateRow(table, matchColumn, matchValue, payload) {
  return withProxyFallback(
    table,
    async () => {
      const { data, error } = await supabase
        .from(table)
        .update(payload)
        .eq(matchColumn, matchValue)
        .select()
        .single();
      if (error) throw handleSupabaseError(error, `updateRow(${table})`);
      return data;
    },
    () => proxyUpdateRow(table, matchColumn, matchValue, payload)
  );
}

export async function deleteRow(table, matchColumn, matchValue) {
  return withProxyFallback(
    table,
    async () => {
      const { error } = await supabase.from(table).delete().eq(matchColumn, matchValue);
      if (error) throw handleSupabaseError(error, `deleteRow(${table})`);
    },
    () => proxyDeleteRow(table, matchColumn, matchValue)
  );
}
