-- Run on the database bound as INFLU_DB. Additive; existing rows are preserved.
-- Manual-entry phase: atomic, versioned team snapshot, capped at 1 MB per save.
CREATE TABLE IF NOT EXISTS influ_team_state (
 namespace TEXT PRIMARY KEY,
 revision INTEGER NOT NULL CHECK(revision > 0),
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 updated_at TEXT NOT NULL
);
-- Search results are a separate physical table. Manual-entry endpoints never
-- write here; future discovery must not promote results automatically.
CREATE TABLE IF NOT EXISTS influ_search_cache (
 namespace TEXT NOT NULL,
 query_key TEXT NOT NULL,
 query_json TEXT NOT NULL CHECK(json_valid(query_json)),
 results_json TEXT NOT NULL CHECK(json_valid(results_json)),
 created_at TEXT NOT NULL,
 expires_at TEXT,
 PRIMARY KEY(namespace, query_key)
);
CREATE VIEW IF NOT EXISTS influ_team_people AS
 SELECT s.namespace, json_extract(r.value,'$.id') AS person_id,
 json_extract(r.value,'$.name') AS name,
 json_extract(r.value,'$.status') AS review_status,
 json_extract(r.value,'$.province') AS province, r.value AS profile_json
 FROM influ_team_state s, json_each(s.payload,'$.records') r;
