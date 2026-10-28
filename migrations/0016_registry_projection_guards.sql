-- Forward-only: preserve publication consent and avoid inherited outer UPSERT conflict policy.
DROP TRIGGER aggregator_registry_insert;
CREATE TRIGGER aggregator_registry_insert AFTER INSERT ON campaigns BEGIN
INSERT INTO am_core_exhibits(id,payload,source_url,review_status,updated_at)
 VALUES('agg_'||NEW.id,json_object('registry_source','aggregator','aggregator_id',NEW.id,'name',NEW.name,'project_name',NEW.name,'slug','agg_'||NEW.slug,'status',NEW.status,'chains',json(NEW.chain),'category',NEW.category,'description',NEW.description,'official_urls',json(NEW.official_urls),'claim_deadline_at',NEW.claim_deadline_at,'snapshot_at',NEW.snapshot_at,'visibility','private'),json_extract(NEW.official_urls,'$[0]'),NEW.status,NEW.updated_at)
 ON CONFLICT(id) DO UPDATE SET payload=json_patch(am_core_exhibits.payload,json_remove(excluded.payload,'$.visibility')),source_url=excluded.source_url,review_status=excluded.review_status,updated_at=excluded.updated_at
 WHERE json_extract(am_core_exhibits.payload,'$.registry_source')='aggregator' AND json_extract(am_core_exhibits.payload,'$.aggregator_id')=NEW.id;
 INSERT OR IGNORE INTO campaign_registry_links(aggregator_id,canonical_id)
 SELECT NEW.id,e.id FROM am_core_exhibits e WHERE e.id='agg_'||NEW.id
 AND json_extract(e.payload,'$.registry_source')='aggregator' AND json_extract(e.payload,'$.aggregator_id')=NEW.id
 AND NOT EXISTS(SELECT 1 FROM campaign_registry_links l WHERE l.aggregator_id=NEW.id OR l.canonical_id=e.id);
END;
DROP TRIGGER aggregator_registry_update;
CREATE TRIGGER aggregator_registry_update AFTER UPDATE ON campaigns BEGIN
INSERT INTO am_core_exhibits(id,payload,source_url,review_status,updated_at)
 VALUES('agg_'||NEW.id,json_object('registry_source','aggregator','aggregator_id',NEW.id,'name',NEW.name,'project_name',NEW.name,'slug','agg_'||NEW.slug,'status',NEW.status,'chains',json(NEW.chain),'category',NEW.category,'description',NEW.description,'official_urls',json(NEW.official_urls),'claim_deadline_at',NEW.claim_deadline_at,'snapshot_at',NEW.snapshot_at,'visibility','private'),json_extract(NEW.official_urls,'$[0]'),NEW.status,NEW.updated_at)
 ON CONFLICT(id) DO UPDATE SET payload=json_patch(am_core_exhibits.payload,json_remove(excluded.payload,'$.visibility')),source_url=excluded.source_url,review_status=excluded.review_status,updated_at=excluded.updated_at
 WHERE json_extract(am_core_exhibits.payload,'$.registry_source')='aggregator' AND json_extract(am_core_exhibits.payload,'$.aggregator_id')=NEW.id;
 INSERT OR IGNORE INTO campaign_registry_links(aggregator_id,canonical_id)
 SELECT NEW.id,e.id FROM am_core_exhibits e WHERE e.id='agg_'||NEW.id
 AND json_extract(e.payload,'$.registry_source')='aggregator' AND json_extract(e.payload,'$.aggregator_id')=NEW.id
 AND NOT EXISTS(SELECT 1 FROM campaign_registry_links l WHERE l.aggregator_id=NEW.id OR l.canonical_id=e.id);
END;
INSERT OR IGNORE INTO am_core_schema(version) VALUES(13);
