import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { API_PATHS, API_PROTOCOL_VERSION, type ControlMessage } from "./protocol.ts";

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

async function pairBrowserToServer(
  serverId: string,
  controlServer: WebSocket,
  authHeader: string,
): Promise<{ browser: WebSocket; serverChannel: WebSocket; channelId: string }> {
  const dialPromise = nextMessage(controlServer);
  const browser = await openSocket(API_PATHS.browser, { serverId }, { authorization: authHeader });
  const dialEvent = await dialPromise;
  const dial = JSON.parse(String(dialEvent.data)) as ControlMessage;
  expect(dial.type).toBe("dial");
  const serverChannel = await openSocket(
    API_PATHS.serverChannel,
    { serverId, channelId: dial.channelId },
    { "x-trunk-server-proof": "x" },
  );
  return { browser, serverChannel, channelId: dial.channelId };
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

  it("401s /server-channel missing proof header", async () => {
    const r = await SELF.fetch(url(API_PATHS.serverChannel, { serverId: "abc", channelId: "x" }), {
      headers: { upgrade: "websocket" },
    });
    expect(r.status).toBe(401);
  });

  it("400s /server-channel missing channelId", async () => {
    const r = await SELF.fetch(url(API_PATHS.serverChannel, { serverId: "abc" }), {
      headers: { upgrade: "websocket", "x-trunk-server-proof": "x" },
    });
    expect(r.status).toBe(400);
  });

  it("401s /browser missing authorization header", async () => {
    const r = await SELF.fetch(url(API_PATHS.browser, { serverId: "abc" }), {
      headers: { upgrade: "websocket" },
    });
    expect(r.status).toBe(401);
  });
});

