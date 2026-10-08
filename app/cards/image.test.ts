import { describe, expect, test } from "vitest";
import { proxiedImageUrl, upstreamImageUrl } from "./image";

describe("proxiedImageUrl", () => {
  test("each official host maps to our path and back", () => {
    for (const [host, origin] of [
      ["www", "https://www.onepiece-cardgame.com"],
      ["en", "https://en.onepiece-cardgame.com"],
      ["asia-en", "https://asia-en.onepiece-cardgame.com"],
      ["asia-tc", "https://asia-tc.onepiece-cardgame.com"],
    ]) {
      const official = `${origin}/images/cardlist/card/OP01-001_p1.png`;
      expect(proxiedImageUrl(official)).toBe(`/api/card-image/${host}/OP01-001_p1.png`);
      expect(upstreamImageUrl(host, "OP01-001_p1.png")).toBe(official);
    }
  });

  test("anything that is not an official card image is refused", () => {
    for (const url of [
      null,
      "not a url",
      "http://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png",
      "https://evil.example/images/cardlist/card/OP01-001.png",
      "https://en.onepiece-cardgame.com.evil.example/images/cardlist/card/OP01-001.png",
      "https://en.onepiece-cardgame.com/images/other/OP01-001.png",
      "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?x=1",
      "https://en.onepiece-cardgame.com/images/cardlist/card/../../secret.png",
      "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.jpg",
      "https://en.onepiece-cardgame.com:8443/images/cardlist/card/OP01-001.png",
      "https://tcgplayer-cdn.tcgplayer.com/product/512345_in_1000x1000.jpg",
    ]) {
      expect(proxiedImageUrl(url)).toBeNull();
    }
  });
});

describe("upstreamImageUrl", () => {
  test("an unknown host or a file outside the pattern is refused", () => {
    expect(upstreamImageUrl("cn", "OP01-001.png")).toBeNull();
    expect(upstreamImageUrl("toString", "OP01-001.png")).toBeNull();
    expect(upstreamImageUrl("en", "..%2Fsecret.png")).toBeNull();
    expect(upstreamImageUrl("en", "OP01-001.png.html")).toBeNull();
  });
});
