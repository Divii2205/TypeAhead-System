// app.js — the browser-side logic for the typeahead UI.
// -----------------------------------------------------------------------------
// Responsibilities:
//   - Watch the search box and ask the server for suggestions as you type
//     (but DEBOUNCED, so we don't fire a request on every single keystroke).
//   - Show loading / error / "no results" states.
//   - Let you move through suggestions with the Up/Down arrow keys and pick one.
//   - Poll the server logs and show them in the logs panel.
// (Search submission is wired up in Step 3; trending in Step 5.)
// -----------------------------------------------------------------------------

// Grab the page elements once.
const input = document.getElementById('search-input');
const button = document.getElementById('search-button');
const list = document.getElementById('suggestions');
const statusEl = document.getElementById('status');
const logsEl = document.getElementById('logs');

// The suggestions currently shown, and which one is highlighted (-1 = none).
let current = [];
let activeIndex = -1;

// A token so that if responses come back out of order, we only use the newest.
let latestRequest = 0;

// --- Debounce helper ----------------------------------------------------------
// Returns a wrapped function that only runs AFTER the user stops calling it for
// `wait` milliseconds. This is how we "avoid unnecessary backend calls".
function debounce(fn, wait) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

// --- Fetch suggestions from the server ---------------------------------------
async function fetchSuggestions(q) {
  // Empty box -> clear everything, no request needed.
  if (!q.trim()) {
    hideSuggestions();
    setStatus('');
    return;
  }

  const myRequest = ++latestRequest;
  setStatus('Searching…');

  try {
    const res = await fetch('/suggest?q=' + encodeURIComponent(q));
    if (!res.ok) throw new Error('Server returned ' + res.status);
    const data = await res.json();

    // If a newer keystroke already fired, ignore this (stale) response.
    if (myRequest !== latestRequest) return;

    render(data.suggestions);
  } catch (err) {
    if (myRequest !== latestRequest) return;
    hideSuggestions();
    setStatus('Something went wrong: ' + err.message, true);
  }
}

// Run fetchSuggestions at most once per ~200ms of typing.
const debouncedFetch = debounce((q) => fetchSuggestions(q), 200);

// --- Rendering ----------------------------------------------------------------
function render(suggestions) {
  current = suggestions || [];
  activeIndex = -1;

  if (current.length === 0) {
    hideSuggestions();
    setStatus('No matching searches.');
    return;
  }

  setStatus('');
  list.innerHTML = '';

  current.forEach((item, i) => {
    const li = document.createElement('li');
    li.dataset.index = i;

    const term = document.createElement('span');
    term.className = 'term';
    term.textContent = item.query;

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = Number(item.count).toLocaleString();

    li.appendChild(term);
    li.appendChild(count);

    // Click a suggestion to pick it.
    li.addEventListener('click', () => choose(i));

    list.appendChild(li);
  });

  list.hidden = false;
}

function hideSuggestions() {
  list.hidden = true;
  list.innerHTML = '';
  current = [];
  activeIndex = -1;
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

// Visually highlight the row at activeIndex (for keyboard navigation).
function updateActive() {
  [...list.children].forEach((li, i) => {
    li.classList.toggle('active', i === activeIndex);
  });
}

// Pick a suggestion: put it in the box and close the dropdown.
function choose(i) {
  if (i < 0 || i >= current.length) return;
  input.value = current[i].query;
  hideSuggestions();
  input.focus();
}

// --- Events -------------------------------------------------------------------
input.addEventListener('input', () => debouncedFetch(input.value));

input.addEventListener('keydown', (e) => {
  // Only the arrow keys / enter / escape need special handling.
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (current.length === 0) return;
    activeIndex = Math.min(activeIndex + 1, current.length - 1);
    updateActive();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (current.length === 0) return;
    activeIndex = Math.max(activeIndex - 1, 0);
    updateActive();
  } else if (e.key === 'Enter') {
    // If a suggestion is highlighted, pick it. (Submitting comes in Step 3.)
    if (activeIndex >= 0) {
      e.preventDefault();
      choose(activeIndex);
    }
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
});

// Close the dropdown if you click anywhere outside the search area.
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-area')) hideSuggestions();
});

// The search button doesn't submit yet — wired up in Step 3.
button.addEventListener('click', () => input.focus());

// --- Live logs panel ----------------------------------------------------------
async function refreshLogs() {
  try {
    const res = await fetch('/logs?n=50');
    const data = await res.json();
    logsEl.textContent = data.lines.length
      ? data.lines.join('\n')
      : '(no activity yet)';
    // Auto-scroll to the newest line.
    logsEl.scrollTop = logsEl.scrollHeight;
  } catch {
    // Ignore log-fetch errors; they're not important to the user.
  }
}

setInterval(refreshLogs, 1500);
refreshLogs();
