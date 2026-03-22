const API = 'https://uwi-comp3435-project.onrender.com';

// Tab switching
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

// Constants
const REPAIR_COST            = { shallow: 20,  medium: 50,  deep: 100 };
const REPAIR_TIME            = { shallow: 0.5, medium: 1,   deep: 2   };
const RESURFACE_COST_PER_KM  = 100;
const RESURFACE_TIME_PER_KM  = 8;
const RESURFACE_THRESHOLD    = 1000;
const MAX_ROAD_LENGTH_KM     = 10;
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

// Utility: state toggles
function setState(prefix, state) {
  ['idle','loading','error','results'].forEach(s => {
    const el = document.getElementById(prefix + '-' + s);
    if (el) el.classList.toggle('hidden', s !== state);
  });
}

function setError(prefix, msg) {
  const el = document.getElementById(prefix + '-error-msg');
  if (el) el.textContent = msg;
  setState(prefix, 'error');
}

// Utility: format currency and time
function formatMoney(amount) {
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatHours(hours) {
  if (hours === null || hours === undefined) return '–';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr${h !== 1 ? 's' : ''}`;
  return `${h} hr${h !== 1 ? 's' : ''} ${m} min`;
}


// MongoDB data loader (cached) — all roads with full holedata
let allRoadsCache = null;
async function loadAllRoads() {
  if (!allRoadsCache) {
    const res  = await fetch(API + '/api/roads/all');
    const data = await res.json();
    if (!data.success) throw new Error('Could not load road data');
    allRoadsCache = data.roads;
  }
  return allRoadsCache;
}
function clearRoadsCache() { allRoadsCache = null; }

// ARIA combobox autocomplete
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

  function open()  { list.classList.remove('hidden'); input.setAttribute('aria-expanded', 'true'); }
  function close() {
    list.classList.add('hidden');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIdx = -1;
  }
  function select(name) { input.value = name; close(); input.focus(); }

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

  input.addEventListener('input',  update);
  input.addEventListener('focus',  update);
  input.addEventListener('blur',   () => setTimeout(close, 150));
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

// Wire autocomplete for Tab 2 and Tab 3 search inputs
(async function initSearchAutocomplete() {
  try {
    const roads = await loadAllRoads();
    const names = roads.map(r => r.name);
    [
      ['maint-road-input',  'maint-road-opts'],
      ['rpt-monthly-input', 'rpt-monthly-opts'],
    ].forEach(([inputId, listId]) => {
      const inp = document.getElementById(inputId);
      const lst = document.getElementById(listId);
      if (inp && lst) initAutocomplete(inp, lst, names);
    });
  } catch { /* do nothing if data unavailable */ }
})();

// Road helpers
function formatType(type) {
  return { highway4: 'Highway (4-Lane)', highway2: 'Highway (2-Lane)',
           residential: 'Residential', cart: 'Cart Road' }[type] || type;
}

// Net current potholes — observations add, repairs subtract
function getRoadNet(r) {
  let s = 0, m = 0, d = 0;
  r.holedata.forEach(e => {
    if (e.type === 'observation') { s += e.shallow; m += e.medium; d += e.deep; }
    else if (e.type === 'repair') { s -= e.shallow; m -= e.medium; d -= e.deep; }
  });
  return { shallow: Math.max(0, s), medium: Math.max(0, m), deep: Math.max(0, d) };
}

function roadTotal(r)      { const n = getRoadNet(r); return n.shallow + n.medium + n.deep; }
function roadPct(n, total) { return total > 0 ? Math.round(n / total * 100) : 0; }

// Monthly observation totals for a single road, optionally filtered by year
function getMonthlyObs(r, year) {
  return MONTHS.map((month, i) => {
    let s = 0, m = 0, d = 0;
    r.holedata.forEach(e => {
      if (e.type !== 'observation') return;
      const dt = new Date(e.date + 'T00:00:00');
      if (year !== undefined && dt.getFullYear() !== year) return;
      if (dt.getMonth() === i) { s += e.shallow; m += e.medium; d += e.deep; }
    });
    return { month, shallow: s, medium: m, deep: d, total: s + m + d };
  });
}

// Aggregate monthly observations across multiple roads, optionally filtered by year
function aggregateMonthly(roads, year) {
  return MONTHS.map((month, i) => {
    let s = 0, m = 0, d = 0;
    roads.forEach(r => {
      r.holedata.forEach(e => {
        if (e.type !== 'observation') return;
        const dt = new Date(e.date + 'T00:00:00');
        if (year !== undefined && dt.getFullYear() !== year) return;
        if (dt.getMonth() === i) { s += e.shallow; m += e.medium; d += e.deep; }
      });
    });
    return { month, shallow: s, medium: m, deep: d, total: s + m + d };
  });
}

// Net potholes per month (obs − repairs) for a set of roads, filtered by year
function aggregateNetByYear(roads, year) {
  return MONTHS.map((month, i) => {
    let net = 0;
    roads.forEach(r => {
      r.holedata.forEach(e => {
        if (e.type !== 'observation' && e.type !== 'repair') return;
        const dt = new Date(e.date + 'T00:00:00');
        if (dt.getFullYear() !== year || dt.getMonth() !== i) return;
        const tot = (e.shallow ?? 0) + (e.medium ?? 0) + (e.deep ?? 0);
        if (e.type === 'observation') net += tot; else net -= tot;
      });
    });
    return { month, net: Math.max(0, net) };
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


// Calc helpers
function calcRepairCost(shallow, medium, deep) {
  return shallow * REPAIR_COST.shallow + medium * REPAIR_COST.medium + deep * REPAIR_COST.deep;
}
function calcRepairTime(shallow, medium, deep) {
  return shallow * REPAIR_TIME.shallow + medium * REPAIR_TIME.medium + deep * REPAIR_TIME.deep;
}
function calcResurfaceCost(lengthKm) {
  return Math.min(lengthKm, MAX_ROAD_LENGTH_KM) * RESURFACE_COST_PER_KM;
}
function calcResurfaceTime(lengthKm) {
  return Math.min(lengthKm, MAX_ROAD_LENGTH_KM) * RESURFACE_TIME_PER_KM;
}


// Monthly table builder
function buildMonthlyTable(containerId, months, title, subtitle) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  const totals = { shallow: 0, medium: 0, deep: 0, total: 0 };
  months.forEach(m => {
    totals.shallow += m.shallow ?? 0;
    totals.medium  += m.medium  ?? 0;
    totals.deep    += m.deep    ?? 0;
    totals.total   += m.total   ?? 0;
  });

  const rows = MONTHS.map((name, i) => {
    const m = months[i] ?? { shallow: 0, medium: 0, deep: 0, total: 0 };
    const isZero = (m.total ?? 0) === 0;
    return `<tr>
      <td>${name}</td>
      <td class="${isZero ? 'td-zero' : 'td-shallow'}">${m.shallow ?? 0}</td>
      <td class="${isZero ? 'td-zero' : 'td-medium'}">${m.medium  ?? 0}</td>
      <td class="${isZero ? 'td-zero' : 'td-deep'}">${m.deep    ?? 0}</td>
      <td class="${isZero ? 'td-zero' : 'td-total'}">${m.total   ?? 0}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="monthly-table-header">
      <h3>${title}</h3>
      <span>${subtitle}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Month</th><th>Shallow</th><th>Medium</th><th>Deep</th><th>Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td>Year Total</td>
          <td>${totals.shallow}</td><td>${totals.medium}</td>
          <td>${totals.deep}</td><td>${totals.total}</td>
        </tr>
      </tfoot>
    </table>`;
}



// TAB 1 – Add Road Data
let allRoadNames = [];
let checkMode       = 'check';
let lastCheckedName = '';

// Set date input max = today, default = today
(function initDateInput() {
  const today     = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('addpothole-date');
  if (dateInput) { dateInput.max = today; dateInput.value = today; }
})();

// Wire pothole-panel autocomplete once roads load (allRoadNames populated here)
(async function initPotholeAutocomplete() {
  try {
    const roads = await loadAllRoads();
    roads.forEach(r => allRoadNames.push(r.name));
    initAutocomplete(
      document.getElementById('addpothole-road-input'),
      document.getElementById('addpothole-road-opts'),
      allRoadNames
    );
  } catch {}
})();

let checkMsgTimeout;
function setCheckMsg(html, fade = false) {
  const msgEl = document.getElementById('addroad-check-msg');
  clearTimeout(checkMsgTimeout);
  msgEl.innerHTML = html;
  if (fade) checkMsgTimeout = setTimeout(() => { msgEl.innerHTML = ''; }, 4000);
}

// Reset left panel back to check mode
function resetToCheckMode() {
  clearTimeout(checkMsgTimeout);
  checkMode = 'check';
  lastCheckedName = '';
  document.getElementById('addroad-btn').textContent = 'Check Road';
  document.getElementById('addroad-cancel-btn').classList.add('hidden');
  document.getElementById('addroad-extra-fields').classList.add('hidden');
  document.getElementById('addroad-check-msg').innerHTML = '';
  document.getElementById('addroad-error').classList.add('hidden');
}

// If user edits the name after a check, reset back to check mode
document.getElementById('addroad-check-input').addEventListener('input', () => {
  if (checkMode === 'add') {
    const current = document.getElementById('addroad-check-input').value.trim().toLowerCase();
    if (current !== lastCheckedName.toLowerCase()) resetToCheckMode();
  }
});

async function handleAddRoadBtn() {
  const input   = document.getElementById('addroad-check-input');
  const errorEl = document.getElementById('addroad-error');
  const name    = input.value.trim();

  errorEl.classList.add('hidden');
  document.getElementById('addroad-success').classList.add('hidden');

  if (!name) {
    errorEl.textContent = 'Please enter a road name.';
    errorEl.classList.remove('hidden');
    input.focus();
    return;
  }

  //CHECK phase
  if (checkMode === 'check') {
    const res  = await fetch(`${API}/api/roads/${encodeURIComponent(name)}`);
    const data = await res.json();

    if (data.success) {
      const road = data.road;
      setCheckMsg(`<div class="road-check-found">&#10003; Found — ${formatType(road.type)}, ${road.lengthKm} km. Use the right panel to log potholes.</div>`, true);
      return;
    }

    // Not found — switch to ADD mode
    setCheckMsg('<div class="road-check-new">Road not in system. Fill in the details below to add it.</div>', false);
    document.getElementById('addroad-extra-fields').classList.remove('hidden');
    document.getElementById('addroad-btn').textContent = 'Add Road';
    document.getElementById('addroad-cancel-btn').classList.remove('hidden');
    checkMode       = 'add';
    lastCheckedName = name;
    return;
  }

  // ADD phase
  const typeEl   = document.getElementById('addroad-type');
  const lengthEl = document.getElementById('addroad-length');
  const type     = typeEl.value;
  const rawLen   = parseFloat(lengthEl.value);

  if (!type) {
    errorEl.textContent = 'Please select a road type.';
    errorEl.classList.remove('hidden');
    typeEl.focus();
    return;
  }
  if (!lengthEl.value || isNaN(rawLen) || rawLen < 1 || rawLen > MAX_ROAD_LENGTH_KM) {
    errorEl.textContent = `Please enter a road length between 1 and ${MAX_ROAD_LENGTH_KM} km.`;
    errorEl.classList.remove('hidden');
    lengthEl.focus();
    return;
  }

  const lengthKm  = Math.round(rawLen);
  const addedName = lastCheckedName;

  const res  = await fetch(API + '/api/roads', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: addedName, type, lengthKm })
  });
  const data = await res.json();

  if (!data.success) {
    errorEl.textContent = data.message || 'Failed to add road. Please try again.';
    errorEl.classList.remove('hidden');
    return;
  }

  clearRoadsCache();
  if (!allRoadNames.some(n => n.toLowerCase() === addedName.toLowerCase())) {
    allRoadNames.push(addedName);
  }

  const successEl = document.getElementById('addroad-success');
  successEl.textContent = `✓ "${addedName}" added — ${formatType(type)}, ${lengthKm} km.`;
  successEl.classList.remove('hidden');
  setTimeout(() => successEl.classList.add('hidden'), 4000);
  input.value    = '';
  typeEl.value   = '';
  lengthEl.value = '';
  document.getElementById('addroad-extra-fields').classList.add('hidden');
  document.getElementById('addroad-cancel-btn').classList.add('hidden');
  document.getElementById('addroad-btn').textContent = 'Check Road';
  checkMode       = 'check';
  lastCheckedName = '';
}

