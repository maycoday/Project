(function(global){
  const CONFIG = global.APP_CONFIG || {};
  const TABLE = CONFIG.COMPLAINTS_TABLE || 'complaints_secure';

  class AawaazDataService {
    constructor(){
      this.enabled = Boolean(global.supabase && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && !CONFIG.SUPABASE_URL.includes('YOUR-PROJECT'));
      if(this.enabled){
        this.client = global.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
          auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
        });
      } else {
        console.info('[Aawaaz] Supabase client not initialized. Add real credentials in js/supabaseConfig.js.');
      }
    }

    async saveComplaint(payload){
      if(!this.enabled){
        console.warn('[Aawaaz] Running in offline mode — encrypted complaint not persisted.');
        return {offline:true};
      }
      const {error} = await this.client.from(TABLE).insert(payload);
      if(error) throw error;
      return {success:true};
    }

    async findComplaintByTokenHash(tokenHash){
      if(!this.enabled) return null;
      const {data, error} = await this.client.from(TABLE)
        .select('*')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if(error && error.code !== 'PGRST116') throw error;
      return data || null;
    }

    async fetchPatternReports(limit=250){
      if(!this.enabled) return [];
      const {data, error} = await this.client.from(TABLE)
        .select('id, created_at, metadata, authorities, ciphertext_b64, iv_b64')
        .order('created_at',{ascending:false})
        .limit(limit);
      if(error) throw error;
      return data || [];
    }

    async fetchAllComplaints(limit=500){
      if(!this.enabled) return [];
      const {data, error} = await this.client.from(TABLE)
        .select('id, created_at, authorities, review_status')
        .order('created_at',{ascending:false})
        .limit(limit);
      if(error) throw error;
      return data || [];
    }

    async fetchComplaintsByAuthority(authority, limit=250){
      if(!this.enabled) return [];
      const {data, error} = await this.client.from(TABLE)
        .select('*')
        .contains('authorities', [authority])
        .order('created_at',{ascending:false})
        .limit(limit);
      if(error) throw error;
      return data || [];
    }

    async updateComplaintStatus(complaintId, status, reviewedBy){
      if(!this.enabled) throw new Error('Supabase not enabled');
      const update = {
        review_status: status,
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString()
      };
      const {error} = await this.client.from(TABLE)
        .update(update)
        .eq('id', complaintId);
      if(error) throw error;
      return {success:true};
    }
  }

  global.AawaazDataService = AawaazDataService;
  global.AawaazData = new AawaazDataService();
})(window);
