import { parseGuild, parseGuildCommand, type GuildAction,type GuildCommand,type GuildResponse } from "@guild-to-glory/shared";
export interface GuildApi {
 load():Promise<GuildResponse>; command(action:GuildAction):Promise<GuildResponse>; retry():Promise<GuildResponse>; hasPending():boolean;
}
interface PendingStore {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
export function createGuildApi(serverUrl:string,account:{ensure():Promise<string>},store:()=>PendingStore,request:typeof fetch=fetch):GuildApi {
  const url=new URL(serverUrl);url.protocol=(url.protocol==="wss:"||url.protocol==="https:")?"https:":"http:";
  url.pathname=url.pathname.replace(/\/$/,"")+"/guild";url.search="";url.hash="";
  let accountKey:string|undefined;let revision:number|undefined;let pending:{command:GuildCommand;key:string}|undefined;let busy=false;
  async function credentials(){
    const credential=await account.ensure();
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(credential));
    const key="guild-to-glory.pending-command:"+url.href+":"+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
    if(accountKey!==key){accountKey=key;revision=undefined;}
    const raw=store().getItem(key);pending=raw ? {command:JSON.parse(raw),key}:undefined;
    return {credential,key};
  }
  async function send(credential:string,command?:GuildCommand):Promise<GuildResponse>{
    const response=await request(url,{method:command?"POST":"GET",headers:{Authorization:"Bearer "+credential,...(command?{"Content-Type":"application/json"}:{})},
      ...(command?{body:JSON.stringify(command)}:{}),credentials:"omit",cache:"no-store",signal:AbortSignal.timeout(15000)});
    const value=await response.json();
    if(!response.ok)throw Error(value.error?.message??"Guild request failed. Retry safely.");
    if(typeof value.ok!=="boolean" || !Number.isSafeInteger(value.revision) || value.revision<0 || !value.features || typeof value.features.debugGold!=="boolean" || typeof value.features.legacyImport!=="boolean" ||
      (command && value.requestId!==command.requestId))throw Error("Invalid Guild response. Retry safely.");
    if(value.guild!==null)value.guild=parseGuild(value.guild);
    revision=value.revision;return value as GuildResponse;
  }
  async function exclusive<T>(work:()=>Promise<T>):Promise<T>{if(busy)throw Error("Guild request already running.");busy=true;try{return await work();}finally{busy=false;}}
  return {
    hasPending:()=>!!pending,
    load:()=>exclusive(async()=>{const {credential}=await credentials();return send(credential);}),
    command:action=>exclusive(async()=>{
      const {credential,key}=await credentials();if(pending)throw Error("An earlier command is unresolved. Use Retry before another action.");
      if(revision===undefined)throw Error("Load Guild before making changes.");
      const command=parseGuildCommand({requestId:crypto.randomUUID(),expectedRevision:revision,action});
      store().setItem(key,JSON.stringify(command));pending={key,command};
      const result=await send(credential,command);store().removeItem(key);pending=undefined;return result;
    }),
    retry:()=>exclusive(async()=>{
      const {credential}=await credentials();if(!pending)return send(credential);
      const {key,command}=pending;const result=await send(credential,command);store().removeItem(key);pending=undefined;return result;
    })
  };
}