// Right panel: log potholes
async function handleLogPotholes() {
  const roadInput = document.getElementById('addpothole-road-input');
  const errorEl   = document.getElementById('addpothole-error');
  const successEl = document.getElementById('addpothole-success');
  const name      = roadInput.value.trim();
  const date      = document.getElementById('addpothole-date').value;
  const shallow   = parseInt(document.getElementById('addpothole-shallow').value, 10) || 0;
  const medium    = parseInt(document.getElementById('addpothole-medium').value,  10) || 0;
  const deep      = parseInt(document.getElementById('addpothole-deep').value,    10) || 0;

  errorEl.classList.add('hidden');
  successEl.classList.add('hidden');

  if (!name) {
    errorEl.textContent = 'Please select or enter a road name.';
    errorEl.classList.remove('hidden');
    return;
  }
  if (!date) {
    errorEl.textContent = 'Please select an observation date.';
    errorEl.classList.remove('hidden');
    return;
  }
  if (shallow + medium + deep === 0) {
    errorEl.textContent = 'Enter at least one pothole count.';
    errorEl.classList.remove('hidden');
    return;
  }

  const res  = await fetch(`${API}/api/roads/${encodeURIComponent(name)}/holedata`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type: 'observation', date, shallow, medium, deep })
  });
  const data = await res.json();

  if (!data.success) {
    errorEl.textContent = data.message || 'Failed to log potholes. Please try again.';
    errorEl.classList.remove('hidden');
    return;
  }

  clearRoadsCache();
  successEl.textContent = `Logged ${shallow + medium + deep} pothole(s) for "${name}" on ${date}.`;
  successEl.classList.remove('hidden');
  setTimeout(() => successEl.classList.add('hidden'), 4000);

  document.getElementById('addpothole-shallow').value = '0';
  document.getElementById('addpothole-medium').value  = '0';
  document.getElementById('addpothole-deep').value    = '0';
}

