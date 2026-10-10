// Minokoala on the homepage, celebrating koalakollect.app (Mike, dm-alyssa
// 88766, 88776). The art is the anime's concept sheet on the One Piece wiki,
// so it is served from there through the image optimizer and never committed:
// Toei's art stays out of this public repo. next.config.ts allows exactly this
// one file and this one width.
export const MINOKOALA = {
  src: "https://static.wikia.nocookie.net/onepiece/images/f/f0/Minokoala_Anime_Concept_Art.png/revision/latest?cb=20180913000233",
  host: "static.wikia.nocookie.net",
  pathname: "/onepiece/images/f/f0/Minokoala_Anime_Concept_Art.png/revision/latest",
  search: "?cb=20180913000233",
  // The source is 1272x1448; shown at most 420 CSS px wide, so one 840px
  // derivative covers 2x screens.
  width: 420,
  height: 478,
  derivative: 840,
} as const;
