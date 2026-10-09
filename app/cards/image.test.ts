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
    expect(upstreamImageUrl("tcgcsv", "OP01-001.png")).toBeNull();
    expect(upstreamImageUrl("toString", "OP01-001.png")).toBeNull();
    expect(upstreamImageUrl("en", "..%2Fsecret.png")).toBeNull();
    expect(upstreamImageUrl("en", "OP01-001.png.html")).toBeNull();
  });
});

// cn's images are on Windo's own host, one folder. Every shape below is a real
// cardImg from the 2026-10-08 cn list (4,927 rows: png and jpg, file names
// carrying URL-encoded copy marks, Chinese and a space, and one card, id 7045,
// one 32-hex folder deeper).
const CN = "https://source.windoent.com/OnePiecePc/Picture/";
const CN_FILES = [
  "1705891765183OP06-050P.png",
  "b153b99b94584538955821c11f0b04c4.png",
  "1755141444109PRB02-013p.jpg",
  "1741571282148EB02-046%281%29.png",
  "1686120951807%E4%BC%81%E4%B8%9A%E5%BE%AE%E4%BF%A1%E6%88%AA%E5%9B%BE_16861209469943.png",
  "1724209625002%E5%8D%B7%E4%B9%83%20%E6%B0%B4%E5%8D%B0%283%29.png",
  "1758002850989OP13%E2%80%90120.jpg",
  "af544721305c4c75aa744e0cbb4508b2/OP05-060.png",
];

describe("cn images", () => {
  test("each measured cn shape maps to our path and back to the same URL", () => {
    for (const file of CN_FILES) {
      const ours = proxiedImageUrl(`${CN}${file}`);
      expect(ours).toBe(`/api/card-image/cn/${file}`);
      // The route sees its segments decoded, the way Next hands them over.
      const segments = ours!.slice("/api/card-image/cn/".length).split("/").map(decodeURIComponent);
      expect(upstreamImageUrl("cn", segments.join("/"))).toBe(`${CN}${file}`);
      // And still right if they arrive undecoded.
      expect(upstreamImageUrl("cn", file)).toBe(`${CN}${file}`);
    }
  });

  test("anything else on the cn host is refused", () => {
    for (const url of [
      "http://source.windoent.com/OnePiecePc/Picture/OP06-050.png",
      "https://source.windoent.com/OnePiecePc/Other/OP06-050.png",
      "https://source.windoent.com/OnePiecePc/Picture/OP06-050.png?x=1",
      "https://source.windoent.com/OnePiecePc/Picture/OP06-050.gif",
      "https://source.windoent.com/OnePiecePc/Picture/a/b/OP06-050.png",
      "https://source.windoent.com/OnePiecePc/Picture/notahexfolder/OP06-050.png",
      "https://source.windoent.com/OnePiecePc/Picture/..%2Fsecret.png",
      "https://source.windoent.com/OnePiecePc/Picture/%2E%2E/secret.png",
      "https://source.windoent.com/OnePiecePc/Picture/OP06%25050.png",
    ]) {
      expect(proxiedImageUrl(url)).toBeNull();
    }
    for (const file of ["../secret.png", "a/b/OP06-050.png", "OP06-050.png.html", "OP06%2F050.png", "x%25y.png", ".png"]) {
      expect(upstreamImageUrl("cn", file)).toBeNull();
    }
    // A Bandai host never takes a folder or a cn-style name.
    expect(upstreamImageUrl("en", "af544721305c4c75aa744e0cbb4508b2/OP05-060.png")).toBeNull();
    expect(upstreamImageUrl("en", "EB02-046(1).png")).toBeNull();
  });
});
