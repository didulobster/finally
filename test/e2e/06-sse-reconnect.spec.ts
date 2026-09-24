import net from "node:net";
import { expect, test } from "@playwright/test";
import { readNumber, waitForPrice } from "./helpers";

/**
 * A TCP proxy in front of the app, so the test can really cut the SSE connection.
 * Browser offline emulation does not break an already-open EventSource.
 */
function startProxy(target: URL) {
  const sockets = new Set<net.Socket>();
  let blocked = false;
  const server = net.createServer((client) => {
    if (blocked) return client.destroy();
    const upstream = net.connect(Number(target.port || 80), target.hostname);
    for (const s of [client, upstream]) {
      sockets.add(s);
      s.on("close", () => sockets.delete(s));
      s.on("error", () => s.destroy());
    }
    client.pipe(upstream).pipe(client);
  });
  return {
    listen: () => new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port))),
    drop: () => {
      blocked = true;
      sockets.forEach((s) => s.destroy());
    },
    restore: () => {
      blocked = false;
    },
    close: () => {
      sockets.forEach((s) => s.destroy());
      server.close();
    },
  };
}

test("price stream reconnects after a network drop", async ({ page, baseURL }) => {
  const proxy = startProxy(new URL(baseURL!));
  const port = await proxy.listen();
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    const status = page.getByTestId("connection-status");
    await expect(status).toHaveAttribute("data-status", "connected");
    await waitForPrice(page, "TSLA");

    proxy.drop();
    await expect(status).not.toHaveAttribute("data-status", "connected");

    proxy.restore();
    await expect(status).toHaveAttribute("data-status", "connected", { timeout: 20_000 });

    const price = page.getByTestId("watchlist-price-TSLA");
    const after = await readNumber(price);
    await expect.poll(() => readNumber(price), { timeout: 15_000 }).not.toBe(after);
  } finally {
    proxy.close();
  }
});
