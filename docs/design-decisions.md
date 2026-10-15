# Design decisions

Short entries, newest last: what was decided, and why, so a later change can
tell a rule from an accident.

## 2026-10-15: a printing's origin

- **Origin is always a product when a real one exists, else the distribution;
  never both.** `pickOrigin` (convex/cards.ts) takes the first real product in
  the existing listing order (current before removed, dated before undated, by
  release date, then key). With none, the origin is the distinct distribution
  names of the claims, strongest claim first; with neither, it is null. A
  stamped print keeps its competition pack this way, since no product lists it.
- **Buckets are skipped, not deleted.** A product with `is_bucket: true` (the
  site-wide "Promotion card" style series) stands in for the real products, so
  the origin read passes over it. Its `printing_products` rows stay: the Promo
  and Limited set pages are built from them, and "Listed under" still shows it.
- **A listing whose product row has not synced is not a product.** It still
  shows under "Listed under" by its series id.
- **Removed real listings still count.** A print the series page dropped still
  came from that product; it is taken only after every current real listing.
- **"Listed under" omits the origin product.** The print page names the origin
  once, in "Where it came from"; "Listed under" keeps every other listing,
  buckets included, and is not rendered when nothing remains. When the origin
  is a product, the claims list is not rendered. With no origin, claims whose
  distribution has not synced still render: they are evidence, not an origin.
- The rule lives in one pure function on the server, and the print page's
  section choice in `printOrigin` (app/[lang]/cards/ui.tsx), so both are
  unit-tested without a database or a DOM.

## 2026-10-15: one set page across languages

- **`product_sets` decides which products and cards a set page shows; the
  set's own products decide what it is.** A set's own products are those whose
  code is the set's code, cn's language letter dropped (OPC-14 is OP-14). Only
  they give the title, kind and release date. A product that holds the set
  only through `product_sets` adds its cards and nothing else, so EB-04 is
  titled and dated by jp:550204, never by en's OP14-EB04 booster (agreed with
  roberto, general 93050; the data contract's Sets section says the same).
- **A product carrying two sets gives each only what is provably its.** en's
  OP14-EB04 and cn's two-deck starters carry two sets each. On one set's page
  (and in its count) such a product adds its cards numbered for that set, since
  a printing's set is its card number, and any card the set's other products
  list as well. A reprint in it that no other product of the set lists cannot
  say which set it came with, so neither page takes it. Without this the EB-04
  page lists all of OP-14 and OP-15, and cn's Luffy-and-Katakuri starter puts
  the Katakuri deck's reprints on the ST-31 page (measured on dev: 15 cards
  became 25).
- **Set P is not a set page of its own.** Its products are the promo buckets,
  which the kind grouping already makes one page; the promo page keeps its URL.
  A product with no set (the en Double Packs, the limited and family buckets)
  keeps the grouping it had: by its code, or by kind.
- **Old set URLs move for good.** The pages per product code (opc-09,
  op14-eb04) are gone; the proxy answers them with a 308 to the set page, by
  one pure rule in `lib/set-slug.ts` (drop cn's letter, take a combined code's
  first set). The set row keeps those old slugs as `aliases` so DON cards that
  `don_sets` still places on them show on the page they moved to.

## 2026-10-15: the card page grouped by design

- **No design rows, no change.** A card with no `printing_designs` row keeps
  the per-language layout and the plain "z printings" line, on its page and its
  tile. "0 designs across 3 languages" would read as if the card had none, when
  they are only not reviewed yet. The design layout switches on per card with
  its first row.
- **Counts.** "x designs across y languages, z printings", plus " · n
  unreviewed" only when n > 0. x counts designs holding a printing; y counts
  the languages the card is printed in, with tcgcsv as English, so a card with
  only en and tcgcsv printings is one language; n counts printings no design
  holds. A row naming a design that is not this card's leaves the printing
  unreviewed.
- **Exclusive.** A design is exclusive to a language when all its printings are
  in that language, the card is printed in another, and no unreviewed printing
  sits in a language the design lacks: until it is reviewed, that printing
  could join the design and widen it, so the answer is unknown and there is no
  star. An unreviewed printing in the design's own language changes nothing.
  `exclusive_override` wins both ways; a true override still needs the design
  in one language, since the label names it. The label is visible text,
  "★ <Language> exclusive", never a tooltip.
- **Order and chips.** Unstamped designs first, then the order of each
  design's first printing. Language chips only on a design in more than one
  language, opening on the first language in the reader's `SITE_ORDER` the
  design has. Unreviewed printings sit below, by language, as today.
- The rules live in convex/designCore.ts and `countLine`
  (app/[lang]/cards/ui.tsx), unit-tested without a DOM.

## 2026-10-15: one headline for every card, and exclusive counts

Options: keep the bare "N printings" until a card has designs, or give every card the same
shape now. Picked the same shape (upper, alyssa-internal 93618, Mike's ask at 93601): a card
with no design rows reads "8 printings across 3 languages · 8 unreviewed", and design blocks
appear as rows land. The exclusive count (" · 3 cn exclusive", Mike's form from dm 92505) is
derived by the same `exclusiveLanguage` rule as the per-design star, so the tile and the star
can never disagree, and stored on the card summary. The count uses a short language label
(`languageCode`); the star keeps the full name. Browse returns `counts` for every card and keeps
the old nullable `designs`, because Convex and Vercel deploy separately and a client deployed
before this reads any non-null `designs` as a designed card (codex r1 on #45).
