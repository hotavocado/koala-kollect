# Koala Kollect

An open-source One Piece Card Game collection app. It starts with a database of
every card printed in English, Japanese and Chinese, with where each printing
came from. Accounts, portfolios and sales data come later.

The card data lives in [koala-kollect-data](https://github.com/hotavocado/koala-kollect-data).
This app mirrors it into Convex (`convex/schema.ts`), with field names matching
the data repo's `schema/v1.schema.json`.

**Status:** landing page (`/`), card browse (`/cards`) and data sync. `/cards`
shows an empty state until the data repo publishes its first card list.

## Deploy

Vercel builds `main` on every push. **The deployed site reads the Convex DEV
deployment** (`NEXT_PUBLIC_CONVEX_URL` on the Vercel project points at
`shocking-vulture-461`), because there is no prod deployment yet. Cut a prod
Convex deployment and repoint that variable before the event QR codes go out.

## Develop

```sh
npm install
npm run dev            # http://localhost:3000
npx convex dev         # optional: creates a Convex deployment and writes NEXT_PUBLIC_CONVEX_URL
npm run lint && npm run typecheck && npm test && npm run build
```

## Card data sync

`convex/dataSync.ts` copies the data repo into Convex once a day (`convex/crons.ts`).
It checks every file against the data repo's `manifest.json` (sha256 and row
count) before writing anything. A mismatch is recorded in the `data_syncs` table
and nothing is written. Records are upserted by key and never deleted. To run it
by hand: `npx convex run dataSync:run '{"force": true}'`.

It reads `main`'s commit from git's ref advertisement
(`https://github.com/<repo>.git/info/refs?service=git-upload-pack`), not from
GitHub's REST API. The REST API's unauthenticated limit is per IP, and it was
already used up on Convex's shared egress address (HTTP 403, 2026-10-08).

Stack: Next.js (App Router), Convex, Tailwind. The design system (colour tokens,
type scale, radius, shadows) is copied from direct-hire: `styles/colors.scss`,
`app/globals.css`, `tailwind.config.ts`. The body font there is Moderat, a
licensed font that is not included here; Plus Jakarta Sans stands in for it.

Mascot: Minokoala. The icon is a placeholder until an original drawing exists;
the show's art is not used here.

**Licence:** the code is MIT ([LICENSE](LICENSE)). The card data has its own licence, CC BY 4.0, in koala-kollect-data.

One Piece Card Game and its card text and images are owned by Bandai and Eiichiro
Oda/Shueisha/Toei Animation. This project is not affiliated with them.
