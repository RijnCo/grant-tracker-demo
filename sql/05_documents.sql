-- =============================================================================
-- SEFA Grant Tracking Database — Award Documents
-- PDFs (award letters, amendments, invoices) attached to an award, stored on
-- disk under uploads/ (or referenced by external URL) with the path recorded
-- here so the UI can link to them. Part of the 2 CFR 200.334 record trail.
-- =============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE award_document (
    document_id  INTEGER PRIMARY KEY,
    award_id     INTEGER NOT NULL REFERENCES award(award_id),
    file_name    TEXT NOT NULL,
    storage_path TEXT,                 -- e.g. uploads/doc_1.pdf (uploaded file)
    external_url TEXT,                 -- or a link to an external system
    doc_type     TEXT NOT NULL DEFAULT 'award_letter'
                 CHECK (doc_type IN ('award_letter','amendment','invoice','report','other')),
    content_type TEXT DEFAULT 'application/pdf',
    file_size    INTEGER,
    uploaded_by  TEXT,
    uploaded_at  TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (storage_path IS NOT NULL OR external_url IS NOT NULL)
);

CREATE INDEX idx_award_document_award ON award_document(award_id);
