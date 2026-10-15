# Price tracking: requirements

**Status: capture only.** The daily tcgcsv capture runs from 2026-10-15 (see
Capture); nothing else is built. The rest begins after the current arc (DON set pages and image
resize). Recorded on 2026-10-10 from Mike's messages, so the requirements
survive until the work starts. Each line cites the dm-alyssa message it comes
from.

## Requirements

1. **When.** After the current arc is over. Mike: "after this arc is over
   let's get the price tracking going" (88668).
2. **Sources.** TCGplayer and PriceCharting. Mike: "two main sources of data is
   going to be tcg player and pricecharting" (88669).
3. **Price history per card.** A table and a line graph over time, for raw and
   graded copies. The grading companies, in Mike's order: PSA, BGS, CGC, TAG.
   Mike: "the price should have table and line graph for raw and graded
   categories, primarily psa, bgs, cgc, tag" (88675).
4. **One market price.** Combined from TCGplayer and PriceCharting sales. Shown
   on the card page, and as metadata on card thumbnails (88692).
5. **Thumbnails that stand for several printings** (the set gallery, for one):
   use the English printing's price. If there is none, use Japanese, then
   Chinese as the last fallback (88692).
6. **A thumbnail shows one number: the raw market price.** No graded prices
   on thumbnails; the grades are on the card page. Mike: "multi printuhtunf
   thumbnails show 1 price, just en, jp, cn in order of priority" (88708) and
   "oh yea raw price" (88713).

## Source facts

Measured on 2026-10-10 by roberto's worker (general 89020). Facts only, no
design.

- **PriceCharting access.** The API and the CSV export need the $49/month
  Legendary tier. That data is licensed for internal use only. Showing it in
  the app needs a separate commercial license, with written permission and no
  published price.
- **No history, no sales.** Neither PriceCharting nor tcgcsv has price
  history or individual sales; PriceCharting says so in those words. Both
  expose derived prices only. So the line graph (requirement 3) means taking
  our own daily snapshots from the day tracking starts.
- **Grades.** PriceCharting has a separate price per grading company only at
  grade 10: PSA, BGS, CGC, SGC, TAG, ACE, plus BGS Black Label and CGC
  Pristine. Grades 1 to 9.5 have one price regardless of company. TAG is
  covered, at 10 only.
- **Joining to our cards.** PriceCharting's tcg-id equals our tcgcsv locator
  id (measured on one stamp).
- **PriceCharting coverage.** 74 jp and 66 en set pages, none for cn. Stamped
  cards sit inside the en set pages with their own prices.
- **tcgcsv.** Low, mid, high and market price per product, updated daily
  around 20:00Z, no history.

## Open questions

These are not decided. Each needs a measurement or a ruling before anyone
builds.

- **How the market price is blended.** Neither licensed feed carries sales
  (see Source facts), so requirement 4's "combined from sales" cannot be built
  as written. The question is now which derived prices to combine, and how.
- **The PriceCharting license.** Showing its prices in the app needs a
  commercial license (see Source facts). That is Mike's call; roberto puts it
  to him when the arc starts.
- **Where prices are stored**: the data repo (koala-kollect-data, synced like
  every other record) or the app (written by its own cron). The data repo is
  built around published facts that change rarely. Prices change daily.

## Measured 2026-10-15 (alyssa's worker)

- **TCGplayer is English only.** tcgcsv lists one One Piece category, 68. So
  jp prices can only come from PriceCharting, and cn has no price source.
- **What is joined today.** 862 of our ~15.6k printings carry a TCGplayer id,
  all through tcgcsv locators: the DON printings and the Release Event stamps.
  None of the 4,843 en official printings is joined.
