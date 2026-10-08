import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const PNG = "/api/card-image/en/OP01-001.png";

function call(path: string, host = "en", file = ["OP01-001.png"]) {
  return GET(new Request(`https://koala.test${path}`), { params: Promise.resolve({ host, file }) });
}

function upstream(status: number, type: string) {
  const fetchMock = vi.fn(async () => new Response("x", { status, headers: { "content-type": type } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/card-image", () => {
  test("an image is served with the long cache", async () => {
    upstream(200, "image/png");
    const res = await call(PNG);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=604800, s-maxage=31536000");
  });

  test("cn's one card a folder deeper is fetched from that folder", async () => {
    const fetchMock = upstream(200, "image/png");
    const path = "/api/card-image/cn/af544721305c4c75aa744e0cbb4508b2/OP05-060.png";
    const res = await call(path, "cn", ["af544721305c4c75aa744e0cbb4508b2", "OP05-060.png"]);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://source.windoent.com/OnePiecePc/Picture/af544721305c4c75aa744e0cbb4508b2/OP05-060.png",
      expect.anything(),
    );
  });

  test("a folder on a Bandai host is refused before any upstream fetch", async () => {
    const fetchMock = upstream(200, "image/png");
    const res = await call("/api/card-image/en/x/OP01-001.png", "en", ["x", "OP01-001.png"]);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a query string is refused before any upstream fetch", async () => {
    const fetchMock = upstream(200, "image/png");
    const res = await call(`${PNG}?nonce=1`);
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("an upstream 404 is a cached miss", async () => {
    upstream(404, "text/html; charset=UTF-8");
    const res = await call(PNG);
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  test("a transient upstream failure is an uncached 502", async () => {
    for (const status of [429, 500, 503]) {
      upstream(status, "text/html");
      const res = await call(PNG);
      expect(res.status).toBe(502);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  test("a 200 that is not an image is an uncached 502", async () => {
    upstream(200, "text/html");
    const res = await call(PNG);
    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
