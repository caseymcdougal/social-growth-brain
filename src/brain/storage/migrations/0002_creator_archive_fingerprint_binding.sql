ALTER TABLE brain_creator_archives
  ADD CONSTRAINT brain_creator_archives_payload_fingerprint_matches
  CHECK (
    (
      payload ? 'sourceFingerprint'
      AND jsonb_typeof(payload -> 'sourceFingerprint') = 'string'
      AND payload ->> 'sourceFingerprint' = source_fingerprint
    ) IS TRUE
  );
