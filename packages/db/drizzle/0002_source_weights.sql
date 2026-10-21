-- Default source weights (architecture §7, schema.sql). Tune with outcome data.
INSERT INTO source (kind, name, base_weight) VALUES
 ('pdrm_semakmule',      'PDRM Semak Mule',              0.95),
 ('bank_confirmed',      'Member bank confirmed mule',   0.90),
 ('nsrc_case',           'NSRC case reference',          0.85),
 ('regulator_alert',     'BNM FCA / SC Investor Alert',  0.80),
 ('threat_feed',         'Phishing / malware feeds',     0.60),
 ('news_extraction',     'News and police statements',   0.50),
 ('user_report_verified','User report with evidence',    0.40),
 ('user_report',         'User report, no evidence',     0.25),
 ('model_inference',     'Model-flagged (not evidence)', 0.00);
