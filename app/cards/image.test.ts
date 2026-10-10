import { describe, expect, test } from "vitest";
import { MINOKOALA } from "../minokoala";
import { CARD_IMAGE_QUALITY, CARD_IMAGE_WIDTHS, cardImageSrc, optimizedImageUrl, proxiedImageUrl, upstreamImageUrl } from "./image";

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
      "https://tcgplayer-cdn.tcgplayer.com.evil.example/product/712717_in_1000x1000.jpg",
      "https://evil.example/product/712717_in_1000x1000.jpg",
    ]) {
      expect(proxiedImageUrl(url)).toBeNull();
    }
  });
});

// tcgcsv prints have only TCGplayer's image. 712717 is the stamped Chopper
// OP17-084 (prt_y59a36txa2uy) that rendered blank.
describe("TCGplayer images", () => {
  const TCG = "https://tcgplayer-cdn.tcgplayer.com/product/712717_in_1000x1000.jpg";

  test("a TCGplayer CDN image maps to our path and back", () => {
    expect(proxiedImageUrl(TCG)).toBe("/api/card-image/tcgplayer/712717_in_1000x1000.jpg");
    expect(upstreamImageUrl("tcgplayer", "712717_in_1000x1000.jpg")).toBe(TCG);
  });

  test("anything else on the TCGplayer CDN is refused", () => {
    for (const url of [
      "http://tcgplayer-cdn.tcgplayer.com/product/712717_in_1000x1000.jpg",
      "https://tcgplayer-cdn.tcgplayer.com/product/712717_in_1000x1000.jpg?x=1",
      "https://tcgplayer-cdn.tcgplayer.com/product/712717_in_200x200.jpg",
      "https://tcgplayer-cdn.tcgplayer.com/other/712717_in_1000x1000.jpg",
      "https://tcgplayer-cdn.tcgplayer.com/product/x/712717_in_1000x1000.jpg",
      "https://tcgplayer-cdn.tcgplayer.com/product/712717_in_1000x1000.png",
    ]) {
      expect(proxiedImageUrl(url)).toBeNull();
    }
    expect(upstreamImageUrl("tcgplayer", "../712717_in_1000x1000.jpg")).toBeNull();
    expect(upstreamImageUrl("tcgplayer", "OP01-001.png")).toBeNull();
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

describe("optimizedImageUrl", () => {
  test("asks the optimizer for the proxied image at the surface's one width", () => {
    const proxied = "/api/card-image/en/OP01-001_p1.png";
    expect(optimizedImageUrl(proxied, "tile")).toBe("/_next/image?url=%2Fapi%2Fcard-image%2Fen%2FOP01-001_p1.png&w=362&q=80");
    expect(optimizedImageUrl(proxied, "thumb")).toContain("&w=160&");
    expect(optimizedImageUrl(proxied, "finder")).toContain("&w=96&");
  });

  // The optimizer serves only widths and qualities next.config.ts lists, and
  // mints a derivative for each one it serves. The two must agree exactly:
  // a width CardImage asks for that the config lacks is refused (and falls
  // back to the full image), a width the config lists that nothing asks for
  // is one more derivative anyone could request.
  test("next.config.ts lists exactly the widths and quality CardImage and the homepage Minokoala use", async () => {
    const { default: config } = await import("../../next.config");
    const listed = [...(config.images?.imageSizes ?? []), ...(config.images?.deviceSizes ?? [])].sort((a, b) => a - b);
    expect(listed).toEqual([...Object.values(CARD_IMAGE_WIDTHS), MINOKOALA.derivative].sort((a, b) => a - b));
    expect(config.images?.qualities).toEqual([CARD_IMAGE_QUALITY]);
    expect(config.images?.localPatterns).toEqual([{ pathname: "/api/card-image/**", search: "" }]);
    // One remote file, by exact path and query: the homepage Minokoala.
    expect(config.images?.remotePatterns).toEqual([
      { protocol: "https", hostname: MINOKOALA.host, pathname: MINOKOALA.pathname, search: MINOKOALA.search },
    ]);
    expect(MINOKOALA.src).toBe(`https://${MINOKOALA.host}${MINOKOALA.pathname}${MINOKOALA.search}`);
  });
});

describe("cardImageSrc", () => {
  const official = "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001_p1.png";
  const proxied = "/api/card-image/en/OP01-001_p1.png";
  const resized = optimizedImageUrl(proxied, "tile");

  test("tries the resize, then the full image, then gives up to the text face", () => {
    expect(cardImageSrc(official, "tile", new Set())).toBe(resized);
    expect(cardImageSrc(official, "tile", new Set([resized]))).toBe(proxied);
    expect(cardImageSrc(official, "tile", new Set([resized, proxied]))).toBeNull();
  });

  test("without a size the full image is the only try", () => {
    expect(cardImageSrc(official, undefined, new Set())).toBe(proxied);
    expect(cardImageSrc(official, undefined, new Set([proxied]))).toBeNull();
  });

  test("an image the proxy refuses never reaches the optimizer", () => {
    expect(cardImageSrc(null, "tile", new Set())).toBeNull();
    expect(cardImageSrc("https://example.com/x.png", "tile", new Set())).toBeNull();
  });
});
