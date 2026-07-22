-- Throwaway database for the integration suites (TEST_DATABASE_URL). They TRUNCATE and
-- re-seed on every run, so they must never point at the dev database.
-- Postgres runs this only when the data volume is empty; on an existing volume create it by
-- hand: docker compose exec postgres createdb -U tickethub tickethub_test
CREATE DATABASE tickethub_test OWNER tickethub;
