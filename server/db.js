// db.js
// -----------------------------------------------------------------------------
// The PRIMARY DATA STORE layer. Everything that touches SQLite lives here, so the
// rest of the app never writes raw SQL — it just calls these friendly functions.
//
// Right now it does one job: getSuggestions(prefix) — "give me the top 10 words
// that start with this prefix, most popular first". (Writing/search-counting is
// added in Step 3.)
// -----------------------------------------------------------------------------

const path = require('path');
const Database = require('better-sqlite3');

// Open the database file that load_data.js created.
const DB_FILE = path.join(__dirname, '..', 'data', 'queries.db');
const db = new Database(DB_FILE);

// WAL mode = lets reads and writes happen smoothly side by side while the server runs.
db.pragma('journal_mode = WAL');

// How many suggestions we ever return (the assignment says "at most 10").
const LIMIT = 10;

// --- The prefix-search statement (compiled once, reused for every keystroke) ---
//
// HOW THE FAST PREFIX SEARCH WORKS:
//   `query` is the PRIMARY KEY, so SQLite keeps all words sorted in an index.
//   To find every word starting with "ip", we ask for everything in the range
//   from "ip" up to (but not including) "iq":
//        query >= 'ip'  AND  query < 'iq'
//   This is a RANGE SCAN on the index — much faster than checking every row,
//   because the database can jump straight to "ip" and stop at "iq".
//   We then sort just those matches by count and keep the top 10.
const suggestStmt = db.prepare(`
  SELECT query, count
  FROM queries
  WHERE query >= @lo AND query < @hi
  ORDER BY count DESC
  LIMIT ${LIMIT}
`);

/**
 * Build the exclusive upper bound for a prefix.
 * e.g. "ip" -> "iq", so the range [ "ip", "iq" ) covers ip, ipad, iphone, ...
 * We bump the last character up by one code point.
 */
function upperBound(prefix) {
  const last = prefix.charCodeAt(prefix.length - 1);
  return prefix.slice(0, -1) + String.fromCharCode(last + 1);
}

/**
 * Get up to 10 suggestions for a typed prefix.
 * Handles empty / missing / whitespace / no-match input gracefully (returns []).
 *
 * @param {string} rawPrefix - whatever the user typed (any case, maybe blank).
 * @returns {Array<{query: string, count: number}>}
 */
function getSuggestions(rawPrefix) {
  // Guard against missing or non-string input.
  if (typeof rawPrefix !== 'string') return [];

  // Normalise: trim spaces and lowercase (our data is stored lowercase).
  const prefix = rawPrefix.trim().toLowerCase();

  // Empty input -> no suggestions (don't dump the whole dataset).
  if (prefix.length === 0) return [];

  const rows = suggestStmt.all({ lo: prefix, hi: upperBound(prefix) });
  return rows; // already [{query, count}, ...]; empty array if nothing matched
}

module.exports = { db, getSuggestions };