document.getElementById('addroad-btn').addEventListener('click', handleAddRoadBtn);
document.getElementById('addroad-cancel-btn').addEventListener('click', () => {
  document.getElementById('addroad-check-input').value = '';
  resetToCheckMode();
});
document.getElementById('addroad-check-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleAddRoadBtn();
});
document.getElementById('addpothole-btn').addEventListener('click', handleLogPotholes);


// TAB 2 – Road Maintenance
let lastMaintData = null;

async function fetchMaintData(roadName) {
  const res  = await fetch(`${API}/api/roads/${encodeURIComponent(roadName)}`);
  const data = await res.json();
  if (!data.success) throw new Error(`Road "${roadName}" not found`);
  const road = data.road;
  const net  = getRoadNet(road);
  return {
    name:          road.name,
    shallowCount:  net.shallow,
    mediumCount:   net.medium,
    deepCount:     net.deep,
    roadLengthKm:  road.lengthKm,
    totalPotholes: net.shallow + net.medium + net.deep
  };
}

function renderMaintResults(data) {
  const { name, shallowCount, mediumCount, deepCount, roadLengthKm } = data;

  const repairCost     = calcRepairCost(shallowCount, mediumCount, deepCount);
  const repairTime     = calcRepairTime(shallowCount, mediumCount, deepCount);
  const shouldResuface = repairCost > RESURFACE_THRESHOLD && roadLengthKm !== null;

  document.getElementById('maint-results-road-name').textContent = name;

  const tbody = document.getElementById('maint-breakdown-body');
  const tfoot = document.getElementById('maint-breakdown-foot');
  tbody.innerHTML = `
    <tr><td>Shallow</td><td>${shallowCount}</td><td>${formatMoney(shallowCount * REPAIR_COST.shallow)}</td></tr>
    <tr><td>Medium</td> <td>${mediumCount}</td> <td>${formatMoney(mediumCount  * REPAIR_COST.medium)}</td></tr>
    <tr><td>Deep</td>   <td>${deepCount}</td>   <td>${formatMoney(deepCount    * REPAIR_COST.deep)}</td></tr>`;
  tfoot.innerHTML = `
    <tr><td>Total</td><td>${shallowCount + mediumCount + deepCount}</td><td>${formatMoney(repairCost)}</td></tr>`;

  document.getElementById('maint-repair-time').textContent = formatHours(repairTime);

  document.getElementById('maint-action-road-name').textContent = name;
  const noteEl    = document.getElementById('maint-action-note');
  const actionBtn = document.getElementById('maint-action-btn');

  if (shouldResuface) {
    const rsCost = calcResurfaceCost(roadLengthKm);
    noteEl.textContent       = `Repair cost (${formatMoney(repairCost)}) exceeds the $${RESURFACE_THRESHOLD.toLocaleString()} threshold. Resurfacing (${roadLengthKm} km × $${RESURFACE_COST_PER_KM}/km = ${formatMoney(rsCost)}) is recommended.`;
    actionBtn.textContent    = 'Resurface Road';
    actionBtn.className      = 'btn-action btn-action-resurface';
    actionBtn.dataset.action = 'resurface';
  } else {
    noteEl.textContent       = `Total repair cost (${formatMoney(repairCost)}) is within the $${RESURFACE_THRESHOLD.toLocaleString()} threshold.`;
    actionBtn.textContent    = 'Repair All Potholes';
    actionBtn.className      = 'btn-action btn-action-repair';
    actionBtn.dataset.action = 'repair';
  }

  document.getElementById('maint-action-idle').classList.add('hidden');
  document.getElementById('maint-action-loaded').classList.remove('hidden');
}

