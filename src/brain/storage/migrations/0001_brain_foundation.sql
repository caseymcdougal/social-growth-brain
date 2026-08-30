CREATE TABLE IF NOT EXISTS brain_opportunities (
  id UUID PRIMARY KEY,
  creator_id TEXT NOT NULL CHECK (creator_id = 'casey-mcdougal'),
  revision INTEGER NOT NULL CHECK (revision > 0),
  status TEXT NOT NULL,
  publish_by TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS brain_opportunities_inbox_idx
  ON brain_opportunities (status, publish_by, revision DESC);
CREATE TABLE IF NOT EXISTS brain_opportunity_revisions (
  opportunity_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  revised_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  PRIMARY KEY (opportunity_id, revision)
);
CREATE TABLE IF NOT EXISTS brain_signal_evidence (
  id UUID PRIMARY KEY,
  opportunity_id UUID NOT NULL,
  prediction_revision INTEGER NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  FOREIGN KEY (opportunity_id, prediction_revision)
    REFERENCES brain_opportunity_revisions (opportunity_id, revision)
);
CREATE TABLE IF NOT EXISTS brain_draft_variants (
  id UUID PRIMARY KEY,
  opportunity_id UUID NOT NULL,
  prediction_revision INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  FOREIGN KEY (opportunity_id, prediction_revision)
    REFERENCES brain_opportunity_revisions (opportunity_id, revision)
);
CREATE TABLE IF NOT EXISTS brain_decision_events (
  id UUID PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES brain_opportunities(id),
  opportunity_revision INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  FOREIGN KEY (opportunity_id, opportunity_revision)
    REFERENCES brain_opportunity_revisions (opportunity_id, revision)
);
CREATE TABLE IF NOT EXISTS brain_outcome_snapshots (
  id UUID PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES brain_opportunities(id),
  observed_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS brain_compliance_checks (
  id UUID PRIMARY KEY,
  retained_post_id TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS brain_compliance_checks_post_idx
  ON brain_compliance_checks (retained_post_id, checked_at DESC);
CREATE TABLE IF NOT EXISTS brain_creator_archives (
  id UUID PRIMARY KEY,
  creator_id TEXT NOT NULL CHECK (creator_id = 'casey-mcdougal'),
  source_fingerprint TEXT NOT NULL UNIQUE,
  imported_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);
CREATE OR REPLACE FUNCTION brain_reject_immutable_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'brain append-only table % cannot be updated or deleted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'brain_opportunity_revisions','brain_signal_evidence','brain_draft_variants',
    'brain_decision_events','brain_outcome_snapshots','brain_compliance_checks','brain_creator_archives'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', table_name || '_immutable', table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION brain_reject_immutable_mutation()', table_name || '_immutable', table_name);
  END LOOP;
END;
$$;
