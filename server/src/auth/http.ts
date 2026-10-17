import type { IncomingMessage, ServerResponse } from "node:http";
import { Guests, RateLimit } from "./guests.js";
export function guestHttp(guests:Guests,origins:readonly string[]) {
  const perIP=new RateLimit(5,10*60*1000),global=new RateLimit(100,60*60*1000);
  return (req:IncomingMessage,res:ServerResponse):void=>{
    if(req.url!=="/guest-account"){res.writeHead(404);res.end();return;}
    res.setHeader("Cache-Control","no-store");res.setHeader("Vary","Origin");
    const origin=req.headers.origin;
    if(origin && !origins.includes(origin)){res.writeHead(403);res.end();return;}
    if(origin)res.setHeader("Access-Control-Allow-Origin",origin);
    if(req.method==="OPTIONS"){
      res.setHeader("Access-Control-Allow-Methods","POST");res.setHeader("Access-Control-Allow-Headers","Content-Type");res.writeHead(204);res.end();return;
    }
    const reply=(status:number,value:unknown)=>{if(res.writableEnded)return;res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(value));};
    if(req.method!=="POST" || req.headers["content-type"]?.split(";")[0]!=="application/json"){reply(400,{error:"Invalid guest request."});return;}
    const ip=req.socket.remoteAddress??"unknown";
    if(!perIP.allow(ip) || !global.allow("all")){reply(429,{error:"Guest creation limit reached. Try again later."});return;}
    let body="",bytes=0;
    const timer=setTimeout(()=>reply(408,{error:"Guest request timed out."}),5000);
    res.on("close",()=>clearTimeout(timer));
    req.on("data",chunk=>{bytes+=chunk.length;if(bytes>128){reply(413,{error:"Guest request too large."});return;}body+=chunk.toString("utf8");});
    req.on("error",()=>{clearTimeout(timer);reply(400,{error:"Invalid guest request."});});
    req.on("end",()=>{
      clearTimeout(timer);if(res.writableEnded)return;
      try {const value=JSON.parse(body);if(!value || Array.isArray(value) || typeof value!=="object" || Object.keys(value).length)throw Error();}
      catch {reply(400,{error:"Invalid guest request."});return;}
      try {reply(201,guests.create());}catch{reply(503,{error:"Guest service unavailable. Please retry."});}
    });
  };
}
