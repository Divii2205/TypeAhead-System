# Search Typeahead System

A search-as-you-type suggestion system (like the dropdown under a search engine's
search box). It serves the top 10 popular queries that start with what you're typing,
records the searches you submit, and keeps suggestions fast using a **distributed Redis
cache** routed by **consistent hashing**. It also supports **trending** (recency-aware)
ranking and **batch writes** to reduce database load.

> Built as a learning project. Every design choice is explained in plain English in
> [`PROCESS.md`](./PROCESS.md).

---

## Architecture (one-minute version)

```
   Browser (public/)                 Node + Express (server/)              Storage
 ┌──────────────────┐   GET /suggest ┌───────────────────────┐  cache   ┌───────────┐
 │ search box       │ ─────────────► │  suggest route        │ ───────► │ Redis x3  │
 │ suggestions list │ ◄───────────── │  (cache → DB fallback)│ ◄─────── │ (Docker)  │
 │ trending panel   │                │                       │          └───────────┘
 │ logs panel       │  POST /search  │  search route         │  miss    ┌───────────┐
 └──────────────────┘ ─────────────► │  → batch buffer       │ ───────► │ SQLite    │
                                      │  → trending tracker   │          │ (queries) │
                                      └───────────────────────┘          └───────────┘
                                          ▲ batch flusher writes counts in bulk
```

- **SQLite** is the *primary data store* (the source of truth for query counts).
- **Redis x3** is the *cache* (fast, temporary copies of suggestion results).
- **Consistent hashing** (our code) decides which Redis node owns each prefix.

---

## How to run it

You need **Node.js** and **Docker Desktop** installed.

```bash
# 1. Start the 3 Redis cache nodes (in the background)
docker compose up -d

# 2. Install Node dependencies
npm install

# 3. Load the dataset into SQLite (see "Dataset" below first)
npm run load

# 4. Start the server
npm start
```

Then open <http://localhost:3000>.

To stop the Redis nodes later: `docker compose down`.

---

## Dataset

This project uses the open **English Word Frequency** list — the Google Web Trillion
Word Corpus, published by Peter Norvig. It contains **333,333 rows**, each a word and its
real-world frequency (`word <TAB> count`). That already matches the required
`query | count` format and far exceeds the 100,000-row minimum, so **no count derivation
is needed** — we use the published frequency directly as the popularity count.

- **Source:** <https://norvig.com/ngrams/count_1w.txt> (free, no login)
- Same data is also on Kaggle as *English Word Frequency* (`unigram_freq.csv`).

Download it into the `data/` folder, then load it:

```bash
# download (no login required)
curl -L -o data/count_1w.txt https://norvig.com/ngrams/count_1w.txt

# load into SQLite (creates data/queries.db)
npm run load
```

The loader (`data/load_data.js`) creates the `queries` table, then bulk-inserts all rows
in a single transaction (~3–4 seconds).

---

## API documentation

| Method | Endpoint | What it does |
|--------|----------|--------------|
| GET | `/suggest?q=<prefix>` | Up to 10 suggestions starting with `<prefix>`, best first |
| POST | `/search` | Records a submitted query; returns `{"message":"Searched"}` |
| GET | `/cache/debug?prefix=<prefix>` | Shows which Redis node owns the prefix + hit/miss |
| GET | `/trending` | Top queries by recent activity |
| GET | `/logs?n=50` | Most recent log lines (also shown in the UI) |

**Example — `GET /suggest`:**

```bash
curl "http://localhost:3000/suggest?q=ip"
```
```json
{
  "q": "ip",
  "count": 10,
  "suggestions": [
    { "query": "ip",   "count": 64162886 },
    { "query": "ipod", "count": 36985229 },
    { "query": "ipaq", "count": 7454622 }
  ]
}
```

Input is case-insensitive (`IP` == `ip`); empty, missing, or no-match input returns
`{"count": 0, "suggestions": []}` instead of an error.

**Example — `POST /search`:**

```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{"query":"iphone"}'
```
```json
{ "message": "Searched" }
```

This records the query (new query → count 1; existing query → count + 1).

_More endpoint examples are added as each is built._

---

## Performance report

_Filled in at Step 7: p95 latency, cache hit rate, and database write reduction._

---

## Design choices & trade-offs

See [`PROCESS.md`](./PROCESS.md) for the full, step-by-step reasoning behind every part
of this system.
