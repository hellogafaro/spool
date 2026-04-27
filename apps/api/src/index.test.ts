import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  API_PATHS,
  API_PROTOCOL_VERSION,
  ENVIRONMENT_PROOF_HEADER,
  type ControlMessage,
} from "./protocol.ts";

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

async function pairBrowserToEnvironment(
  environmentId: string,
  control: WebSocket,
  authHeader: string,
): Promise<{ browser: WebSocket; channel: WebSocket; channelId: string }> {
  const dialPromise = nextMessage(control);
  const browser = await openSocket(
    API_PATHS.browser,
    { environmentId },
    { authorization: authHeader },
  );
  const dialEvent = await dialPromise;
  const dial = JSON.parse(String(dialEvent.data)) as ControlMessage;
  expect(dial.type).toBe("dial");
  const channel = await openSocket(
    API_PATHS.channel,
    { environmentId, channelId: dial.channelId },
    { [ENVIRONMENT_PROOF_HEADER]: "x" },
  );
  return { browser, channel, channelId: dial.channelId };
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
    const r = await SELF.fetch(url(API_PATHS.environment, { environmentId: "abcdefghjk23" }));
    expect(r.status).toBe(426);
  });

  it("400s WS path missing environmentId", async () => {
    const r = await SELF.fetch(url(API_PATHS.environment), {
      headers: { upgrade: "websocket", [ENVIRONMENT_PROOF_HEADER]: "x" },
    });
    expect(r.status).toBe(400);
  });

  it("401s /environment missing proof header", async () => {
    const r = await SELF.fetch(url(API_PATHS.environment, { environmentId: "abcdefghjk23" }), {
      headers: { upgrade: "websocket" },
    });
    expect(r.status).toBe(401);
  });

  it("401s /channel missing proof header", async () => {
    const r = await SELF.fetch(
      url(API_PATHS.channel, { environmentId: "abcdefghjk23", channelId: "x" }),
      { headers: { upgrade: "websocket" } },
    );
    expect(r.status).toBe(401);
  });

  it("400s /channel missing channelId", async () => {
    const r = await SELF.fetch(url(API_PATHS.channel, { environmentId: "abcdefghjk23" }), {
      headers: { upgrade: "websocket", [ENVIRONMENT_PROOF_HEADER]: "x" },
    });
    expect(r.status).toBe(400);
  });

  it("401s /ws missing authorization header", async () => {
    const r = await SELF.fetch(url(API_PATHS.browser, { environmentId: "abcdefghjk23" }), {
      headers: { upgrade: "websocket" },
    });
    expect(r.status).toBe(401);
  });
});

