import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { API_PATHS, API_PROTOCOL_VERSION } from "./protocol.ts";

const ORIGIN = "https://api.test.local";

function url(path: string, params?: Record<string, string>): string {
  const u = new URL(path, ORIGIN);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      u.searchParams.set(k, v);
    }
  }
  return u.toString();
}

async function openSocket(
  path: string,
  params: Record<string, string>,
  headers: Record<string, string>,
): Promise<WebSocket> {
  const response = await SELF.fetch(url(path, params), {
    headers: { upgrade: "websocket", ...headers },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) throw new Error("missing webSocket on response");
  socket.accept();
  return socket;
}

function nextMessage(socket: WebSocket): Promise<MessageEvent> {
  return new Promise((resolve, reject) => {
    socket.addEventListener("message", (event) => resolve(event as MessageEvent), { once: true });
    socket.addEventListener("close", () => reject(new Error("socket closed")), { once: true });
    socket.addEventListener("error", () => reject(new Error("socket error")), { once: true });
  });
}

function nextClose(socket: WebSocket): Promise<CloseEvent> {
  return new Promise((resolve) => {
    socket.addEventListener("close", (event) => resolve(event as CloseEvent), { once: true });
  });
}

describe("HTTP routes", () => {
  it("serves /health", async () => {
    const r = await SELF.fetch(url(API_PATHS.health));
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ok\n");
  });

  it("serves /version with protocol version", async () => {
    const r = await SELF.fetch(url(API_PATHS.version));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      product: "trunk-api",
      version: "0.0.0",
      protocolVersion: API_PROTOCOL_VERSION,
    });
  });

  it("404s unknown path", async () => {
    const r = await SELF.fetch(url("/nope"));
    expect(r.status).toBe(404);
  });

  it("426s WS path without upgrade header", async () => {
    const r = await SELF.fetch(url(API_PATHS.server, { serverId: "abc" }));
    expect(r.status).toBe(426);
  });

  it("400s WS path missing serverId", async () => {
    const r = await SELF.fetch(url(API_PATHS.server), {
      headers: { upgrade: "websocket", "x-trunk-server-proof": "x" },
    });
    expect(r.status).toBe(400);
  });

  it("401s /server missing proof header", async () => {
    const r = await SELF.fetch(url(API_PATHS.server, { serverId: "abc" }), {
      headers: { upgrade: "websocket" },
    });
    expect(r.status).toBe(401);
  });

  it("401s /browser missing authorization header", async () => {
    const r = await SELF.fetch(url(API_PATHS.browser, { serverId: "abc" }), {
      headers: { upgrade: "websocket" },
    });
    expect(r.status).toBe(401);
  });
});

describe("DO routing", () => {
  it("rejects browser when no server is connected", async () => {
    const browser = await openSocket(
      API_PATHS.browser,
      { serverId: "room-no-server" },
      { authorization: "Bearer x" },
    );
    const close = await nextClose(browser);
    expect(close.code).toBe(1013);
  });

  it("forwards browser->server and server->browser frames", async () => {
    const serverId = "room-fanout";
    const server = await openSocket(
      API_PATHS.server,
      { serverId },
      { "x-trunk-server-proof": "x" },
    );
    const browser = await openSocket(
      API_PATHS.browser,
      { serverId },
      { authorization: "Bearer x" },
    );

    const serverGot = nextMessage(server);
    browser.send("hello-server");
    expect((await serverGot).data).toBe("hello-server");

    const browserGot = nextMessage(browser);
    server.send("hello-browser");
    expect((await browserGot).data).toBe("hello-browser");

    server.close();
    browser.close();
  });

  it("server replace does not evict existing browsers", async () => {
    const serverId = "room-replace";
    const serverA = await openSocket(
      API_PATHS.server,
      { serverId },
      { "x-trunk-server-proof": "x" },
    );
    const browser = await openSocket(
      API_PATHS.browser,
      { serverId },
      { authorization: "Bearer x" },
    );

    const serverB = await openSocket(
      API_PATHS.server,
      { serverId },
      { "x-trunk-server-proof": "x" },
    );

    const browserGot = nextMessage(browser);
    serverB.send("from-replacement");
    expect((await browserGot).data).toBe("from-replacement");

    expect(browser.readyState).toBe(WebSocket.OPEN);

    void serverA;
    serverB.close();
    browser.close();
  });

  it("evicts browsers when active server disconnects", async () => {
    const serverId = "room-evict";
    const server = await openSocket(
      API_PATHS.server,
      { serverId },
      { "x-trunk-server-proof": "x" },
    );
    const browser = await openSocket(
      API_PATHS.browser,
      { serverId },
      { authorization: "Bearer x" },
    );

    const closed = nextClose(browser);
    server.close();
    const event = await closed;
    expect(event.code).toBe(1013);
  });

  it("isolates rooms by serverId", async () => {
    const serverA = await openSocket(
      API_PATHS.server,
      { serverId: "room-a" },
      { "x-trunk-server-proof": "x" },
    );
    const serverB = await openSocket(
      API_PATHS.server,
      { serverId: "room-b" },
      { "x-trunk-server-proof": "x" },
    );
    const browserA = await openSocket(
      API_PATHS.browser,
      { serverId: "room-a" },
      { authorization: "Bearer x" },
    );

    const got = nextMessage(serverA);
    browserA.send("ping-a");
    expect((await got).data).toBe("ping-a");

    let bGotMessage = false;
    serverB.addEventListener("message", () => {
      bGotMessage = true;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(bGotMessage).toBe(false);

    serverA.close();
    serverB.close();
    browserA.close();
  });
});
