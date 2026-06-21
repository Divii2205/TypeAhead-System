// index.js
// -----------------------------------------------------------------------------
// The web server. It does two kinds of things:
//   1. Serves the web page (the files in public/).
//   2. Answers API requests from that page.
//
// Endpoints so far (more added in later steps):
//   GET /suggest?q=<prefix>  -> up to 10 suggestions starting with <prefix>
//   GET /logs?n=<number>     -> the most recent log lines (for the UI logs panel)
//
// Run with:  node server/index.js   (or: npm start)
// -----------------------------------------------------------------------------

const path = require('path');
const express = require('express');

const { getSuggestions, recordSearch } = require('./db');
const { log, getRecent } = require('./logger');

const app = express();
const PORT = 3000;

// Let routes read JSON bodies (used by POST /search in Step 3).
app.use(express.json());

// Serve the front-end files in public/ at the site root.
// e.g. public/index.html becomes http://localhost:3000/
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- GET /suggest?q=<prefix> --------------------------------------------------
// Returns JSON: { q, count, suggestions: [{query, count}, ...] }
app.get('/suggest', (req, res) => {
  const startedAt = Date.now();

  // The typed prefix arrives as the query-string parameter ?q=...
  const q = req.query.q || '';

  const suggestions = getSuggestions(q);
  const ms = Date.now() - startedAt;

  // Record what happened (handy evidence + shows up in the UI logs panel).
  log('SUGGEST', { q, results: suggestions.length, ms });

  res.json({ q, count: suggestions.length, suggestions });
});

// --- POST /search -------------------------------------------------------------
// The "dummy search API". The user submits a query; we record it (count +1) and
// reply with the required dummy message. The body is JSON: { "query": "iphone" }.
app.post('/search', (req, res) => {
  const query = (req.body && (req.body.query || req.body.q)) || '';

  const recorded = recordSearch(query);
  log('SEARCH', { query: recorded || '(empty)', recorded: recorded !== null });

  // The assignment asks specifically for this response shape.
  res.json({ message: 'Searched' });
});

// --- GET /logs?n=<number> -----------------------------------------------------
// The UI polls this to show a live "what the server is doing" panel.
app.get('/logs', (req, res) => {
  const n = parseInt(req.query.n, 10) || 50;
  res.json({ lines: getRecent(n) });
});

// --- Start the server ---------------------------------------------------------
app.listen(PORT, () => {
  log('SERVER', { msg: 'started', url: `http://localhost:${PORT}` });
  console.log(`Open http://localhost:${PORT}`);
});
