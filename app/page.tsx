const sites = [
  { code: "EN", name: "English" },
  { code: "Asia-EN", name: "English (Asia)" },
  { code: "JP", name: "Japanese" },
  { code: "TC", name: "Traditional Chinese" },
  { code: "CN", name: "Simplified Chinese" },
];

export default function Home() {
  return (
    <main className="container py-16">
      <h1 className="text-4xl xs:text-5xl">Koala Kollect</h1>
      <p className="mt-4 max-w-xl text-base text-muted-foreground">
        Every One Piece Card Game card printed in English, Japanese and Chinese, and where each
        printing came from.
      </p>

      <section className="mt-10 rounded-lg bg-layer-1 p-6 shadow-sm">
        <h2 className="text-xl">Card database</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Not populated yet. Cards sync from{" "}
          <a
            className="text-foreground underline underline-offset-4"
            href="https://github.com/hotavocado/koala-kollect-data"
          >
            koala-kollect-data
          </a>
          , which reads the official card list on each of these sites:
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {sites.map((s) => (
            <li key={s.code} className="pill bg-custom-blue px-3 py-1 text-xs text-m3-on-surface">
              {s.code} · {s.name}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
