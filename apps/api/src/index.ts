import { API_PATHS, API_PROTOCOL_VERSION } from "./protocol.ts";

interface Env {
  SERVER_ROOMS: DurableObjectNamespace;
}

interface VersionPayload {
  product: "trunk-api";
  version: string;
  protocolVersion: number;
}

const VERSION_PAYLOAD: VersionPayload = {
  product: "trunk-api",
  version: "0.0.0",
  protocolVersion: API_PROTOCOL_VERSION,
};

const textHeaders = {
  "content-type": "text/plain; charset=utf-8",
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === API_PATHS.health) {
      return new Response("ok\n", { headers: textHeaders });
    }

    if (url.pathname === API_PATHS.version) {
      return Response.json(VERSION_PAYLOAD, { headers: jsonHeaders });
    }

    if (url.pathname !== API_PATHS.server && url.pathname !== API_PATHS.browser) {
      return new Response("not found\n", { status: 404, headers: textHeaders });
    }

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("websocket upgrade required\n", { status: 426, headers: textHeaders });
    }

    const serverId = url.searchParams.get("serverId")?.trim();
    if (!serverId) {
      return new Response("serverId required\n", { status: 400, headers: textHeaders });
    }

    if (url.pathname === API_PATHS.server && !request.headers.get("x-trunk-server-proof")) {
      return new Response("server proof required\n", { status: 401, headers: textHeaders });
    }

    if (url.pathname === API_PATHS.browser && !request.headers.get("authorization")) {
      return new Response("authorization required\n", { status: 401, headers: textHeaders });
    }

    const id = env.SERVER_ROOMS.idFromName(serverId);
    return env.SERVER_ROOMS.get(id).fetch(request);
  },
};

export class ServerRoom implements DurableObject {
  private serverSocket: WebSocket | null = null;
  private browserSocket: WebSocket | null = null;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    void this.state;
    void this.env;
  }

  fetch(request: Request): Response {
    const url = new URL(request.url);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    if (url.pathname === API_PATHS.server) {
      this.acceptServer(server);
    } else if (url.pathname === API_PATHS.browser) {
      this.acceptBrowser(server);
    } else {
      server.close(1008, "unsupported route");
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private acceptServer(socket: WebSocket): void {
    this.serverSocket?.close(1012, "server replaced");
    this.serverSocket = socket;

    socket.addEventListener("message", (event) => {
      const browser = this.browserSocket;
      if (browser && browser.readyState === WebSocket.OPEN) {
        browser.send(event.data);
      }
    });

    socket.addEventListener("close", () => {
      if (this.serverSocket !== socket) {
        return;
      }
      this.serverSocket = null;
      this.browserSocket?.close(1013, "server offline");
      this.browserSocket = null;
    });

    socket.addEventListener("error", () => {
      socket.close(1011, "server error");
    });
  }

  private acceptBrowser(socket: WebSocket): void {
    if (!this.serverSocket || this.serverSocket.readyState !== WebSocket.OPEN) {
      socket.close(1013, "server offline");
      return;
    }

    this.browserSocket?.close(4000, "browser replaced");
    this.browserSocket = socket;

    socket.addEventListener("message", (event) => {
      if (!this.serverSocket || this.serverSocket.readyState !== WebSocket.OPEN) {
        socket.close(1013, "server offline");
        return;
      }
      this.serverSocket.send(event.data);
    });

    socket.addEventListener("close", () => {
      if (this.browserSocket === socket) {
        this.browserSocket = null;
      }
    });

    socket.addEventListener("error", () => {
      if (this.browserSocket === socket) {
        this.browserSocket = null;
      }
      socket.close(1011, "browser error");
    });
  }
}
