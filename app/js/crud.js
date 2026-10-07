import { supabase } from './supabaseClient.js';

export async function fetchRows(table, householdId, orderColumn, ascending = true) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('household_id', householdId)
    .order(orderColumn, { ascending });
  if (error) throw error;
  return data;
}

export async function insertRow(table, payload) {
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateRow(table, id, patch) {
  const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteRow(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

// Bulk variant of insertRow() for a whole batch of rows at once (e.g.
// every transaction parsed out of one uploaded bank statement) — one
// request instead of one per row.
export async function insertRows(table, payloads) {
  if (!payloads.length) return [];
  const { data, error } = await supabase.from(table).insert(payloads).select();
  if (error) throw error;
  return data;
}

export async function upsertRow(table, payload, conflictColumn) {
  const { data, error } = await supabase.from(table).upsert(payload, { onConflict: conflictColumn }).select().single();
  if (error) throw error;
  return data;
}
