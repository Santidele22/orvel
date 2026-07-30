# Environment Context

## Supabase Projects

| Environment | Name | Project Ref | URL | Status | Free Tier |
|-------------|------|-------------|-----|--------|-----------|
| QA / Dev-remote | `orvel-qa-dev` | `rloovjtdaqvcgzlbppfr` | `https://rloovjtdaqvcgzlbppfr.supabase.co` | Reachable (2026-07-30); Phase 2 in progress | Yes |
| Production | `orvel-main` | _pending (Phase 3)_ | _pending_ | Not yet provisioned | Yes |

## Access Status

- **CLI**: `supabase` CLI not installed on this machine. All operations use MCP `execute_sql` and `apply_migration`.
- **MCP**: Connected and authenticated to `orvel-qa-dev` via Supabase MCP server.
- **Free-tier assumption**: Both projects operate under Supabase free tier ($0/month). No paid plan needed for MVP. See `infra/context/supabase.md` for quota monitoring notes.

## Required Environment Variables

_To be documented once secrets are entered (Phase 2 task 2.18)._

### Documentation Rules

- Document environment variable names only when verified from source or provided by Santi.
- Never document secret values.
- Never commit `.env` files or local credentials.
- Keep examples generic unless Santi provides approved public values.

## Expected Future Sections

When verified, add concise sections for:

- Local development.
- Preview/staging.
- Production.
- Supabase project linkage.
- Required environment variables by app/package/function.
