# PROCESS — how we built this, step by step (and why)

This document is the "story" of the project. After each build step we add a section
explaining **what we did**, **definitions** of any new word, and **why** we chose that
approach. If someone asks "why did you do it this way?" the answer is here, in plain
English.

---

## The big idea (read this first)

A typeahead system has to answer one question very, very fast, thousands of times:

> "The user typed `ip` — what are the 10 most popular searches that start with `ip`?"

Doing a database lookup every single time is slow. So the trick is:

1. Keep the *truth* (every query and how many times it was searched) in a reliable
   **database** (we use **SQLite**).
2. Keep *recent answers* in a fast **cache** (we use **Redis**) so repeated questions
   are answered instantly.
3. Spread the cache across several nodes (a **distributed cache**) and use
   **consistent hashing** to decide which node holds which answer.
4. Don't write to the database on every search — **batch** the writes together.
5. Let **recent** activity bump things up the list (**trending**), but make that effect
   fade over time so old spikes don't dominate forever.

Everything below builds these pieces one at a time.

---

## Step 0 — Project setup

**What we did**
- Set up a Node.js project (`package.json`) with three dependencies we'll add: `express`
  (web server), `better-sqlite3` (database), `ioredis` (talks to Redis).
- Wrote `docker-compose.yml` describing **3 Redis containers** on ports 6379/6380/6381.
  These are our 3 cache nodes.
- Wrote `server/logger.js`, a tiny helper that writes events to the console **and** to
  `logs/app.log`, and remembers the latest lines so the web page can show them.
- Created the folder layout and these two docs.

**Definitions**
- **Node.js** — lets us run JavaScript on the server (not just in the browser).
- **Express** — a small library that makes it easy to define web endpoints like
  `GET /suggest`.
- **Docker / container** — a way to run a program (here, Redis) in an isolated box without
  installing it directly on your computer. `docker compose up` starts all 3 at once.
- **Redis** — an in-memory database that is extremely fast at "give me the value for this
  key" — perfect for a cache.
- **Dependency** — code written by other people that our project uses; installed with
  `npm install`.

**Why these choices**
- *SQLite* for the database: it's a single file, needs no separate server, and is plenty
  fast for this assignment. Easiest possible "real database".
- *Redis in Docker* for the cache: Redis is the industry-standard cache, and Docker lets
  us run 3 copies with one command — a genuine distributed setup that's still easy to run.
- *Logging from day one*: the assignment is graded partly on *showing* behaviour (cache
  hits, routing, batching). Logging early means we get that evidence for free.