describe("dial-back routing", () => {
  it("rejects browser when no server is connected", async () => {
    const browser = await openSocket(
      API_PATHS.browser,
      { serverId: "room-no-server" },
      { authorization: "Bearer x" },
    );
    const close = await nextClose(browser);
    expect(close.code).toBe(1013);
  });

  it("signals server with a channel id when a browser connects", async () => {
    const serverId = "room-signal";
    const control = await openSocket(
      API_PATHS.server,
      { serverId },
      { "x-trunk-server-proof": "x" },
    );
    const dialPromise = nextMessage(control);
    const browser = await openSocket(
      API_PATHS.browser,
      { serverId },
      { authorization: "Bearer x" },
    );

    const dialEvent = await dialPromise;
    const dial = JSON.parse(String(dialEvent.data)) as ControlMessage;
    expect(dial.type).toBe("dial");
    expect(dial.channelId).toMatch(/^[0-9a-f-]{36}$/);

    browser.close();
    control.close();
  });

  it("bridges bytes once server dials back", async () => {
    const serverId = "room-bridge";
    const control = await openSocket(
      API_PATHS.server,
      { serverId },
      { "x-trunk-server-proof": "x" },
    );

    const { browser, serverChannel } = await pairBrowserToServer(serverId, control, "Bearer x");

    const serverGot = nextMessage(serverChannel);
    browser.send("hello-server");
    expect((await serverGot).data).toBe("hello-server");

    const browserGot = nextMessage(browser);
    serverChannel.send("hello-browser");
    expect((await browserGot).data).toBe("hello-browser");

    serverChannel.close();
    browser.close();
    control.close();
  });

  it("flushes browser messages buffered before the server dials back", async () => {
    const serverId = "room-buffered";
    const control = await openSocket(
      API_PATHS.server,
      { serverId },
      { "x-trunk-server-proof": "x" },
    );

    const dialPromise = nextMessage(control);
    const browser = await openSocket(
      API_PATHS.browser,
      { serverId },
      { authorization: "Bearer x" },
    );

    browser.send("early-1");
    browser.send("early-2");

    const dialEvent = await dialPromise;
    const dial = JSON.parse(String(dialEvent.data)) as ControlMessage;

    const serverChannel = await openSocket(
      API_PATHS.serverChannel,
      { serverId, channelId: dial.channelId },
      { "x-trunk-server-proof": "x" },
    );

    const collected: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const handler = (event: Event) => {
        collected.push(String((event as MessageEvent).data));
        if (collected.length >= 2) {
          serverChannel.removeEventListener("message", handler);
          resolve();
        }
      };
      serverChannel.addEventListener("message", handler);
      setTimeout(() => reject(new Error("timeout waiting for buffered frames")), 1000);
    });

    expect(collected).toEqual(["early-1", "early-2"]);

    serverChannel.close();
    browser.close();
    control.close();
  });

  it("rejects server-channel for unknown channel id", async () => {
    const serverId = "room-unknown-channel";
    const control = await openSocket(
      API_PATHS.server,
      { serverId },
      { "x-trunk-server-proof": "x" },
    );
    const orphan = await openSocket(
      API_PATHS.serverChannel,
      { serverId, channelId: "00000000-0000-0000-0000-000000000000" },
      { "x-trunk-server-proof": "x" },
    );
    const close = await nextClose(orphan);
    expect(close.code).toBe(4404);
    control.close();
  });

  it("each browser gets its own pair (multi-device)", async () => {
    const serverId = "room-multi-device";
    const control = await openSocket(
      API_PATHS.server,
      { serverId },
      { "x-trunk-server-proof": "x" },
    );

    const dialAPromise = nextMessage(control);
    const browserA = await openSocket(
      API_PATHS.browser,
      { serverId },
      { authorization: "Bearer a" },
    );
    const dialA = JSON.parse(String((await dialAPromise).data)) as ControlMessage;
    const channelA = await openSocket(
      API_PATHS.serverChannel,
      { serverId, channelId: dialA.channelId },
      { "x-trunk-server-proof": "x" },
    );

    const dialBPromise = nextMessage(control);
    const browserB = await openSocket(
      API_PATHS.browser,
      { serverId },
      { authorization: "Bearer b" },
    );
    const dialB = JSON.parse(String((await dialBPromise).data)) as ControlMessage;
    const channelB = await openSocket(
      API_PATHS.serverChannel,
      { serverId, channelId: dialB.channelId },
      { "x-trunk-server-proof": "x" },
    );

    expect(dialA.channelId).not.toBe(dialB.channelId);

    const gotA = nextMessage(channelA);
    browserA.send("from-a");
    expect((await gotA).data).toBe("from-a");

    const gotB = nextMessage(channelB);
    browserB.send("from-b");
    expect((await gotB).data).toBe("from-b");

    expect(browserA.readyState).toBe(WebSocket.OPEN);
    expect(browserB.readyState).toBe(WebSocket.OPEN);

    channelA.close();
    channelB.close();
    browserA.close();
    browserB.close();
    control.close();
  });

  it("isolates rooms by serverId", async () => {
    const controlA = await openSocket(
      API_PATHS.server,
      { serverId: "room-a" },
      { "x-trunk-server-proof": "x" },
    );
    const controlB = await openSocket(
      API_PATHS.server,
      { serverId: "room-b" },
      { "x-trunk-server-proof": "x" },
    );

    const dialPromise = nextMessage(controlA);
    const browserA = await openSocket(
      API_PATHS.browser,
      { serverId: "room-a" },
      { authorization: "Bearer a" },
    );

    const dialEvent = await dialPromise;
    const dial = JSON.parse(String(dialEvent.data)) as ControlMessage;

    let bGotMessage = false;
    controlB.addEventListener("message", () => {
      bGotMessage = true;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(bGotMessage).toBe(false);

    expect(dial.type).toBe("dial");

    browserA.close();
    controlA.close();
    controlB.close();
  });

  it("evicts pending browsers when control server disconnects", async () => {
    const serverId = "room-evict";
    const control = await openSocket(
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
    control.close();
    const event = await closed;
    expect(event.code).toBe(1013);
  });
});
