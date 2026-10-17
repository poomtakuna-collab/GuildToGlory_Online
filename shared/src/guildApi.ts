import { parseGuild, type GuildData } from "./guild.js";
import type { RecruitmentAction } from "./recruitment.js";
import type { PartyAction } from "./party.js";
export type GuildAction = {type:"create";name:string} | {type:"recruitment";action:RecruitmentAction} |
  {type:"party";action:PartyAction} | {type:"debugGold"} | {type:"importLegacy";guild:GuildData};
export interface GuildCommand { requestId:string; expectedRevision:number; action:GuildAction }
export interface GuildResponse {
  ok:boolean; guild:GuildData|null; revision:number;
  features:{debugGold:boolean;legacyImport:boolean};
  error?:{code:string;message:string}; requestId?:string;
}
const object=(v:unknown):v is Record<string,unknown>=>typeof v==="object" && v!==null && !Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length && keys.every(k=>Object.hasOwn(v,k));
const id=(v:unknown)=>typeof v==="string" && v.length>0 && v.length<=128;
export function parseGuildCommand(value:unknown):GuildCommand {
  const fail=():never=>{throw Error("Invalid Guild command.");};
  if(!object(value) || !exact(value,["requestId","expectedRevision","action"]) || typeof value.requestId!=="string" ||
    !/^[a-f0-9-]{36}$/i.test(value.requestId) || !Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number)<0 || !object(value.action))return fail();
  const a=value.action;
  if(a.type==="create") {if(!exact(a,["type","name"]) || typeof a.name!=="string" || a.name.length>96)return fail();}
  else if(a.type==="debugGold") {if(!exact(a,["type"]))return fail();}
  else if(a.type==="importLegacy") {if(!exact(a,["type","guild"]))return fail();a.guild=parseGuild(a.guild);}
  else if(a.type==="recruitment" || a.type==="party") {
    if(!exact(a,["type","action"]) || !object(a.action))return fail();
    const b=a.action;
    if((a.type==="recruitment" && b.type==="roll") || (a.type==="party" && b.type==="clear")) {if(!exact(b,["type"]))return fail();}
    else if(a.type==="party" && b.type==="replace") {if(!exact(b,["type","id","replacementId"]) || !id(b.id) || !id(b.replacementId))return fail();}
    else if((a.type==="recruitment"?["recruit","reject","dismiss"]:["add","remove","setLeader"]).includes(b.type as string)) {
      if(!exact(b,["type","id"]) || !id(b.id))return fail();
    } else return fail();
  } else return fail();
  return structuredClone(value) as unknown as GuildCommand;
}
/** Stable fingerprint regardless of JSON object key order. */
export function canonicalCommand(value:unknown):string {
  if(Array.isArray(value))return "["+value.map(canonicalCommand).join(",")+"]";
  if(object(value))return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonicalCommand(value[k])).join(",")+"}";
  return JSON.stringify(value);
}