function resetMaintTab() {
  lastMaintData = null;
  document.getElementById('maint-road-input').value = '';
  setState('maint', 'idle');
  document.getElementById('maint-action-idle').classList.remove('hidden');
  document.getElementById('maint-action-loaded').classList.add('hidden');
}

async function handleMaintSearch() {
  const road = document.getElementById('maint-road-input').value.trim();
  if (!road) return;

  lastMaintData = null;
  setState('maint', 'loading');

  try {
    const data    = await fetchMaintData(road);
    lastMaintData = data;
    renderMaintResults(data);
    setState('maint', 'results');
  } catch {
    setError('maint', 'Road not found. Check the name or add it via the Add Road Data tab.');
  }
}

document.getElementById('maint-btn').addEventListener('click', handleMaintSearch);
document.getElementById('maint-road-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleMaintSearch();
});
document.getElementById('maint-cancel-btn').addEventListener('click', resetMaintTab);

document.getElementById('maint-action-btn').addEventListener('click', async () => {
  if (!lastMaintData) return;

  const btn    = document.getElementById('maint-action-btn');
  const action = btn.dataset.action;
  const today  = new Date().toISOString().split('T')[0];

  btn.disabled = true;

  const entry = action === 'repair'
    ? { type: 'repair',   date: today, shallow: lastMaintData.shallowCount, medium: lastMaintData.mediumCount, deep: lastMaintData.deepCount }
    : { type: 'resurface', date: today, cost: calcResurfaceCost(lastMaintData.roadLengthKm) };

  try {
    const res  = await fetch(`${API}/api/roads/${encodeURIComponent(lastMaintData.name)}/holedata`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(entry)
    });
    const data = await res.json();
    if (!data.success) throw new Error();

    clearRoadsCache();
    btn.textContent = 'Logged ✓';
    const maintSuccessEl = document.getElementById('maint-success');
    maintSuccessEl.textContent = `✓ ${action === 'repair' ? 'Repair' : 'Resurfacing'} logged for "${lastMaintData.name}" on ${today}.`;
    maintSuccessEl.classList.remove('hidden');
    setTimeout(() => {
      btn.disabled    = false;
      maintSuccessEl.classList.add('hidden');
      resetMaintTab();
    }, 2000);
  } catch {
    btn.disabled    = false;
    btn.textContent = action === 'repair' ? 'Repair All Potholes' : 'Resurface Road';
  }
});


