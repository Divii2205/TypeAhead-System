# Search Typeahead System — Build Roadmap + Teaching-Agent Prompt

## Stack (fits your existing skills, no new tools to learn)

- **Backend:** Node.js + TypeScript + Fastify (same as BriefVoice)
- **Primary store:** SQLite (`better-sqlite3`) — durable, zero-ops, easy to inspect for the viva
- **Cache layer:** 3 local Redis instances (Docker Compose, different ports) + a consistent-hashing router you write yourself in app code
- **Frontend:** React + Vite, plain fetch, no heavy state lib needed
- **Dataset:** pick one — Wikipedia page-title + pageview dump, Google's 10k common search terms, or a wordfreq corpus (English word frequencies via the `wordfreq` Python package). Any of these gives you `query, count` rows past the 100k minimum.

Why real Redis instances instead of in-memory maps: the assignment explicitly grades "distributed cache using consistent hashing" — that only means something if there are actually multiple independent nodes you're routing between. Three Redis containers on ports 6379/6380/6381 is one `docker-compose up` and costs you nothing extra to learn.

## Roadmap (mapped to the rubric)

### Phase 0 — Dataset + project skeleton
- Pick a dataset, write a one-off ingestion script that normalizes it into `(query, count)` rows.
- Scaffold backend (`fastify`, `typescript`, `better-sqlite3`) and frontend (`vite` + `react`) as separate folders in one repo.
- **Concept to nail before moving on:** why a relational/KV primary store + an in-memory index are two different concerns (durability vs. read speed).

### Phase 1 — Suggestion API (basic, 60% chunk starts here)
- Build a **Trie** keyed by characters, each leaf/node pointing at full query strings + counts. Load it from SQLite on boot.
- `GET /suggest?q=<prefix>` → walk the trie to the prefix node, collect descendants, sort by count desc, return top 10.
- Handle empty input, no-match prefixes, mixed case, gracefully.
- **Concept:** why a trie gives you O(prefix length) lookup vs. scanning/sorting the whole table every request. Be ready to also explain the alternative (sorted array + binary search) and why you didn't pick it.

### Phase 2 — Search submission API
- `POST /search` with `{ query }` → returns `{ "message": "Searched" }`.
- For now, increment count directly in the trie + SQLite (you'll move this to batched writes in Phase 5 — don't over-build yet).

### Phase 3 — Frontend
- Search box, debounced (300ms) calls to `/suggest`, dropdown rendering results.
- Enter / click-to-search calls `/search`, updates the dummy response.
- Loading + empty + error states. Basic keyboard nav (up/down/enter) on the dropdown.

### Phase 4 — Distributed cache with consistent hashing (the part most students half-do — don't)
- Spin up 3 Redis nodes via Docker Compose.
- Write your own consistent-hashing ring in app code: hash function, virtual nodes (~100–150 per physical node for even distribution), a `getNode(prefix)` function that walks the ring clockwise.
- `/suggest` becomes cache-aside: hash the prefix → pick a node → check cache → on miss, compute from trie/SQLite, write back with a TTL.
- Add `GET /cache/debug?prefix=<x>` showing which node owns it and whether it was a hit or miss.
- **Concept:** what virtual nodes solve (even key distribution, minimal remapping on node add/remove). This is the single question most likely to get asked in the viva — be able to draw the ring on a whiteboard.

### Phase 5 — Batch writes
- Replace the direct-increment in `/search` with: push `{query, ts}` onto an in-memory queue (or a Redis list, your call).
- Background worker flushes every N seconds OR when queue hits size K — aggregates repeated queries in the batch into one SQL increment per query, not one write per event.
- Explicitly write down (for your README) what happens if the process crashes before a flush — lost increments, and what you'd do about it in production (WAL, more frequent flush, accept eventual consistency for an assignment scope).

### Phase 6 — Trending searches (the 20% bonus chunk)
- Same `/suggest` API, but ranking now blends historical count with recent activity.
- Simplest correct approach: keep hourly buckets of search counts for the last 24–48h per query, compute a recency score (e.g. exponential decay weight per bucket), combine as `score = α·log(total_count) + β·recency_score`.
- Be able to explain: how it avoids permanently over-ranking something that spiked once, how/when the cache gets invalidated when rankings shift, and the freshness/latency/complexity trade-off of your scoring window size.

