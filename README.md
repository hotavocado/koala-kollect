# Koala Kollect

An open-source One Piece Card Game collection app. It starts with a database of
every card printed in English, Japanese and Chinese, with where each printing
came from. Accounts, portfolios and sales data come later.

The card data lives in [koala-kollect-data](https://github.com/hotavocado/koala-kollect-data).
This app mirrors it into Convex (`convex/schema.ts`), with field names matching
the data repo's `schema/v1.schema.json`.

**Status:** app scaffold. The home page renders; the card pages come once the
data repo has cards to sync.

## Develop

```sh
npm install
npm run dev            # http://localhost:3000
npx convex dev         # optional: creates a Convex deployment and writes NEXT_PUBLIC_CONVEX_URL
npm run lint && npm run typecheck && npm run build
```

Stack: Next.js (App Router), Convex, Tailwind. The design system (colour tokens,
type scale, radius, shadows) is copied from direct-hire: `styles/colors.scss`,
`app/globals.css`, `tailwind.config.ts`. The body font there is Moderat, a
licensed font that is not included here; Plus Jakarta Sans stands in for it.

Mascot: Minokoala. The icon is a placeholder until an original drawing exists;
the show's art is not used here.

**Licence:** the code is MIT ([LICENSE](LICENSE)). The card data has its own licence, CC BY 4.0, in koala-kollect-data.

One Piece Card Game and its card text and images are owned by Bandai and Eiichiro
Oda/Shueisha/Toei Animation. This project is not affiliated with them.