- **The en join, by card number.** A full tcgcsv sweep (87 groups, 7,739
  products, 7,500 price rows, 7,340 with a market price) against our en
  printing locators: all 2,785 of our en numbers exist on TCGplayer (0
  missing). 1,187 numbers have as many TCGplayer products as we have en
  printings. On 1,574 TCGplayer has more, because it splits a same-art reprint
  by the product it came in (OP01-016 Nami: 12 products, 9 printings, among
  them "Luffy Deck", "Gift Collection 2023", "English Version 1st Anniversary
  Set"). On 24 we have more printings than TCGplayer has products.
- **PriceCharting API** (its documentation): a paid subscription; CSV
  downloads limited to one every 10 minutes; "Historic prices and historic
  sales are not supported." Card fields: loose-price (ungraded), graded 2 to 9.5
  regardless of company (graded-price is 9, new-price 8 or 8.5, box-only-price
  9.5), and at 10 per company: manual-only-price is PSA 10, bgs-10-price,
  condition-17 CGC 10, condition-18 SGC 10, condition-21 TAG 10, condition-22
  ACE 10, plus CGC 10 Pristine and BGS 10 Black. Each product carries tcg-id,
  so once a printing is joined to TCGplayer its PriceCharting en price joins
  through it. jp products have no TCGplayer counterpart, so jp needs its own
  join.

## The join: price_links (data repo, roberto's lane)

One row per TCGplayer product and finish that maps to a printing:
`{printing_key, source, source_id, method}`. The map is **product to printing,
many to one**, the same split as designs: tcgcsv keys by product, we key by
printing, so the 1,574 numbers where TCGplayer lists more products resolve as
several products on one printing. The 24 numbers where we have more printings
are the review pass. (roberto, general 93520.)

## Capture (started 2026-10-15)

The app captures tcgcsv's prices daily from 2026-10-15
(convex/priceCapture.ts, hourly at :30; it writes once per tcgcsv update, ~20:00Z), so
history exists before anything is shown. Rows are keyed by TCGplayer product
and finish (`{productId}:{subTypeName}`), one row per month with that month's
daily points (market, low, mid, high, direct low). They are not joined to
printings and nothing displays them. A printing reads its history through
price_links once that exists.

## Questions put to Mike (dm-alyssa 93511, 2026-10-15)

Leans are upper's, and stand if he answers only 1 and 2.

1. **PriceCharting commercial license.** The API is $49 a month, and showing
   the prices in the app needs a separate license, price unknown. Without it
   there are no graded and no jp prices, only en raw from TCGplayer.
2. **Displaying TCGplayer prices publicly.** tcgcsv is an unofficial mirror.
   Fine to show, or the affiliate route (a price next to a buy link)?
3. **Combined market price.** No feed carries sales, so a blend averages two
   derived numbers. Lean: a priority rule. en raw from TCGplayer market, jp raw
   from PriceCharting, graded from PriceCharting.
4. **Which price a tile shows.** Lean: the printing whose image the tile
   shows, since a card's en printings can be 100x apart.
5. **Graded granularity.** PriceCharting splits by company only at 10. Lean:
   PSA 10, BGS 10, CGC 10, TAG 10, plus generic 9 and 9.5.
6. **Currency.** USD only, on the jp and cn pages too; both sources are USD.

Order after the answers: the en join (roberto), price history joined to
printings plus the summary chain, the UI, PriceCharting last.

## Status at the 2026-10-15 halt (Mike, general 93685)

- Capture is live on prod (koala #44, db670fc). One row so far: day 2026-10-15, 87 groups,
  7500 rows, tcgcsv updated 2026-10-15T20:06:01+0000. The hourly fire at 22:30:52Z read tcgcsv's
  last-updated, found it unchanged, and wrote nothing, as designed. The next row-writing fire
  is expected around 20:30Z on the day after, after tcgcsv's ~20:00Z update.
- The cron is a Convex cron, not a VM crontab line, so it keeps capturing through the halt.
  Nothing reads the rows yet.
- Blocked on Mike: the six questions above (dm-alyssa 93511), all unanswered at the halt.
- Next, in order, once he answers: the en join (price_links, roberto's lane, parked behind the
  design arc), price history joined to printings plus the summary chain, the UI, PriceCharting last.