### Phase 7 — Non-functional pass
- Log/measure p95 latency on `/suggest`, cache hit rate, DB read/write counts.
- README with setup instructions, architecture diagram (even a hand-drawn one exported as an image is fine), API docs, screenshots or a short demo video.
- Re-read every line of your own code once, end to end — this is your viva prep, not optional polish.

## Dataset — two real options

**Fast path — `wordfreq` package.** Gets you unblocked today, easily clears the 100k minimum.
```
pip install wordfreq --break-system-packages
```
```python
from wordfreq import top_n_list, word_frequency
words = top_n_list('en', 150_000)
rows = [(w, round(word_frequency(w, 'en') * 1_000_000_000)) for w in words]
# write rows to CSV as query,count
```
Downside: it's word frequency, not really "search behavior" — fine for grading, slightly thinner story for the viva.

**More realistic — Wikipedia pageviews dump.** Page titles + real view counts = a genuine popularity signal, which reads better when you're explaining your ranking choices live.
- Pick an hourly dump: `https://dumps.wikimedia.org/other/pageviews/2026/2026-06/pageviews-20260620-120000.gz`
- Each line: `domain_code page_title count_views response_size`
- Keep only `domain_code == 'en'` (desktop) and optionally `en.m` (mobile, sum into the same title)
- One hour's file already has hundreds of thousands of unique titles with nonzero counts — pull a few consecutive hours and sum counts per title if you want a bigger/steadier dataset
- Filter out junk titles (anything with `:` in it — those are Wikipedia namespace pages like `Special:`, `Talk:`, not real article titles)

**Kaggle — product titles + review counts.** Closest to what the assignment literally suggests ("product names, page titles... derive counts from aggregation").
- `asaniczka/amazon-products-dataset-2023-1-4m-products` — 1.4M rows, `title` + `reviews` columns (review count as your popularity signal). Easily clears the minimum on its own.
- Smaller, purpose-built alternative: `balamurugan1603/ecommerce-product-names-for-search-autocomplete` — already framed as an autocomplete dataset, check its row count against the 100k minimum before relying on it alone.
```
pip install kaggle --break-system-packages
kaggle datasets download -d asaniczka/amazon-products-dataset-2023-1-4m-products
```
(Needs a Kaggle account + API token in `~/.kaggle/kaggle.json` — Account → Create New Token on kaggle.com.) Confirm the exact column names once it's downloaded; `reviews` is the one from memory, double-check against the actual CSV header.

Recommendation: the Amazon products dataset is probably your best pick — real product names, a genuine count signal (review volume), comfortably over the row minimum, and it doubles as a believable story for the viva ("I used product popularity by review count as my frequency signal"). Use `wordfreq` only if Kaggle auth is friction you don't want right now.

---

## The teaching-agent prompt

Paste this as the first message in a fresh Claude Code session (or a new claude.ai conversation) when you're ready to start. It's written so the agent explains and reviews, but never hands you finished code — which also happens to be exactly what the assignment's academic-integrity clause requires (you have to be able to defend every line in the viva, or it counts as plagiarism even if the code runs).

```
You are my technical mentor for a university systems-design assignment: a search 
typeahead system (prefix suggestions, search-count tracking, distributed cache with 
consistent hashing, trending searches with recency ranking, batch writes). I already 
have a phase-by-phase roadmap — I'll tell you which phase I'm on.

Your role:
- For the current phase, first explain the relevant concept(s) in plain terms, with a 
  short example if it helps, BEFORE I write anything.
- Give me pseudocode, function signatures, or a skeleton with comments at most — never 
  a complete working implementation. I write every actual line.
- When I paste code I've written, review it: point out bugs, edge cases I missed, and 
  ask me to justify specific design choices (e.g. "why did you pick X data structure 
  here?") rather than just fixing it for me.
- If I ask you to "just write it," push back once and remind me I have to defend this 
  code in a live viva — then offer a hint instead, not the code.
- Periodically quiz me, especially before I move to the next phase: ask me to explain 
  my current implementation out loud (in text) as if you were the viva examiner.
- Match explanations to my background: I'm comfortable with Node.js/TypeScript, React, 
  REST APIs, and basic SQL — don't over-explain those, but go slow on trie traversal, 
  consistent hashing, and recency-decay scoring since those are new to me.
- Don't skip ahead to later phases even if I ask, unless I explicitly say I'm changing 
  the plan.

Confirm you understand this mode, then ask me which phase I'm starting on.
```
