-- Study startup readiness (ADR-0034), derived per ADR-0004/0006: one row per
-- study, every column computed from existing facts. No task table, no stored
-- checklist state — a startup item "completes" by the underlying fact changing.

CREATE VIEW v_study_startup AS
SELECT
  st.id AS study_id,
  st.status,
  coalesce(sc.total, 0)::int AS site_count,
  coalesce(sc.pending, 0)::int AS pending_site_count,
  coalesce(sc.active, 0)::int AS active_site_count,
  coalesce(pi.no_pi, 0)::int AS sites_without_pi_count,
  coalesce(rc.total, 0)::int AS rule_count,
  coalesce(rc.study_rules, 0)::int AS study_rule_count,
  coalesce(rc.site_rules, 0)::int AS site_rule_count,
  coalesce(rc.person_rules, 0)::int AS person_rule_count,
  coalesce(us.unsynced, 0)::int AS unsynced_expected_count,
  coalesce(ed.total, 0)::int AS expected_total,
  coalesce(ed.missing, 0)::int AS missing_count,
  coalesce(ms.total, 0)::int AS milestone_count,
  coalesce(ms.overdue, 0)::int AS overdue_milestone_count,
  coalesce(ag.people, 0)::int AS granted_people_count
FROM study st
LEFT JOIN LATERAL (
  SELECT count(*) AS total,
         count(*) FILTER (WHERE ss.status = 'pending') AS pending,
         count(*) FILTER (WHERE ss.status = 'active') AS active
  FROM study_site ss WHERE ss.study_id = st.id
) sc ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS no_pi
  FROM study_site ss
  WHERE ss.study_id = st.id AND ss.status IN ('pending', 'active')
    AND NOT EXISTS (
      SELECT 1 FROM study_site_role ssr
      WHERE ssr.study_site_id = ss.id
        AND ssr.role = 'principal_investigator'
        AND (ssr.end_date IS NULL OR ssr.end_date >= CURRENT_DATE))
) pi ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS total,
         count(*) FILTER (WHERE rr.scope_level = 'study') AS study_rules,
         count(*) FILTER (WHERE rr.scope_level = 'study_site') AS site_rules,
         count(*) FILTER (WHERE rr.scope_level = 'person_role') AS person_rules
  FROM requirement_rule rr WHERE rr.study_id = st.id
) rc ON true
-- Placeholders ctms_sync_expected_documents (migration 0001) would insert but
-- hasn't yet: the same three scope-level sources, each guarded by NOT EXISTS
-- against expected_document. "Sync needed" is derived, never flagged.
LEFT JOIN LATERAL (
  SELECT
    (SELECT count(*)
     FROM requirement_rule rr
     WHERE rr.study_id = st.id AND rr.scope_level = 'study'
       AND NOT EXISTS (
         SELECT 1 FROM expected_document e
         WHERE e.rule_id = rr.id AND e.study_site_id IS NULL AND e.person_id IS NULL))
    +
    (SELECT count(*)
     FROM requirement_rule rr
     JOIN study_site ss ON ss.study_id = rr.study_id AND ss.status IN ('pending', 'active')
     WHERE rr.study_id = st.id AND rr.scope_level = 'study_site'
       AND NOT EXISTS (
         SELECT 1 FROM expected_document e
         WHERE e.rule_id = rr.id AND e.study_site_id = ss.id AND e.person_id IS NULL))
    +
    (SELECT count(*)
     FROM (
       SELECT DISTINCT rr.id AS rule_id, ssr.study_site_id, ssr.person_id
       FROM requirement_rule rr
       JOIN study_site ss ON ss.study_id = rr.study_id AND ss.status IN ('pending', 'active')
       JOIN study_site_role ssr ON ssr.study_site_id = ss.id
       WHERE rr.study_id = st.id AND rr.scope_level = 'person_role'
         AND (rr.applies_to_roles IS NULL OR ssr.role::text = ANY (rr.applies_to_roles))
         AND (ssr.end_date IS NULL OR ssr.end_date >= CURRENT_DATE)
     ) pending_scope
     WHERE NOT EXISTS (
       SELECT 1 FROM expected_document e
       WHERE e.rule_id = pending_scope.rule_id
         AND e.study_site_id = pending_scope.study_site_id
         AND e.person_id = pending_scope.person_id))
    AS unsynced
) us ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS total,
         count(*) FILTER (WHERE v.status = 'missing') AS missing
  FROM v_expected_document_status v WHERE v.study_id = st.id
) ed ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS total,
         count(*) FILTER (WHERE m.status = 'overdue') AS overdue
  FROM v_milestone_status m WHERE m.study_id = st.id
) ms ON true
-- People granted access to this study specifically (study- or site-scoped);
-- unscoped grants cover every study and would only add noise here.
LEFT JOIN LATERAL (
  SELECT count(DISTINCT g.person_id) AS people
  FROM access_grant g
  WHERE g.revoked_at IS NULL
    AND (g.study_id = st.id
         OR g.study_site_id IN (SELECT id FROM study_site WHERE study_id = st.id))
) ag ON true;
