-- Empty after every successful guarded repair. No historical events are changed.
CREATE TABLE autopsy_projection_rebuild_guards(
 id TEXT PRIMARY KEY,
 matches INTEGER NOT NULL CHECK(matches=1)
);
INSERT OR IGNORE INTO am_core_schema(version) VALUES(14);
