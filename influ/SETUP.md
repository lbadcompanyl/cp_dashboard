# Manual-entry database setup

No AI or ScrapeCreators calls. The UI can continue saving locally before setup.

1. Create a dedicated Cloudflare D1 database and execute `migrations/0001_team.sql`
   in its SQL console. Bind it to Pages as `INFLU_DB` for Preview and Production.
2. Protect `/influ` and `/influ/*` using Cloudflare Access for the allowed team.
   Preview already uses Access; use that application's audience for Preview.
   Do not protect all `/api/*` paths: public dashboards depend on them.
3. Set `INFLU_ACCESS_ISSUER` to the Access team origin, e.g.
   `https://YOUR-TEAM.cloudflareaccess.com` (no trailing slash), and
   `INFLU_ACCESS_AUD` to the exact application audience from Access settings.
   Use the correct audience separately for Preview and Production. These values
   must come from the account settings, never from unverified request tokens.
4. Redeploy dev, sign in, and use “เปิดฐานทีม”. A successful connection shows
   the team database status. A fresh database starts empty, without seed names.
   Local data is never uploaded automatically; “นำข้อมูลเครื่องนี้เข้าฐานทีม”
   is available only while the central database is empty. Review the count first.
5. Verify two browsers: save in one, reload in the other. Concurrent stale saves
   must return a conflict and keep the local draft. Never overwrite a newer
   revision silently. Then follow the release rules in the repository's CLAUDE.md.

## Storage and limits

The initial manual-entry store uses one versioned JSON snapshot per environment
with an atomic compare-and-swap, maximum request size 1 MB. It preserves the
existing v3 profiles and project quotes without lossy migration. `influ_team_people`
is a SQL view exposing one person per row with pending/reviewed status.
`influ_search_cache` is a separate physical table reserved for future discovery.
It is not yet populated. At higher volume, migrate snapshots to normalized rows;
do not increase request limits beyond D1 row limits.

`main`, `dev`, and individual preview branches have isolated namespaces. Never
delete the dev namespace during release. Moving dev's entered records to production
is a separate explicit migration, not part of deploying the code.

The API validates Access JWT signatures, issuer, audience and expiry; it rejects
missing configuration, unsigned headers, and cross-origin writes. Do not remove
these checks to make setup appear complete. API errors contain no token or record.

References: [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/),
[D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/).
