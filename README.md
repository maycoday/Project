# Project

## Supabase Integration

### Quick Setup

1. **Run the schema**: Open your Supabase project → SQL Editor → paste the contents of `supabase_schema.sql` → Execute. This creates the `complaints_secure` table with proper indexes and RLS policies.

2. **Configure credentials**: Your Supabase URL and anon key are already in `js/supabaseConfig.js`. These are public credentials (safe for client-side use).

3. **Test the integration**: File a complaint through the user portal. It will be encrypted client-side and stored in Supabase. Check your database to see the ciphertext (no plaintext is ever saved).

4. **View analytics**: Navigate to the Pattern Detection page. It will automatically load encrypted complaints from Supabase and display metadata-only analytics.

### What Gets Stored

- ✅ **Encrypted ciphertext** (AES-256-GCM)
- ✅ **Hashed tracking token** (SHA-256)
- ✅ **Wrapped encryption keys** (RSA-OAEP per authority)
- ✅ **Metadata only** (category, department, urgency, sentiment)
- ❌ **NO PLAINTEXT** ever touches the database
- ❌ **NO IP ADDRESSES** (unless you add logging)
- ❌ **NO USER IDENTITIES** (fully anonymous)

### Schema Details

The `complaints_secure` table includes:
- **token_hash**: SHA-256 hash of tracking tokens (enables lookup without storing raw tokens)
- **ciphertext_b64**: Base64-encoded AES-GCM ciphertext of the complaint
- **iv_b64**: Initialization vector for decryption
- **wrapped_keys**: JSON object with RSA-wrapped AES keys for each selected authority
- **metadata**: JSON object with non-sensitive analytics data (category, department, scores)

See `supabase_schema.sql` for the complete schema, indexes, RLS policies, and helper functions.