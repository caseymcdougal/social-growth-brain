ALTER TABLE brain_creator_archives
  ADD CONSTRAINT brain_creator_archives_payload_fingerprint_matches
  CHECK (
    jsonb_typeof(payload -> 'sourceFingerprint') = 'string'
    AND payload ->> 'sourceFingerprint' = source_fingerprint
  );
