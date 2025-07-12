CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS trgm_idx_users_os ON users USING gin ((devicedata->>'OS') gin_trgm_ops); 