import type { DatabaseSync } from "node:sqlite";

export interface Migration { version: number; name: string; sql: string }
export const MIGRATIONS: readonly Migration[] = [{version:1,name:"guild_foundation",sql:
`CREATE TABLE players (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(id)) > 0),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE guilds (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(id)) > 0),
  owner_player_id TEXT NOT NULL UNIQUE REFERENCES players(id),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 3 AND 24),
  level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 9007199254740991),
  gold INTEGER NOT NULL CHECK(gold BETWEEN 0 AND 9007199254740991),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE adventurers (
  id TEXT PRIMARY KEY NOT NULL,
  guild_id TEXT NOT NULL REFERENCES guilds(id),
  name TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK(json_valid(rarity)),
  level INTEGER NOT NULL CHECK(level >= 1),
  race TEXT NOT NULL, class_name TEXT,
  base_stats TEXT NOT NULL CHECK(json_valid(base_stats)),
  total_base_stats INTEGER NOT NULL,
  starting_skills TEXT NOT NULL CHECK(json_valid(starting_skills)),
  traits TEXT NOT NULL CHECK(json_valid(traits)),
  roster_index INTEGER NOT NULL CHECK(roster_index >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(guild_id,id)
) STRICT;
CREATE INDEX adventurers_guild ON adventurers(guild_id,roster_index);
CREATE TABLE pending_recruits (
  guild_id TEXT PRIMARY KEY NOT NULL REFERENCES guilds(id),
  adventurer_data TEXT NOT NULL CHECK(json_valid(adventurer_data)),
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE active_parties (
  guild_id TEXT PRIMARY KEY NOT NULL REFERENCES guilds(id),
  leader_adventurer_id TEXT,
  FOREIGN KEY(guild_id,leader_adventurer_id)
    REFERENCES active_party_members(guild_id,adventurer_id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE active_party_members (
  guild_id TEXT NOT NULL REFERENCES active_parties(guild_id),
  adventurer_id TEXT NOT NULL,
  slot_index INTEGER NOT NULL CHECK(slot_index BETWEEN 0 AND 3),
  PRIMARY KEY(guild_id,adventurer_id),
  UNIQUE(guild_id,slot_index),
  FOREIGN KEY(guild_id,adventurer_id) REFERENCES adventurers(guild_id,id) ON DELETE CASCADE
) STRICT;
CREATE TRIGGER clear_removed_leader BEFORE DELETE ON active_party_members
BEGIN
  UPDATE active_parties SET leader_adventurer_id = NULL
    WHERE guild_id = OLD.guild_id AND leader_adventurer_id = OLD.adventurer_id;
END;`}];

/** All pending migrations and their version records commit together. Never reset data. */
export function migrate(db: DatabaseSync, migrations: readonly Migration[] = MIGRATIONS): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT");
    const applied=db.prepare("SELECT version,name FROM schema_migrations ORDER BY version").all();
    for(let i=0;i<migrations.length;i++) if(migrations[i]!.version!==i+1) throw Error("Migration versions must be consecutive.");
    for(let i=0;i<applied.length;i++) {
      if(applied[i]!.version!==migrations[i]?.version || applied[i]!.name!==migrations[i]?.name) throw Error("Unsupported database migration history. Database preserved.");
    }
    for(const migration of migrations.slice(applied.length)) {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations(version,name,applied_at) VALUES (?,?,?)").run(migration.version,migration.name,new Date().toISOString());
    }
    if(db.prepare("PRAGMA foreign_key_check").all().length) throw Error("Database contains invalid foreign key references.");
    db.exec("COMMIT");
  } catch(error) { db.exec("ROLLBACK"); throw error; }
}
