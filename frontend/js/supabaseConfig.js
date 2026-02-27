// Populate these values with your Supabase project credentials.
// Never commit actual secrets to version control.
window.APP_CONFIG = Object.assign({}, window.APP_CONFIG, {
  SUPABASE_URL: window.APP_CONFIG?.SUPABASE_URL || 'https://kzfunoamfpohgxcgkrlb.supabase.co',
  SUPABASE_ANON_KEY: window.APP_CONFIG?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6ZnVub2FtZnBvaGd4Y2drcmxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxODA3MTYsImV4cCI6MjA4Nzc1NjcxNn0.YSoj20A8eUVwxAKDjae3Jy97m1qcvNjUJh7XN3CMkss',
  COMPLAINTS_TABLE: window.APP_CONFIG?.COMPLAINTS_TABLE || 'complaints_secure'
});
