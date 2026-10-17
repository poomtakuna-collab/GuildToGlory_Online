import type { IncomingMessage,ServerResponse } from "node:http";
import { Guests,RateLimit } from "../auth/guests.js";
import { GuildService } from "./service.js";
export function guildHttp(guests:Guests,service:GuildService,origins:readonly string[]) {
  const limit=new RateLimit(120,60000);
  return (req:IncomingMessage,res:ServerResponse):void=>{
    const reply=(status:number,data:unknown)=>{if(!res.writableEnded){res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(data));}};
    const error=(status:number,code:string,message:string)=>reply(status,{ok:false,error:{code,message}});
    res.setHeader("Cache-Control","no-store");res.setHeader("Vary","Origin");
    if(req.url!=="/guild"){error(404,"NOT_FOUND","Unknown Guild endpoint.");return;}
    const origin=req.headers.origin;
    if(origin && !origins.includes(origin)){error(403,"ORIGIN","Origin not allowed.");return;}
    if(origin)res.setHeader("Access-Control-Allow-Origin",origin);
    if(req.method==="OPTIONS") {res.setHeader("Access-Control-Allow-Methods","GET, POST");res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");res.writeHead(204);res.end();return;}
    if(!limit.allow(req.socket.remoteAddress??"unknown")){error(429,"RATE_LIMIT","Too many Guild requests. Retry later.");return;}
    let identity:{playerId:string}|null;
    try {const header=req.headers.authorization;identity=guests.authenticate(header?.startsWith("Bearer ")?header.slice(7):undefined);}
    catch{error(503,"UNAVAILABLE","Guild service unavailable. Retry safely.");return;}
    if(!identity){error(401,"AUTH","Guest authentication failed. Credential has not been replaced.");return;}
    const playerId=identity.playerId;
    if(req.method==="GET") {try{reply(200,service.get(playerId));}catch{error(503,"UNAVAILABLE","Unable to load Guild.");}return;}
    if(req.method!=="POST" || req.headers["content-type"]?.split(";")[0]!=="application/json"){error(400,"PAYLOAD","Expected JSON Guild command.");return;}
    const chunks:Buffer[]=[];let size=0;
    const timer=setTimeout(()=>error(408,"TIMEOUT","Request timed out. Retry the same request ID."),5000);
    res.on("close",()=>clearTimeout(timer));
    req.on("data",chunk=>{size+=chunk.length;if(size>262144){error(413,"SIZE","Guild payload exceeds 256 KiB.");return;}if(!res.writableEnded)chunks.push(Buffer.from(chunk));});
    req.on("error",()=>{clearTimeout(timer);error(400,"PAYLOAD","Invalid Guild request.");});
    req.on("end",()=>{
      clearTimeout(timer);if(res.writableEnded)return;
      let payload:unknown;try{payload=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{error(400,"PAYLOAD","Invalid JSON.");return;}
      try{reply(200,service.execute(playerId,payload));}
      catch{error(400,"COMMAND","Invalid or unavailable Guild command. Retry with the same request ID.");}
    });
  };
}
