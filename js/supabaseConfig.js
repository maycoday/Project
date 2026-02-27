// Populate these values with your Supabase project credentials.
// Never commit actual secrets to version control.
window.APP_CONFIG = Object.assign({}, window.APP_CONFIG, {
  SUPABASE_URL: window.APP_CONFIG?.SUPABASE_URL || 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: window.APP_CONFIG?.SUPABASE_ANON_KEY || 'YOUR_PUBLIC_ANON_KEY',
  COMPLAINTS_TABLE: window.APP_CONFIG?.COMPLAINTS_TABLE || 'complaints_secure'
});
