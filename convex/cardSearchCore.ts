// Pure parsing for card search, kept apart from the query so it tests without
// a database.

// Every numbered card in the data is one of these shapes (measured on the data
// repo, 2026-10-08): OP01-001, ST01-001, EB01-001, PRB01-001, and P-001. P has
// no set digits.
const NUMBER = /^(OP|ST|EB|PRB|P)(\d*)(-?)(\d*)$/;

export type NumberQuery = {
  // Whole card numbers to try first, in order. A typed "op1-1" means OP01-001.
  exact: string[];
  // A card-number prefix for the rest of the list, as typed but upper-cased
  // and with the hyphen restored: "op01" lists OP01-001 onward.
  prefix: string;
};

// Reads a search box value as a card number, or null when it is not one, in
// which case the caller searches names. Spaces are ignored, case is not
// significant, and the hyphen is optional when the digits are complete.
export function parseCardNumber(raw: string): NumberQuery | null {
  const text = raw.replace(/\s+/g, "").toUpperCase();
  const m = NUMBER.exec(text);
  if (!m) return null;
  const [, letters, setDigits, hyphen, cardDigits] = m;
  const isPromo = letters === "P";

  if (isPromo) {
    // "P-034", "P034", "P34", "P-". A bare "P" is a name prefix (Perona), not a number.
    const digits = setDigits + cardDigits;
    if (!hyphen && !digits) return null;
    if (digits.length > 3) return null;
    const exact = digits ? [`P-${digits.padStart(3, "0")}`] : [];
    return { exact, prefix: `P-${digits}` };
  }

  // OP, ST, EB, PRB: set digits, then card digits. With no hyphen the split is
  // only known once all five digits are there ("OP01001").
  if (!hyphen) {
    if (!setDigits) return null; // "OP", "ST", "EB": too short to mean a number
    if (setDigits.length === 5) {
      const n = `${letters}${setDigits.slice(0, 2)}-${setDigits.slice(2)}`;
      return { exact: [n], prefix: n };
    }
    if (setDigits.length > 2) return null;
    return { exact: [], prefix: `${letters}${setDigits}` };
  }

  if (!setDigits || setDigits.length > 2 || cardDigits.length > 3) return null;
  const exact = cardDigits ? [`${letters}${setDigits.padStart(2, "0")}-${cardDigits.padStart(3, "0")}`] : [];
  return { exact, prefix: `${letters}${setDigits}-${cardDigits}` };
}

// Rows a search returns at most. Shared with the page, which says when it
// stopped short.
export const SEARCH_LIMIT = 20;

// The shortest name query that lists by match. Shorter, one letter matches too
// much to rank, so only a card whose whole name is that character comes back.
export const MIN_NAME_QUERY = 2;