// TAB 3 – Reports
// Collect all unique years from holedata across all roads
function getAvailableYears(roads) {
  const years = new Set();
  roads.forEach(r => r.holedata.forEach(e => {
    years.add(new Date(e.date + 'T00:00:00').getFullYear());
  }));
  return [...years].sort((a, b) => b - a);
}

// Populate year <select> elements once data loads
(async function populateYearDropdowns() {
  try {
    const roads = await loadAllRoads();
    const years = getAvailableYears(roads);
    ['rpt-monthly-year','rpt-roadtype-year','rpt-repaired-year',
     'rpt-resurfaced-year','rpt-sysmonthly-year'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        sel.appendChild(opt);
      });
    });
  } catch {}
})();

// Load/Cancel toggle for each report section
function rptToggle(btnId, resultsId, errorId, loadFn, clearIds = []) {
  const btn = document.getElementById(btnId);
  const res = document.getElementById(resultsId);
  const err = document.getElementById(errorId);
  if (!btn) return;
  btn.dataset.mode = 'load';
  btn.addEventListener('click', async () => {
    if (btn.dataset.mode === 'cancel') {
      btn.dataset.mode = 'load';
      btn.textContent  = 'Load Report';
      res.classList.add('hidden');
      err.classList.add('hidden');
      clearIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      return;
    }
    err.classList.add('hidden');
    res.classList.add('hidden');
    try {
      await loadFn(res);
      res.classList.remove('hidden');
      btn.dataset.mode = 'cancel';
      btn.textContent  = 'Cancel';
    } catch (e) {
      err.textContent = e.message || 'Error loading data.';
      err.classList.remove('hidden');
    }
  });
}

