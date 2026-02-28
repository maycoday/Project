import { supabase, isSupabaseReady } from './supabaseClient';

/**
 * Complaint Data Service
 * Handles all database operations for encrypted complaints
 */
export const complaintService = {
  /**
   * Submit an encrypted complaint to Supabase
   */
  async submitComplaint({ reference, tokenHash, tokenHint, ciphertextB64, ivB64, authorities, wrappedKeys, metadata }) {
    if (!isSupabaseReady()) {
      console.warn('[complaintService] Supabase not configured — complaint stored locally only');
      return { success: true, offline: true, id: crypto.randomUUID() };
    }

    const { data, error } = await supabase
      .from('complaints_secure')
      .insert({
        reference,
        token_hash: tokenHash,
        token_hint: tokenHint,
        ciphertext_b64: ciphertextB64,
        iv_b64: ivB64,
        authorities,
        wrapped_keys: wrappedKeys,
        metadata,
      })
      .select('id, created_at')
      .single();

    if (error) throw new Error(`Submission failed: ${error.message}`);
    return { success: true, ...data };
  },

  /**
   * Look up a complaint by token hash
   */
  async lookupByToken(tokenHash) {
    if (!isSupabaseReady()) return null;

    const { data, error } = await supabase
      .from('complaints_secure')
      .select('*')
      .eq('token_hash', tokenHash)
      .single();

    if (error) return null;
    return data;
  },

  /**
   * Get complaint count for dashboard stats
   */
  async getComplaintCount() {
    if (!isSupabaseReady()) return 0;

    const { count, error } = await supabase
      .from('complaints_secure')
      .select('*', { count: 'exact', head: true });

    return error ? 0 : count;
  },

  /**
   * Get recent complaints for pattern detection (metadata only)
   */
  async getRecentComplaints(hours = 72) {
    if (!isSupabaseReady()) return [];

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('complaints_analytics')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    return error ? [] : data;
  },
};

/**
 * Activity Log Service
 * Tracks authority actions for accountability
 */
export const activityLogService = {
  /**
   * Log an authority action
   */
  async logActivity({ complaintId, tokenHash, activityType, actionDescription, authority, metadata }) {
    if (!isSupabaseReady()) {
      console.log(`[ActivityLog] ${authority}: ${activityType} — ${actionDescription}`);
      return { success: true, offline: true };
    }

    const { error } = await supabase
      .from('activity_logs')
      .insert({
        complaint_id: complaintId,
        token_hash: tokenHash,
        activity_type: activityType,
        action_description: actionDescription,
        authority,
        metadata: metadata ? JSON.stringify(metadata) : null,
      });

    if (error) console.error('[ActivityLog] Insert failed:', error.message);
    return { success: !error };
  },

  /**
   * Fetch activity logs by token hash
   */
  async fetchByToken(tokenHash, limit = 50) {
    if (!isSupabaseReady()) return [];

    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('token_hash', tokenHash)
      .order('created_at', { ascending: false })
      .limit(limit);

    return error ? [] : data;
  },

  /**
   * Fetch all recent activity logs (admin view)
   */
  async fetchRecent(limit = 100) {
    if (!isSupabaseReady()) return [];

    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    return error ? [] : data;
  },
};
