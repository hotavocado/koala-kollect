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
  is a product, the claims list is not rendered.
- The rule lives in one pure function on the server, and the print page's
  section choice in `printOrigin` (app/[lang]/cards/ui.tsx), so both are
  unit-tested without a database or a DOM.
