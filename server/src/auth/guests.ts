import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { GuildDatabase } from "../database/database.js";
export const validCredential=(value:unknown):value is string=>typeof value==="string" && /^[a-f0-9]{64}$/.test(value);
const hash=(credential:string)=>createHash("sha256").update(credential).digest("hex");
export class Guests {
  constructor(private readonly db:GuildDatabase) {}
  create(): {playerId:string;credential:string} {
    const playerId=randomUUID(),credential=randomBytes(32).toString("hex"),now=new Date().toISOString();
    this.db.transaction(()=>{
      this.db.connection.prepare("INSERT INTO players(id,created_at,updated_at) VALUES (?,?,?)").run(playerId,now,now);
      this.db.connection.prepare("INSERT INTO guest_credentials(player_id,credential_hash,created_at) VALUES (?,?,?)").run(playerId,hash(credential),now);
    });
    return {playerId,credential};
  }
  authenticate(credential:unknown): {playerId:string} | null {
    if(!validCredential(credential))return null;
    const row=this.db.connection.prepare("SELECT player_id FROM guest_credentials WHERE credential_hash=?").get(hash(credential));
    return row ? {playerId:row.player_id as string} : null;
  }
}
/** In-memory single-server limiter. Never trust forwarded IP headers. */
export class RateLimit {
  private readonly entries=new Map<string,{count:number;until:number}>();
  constructor(private readonly limit:number,private readonly period:number) {}
  allow(key:string,now=Date.now()):boolean {
    for(const [ip,entry] of this.entries)if(entry.until<=now)this.entries.delete(ip);
    let entry=this.entries.get(key);
    if(!entry){if(this.entries.size>=10000)return false;entry={count:0,until:now+this.period};this.entries.set(key,entry);}
    return ++entry.count<=this.limit;
  }
}
