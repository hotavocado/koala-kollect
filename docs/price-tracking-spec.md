# Price tracking: requirements

**Status: not started.** Begins after the current arc (DON set pages and image
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

## Open questions

These are not decided. Each needs a measurement or a ruling before anyone
builds.

- **How the market price is blended.** Recent sales only or listings too, the
  time window, and how the two sources are weighted.
- **Whether PriceCharting carries TAG**, and whether it has per-grade prices
  for each company. Roberto's worker is surveying PriceCharting read-only
  (general 88677): API, CSV export, terms, limits, cost, and graded coverage.
- **Where prices are stored**: the data repo (koala-kollect-data, synced like
  every other record) or the app (written by its own cron). The data repo is
  built around published facts that change rarely. Prices change daily.
