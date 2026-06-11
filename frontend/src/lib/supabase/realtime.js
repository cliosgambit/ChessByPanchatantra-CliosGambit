import { supabase } from '../supabaseClient';
import { isSupabaseConfigured } from '../supabaseClient';
import { isBackendDataProxyEnabled } from './config';

export function subscribeToTable(table, channelName, { onInsert, onUpdate, onDelete, onError }) {
  if (!isSupabaseConfigured() || isBackendDataProxyEnabled()) {
    return null;
  }

  // Prevent duplicate channels (e.g. React StrictMode remount or effect re-run).
  const existing = supabase.getChannels().find((c) => c.topic === channelName);
  if (existing) {
    supabase.removeChannel(existing);
  }

  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (payload) => {
      console.log(`[realtime] INSERT ${table}:`, payload.new);
      onInsert?.(payload.new);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (payload) => {
      console.log(`[realtime] UPDATE ${table}:`, payload.new);
      onUpdate?.(payload.new);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (payload) => {
      console.log(`[realtime] DELETE ${table}:`, payload.old);
      onDelete?.(payload.old);
    })
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[realtime] subscribed: ${channelName}`);
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error(`[realtime] channel error (${channelName}):`, status, err);
        onError?.(new Error(`Realtime subscription failed: ${status}`));
      }
    });

  return channel;
}

export async function unsubscribeChannel(channel) {
  if (!channel || !supabase) return;
  await supabase.removeChannel(channel);
}