// Section 1: Monthly Pothole Tracking
rptToggle('rpt-monthly-btn', 'rpt-monthly-results', 'rpt-monthly-error', async res => {
  const year = parseInt(document.getElementById('rpt-monthly-year').value, 10);
  const road = document.getElementById('rpt-monthly-input').value.trim();
  if (!year) throw new Error('Please select a year.');
  if (!road) throw new Error('Please enter a road name.');
  const roads = await loadAllRoads();
  const r = roads.find(rd => rd.name.toLowerCase() === road.toLowerCase());
  if (!r) throw new Error(`Road "${road}" not found.`);
  buildMonthlyTable(res.id, getMonthlyObs(r, year), r.name, `Pothole observations — ${year}`);
}, ['rpt-monthly-year', 'rpt-monthly-input']);

// Section 2: Potholes by Road Type
rptToggle('rpt-roadtype-btn', 'rpt-roadtype-results', 'rpt-roadtype-error', async res => {
  const year = parseInt(document.getElementById('rpt-roadtype-year').value, 10);
  if (!year) throw new Error('Please select a year.');
  const roads = await loadAllRoads();
  const typeGroups = [
    { key: 'highway4',    label: 'Highway (4-Lane)' },
    { key: 'highway2',    label: 'Highway (2-Lane)' },
    { key: 'residential', label: 'Residential'      },
    { key: 'cart',        label: 'Cart Road'         },
  ];
  res.innerHTML = typeGroups.map(tg => {
    const typeRoads = roads.filter(r => r.type === tg.key);
    const monthly   = aggregateNetByYear(typeRoads, year);
    const rows      = MONTHS.map((m, i) =>
      `<tr><td>${m}</td><td>${monthly[i].net}</td></tr>`).join('');
    const total     = monthly.reduce((a, m) => a + m.net, 0);
    return `<div class="rpt-type-block">
      <h3 class="rpt-type-label">${tg.label}</h3>
      <table>
        <thead><tr><th>Month</th><th>Net Potholes</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Year Total</td><td>${total}</td></tr></tfoot>
      </table>
    </div>`;
  }).join('');
}, ['rpt-roadtype-year']);

