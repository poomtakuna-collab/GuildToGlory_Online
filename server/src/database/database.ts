import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync, realpathSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "./migrations.js";

const serverRoot=fileURLToPath(new URL("../../",import.meta.url));
export function databasePath(configured = process.env.DATABASE_PATH): string {
  if(configured!==undefined && !configured.trim()) throw Error("DATABASE_PATH cannot be empty.");
  const path=resolve(serverRoot,configured ?? "data/guild.sqlite");
  if(!/\.(sqlite|sqlite3|db)$/.test(path)) throw Error("DATABASE_PATH must end in .sqlite, .sqlite3 or .db.");
  // Do not allow the configured file (including existing symlinks) into client assets.
  let ancestor=path;
  while(!existsSync(ancestor) && dirname(ancestor)!==ancestor) ancestor=dirname(ancestor);
  const canonical=resolve(realpathSync(ancestor),relative(ancestor,path));
  const clientPath=resolve(serverRoot,"../client");
  const clientRoot=existsSync(clientPath) ? realpathSync(clientPath) : clientPath;
  const within=relative(clientRoot,canonical);
  if(within==="" || (!within.startsWith("..") && !isAbsolute(within))) throw Error("Database must be outside the client directory.");
  return path;
}
export class GuildDatabase {
  readonly connection: DatabaseSync;
  private depth=0;
  private sequence=0;
  private closed=false;
  constructor(path: string) {
    if(path!==":memory:") mkdirSync(dirname(resolve(path)),{recursive:true});
    this.connection=new DatabaseSync(path);
    try {
      this.connection.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
      migrate(this.connection);
      this.connection.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
    } catch(error) { this.connection.close(); this.closed=true; throw error; }
  }
  /** Synchronous callbacks only. Nested operations use savepoints. */
  transaction<T>(work: () => T): T {
    if(work.constructor.name==="AsyncFunction") throw Error("Database transactions require a synchronous callback.");
    const nested=this.depth>0;
    const savepoint="transaction_"+(++this.sequence);
    this.connection.exec(nested ? "SAVEPOINT "+savepoint : "BEGIN IMMEDIATE");
    this.depth++;
    try {
      const result=work();
      if(result && typeof (result as {then?:unknown}).then==="function") throw Error("Database transactions cannot return a Promise.");
      this.connection.exec(nested ? "RELEASE "+savepoint : "COMMIT");
      return result;
    } catch(error) {
      this.connection.exec(nested ? "ROLLBACK TO "+savepoint+"; RELEASE "+savepoint : "ROLLBACK");
      throw error;
    } finally { this.depth--; }
  }
  close(): void {
    if(this.closed)return;
    if(this.depth) throw Error("Cannot close the database during a transaction.");
    this.connection.close();this.closed=true;
  }
}
