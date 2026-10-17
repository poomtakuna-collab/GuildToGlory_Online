import { ServerError, type AuthContext } from "@colyseus/core";
import { ConnectionRoom } from "../rooms/ConnectionRoom.js";
import { Guests, RateLimit } from "./guests.js";
/** Dependency captured by the server, never taken from client room options. */
export function authenticatedRoom(guests:Guests) {
  const attempts=new RateLimit(60,60000);
  return class GuestWorldRoom extends ConnectionRoom {
    static override async onAuth(token:string,options:unknown,context:AuthContext):Promise<{playerId:string}> {
      if(!attempts.allow(context.req?.socket.remoteAddress??"unknown"))throw new ServerError(429,"Authentication limit reached. Please retry later.");
      if(!options || typeof options!=="object" || Array.isArray(options) || Object.keys(options).length)throw new ServerError(401,"Guest authentication failed.");
      try {
        const identity=guests.authenticate(token);
        if(identity)return identity;
      } catch {throw new ServerError(503,"Guest authentication unavailable. Please retry.");}
      throw new ServerError(401,"Guest authentication failed. Stored credential has not been replaced.");
    }
  };
}