// Section 3: Potholes Repaired Per Road
rptToggle('rpt-repaired-btn', 'rpt-repaired-results', 'rpt-repaired-error', async res => {
  const year = parseInt(document.getElementById('rpt-repaired-year').value, 10);
  if (!year) throw new Error('Please select a year.');
  const roads = await loadAllRoads();
  const rows  = roads.map(r => {
    let total = 0;
    r.holedata.forEach(e => {
      if (e.type !== 'repair') return;
      if (new Date(e.date + 'T00:00:00').getFullYear() !== year) return;
      total += (e.shallow ?? 0) + (e.medium ?? 0) + (e.deep ?? 0);
    });
    return { name: r.name, total };
  }).filter(r => r.total > 0);
  if (rows.length === 0) {
    res.innerHTML = `<p class="report-empty">No repairs recorded for ${year}.</p>`;
  } else {
    const grandTotal = rows.reduce((a, r) => a + r.total, 0);
    res.innerHTML = `<table>
      <thead><tr><th>Road Name</th><th>Total Repaired</th></tr></thead>
      <tbody>${rows.map(r =>
        `<tr><td>${r.name}</td><td>${r.total}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td>Total</td><td>${grandTotal}</td></tr></tfoot>
    </table>`;
  }
}, ['rpt-repaired-year']);

// Section 4: Roads Resurfaced
rptToggle('rpt-resurfaced-btn', 'rpt-resurfaced-results', 'rpt-resurfaced-error', async res => {
  const year = parseInt(document.getElementById('rpt-resurfaced-year').value, 10);
  if (!year) throw new Error('Please select a year.');
  const roads   = await loadAllRoads();
  const entries = [];
  roads.forEach(r => {
    r.holedata.forEach(e => {
      if (e.type !== 'resurface') return;
      if (new Date(e.date + 'T00:00:00').getFullYear() !== year) return;
      entries.push({ name: r.name, date: e.date, cost: e.cost });
    });
  });
  if (entries.length === 0) {
    res.innerHTML = `<p class="report-empty">No roads were resurfaced in ${year}.</p>`;
  } else {
    res.innerHTML = `<table>
      <thead><tr><th>Road Name</th><th>Date</th><th>Cost</th></tr></thead>
      <tbody>${entries.map(e =>
        `<tr><td>${e.name}</td><td>${e.date}</td><td>${formatMoney(e.cost ?? 0)}</td></tr>`
      ).join('')}</tbody>
    </table>`;
  }
}, ['rpt-resurfaced-year']);

// Section 5: Total Pothole Types Per Month
rptToggle('rpt-sysmonthly-btn', 'rpt-sysmonthly-results', 'rpt-sysmonthly-error', async res => {
  const year = parseInt(document.getElementById('rpt-sysmonthly-year').value, 10);
  if (!year) throw new Error('Please select a year.');
  const roads = await loadAllRoads();
  buildMonthlyTable(res.id, aggregateMonthly(roads, year), 'All Roads', `Pothole observations — ${year}`);
}, ['rpt-sysmonthly-year']);


// User info from sessionStorage
(function loadUser() {
  const name = sessionStorage.getItem('userFullName') || 'Maintenance User';
  document.getElementById('userName').textContent = name;
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('userInitials').textContent = initials;
})();
