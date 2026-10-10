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
