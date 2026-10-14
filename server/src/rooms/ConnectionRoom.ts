import { Room, type Client } from "@colyseus/core";
import { NETWORK_MESSAGES, isPingMessage, type PongMessage } from "@guild-to-glory/shared";

export class ConnectionRoom extends Room {
  onCreate(): void {
    this.onMessage(NETWORK_MESSAGES.ping, (client: Client, payload: unknown) => {
      if (!isPingMessage(payload)) return;

      const response: PongMessage = {
        sentAt: payload.sentAt,
        serverTime: Date.now()
      };
      client.send(NETWORK_MESSAGES.pong, response);
    });
  }
}