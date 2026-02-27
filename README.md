# Project

## Supabase Integration

1. Create a `complaints_secure` table with the following columns (feel free to rename, just update `COMPLAINTS_TABLE` inside `js/supabaseConfig.js`):
	- `id uuid primary key default gen_random_uuid()`
	- `reference text`
	- `created_at timestamptz default now()`
	- `token_hash text unique not null`
	- `token_hint text`
	- `ciphertext_b64 text not null`
	- `iv_b64 text not null`
	- `authorities text[]`
	- `wrapped_keys jsonb`
	- `metadata jsonb`

2. Add Row Level Security policies so only the anon key can insert/select hashed records you need (or create RPCs). No plaintext complaint body is ever stored—only AES-GCM ciphertext plus minimal metadata for analytics.

3. Copy your Supabase project URL and anon key into `js/supabaseConfig.js`. Never commit production secrets; this file is ignored by default when you swap the placeholders.

4. The user portal automatically hashes tracking tokens with SHA-256 before saving. The pattern-detection dashboard reads the metadata field to drive charts. Populate optional metadata keys such as `category`, `department`, `urgency`, and `sentiment` if you want richer analytics.