describe("dial-back routing", () => {
  it("rejects browser when no environment is connected", async () => {
    const browser = await openSocket(
      API_PATHS.browser,
      { environmentId: "noenvabcdef2" },
      { authorization: "Bearer x" },
    );
    const close = await nextClose(browser);
    expect(close.code).toBe(1013);
  });

  it("signals environment with a channel id when a browser connects", async () => {
    const environmentId = "signalabcdef";
    const control = await openSocket(
      API_PATHS.environment,
      { environmentId },
      { [ENVIRONMENT_PROOF_HEADER]: "x" },
    );
    const dialPromise = nextMessage(control);
    const browser = await openSocket(
      API_PATHS.browser,
      { environmentId },
      { authorization: "Bearer x" },
    );

    const dialEvent = await dialPromise;
    const dial = JSON.parse(String(dialEvent.data)) as ControlMessage;
    expect(dial.type).toBe("dial");
    expect(dial.channelId).toMatch(/^[0-9a-f-]{36}$/);

    browser.close();
    control.close();
  });

  it("bridges bytes once environment dials back", async () => {
    const environmentId = "bridgeabcdef";
    const control = await openSocket(
      API_PATHS.environment,
      { environmentId },
      { [ENVIRONMENT_PROOF_HEADER]: "x" },
    );

    const { browser, channel } = await pairBrowserToEnvironment(environmentId, control, "Bearer x");

    const envGot = nextMessage(channel);
    browser.send("hello-environment");
    expect((await envGot).data).toBe("hello-environment");

    const browserGot = nextMessage(browser);
    channel.send("hello-browser");
    expect((await browserGot).data).toBe("hello-browser");

    channel.close();
    browser.close();
    control.close();
  });

  it("flushes browser messages buffered before the environment dials back", async () => {
    const environmentId = "buffrabcdef2";
    const control = await openSocket(
      API_PATHS.environment,
      { environmentId },
      { [ENVIRONMENT_PROOF_HEADER]: "x" },
    );

    const dialPromise = nextMessage(control);
    const browser = await openSocket(
      API_PATHS.browser,
      { environmentId },
      { authorization: "Bearer x" },
    );

    browser.send("early-1");
    browser.send("early-2");

    const dialEvent = await dialPromise;
    const dial = JSON.parse(String(dialEvent.data)) as ControlMessage;

    const channel = await openSocket(
      API_PATHS.channel,
      { environmentId, channelId: dial.channelId },
      { [ENVIRONMENT_PROOF_HEADER]: "x" },
    );

    const collected: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const handler = (event: Event) => {
        collected.push(String((event as MessageEvent).data));
        if (collected.length >= 2) {
          channel.removeEventListener("message", handler);
          resolve();
        }
      };
      channel.addEventListener("message", handler);
      setTimeout(() => reject(new Error("timeout waiting for buffered frames")), 1000);
    });

    expect(collected).toEqual(["early-1", "early-2"]);

    channel.close();
    browser.close();
    control.close();
  });

  it("rejects channel for unknown channel id", async () => {
    const environmentId = "unkchabcdef2";
    const control = await openSocket(
      API_PATHS.environment,
      { environmentId },
      { [ENVIRONMENT_PROOF_HEADER]: "x" },
    );
    const orphan = await openSocket(
      API_PATHS.channel,
      { environmentId, channelId: "00000000-0000-0000-0000-000000000000" },
      { [ENVIRONMENT_PROOF_HEADER]: "x" },
    );
    const close = await nextClose(orphan);
    expect(close.code).toBe(4404);
    control.close();
  });

  it("each browser gets its own pair (multi-device)", async () => {
    const environmentId = "multidevicen";
    const control = await openSocket(
      API_PATHS.environment,
      { environmentId },
      { [ENVIRONMENT_PROOF_HEADER]: "x" },
    );

    const dialAPromise = nextMessage(control);
    const browserA = await openSocket(
      API_PATHS.browser,
      { environmentId },
      { authorization: "Bearer a" },
    );
    const dialA = JSON.parse(String((await dialAPromise).data)) as ControlMessage;
    const channelA = await openSocket(
      API_PATHS.channel,
      { environmentId, channelId: dialA.channelId },
      { [ENVIRONMENT_PROOF_HEADER]: "x" },
    );

    const dialBPromise = nextMessage(control);
    const browserB = await openSocket(
      API_PATHS.browser,
      { environmentId },
      { authorization: "Bearer b" },
    );
    const dialB = JSON.parse(String((await dialBPromise).data)) as ControlMessage;
    const channelB = await openSocket(
      API_PATHS.channel,
      { environmentId, channelId: dialB.channelId },
      { [ENVIRONMENT_PROOF_HEADER]: "x" },
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

  it("isolates rooms by environmentId", async () => {
    const controlA = await openSocket(
      API_PATHS.environment,
      { environmentId: "roomaaaaaaaa" },
      { [ENVIRONMENT_PROOF_HEADER]: "x" },
    );
    const controlB = await openSocket(
      API_PATHS.environment,
      { environmentId: "roombbbbbbbb" },
      { [ENVIRONMENT_PROOF_HEADER]: "x" },
    );

    const dialPromise = nextMessage(controlA);
    const browserA = await openSocket(
      API_PATHS.browser,
      { environmentId: "roomaaaaaaaa" },
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

  it("evicts pending browsers when control environment disconnects", async () => {
    const environmentId = "evictabcdef2";
    const control = await openSocket(
      API_PATHS.environment,
      { environmentId },
      { [ENVIRONMENT_PROOF_HEADER]: "x" },
    );
    const browser = await openSocket(
      API_PATHS.browser,
      { environmentId },
      { authorization: "Bearer x" },
    );

    const closed = nextClose(browser);
    control.close();
    const event = await closed;
    expect(event.code).toBe(1013);
  });
});
