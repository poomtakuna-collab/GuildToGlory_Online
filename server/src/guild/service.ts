import { createHash } from "node:crypto";
import { applyParty, applyRecruitment, createGuild, parseGuild, parseGuildCommand, canonicalCommand, type GuildResponse } from "@guild-to-glory/shared";
import { GuildRepository } from "../database/repository.js";
export class GuildService {
  constructor(private readonly repo:GuildRepository,private readonly mode:string|undefined,private readonly enableLegacy=false) {}
  private features(){return {debugGold:this.mode==="development",legacyImport:this.mode==="development" && this.enableLegacy};}
  private state(playerId:string):GuildResponse {return {ok:true,guild:this.repo.loadGuildForPlayer(playerId),revision:this.repo.revision(playerId),features:this.features()};}
  get(playerId:string):GuildResponse {return this.repo.transaction(()=>this.state(playerId));}
  execute(playerId:string,payload:unknown):GuildResponse {
    const command=parseGuildCommand(payload);
    const fingerprint=createHash("sha256").update(canonicalCommand(command)).digest("hex");
    return this.repo.transaction(()=>{
      if((command.action.type==="debugGold" && !this.features().debugGold) || (command.action.type==="importLegacy" && !this.features().legacyImport))
        return {...this.state(playerId),ok:false,error:{code:"DISABLED",message:"Development operation disabled on this server."},requestId:command.requestId};
      const previous=this.repo.commandReceipt(playerId,command.requestId);
      if(previous){
        const result=this.state(playerId);
        return {...result,...(previous.fingerprint===fingerprint?JSON.parse(previous.outcome):{ok:false,error:{code:"REQUEST_ID_REUSED",message:"Request ID already used for a different command."}}),requestId:command.requestId};
      }
      let outcome:{ok:boolean;error?:{code:string;message:string}}={ok:true};
      if(command.expectedRevision!==this.repo.revision(playerId))outcome={ok:false,error:{code:"CONFLICT",message:"Guild changed in another tab. Latest state loaded; review and try again."}};
      else {
        try {
          this.repo.transaction(()=>{
            let guild=this.repo.loadGuildForPlayer(playerId);
            const a=command.action;
            if(a.type==="create") {if(guild)throw Error("This account already has a Guild.");guild=createGuild(a.name);}
            else if(a.type==="importLegacy") {
              if(!this.features().legacyImport)throw Error("Legacy import is disabled on this server.");
              if(guild)throw Error("Import requires an account without a Guild.");guild=parseGuild(a.guild);
            } else {
              if(a.type==="debugGold" && !this.features().debugGold)throw Error("Debug gold is disabled on this server.");
              if(!guild)throw Error("Create a Guild first.");
              if(a.type==="recruitment")guild=applyRecruitment(guild,a.action);
              else if(a.type==="party")guild=applyParty(guild,a.action);
              else guild=parseGuild({...guild,gold:guild.gold+100000});
            }
            this.repo.saveGuildSnapshot(playerId,guild);this.repo.advanceRevision(playerId);
          });
        }catch(error){
          const message=error instanceof Error && !("code" in error)?error.message:"Guild operation failed. Previous data preserved.";
          outcome={ok:false,error:{code:"REJECTED",message}};
        }
      }
      this.repo.saveCommandReceipt(playerId,command.requestId,fingerprint,outcome);
      return {...this.state(playerId),...outcome,requestId:command.requestId};
    });
  }
}
