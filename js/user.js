const API = 'https://uwi-comp3435-project.onrender.com';

// ─────────────────────────────────────────────────────────────
// Tab switching (with ARIA aria-selected)
// ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ─────────────────────────────────────────────────────────────
// User info from sessionStorage (set during login)
// ─────────────────────────────────────────────────────────────
(function loadUser() {
  const name = sessionStorage.getItem('userFullName') || 'Guest User';
  document.getElementById('userName').textContent = name;
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('userInitials').textContent = initials;
})();

// ─────────────────────────────────────────────────────────────
// Road name loader (cached) — fetches from MongoDB via API
// ─────────────────────────────────────────────────────────────
let roadNames = null;
async function loadRoadNames() {
  if (!roadNames) {
    const res  = await fetch(API + '/api/roads');
    const data = await res.json();
    if (!data.success) throw new Error('Could not load road names');
    roadNames = data.roads.map(r => r.name);
  }
  return roadNames;
}

// ─────────────────────────────────────────────────────────────
// ARIA combobox autocomplete
// ─────────────────────────────────────────────────────────────
function initAutocomplete(input, list, names) {
  let activeIdx = -1;

  function render(matches) {
    list.innerHTML = '';
    matches.forEach((name, i) => {
      const li = document.createElement('li');
      li.id = `${list.id}-opt-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.textContent = name;
      li.addEventListener('mousedown', e => { e.preventDefault(); select(name); });
      list.appendChild(li);
    });
    activeIdx = -1;
  }

  function open()  {
    list.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
  }

  function close() {
    list.classList.add('hidden');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIdx = -1;
  }

  function select(name) {
    input.value = name;
    close();
    input.focus();
  }

  function update() {
    const val = input.value.trim().toLowerCase();
    const matches = val ? names.filter(n => n.toLowerCase().includes(val)) : [];
    if (matches.length) { render(matches); open(); } else { close(); }
  }

  function setActive(idx) {
    const items = list.querySelectorAll('li');
    items.forEach((li, i) => li.setAttribute('aria-selected', i === idx ? 'true' : 'false'));
    if (idx >= 0 && items[idx]) {
      input.setAttribute('aria-activedescendant', items[idx].id);
      items[idx].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
    activeIdx = idx;
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  input.addEventListener('blur',  () => setTimeout(close, 150));
  input.addEventListener('keydown', e => {
    const items = list.querySelectorAll('li');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (list.classList.contains('hidden')) { update(); return; }
      setActive(Math.min(activeIdx + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIdx - 1, -1));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.stopImmediatePropagation();
      select(items[activeIdx].textContent);
    } else if (e.key === 'Escape') {
      close();
    }
  });
}

// Wire up the road name input
(async function initRoadAutocomplete() {
  try {
    const names = await loadRoadNames();
    initAutocomplete(
      document.getElementById('roadNameInput'),
      document.getElementById('user-road-opts'),
      names
    );
  } catch { /* silently skip if data unavailable */ }
})();

// ── Road calculation helpers ──────────────────────────────────
function getRoadNet(r) {
  let s = 0, m = 0, d = 0;
  r.holedata.forEach(e => {
    if (e.type === 'observation') { s += e.shallow; m += e.medium; d += e.deep; }
    else if (e.type === 'repair') { s -= e.shallow; m -= e.medium; d -= e.deep; }
  });
  return { shallow: Math.max(0, s), medium: Math.max(0, m), deep: Math.max(0, d) };
}
function roadPct(n, total) { return total > 0 ? Math.round(n / total * 100) : 0; }

// ─────────────────────────────────────────────────────────────
// Road data lookup — fetches from MongoDB via API
// Returns: { name, totalPotholes, avgDist, shallow, medium, deep }
// shallow / medium / deep are percentages 0–100
// ─────────────────────────────────────────────────────────────
async function fetchRoadData(roadName) {
  const res  = await fetch(`${API}/api/roads/${encodeURIComponent(roadName)}`);
  const data = await res.json();
  if (!data.success) throw new Error(`Road "${roadName}" not found`);
  const road  = data.road;
  const net   = getRoadNet(road);
  const total = net.shallow + net.medium + net.deep;
  const avgDist = total > 0 ? Math.round(road.lengthKm * 1000 / total) : 0;
  return {
    name:          road.name,
    totalPotholes: total,
    avgDist,
    shallow:       roadPct(net.shallow, total),
    medium:        roadPct(net.medium,  total),
    deep:          roadPct(net.deep,    total)
  };
}

// ─────────────────────────────────────────────────────────────
// My Roads – data store
// ─────────────────────────────────────────────────────────────
let roads  = []; // [{ id, name, status: 'loading'|'loaded'|'error', data: null|{...} }]
let nextId = 0;

function updateRoadsVisibility() {
  const isEmpty = roads.length === 0;
  document.getElementById('roadsEmpty').classList.toggle('hidden', !isEmpty);
  document.getElementById('roadCardsContainer').classList.toggle('hidden', isEmpty);
}

// ─────────────────────────────────────────────────────────────
// Summary recalculation — aggregates all loaded roads
// ─────────────────────────────────────────────────────────────
function recalculateSummary() {
  const loaded = roads.filter(r => r.status === 'loaded' && r.data);

  if (!loaded.length) {
    document.getElementById('summaryData').classList.add('hidden');
    document.getElementById('summaryIdle').classList.remove('hidden');
    return;
  }

  const count      = loaded.length;
  const total      = loaded.reduce((s, r) => s + (r.data.totalPotholes || 0), 0);
  const avgDist    = Math.round(loaded.reduce((s, r) => s + (r.data.avgDist   || 0), 0) / count);
  const avgShallow = Math.round(loaded.reduce((s, r) => s + (r.data.shallow   || 0), 0) / count);
  const avgMedium  = Math.round(loaded.reduce((s, r) => s + (r.data.medium    || 0), 0) / count);
  const avgDeep    = Math.round(loaded.reduce((s, r) => s + (r.data.deep      || 0), 0) / count);

  document.getElementById('summaryTotalPotholes').textContent = total;
  document.getElementById('summaryAvgDist').textContent       = avgDist;

  document.getElementById('summaryShallowPct').textContent = avgShallow + '%';
  document.getElementById('summaryMediumPct').textContent  = avgMedium  + '%';
  document.getElementById('summaryDeepPct').textContent    = avgDeep    + '%';

  document.getElementById('summaryData').classList.remove('hidden');
  document.getElementById('summaryIdle').classList.add('hidden');
}

// ─────────────────────────────────────────────────────────────
// Road card – creation and update
// ─────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createRoadCard(road) {
  const card = document.createElement('div');
  card.className = 'road-card';
  card.dataset.roadId = road.id;

  card.innerHTML = `
    <div class="road-card-header">
      <span class="road-card-name">${escapeHtml(road.name)}</span>
      <button class="btn-remove-road" aria-label="Remove ${escapeHtml(road.name)}">&#x2715;</button>
    </div>
    <div class="road-card-body">
      <div class="road-card-loading" aria-busy="true">
        <div class="spinner" role="status" aria-label="Loading"></div>
        <span>Loading data…</span>
      </div>
      <div class="road-card-data hidden">
        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-value road-total-potholes">–</div>
            <div class="stat-label">Total Potholes</div>
          </div>
          <div class="stat-card">
            <div class="stat-value road-avg-dist">–</div>
            <div class="stat-label">Avg. Distance (m)</div>
          </div>
        </div>
        <div class="depth-section">
          <h4>Depth Breakdown</h4>
          <div class="depth-pct-rows">
            <div class="depth-pct-row">
              <span class="depth-label">Shallow</span>
              <span class="depth-pct road-shallow-pct">–</span>
            </div>
            <div class="depth-pct-row">
              <span class="depth-label">Medium</span>
              <span class="depth-pct road-medium-pct">–</span>
            </div>
            <div class="depth-pct-row">
              <span class="depth-label">Deep</span>
              <span class="depth-pct road-deep-pct">–</span>
            </div>
          </div>
        </div>
      </div>
      <div class="road-card-error hidden" role="alert">
        <span class="road-error-msg">Could not load data. Backend not connected yet.</span>
      </div>
    </div>`;

  card.querySelector('.btn-remove-road').addEventListener('click', () => removeRoad(road.id));
  return card;
}

function updateRoadCard(road) {
  const card = document.querySelector(`.road-card[data-road-id="${road.id}"]`);
  if (!card) return;

  const loadingEl = card.querySelector('.road-card-loading');
  const dataEl    = card.querySelector('.road-card-data');
  const errorEl   = card.querySelector('.road-card-error');

  loadingEl.classList.add('hidden');

  if (road.status === 'error') {
    errorEl.classList.remove('hidden');
    return;
  }

  const d   = road.data;
  const fmt = v => v != null ? Math.round(v) + '%' : '–';

  card.querySelector('.road-total-potholes').textContent = d.totalPotholes ?? '–';
  card.querySelector('.road-avg-dist').textContent       = d.avgDist ?? '–';

  card.querySelector('.road-shallow-pct').textContent = fmt(d.shallow);
  card.querySelector('.road-medium-pct').textContent  = fmt(d.medium);
  card.querySelector('.road-deep-pct').textContent    = fmt(d.deep);

  dataEl.classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────
// Add / remove roads
// ─────────────────────────────────────────────────────────────
async function addRoad(name) {
  const road = { id: nextId++, name, status: 'loading', data: null };
  roads.push(road);

  const card = createRoadCard(road);
  document.getElementById('roadCardsContainer').appendChild(card);
  updateRoadsVisibility();

  try {
    road.data   = await fetchRoadData(name);
    road.status = 'loaded';
  } catch {
    road.status = 'error';
  }

  updateRoadCard(road);
  recalculateSummary();
}

function removeRoad(id) {
  roads = roads.filter(r => r.id !== id);
  document.querySelector(`.road-card[data-road-id="${id}"]`)?.remove();
  updateRoadsVisibility();
  recalculateSummary();
}

// ─────────────────────────────────────────────────────────────
// Add Road – input handler
// ─────────────────────────────────────────────────────────────
function handleAddRoad() {
  const input   = document.getElementById('roadNameInput');
  const errorEl = document.getElementById('addRoadError');
  const name    = input.value.trim();

  errorEl.classList.add('hidden');

  if (!name) {
    errorEl.textContent = 'Please enter a road name.';
    errorEl.classList.remove('hidden');
    input.focus();
    return;
  }

  if (roads.some(r => r.name.toLowerCase() === name.toLowerCase())) {
    errorEl.textContent = `"${name}" has already been added.`;
    errorEl.classList.remove('hidden');
    input.focus();
    return;
  }

  input.value = '';
  addRoad(name);
}

document.getElementById('addRoadBtn').addEventListener('click', handleAddRoad);
document.getElementById('roadNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleAddRoad();
});

