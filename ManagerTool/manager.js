/* Manager Tool — local-only, dependency-free dashboard. Nothing is sent to a server. */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORE = 'manager-tool-local-v1';
const DATA_STORE = 'manager-tool-data-v2';
const HANDLE_STORE = 'manager-tool-handles';
const REPORT_SUFFIX = '_manager-report.json';
const DAY = 86400000;

const defaults = () => ({
  settings: { staleDays: 5, inactiveDays: 5, alarms: [-11, -6, -1, 2, 5, 9999] },
  groups: [], notes: [], reminders: [], managerTasks: [], hiddenReports: [], reports: {}, invalidReports: [], folderLabel: '',
});
let state = defaults();
let directoryHandle = null;
let managerDbHandle = null;
let managerDbName = '';
let managerDbStatus = 'No database assigned';
let page = 'briefing';
let selectedKey = null;
let detailTab = 'summary';
let filters = { query: '', group: '', tender: '', status: '', alert: '' };

const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const isoDate = value => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value) : null;
const dayDiff = (from, to = new Date()) => { const date = isoDate(from); return date && !Number.isNaN(date) ? Math.max(0, Math.floor((to - date) / DAY)) : null; };
const today = () => new Date().toISOString().slice(0, 10);
const escape = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c]));
const textOnly = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const safeLabelColor = value => /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : '#607082';
const labelsHtml = opportunity => (opportunity.labels?.length ? `<div class="op-labels">${opportunity.labels.map(label => `<span class="op-label" style="--label-color:${safeLabelColor(label.color)}">${escape(label.text)}</span>`).join('')}</div>` : '<span class="muted">—</span>');
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value || 0));
const dateLabel = value => { const date = isoDate(value); return date ? date.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) : '—'; };
let saveTimer = null;
let managerDbSaveTimer = null;
async function dataDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DATA_STORE, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('state')) req.result.createObjectStore('state');
      if (!req.result.objectStoreNames.contains('reports')) req.result.createObjectStore('reports');
    };
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
async function readState() {
  const db = await dataDb();
  const saved = await new Promise((resolve, reject) => { const tx = db.transaction('state'); const req = tx.objectStore('state').get('current'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  db.close(); return saved;
}
async function writeState() {
  // Manager preferences live separately from reports. Adding a note or reminder never
  // rewrites thousands of opportunities.
  const snapshot = structuredClone(state);
  snapshot.reports = {};
  const db = await dataDb();
  await new Promise((resolve, reject) => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(snapshot, 'current'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close();
}
async function readReports() {
  const db = await dataDb();
  const reports = await new Promise((resolve, reject) => { const tx = db.transaction('reports'); const req = tx.objectStore('reports').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  db.close(); return Object.fromEntries(reports.map(report => [report.tender, hydrateReport(report)]));
}
async function writeReport(report) {
  const stored = structuredClone(report);
  delete stored._managerSearchIndex;
  const db = await dataDb();
  await new Promise((resolve, reject) => { const tx = db.transaction('reports', 'readwrite'); tx.objectStore('reports').put(stored, stored.tender); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close();
}
async function writeReports(reports) {
  if (!reports.length) return;
  const db = await dataDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('reports', 'readwrite');
    reports.forEach(report => { const stored = structuredClone(report); delete stored._managerSearchIndex; tx.objectStore('reports').put(stored, stored.tender); });
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  db.close();
}
const save = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => writeState().catch(error => console.error('Could not save Manager Tool data locally.', error)), 120);
  // The local browser copy is only a fast working cache. When the manager has
  // selected a database file, that portable file is updated as the durable copy.
  if (managerDbHandle) {
    if (managerDbSaveTimer) clearTimeout(managerDbSaveTimer);
    managerDbSaveTimer = window.setTimeout(() => saveManagerDatabase().catch(error => console.warn('Could not update Manager database file.', error)), 1800);
  }
};

async function handleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_STORE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
async function saveHandle(handle, key = 'reportFolder') { const db = await handleDb(); await new Promise((resolve, reject) => { const tx = db.transaction('handles','readwrite'); tx.objectStore('handles').put(handle, key); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); }); db.close(); }
async function loadHandle(key = 'reportFolder') { const db = await handleDb(); const value = await new Promise((resolve, reject) => { const tx=db.transaction('handles'); const req=tx.objectStore('handles').get(key); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); db.close(); return value; }

const MANAGER_DB_KIND = 'manager-tool-database';
function databaseSnapshot() {
  const data = structuredClone(state);
  Object.values(data.reports).forEach(report => delete report._managerSearchIndex);
  return { kind: MANAGER_DB_KIND, schemaVersion: 1, updatedAt: new Date().toISOString(), data };
}
async function replaceCachedReports(reports) {
  const db = await dataDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('reports', 'readwrite');
    const store = tx.objectStore('reports');
    store.clear();
    reports.forEach(report => { const stored = structuredClone(report); delete stored._managerSearchIndex; store.put(stored, stored.tender); });
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function saveManagerDatabase() {
  if (!managerDbHandle) return false;
  managerDbStatus = 'Saving database…'; updateDatabaseStatus();
  try {
    const writable = await managerDbHandle.createWritable();
    await writable.write(JSON.stringify(databaseSnapshot(), null, 2));
    await writable.close();
    managerDbStatus = `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return true;
  } catch (error) { managerDbStatus = 'Database save failed'; throw error; }
  finally { updateDatabaseStatus(); }
}
function updateDatabaseStatus() { $$('.database-status').forEach(element => element.textContent = managerDbHandle ? managerDbStatus : 'No database assigned'); }
async function applyManagerDatabase(payload) {
  if (!payload || payload.kind !== MANAGER_DB_KIND || payload.schemaVersion !== 1 || !payload.data || typeof payload.data !== 'object') throw new Error('This is not a valid Manager Tool database.');
  const incoming = payload.data;
  state = { ...defaults(), ...incoming, reports: incoming.reports || {} };
  state.settings = { ...defaults().settings, ...state.settings };
  Object.values(state.reports).forEach(hydrateReport);
  // A cache failure must never prevent opening the portable database.
  try { await replaceCachedReports(Object.values(state.reports)); await writeState(); }
  catch (error) { console.warn('Browser cache unavailable; using the Manager database file directly.', error); }
}
async function createManagerDatabase() {
  try {
    if (!window.showSaveFilePicker) throw new Error('Use Microsoft Edge or Google Chrome to create a Manager database file.');
    managerDbHandle = await window.showSaveFilePicker({ suggestedName: 'Manager Tool Database.json', types: [{ description: 'Manager Tool database', accept: { 'application/json': ['.json'] } }] });
    managerDbName = managerDbHandle.name;
    managerDbStatus = 'Database created and saved';
    await saveManagerDatabase();
    await saveHandle(managerDbHandle, 'managerDatabase');
    renderPage();
  } catch (error) { if (error?.name !== 'AbortError') alert(`Could not create the Manager database: ${error.message || error}`); }
}
async function openManagerDatabase() {
  try {
    if (!window.showOpenFilePicker) throw new Error('Use Microsoft Edge or Google Chrome to open a Manager database file.');
    const [handle] = await window.showOpenFilePicker({ multiple: false, types: [{ description: 'Manager Tool database', accept: { 'application/json': ['.json'] } }] });
    const payload = JSON.parse(await (await handle.getFile()).text());
    await applyManagerDatabase(payload);
    managerDbHandle = handle; managerDbName = handle.name; managerDbStatus = 'Database opened';
    await saveHandle(managerDbHandle, 'managerDatabase');
    renderShell();
  } catch (error) { if (error?.name !== 'AbortError') alert(`Could not open the Manager database: ${error.message || error}`); }
}

function reportEntries() {
  return Object.entries(state.reports).filter(([key]) => !state.hiddenReports.includes(key)).flatMap(([key, report]) => (report.opportunities || []).map(opportunity => ({ key, report, tender: report.tender || 'Unnamed tender', opportunity })));
}
function buildSearchIndex(report, opportunity) {
  return [report.tender, opportunity.id, opportunity.title, opportunity.customer, opportunity.qlk, opportunity.srId, opportunity.stage, opportunity.statusLabel, ...(opportunity.labels || []).map(label => label.text),
    ...(opportunity.tasks || []).map(task => `${task.title} ${task.description}`),
    ...(opportunity.history || []).map(history => history.content),
    ...(opportunity.versions || []).map(version => `${version.commitMessage} ${version.snapshot?.revision || ''}`),
  ].join(' ').toLowerCase();
}
function hydrateReport(report) {
  report._managerSearchIndex = report._managerSearchIndex || {};
  (report.opportunities || []).forEach(opportunity => { report._managerSearchIndex[opportunity.id] = buildSearchIndex(report, opportunity); });
  return report;
}
function keyFor(report, opp) { return `${report.tender || 'Unnamed tender'}::${opp.id}`; }
function amount(opportunity) { return Number(opportunity.commercial?.cqaOfficialSellPrice || opportunity.kpis?.proposalAmountUSD || 0); }
function taskStats(opportunity) { const tasks = opportunity.tasks || []; const actionable = tasks.filter(task => task.status !== 'Canceled'); const done = actionable.filter(task => task.status === 'Done').length; return { total: actionable.length, done, pct: actionable.length ? Math.round(done / actionable.length * 100) : 0, overdue: actionable.filter(task => task.status !== 'Done' && task.dueDate && isoDate(task.dueDate) < new Date(new Date().toDateString())).length }; }
function taskFlow(opportunity) {
  const tasks = opportunity.tasks || [];
  const active = tasks.filter(task => !['Done', 'Canceled'].includes(task.status));
  const count = status => active.filter(task => task.status === status).length;
  const next = [...active].sort((a,b) => (a.order ?? 999999) - (b.order ?? 999999))[0];
  return { active: active.length, approval: count('Approval'), waiting: count('Missing Info') + count('On Hold'), rework: count('Changes Requested / Rework'), next };
}
function kpiMetrics(opportunity) {
  const kpis = opportunity.kpis || {}; const areas = kpis.areasInvolved || [];
  const tendering = areas.find(area => area.area === 'Tendering');
  let myDays = 0, myHours = 0, unique = new Set();
  areas.forEach(area => Object.entries(area.calendar || {}).forEach(([date, record]) => {
    if (record?.type === 'Worked' || record?.type === 'Waiting') unique.add(date);
    if (area === tendering && record?.type === 'Worked') { const hours = Number(record.hours || 0) + Number(record.minutes || 0) / 60; myHours += hours; if (hours >= 1) myDays++; }
  }));
  const waiting = areas.reduce((sum, area) => sum + Number(area.waitingDays || 0), 0);
  const received = kpis.timeline?.receivedAt || opportunity.dates?.requested;
  const delivered = kpis.timeline?.deliveredAt;
  return { received, delivered, elapsed: received ? dayDiff(received, delivered ? isoDate(delivered) : new Date()) + 1 : null, myDays, myHours, waiting, unique: unique.size, areas };
}
function localDay(value) { const date = isoDate(value); return date && !Number.isNaN(date) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` : ''; }
function dailyKpiTimeline(opportunity) {
  const kpis = opportunity.kpis || {}, dayRecords = new Map(), events = new Map();
  const addEvent = (date, text) => { const day = localDay(date); if (!day) return; events.set(day, [...(events.get(day) || []), text]); };
  (kpis.areasInvolved || []).forEach(area => Object.entries(area.calendar || {}).forEach(([day, record]) => {
    dayRecords.set(day, [...(dayRecords.get(day) || []), { area: area.area || 'Area', ...record }]);
  }));
  addEvent(kpis.timeline?.receivedAt, 'Opportunity received'); addEvent(kpis.timeline?.deliveredAt, 'Opportunity delivered'); addEvent(kpis.timeline?.cancelledAt, 'Opportunity cancelled');
  (opportunity.history || []).forEach(item => addEvent(item.date, `History: ${textOnly(item.content).slice(0, 70)}`));
  (opportunity.versions || []).forEach(item => addEvent(item.createdAt, `Revision: ${item.revision || item.snapshot?.revision || 'saved'}`));
  (opportunity.tasks || []).forEach(task => {
    addEvent(task.responsibleRequestedDate || task.requested, `Task requested: ${task.title}`);
    addEvent(task.responsibleDeliveredDate, `Task delivered: ${task.title}`);
    addEvent(task.approvalRequestedDate, `Approval requested: ${task.title}`);
    addEvent(task.approvalDeliveredDate, `Approval delivered: ${task.title}`);
    addEvent(task.sentBackForApprovalAt, `Sent back for approval: ${task.title}`);
    (task.assignmentCycles || []).forEach(cycle => { addEvent(cycle.changesRequestedAt, `Changes requested: ${task.title}`); addEvent(cycle.approved, `Approval completed: ${task.title}`); });
  });
  const allDates = [...dayRecords.keys(), ...events.keys()].sort();
  const start = localDay(kpis.timeline?.receivedAt) || allDates[0]; const end = localDay(kpis.timeline?.deliveredAt) || localDay(new Date()) || allDates.at(-1);
  if (!start || !end || start > end) return { days: [], truncated: false };
  const days = [], cursor = new Date(`${start}T12:00:00`), last = new Date(`${end}T12:00:00`); let count = 0;
  while (cursor <= last && count < 730) {
    const day = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`;
    const records = dayRecords.get(day) || [], dayEvents = events.get(day) || [];
    const worked = records.filter(record => record.type === 'Worked'), waiting = records.filter(record => record.type === 'Waiting'), inactive = records.filter(record => record.type === 'Inactive');
    const state = worked.length ? 'worked' : waiting.length ? 'waiting' : inactive.length ? 'inactive' : dayEvents.length ? 'event' : 'empty';
    const detail = [...worked.map(record => `Worked · ${record.area}${record.hours ? ` (${record.hours}h)` : ''}`), ...waiting.map(record => `Waiting · ${record.area}`), ...inactive.map(record => `Inactive · ${record.area}`), ...dayEvents];
    days.push({ day, state, detail }); cursor.setDate(cursor.getDate()+1); count++;
  }
  return { days, truncated: cursor <= last };
}
function lastActivity(opportunity) {
  const taskDates = (opportunity.tasks || []).flatMap(task => [task.completedAt, task.responsibleDeliveredDate, task.approvalDeliveredDate]).filter(Boolean);
  const historyDates = (opportunity.history || []).map(entry => entry.date).filter(Boolean);
  const revisionDates = (opportunity.versions || []).map(version => version.createdAt).filter(Boolean);
  // Manager Tool deliberately ignores generic `lastUpdated`: a commercial or UI-only edit
  // must not hide the requested "no task/history/revision activity" alert.
  const all = [...taskDates, ...historyDates, ...revisionDates, opportunity.kpis?.timeline?.receivedAt, opportunity.dates?.requested].filter(Boolean).map(isoDate).filter(Boolean);
  return all.length ? new Date(Math.max(...all.map(value => value.getTime()))).toISOString() : null;
}
function risk(opportunity) {
  if (opportunity.statusLabel !== 'In Progress') return { name: 'Closed', className: 'gray', days: null };
  const expected = opportunity.dates?.expected;
  if (!expected) return { name: 'No date', className: 'gray', days: null };
  const days = Math.ceil((isoDate(expected) - new Date()) / DAY);
  const threshold = state.settings.alarms;
  const classes = ['purple','purple','red','orange','yellow','green'];
  const names = ['Critical','Overdue','Overdue','Due soon','Watch','On time'];
  const index = threshold.findIndex(value => days <= value);
  return { name: names[index < 0 ? names.length - 1 : index], className: classes[index < 0 ? classes.length - 1 : index], days };
}
function alertsFor(entry) {
  const { report, opportunity } = entry; const alerts = [];
  const reportAge = dayDiff(report.exportedAt);
  if (reportAge !== null && reportAge > state.settings.staleDays) alerts.push({ type:'purple', label:`Report not updated for ${reportAge} days`, key:'stale' });
  if (opportunity.statusLabel === 'In Progress') {
    const health = risk(opportunity);
    if (health.days !== null && health.days < 0) alerts.push({ type: health.days <= -6 ? 'purple' : 'red', label:`Expected date overdue by ${Math.abs(health.days)} days`, key:'overdue' });
    const inactive = dayDiff(lastActivity(opportunity));
    if (inactive !== null && inactive > state.settings.inactiveDays) alerts.push({ type:'orange', label:`No task, history or revision activity for ${inactive} days`, key:'inactive' });
    const stats = taskStats(opportunity);
    if (stats.overdue) alerts.push({ type:'red', label:`${stats.overdue} overdue task${stats.overdue === 1 ? '' : 's'}`, key:'tasks' });
  }
  if (state.notes.some(note => note.opKey === keyFor(report, opportunity) && note.status === 'Open')) alerts.push({ type:'yellow', label:'Open manager note', key:'note' });
  return alerts;
}
function allTenders() { return [...new Set(reportEntries().map(entry => entry.tender))].sort((a,b) => a.localeCompare(b)); }
function groupsFor(tender) { return state.groups.filter(group => group.tenderIds.includes(tender)); }
function matches(entry) {
  const { opportunity, tender, report } = entry; const search = filters.query.trim().toLowerCase();
  const haystack = report._managerSearchIndex?.[opportunity.id] || buildSearchIndex(report, opportunity);
  const managerNotes = state.notes.filter(note => note.opKey === keyFor(report, opportunity)).map(note => note.text).join(' ').toLowerCase();
  if (search && !haystack.includes(search) && !managerNotes.includes(search)) return false;
  if (filters.tender && tender !== filters.tender) return false;
  if (filters.group && !groupsFor(tender).some(group => group.id === filters.group)) return false;
  if (filters.status && opportunity.statusLabel !== filters.status) return false;
  if (filters.alert && !alertsFor(entry).some(alert => alert.key === filters.alert)) return false;
  return true;
}
function filteredEntries() { return reportEntries().filter(matches).sort((a,b) => (a.tender + a.opportunity.title).localeCompare(b.tender + b.opportunity.title)); }
function dueItems() {
  const now = new Date(); const week = new Date(now); week.setDate(now.getDate() + 7);
  const reminders = state.reminders.filter(item => item.status !== 'Done').filter(item => !item.dueDate || isoDate(item.dueDate) <= week).map(item => ({...item, type:'Reminder'}));
  const tasks = state.managerTasks.filter(item => item.status !== 'Done').filter(item => !item.dueDate || isoDate(item.dueDate) <= week).map(item => ({...item, type:'Manager task'}));
  return [...reminders, ...tasks].sort((a,b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
}

function badge(className, label) { return `<span class="badge ${className}">${escape(label)}</span>`; }
function ensureManagerUiStyles() {
  if ($('#managerUiStyles')) return;
  const style = document.createElement('style'); style.id = 'managerUiStyles';
  style.textContent = '.op-labels{display:flex;flex-wrap:wrap;gap:4px;min-width:100px}.op-label{display:inline-flex;align-items:center;border:1px solid color-mix(in srgb,var(--label-color) 42%,white);background:color-mix(in srgb,var(--label-color) 12%,white);color:var(--label-color);border-radius:999px;padding:3px 7px;font-size:10px;font-weight:800;line-height:1.1}.database-warning{color:#ffd268}.database-card-warning{border-color:#e6b94e;background:#fffdf7}.timeline-legend{display:flex;flex-wrap:wrap;gap:8px;margin:-3px 0 12px}.timeline-legend span{padding:4px 8px;border-radius:999px;font-size:10px;font-weight:800}.timeline-legend .worked{background:#e9faed;color:#187332}.timeline-legend .waiting{background:#fff5d8;color:#9b7200}.timeline-legend .inactive{background:#edf1f4;color:#667587}.timeline-legend .event{background:#f0ebff;color:#6040ac}.timeline-legend .empty{background:#fafbfc;color:#8795a2;padding:4px 8px;text-align:left}.daily-timeline{display:flex;gap:5px;overflow-x:auto;padding:8px 2px 12px;border-bottom:1px solid #edf1f4}.timeline-day{width:38px;min-width:38px;height:58px;border:1px solid #e2e8ed;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;background:#fafbfc;color:#8795a2;cursor:help}.timeline-day strong{font-size:13px}.timeline-day small{font-size:9px;font-weight:750;margin-top:1px}.timeline-day i{position:absolute;bottom:5px;width:17px;height:4px;border-radius:10px;background:#dce4eb}.timeline-day.worked{background:#effcf2;border-color:#a8dfb5;color:#187332}.timeline-day.worked i{background:#3DCD58}.timeline-day.waiting{background:#fff9e7;border-color:#f0d27a;color:#9b7200}.timeline-day.waiting i{background:#d6a900}.timeline-day.inactive{background:#f1f4f6;color:#667587}.timeline-day.inactive i{background:#8a99a5}.timeline-day.event{background:#f4f1ff;border-color:#cabbf1;color:#6040ac}.timeline-day.event i{background:#6b46c1}.timeline-day:hover{transform:translateY(-2px);box-shadow:0 5px 12px #0b1f3320}';
  document.head.append(style);
}
function renderShell() {
  ensureManagerUiStyles();
  const app = $('#app');
  app.innerHTML = `<header class="topbar"><div class="brand"><div class="brand-mark">M</div>Manager Tool</div><nav class="nav">${[['briefing','Meeting review'],['proposals','Proposals'],['alerts','Alerts'],['workload','Workload'],['settings','Settings']].map(([id,label]) => `<button data-page="${id}" class="${page===id?'active':''}">${label}</button>`).join('')}</nav><div class="top-actions"><span class="report-status">${state.folderLabel ? `Report folder: ${escape(state.folderLabel)}` : 'No report folder selected'}</span><span class="report-status database-status ${managerDbHandle ? '' : 'database-warning'}">${managerDbHandle ? escape(managerDbStatus) : 'No database assigned'}</span><button class="button dark" id="refresh">Refresh reports</button><button class="button primary" id="chooseFolder">Select folder</button></div></header><main class="layout" id="content"></main>`;
  $$('[data-page]').forEach(button => button.onclick = () => { page = button.dataset.page; renderShell(); });
  $('#refresh').onclick = () => scanFolder(); $('#chooseFolder').onclick = () => chooseFolder(); renderPage();
}
function renderPage() { const content = $('#content'); if (!content) return; if (page === 'briefing') return renderBriefing(content); if (page === 'proposals') return renderProposals(content); if (page === 'alerts') return renderAlerts(content); if (page === 'workload') return renderWorkload(content); renderSettings(content); renderManagerDatabaseCard(content); }

function renderManagerDatabaseCard(root) {
  root.insertAdjacentHTML('afterbegin', `<section class="card section manager-database ${managerDbHandle ? '' : 'database-card-warning'}"><div class="section-title"><div><h2>Manager database</h2><span>${managerDbName ? `Using ${escape(managerDbName)} · <span class="database-status">${escape(managerDbStatus)}</span>` : '<strong>No database assigned.</strong> Create or open one before working so the manager data is saved outside the browser.'}</span></div></div><p class="muted">This file contains the reports, teams, notes, reminders and settings. It is the manager's durable copy, independent from browser cache.</p><div class="form-row"><button class="button primary" id="createManagerDb">Create database</button><button class="button" id="openManagerDb">Open database</button><button class="button" id="saveManagerDb" ${managerDbHandle ? '' : 'disabled'}>Save database now</button></div></section>`);
}
function renderBriefing(root) {
  const entries = reportEntries(); const alerts = entries.flatMap(entry => alertsFor(entry).map(alert => ({entry, alert})));
  const stale = [...new Map(entries.filter(entry => dayDiff(entry.report.exportedAt) > state.settings.staleDays).map(entry => [entry.tender, entry])).values()];
  const open = entries.filter(entry => entry.opportunity.statusLabel === 'In Progress'); const upcoming = entries.filter(entry => { const date=isoDate(entry.opportunity.dates?.expected); const now=new Date(); const seven=new Date(now);seven.setDate(now.getDate()+7);return entry.opportunity.statusLabel==='In Progress'&&date&&date>=new Date(now.toDateString())&&date<=seven; });
  root.innerHTML = `<div class="page-head"><div><h1>Weekly review</h1><p>What needs follow-up before the next team meeting.</p></div><button class="button primary" id="addReminder">+ Add reminder or task</button></div>${state.invalidReports.length ? `<section class="card section alert-card red" style="margin-bottom:16px"><div class="section-title"><div><h2>Reports that could not be read</h2><span>The last valid report is kept; ask the tender to export again.</span></div></div>${state.invalidReports.map(item=>`<div class="muted">${escape(item.name)} — ${escape(item.error)}</div>`).join('')}</section>` : ''}<div class="grid summary-grid"><div class="card metric"><div class="label">Open opportunities</div><div class="value">${open.length}</div><div class="sub">In progress only</div></div><div class="card metric"><div class="label">Active alerts</div><div class="value">${alerts.length}</div><div class="sub">Across ${entries.length} reported OPs</div></div><div class="card metric"><div class="label">Reports overdue</div><div class="value">${stale.length}</div><div class="sub">After ${state.settings.staleDays} days</div></div><div class="card metric"><div class="label">Due this week</div><div class="value">${upcoming.length}</div><div class="sub">Expected commitment dates</div></div></div><div class="grid brief-grid" style="margin-top:16px"><section class="card section"><div class="section-title"><div><h2>Meeting follow-up</h2><span>Manager reminders and tasks due this week or overdue</span></div></div><div class="list">${dueItems().length ? dueItems().map(item => `<div class="list-row"><span class="dot ${item.type==='Reminder'?'yellow':'green'}"></span><div class="grow"><strong>${escape(item.title)}</strong><small>${item.type} · ${item.dueDate ? dateLabel(item.dueDate) : 'No date'}${item.note ? ` · ${escape(item.note)}` : ''}</small></div><button class="button" data-done="${item.type}:${item.id}">Done</button></div>`).join('') : '<div class="empty">Nothing to follow up yet. Add a reminder for the next meeting.</div>'}</div></section><section class="card section"><div class="section-title"><div><h2>Tenders to request an update</h2><span>Report older than ${state.settings.staleDays} days</span></div></div><div class="list">${stale.length ? stale.map(entry => `<div class="list-row" data-open="${escape(keyFor(entry.report, entry.opportunity))}"><span class="dot purple"></span><div class="grow"><strong>${escape(entry.tender)}</strong><small>Last export: ${dateLabel(entry.report.exportedAt)} · ${dayDiff(entry.report.exportedAt)} days ago</small></div></div>`).join('') : '<div class="empty">All tender reports are current.</div>'}</div></section></div><section class="card section" style="margin-top:16px"><div class="section-title"><div><h2>Priority alerts</h2><span>Overdue commitments, inactivity and overdue tasks</span></div><button class="button" data-page="alerts">Open alerts</button></div><div class="list">${alerts.slice(0,7).map(({entry,alert}) => `<div class="list-row alert-card ${alert.type}" data-open="${escape(keyFor(entry.report, entry.opportunity))}"><span class="dot ${alert.type}"></span><div class="grow"><strong>${escape(entry.opportunity.title || entry.opportunity.id)}</strong><small>${escape(entry.tender)} · ${escape(alert.label)}</small></div></div>`).join('') || '<div class="empty">No active alerts.</div>'}</div></section>`;
  bindCommon(root); $('#addReminder',root).onclick = () => openManagerItemForm();
}
function filterHtml() { return `<div class="filters"><input id="search" placeholder="Search all reports: OP, tender, customer, tasks, history, revisions…" value="${escape(filters.query)}"/><select id="groupFilter"><option value="">All groups</option>${state.groups.map(group=>`<option value="${group.id}" ${filters.group===group.id?'selected':''}>${escape(group.name)}</option>`).join('')}</select><select id="tenderFilter"><option value="">All tenders</option>${allTenders().map(tender=>`<option ${filters.tender===tender?'selected':''}>${escape(tender)}</option>`).join('')}</select><select id="statusFilter"><option value="">All statuses</option>${['In Progress','On Hold','Submitted','Won','Lost','Canceled'].map(status=>`<option ${filters.status===status?'selected':''}>${status}</option>`).join('')}</select><select id="alertFilter"><option value="">All alert states</option><option value="overdue" ${filters.alert==='overdue'?'selected':''}>Overdue</option><option value="inactive" ${filters.alert==='inactive'?'selected':''}>Inactive</option><option value="tasks" ${filters.alert==='tasks'?'selected':''}>Overdue tasks</option><option value="stale" ${filters.alert==='stale'?'selected':''}>Stale report</option><option value="note" ${filters.alert==='note'?'selected':''}>Open manager note</option></select></div>`; }
function bindFilters(root) { const update=(event)=>{const searchInput=$('#search',root);const keepSearchFocus=event?.currentTarget?.id==='search';const cursor=searchInput.selectionStart ?? searchInput.value.length;filters.query=searchInput.value;filters.group=$('#groupFilter',root).value;filters.tender=$('#tenderFilter',root).value;filters.status=$('#statusFilter',root).value;filters.alert=$('#alertFilter',root).value;renderPage();if(keepSearchFocus){const restoreFocus=()=>{const nextSearch=document.getElementById('search');if(!nextSearch)return;nextSearch.focus({preventScroll:true});nextSearch.setSelectionRange(cursor,cursor);};restoreFocus();window.setTimeout(restoreFocus,0);window.setTimeout(restoreFocus,80);}}; ['search','groupFilter','tenderFilter','statusFilter','alertFilter'].forEach(id=>$("#"+id,root).addEventListener(id==='search'?'input':'change',update)); }
function renderProposals(root) { const entries=filteredEntries(); root.innerHTML=`<div class="page-head"><div><h1>Proposals</h1><p>${entries.length.toLocaleString()} of ${reportEntries().length.toLocaleString()} opportunities shown. Click an OP to inspect its full read-only report.</p></div></div>${filterHtml()}<div class="table-wrap"><table class="table"><thead><tr><th>OP</th><th>Labels</th><th>Tender / groups</th><th>Revisions</th><th>Days</th><th>Amount USD</th><th>Expected date</th><th>Task progress</th><th>Status</th><th>Alerts</th></tr></thead><tbody>${entries.map(entry=>{const op=entry.opportunity,stats=taskStats(op),health=risk(op),alerts=alertsFor(entry);return `<tr class="data-row" data-open="${escape(keyFor(entry.report,op))}"><td><div class="op-title">${escape(op.title||'Untitled')}</div><small class="muted">${escape(op.id)} · ${escape(op.customer||'No customer')}</small></td><td>${labelsHtml(op)}</td><td><strong>${escape(entry.tender)}</strong><br/><small class="muted">${groupsFor(entry.tender).map(group=>escape(group.name)).join(', ')||'No group'}</small></td><td>${(op.versions||[]).length + 1}</td><td>${dayDiff(op.kpis?.timeline?.receivedAt || op.dates?.requested) ?? '—'}</td><td>${money(amount(op))}</td><td>${dateLabel(op.dates?.expected)}</td><td><div class="progress"><i style="width:${stats.pct}%"></i></div><small class="muted">${stats.done}/${stats.total} · ${stats.pct}%</small></td><td>${badge(health.className,op.statusLabel)}</td><td>${alerts.length ? alerts.map(alert=>badge(alert.type,alert.key)).join(' ') : badge('green','Clear')}</td></tr>`;}).join('') || '<tr><td colspan="10" class="empty">No opportunity matches these filters.</td></tr>'}</tbody></table></div>`; bindFilters(root);bindCommon(root); }
function renderAlerts(root) { const alerts=filteredEntries().flatMap(entry=>alertsFor(entry).map(alert=>({entry,alert}))).sort((a,b)=>['purple','red','orange','yellow'].indexOf(a.alert.type)-['purple','red','orange','yellow'].indexOf(b.alert.type)); root.innerHTML=`<div class="page-head"><div><h1>Alerts</h1><p>Items that need a manager decision or follow-up.</p></div></div>${filterHtml()}<section class="card section"><div class="list">${alerts.length?alerts.map(({entry,alert})=>`<div class="list-row alert-card ${alert.type}" data-open="${escape(keyFor(entry.report,entry.opportunity))}"><span class="dot ${alert.type}"></span><div class="grow"><strong>${escape(entry.opportunity.title||entry.opportunity.id)}</strong><small>${escape(entry.tender)} · ${escape(alert.label)} · Expected: ${dateLabel(entry.opportunity.dates?.expected)}</small></div>${badge(alert.type,alert.key)}</div>`).join(''):'<div class="empty">No active alerts for the selected reports.</div>'}</div></section>`;bindFilters(root);bindCommon(root); }
function renderWorkload(root) { const tenders=allTenders().map(tender=>{const entries=reportEntries().filter(entry=>entry.tender===tender);const open=entries.filter(entry=>entry.opportunity.statusLabel==='In Progress');const total=open.reduce((sum,entry)=>sum+taskStats(entry.opportunity).total,0);const done=open.reduce((sum,entry)=>sum+taskStats(entry.opportunity).done,0);const due=open.filter(entry=>{const date=isoDate(entry.opportunity.dates?.expected);return date&&date<=new Date(Date.now()+7*DAY);}).length;return {tender,open:open.length,pct:total?Math.round(done/total*100):0,due,alerts:open.reduce((sum,entry)=>sum+alertsFor(entry).length,0)};}).sort((a,b)=>b.open-a.open); root.innerHTML=`<div class="page-head"><div><h1>Workload</h1><p>Open OPs, task completion and commitments by tender.</p></div></div><section class="card section">${tenders.length?tenders.map(row=>`<div class="workload"><div><strong>${escape(row.tender)}</strong><small class="muted">${groupsFor(row.tender).map(group=>escape(group.name)).join(', ')||'No group'}</small></div><div><div class="bar"><i style="width:${row.pct}%"></i></div><small class="muted">${row.pct}% tasks done · ${row.due} commitment${row.due===1?'':'s'} this week</small></div><div>${badge(row.alerts?'orange':'green',`${row.open} open OPs`)}<br/><small class="muted">${row.alerts} alerts</small></div></div>`).join(''):'<div class="empty">Load a report folder to see workload.</div>'}</section>`; }
function renderSettings(root) { const tenders=allTenders(); root.innerHTML=`<div class="page-head"><div><h1>Configuration</h1><p>Everything here remains only on this manager's computer.</p></div></div><div class="grid settings-grid"><section class="card section"><div class="section-title"><div><h2>Alert thresholds</h2><span>Applied as soon as you save.</span></div></div><div class="form"><label>Report not updated after (days)<input id="staleDays" type="number" min="1" value="${state.settings.staleDays}" /></label><label>OP without task, history or revision activity after (days)<input id="inactiveDays" type="number" min="1" value="${state.settings.inactiveDays}" /></label><button class="button primary" id="saveThresholds">Save thresholds</button></div></section><section class="card section"><div class="section-title"><div><h2>Report folder</h2><span>${state.folderLabel?escape(state.folderLabel):'Not selected'}</span></div></div><p class="muted">Manager Tool only reads the folder you select. It never connects to a remote service.</p><button class="button primary" id="changeFolder">Select or change folder</button></section><section class="card section"><div class="section-title"><div><h2>Teams and groups</h2><span>A tender can be in more than one group.</span></div></div><div class="form-row"><input id="newGroup" placeholder="e.g. Mexico"/><button class="button" id="addGroup">Add group</button></div><div id="groups">${state.groups.map(group=>`<div class="group-row"><label><strong>${escape(group.name)}</strong><br/><small class="muted">${group.tenderIds.length} tenders</small></label><button class="button" data-edit-group="${group.id}">Assign</button><button class="button" data-delete-group="${group.id}">Delete</button></div>`).join('')||'<div class="empty">Create a group to organize tenders.</div>'}</div></section><section class="card section"><div class="section-title"><div><h2>Detected tenders</h2><span>Detected from uploaded reports.</span></div></div><div class="check-list">${tenders.map(tender=>`<label><strong>${escape(tender)}</strong><span class="muted">${groupsFor(tender).map(group=>escape(group.name)).join(', ')||'No group'}</span></label>`).join('')||'<div class="empty">No reports loaded.</div>'}</div></section></div>`;
  root.insertAdjacentHTML('beforeend', `<section class="card section" style="margin-top:16px"><div class="section-title"><div><h2>Stored tender reports</h2><span>Hide a report from the dashboard without deleting its local saved copy. Hidden reports can be restored.</span></div></div><div class="list">${Object.entries(state.reports).map(([tender,report])=>`<div class="list-row"><div class="grow"><strong>${escape(tender)}</strong><small>${dateLabel(report.exportedAt)} · ${(report.opportunities||[]).length} OPs · ${state.hiddenReports.includes(tender)?'Hidden':'Visible'}</small></div><button class="button" data-toggle-report="${escape(tender)}">${state.hiddenReports.includes(tender)?'Restore':'Hide'}</button></div>`).join('')||'<div class="empty">No report has been stored.</div>'}</div></section>`);
  $('#saveThresholds',root).onclick=()=>{state.settings.staleDays=Math.max(1,Number($('#staleDays',root).value)||5);state.settings.inactiveDays=Math.max(1,Number($('#inactiveDays',root).value)||5);save();renderShell();}; $('#changeFolder',root).onclick=chooseFolder; $('#addGroup',root).onclick=()=>{const name=$('#newGroup',root).value.trim();if(name){state.groups.push({id:uid(),name,tenderIds:[]});save();renderPage();}}; $$('[data-delete-group]',root).forEach(button=>button.onclick=()=>{state.groups=state.groups.filter(group=>group.id!==button.dataset.deleteGroup);save();renderPage();}); $$('[data-edit-group]',root).forEach(button=>button.onclick=()=>editGroup(button.dataset.editGroup)); $$('[data-toggle-report]',root).forEach(button=>button.onclick=()=>{const tender=button.dataset.toggleReport;state.hiddenReports=state.hiddenReports.includes(tender)?state.hiddenReports.filter(item=>item!==tender):[...state.hiddenReports,tender];save();renderPage();}); }
function bindCommon(root) { $$('[data-open]',root).forEach(element=>element.onclick=()=>openDetail(element.dataset.open)); $$('[data-done]',root).forEach(button=>button.onclick=()=>completeManagerItem(button.dataset.done)); $$('[data-page]',root).forEach(button=>button.onclick=()=>{page=button.dataset.page;renderShell();}); }
function findEntry(key) { return reportEntries().find(entry=>keyFor(entry.report,entry.opportunity)===key); }
function openDetail(key) { selectedKey=key;detailTab='summary';renderDetail();decorateSummaryDetail(); }
function getQuickLinks(opportunity) {
  const labels = { bfo: 'BFO', cqaLink: 'CQA', ba: 'BA', srLink: 'SR', geet: 'GEET' };
  if (Array.isArray(opportunity.links)) return opportunity.links
    .filter(link => link.type === 'link' && link.url && !/folder/i.test(link.label || ''))
    .map(link => ({ label: link.label || 'Open link', url: link.url }));
  return Object.entries(opportunity.links || {})
    .filter(([key, url]) => typeof url === 'string' && url && !/folder/i.test(key))
    .map(([key, url]) => ({ label: labels[key] || key, url }));
}
function showTenderNote(note) {
  if (!note) return;
  const overlay = document.createElement('div');
  overlay.className = 'panel';
  overlay.innerHTML = `<aside class="drawer" style="max-width:760px"><div class="drawer-head"><div><h2>${escape(note.title || 'Tender note')}</h2><p class="muted">Read-only note from OpportunityOS</p></div><button class="close">×</button></div><div class="detail-body">${escape(textOnly(note.content) || 'This note is empty.').replace(/\n/g, '<br/>')}</div></aside>`;
  overlay.onclick = event => { if (event.target === overlay) overlay.remove(); };
  document.body.append(overlay);
  $('.close', overlay).onclick = () => overlay.remove();
}
function showTaskDetail(task) {
  if (!task) return;
  const logs = task.timeLogs || [];
  const loggedSeconds = logs.reduce((sum, log) => sum + Number(log.durationSeconds || 0), 0);
  const hours = loggedSeconds ? `${(loggedSeconds / 3600).toFixed(1)} h` : '—';
  const detail = document.createElement('div');
  detail.className = 'panel';
  detail.dataset.taskDetail = 'true';
  detail.innerHTML = `<aside class="drawer" style="max-width:760px"><div class="drawer-head"><div><h2>${escape(task.title || 'Task')}</h2><p class="muted">${escape(task.status || 'Pending')} · ${escape(task.priority || 'Medium')} priority</p></div><button class="close">×</button></div><div class="detail-metrics"><div class="metric"><div class="label">Due date</div><div class="value">${dateLabel(task.dueDate)}</div></div><div class="metric"><div class="label">Owner</div><div class="value">${escape(task.responsible || task.owner || '—')}</div></div><div class="metric"><div class="label">Process stage</div><div class="value">${escape(task.stageContext || '—')}</div></div><div class="metric"><div class="label">Logged time</div><div class="value">${hours}</div></div></div><h3>Description</h3><p>${escape(task.description || 'No description.').replace(/\n/g, '<br/>')}</p><h3>Delivery and assignment</h3><table class="detail-table"><tbody><tr><th>Deliverable</th><td>${escape(task.deliverable || '—')}</td></tr><tr><th>Requested</th><td>${dateLabel(task.responsibleRequestedDate)}</td></tr><tr><th>Committed</th><td>${dateLabel(task.responsibleDueDate || task.approvalDueDate)}</td></tr><tr><th>Delivered</th><td>${dateLabel(task.responsibleDeliveredDate || task.approvalDeliveredDate || task.completedAt)}</td></tr></tbody></table><h3>Subtasks</h3><div class="list">${(task.subtasks || []).map(item => `<div class="list-row"><span class="dot ${item.completed ? 'green' : 'yellow'}"></span><div class="grow"><strong>${escape(item.title)}</strong><small>${item.completed ? 'Completed' : 'Pending'}</small></div></div>`).join('') || '<div class="empty">No subtasks.</div>'}</div><h3>Dependencies and schedule</h3><table class="detail-table"><tbody><tr><th>Depends on</th><td>${(task.dependsOnTaskIds || []).map(escape).join(', ') || '—'}</td></tr><tr><th>Execution blocks</th><td>${(task.executionBlocks || []).map(block => `${dateLabel(block.date)} ${escape(block.startTime || '')}–${escape(block.endTime || '')}`).join('<br/>') || '—'}</td></tr></tbody></table></aside>`;
  detail.onclick = event => { if (event.target === detail) detail.remove(); };
  document.body.append(detail);
  $('.close', detail).onclick = () => detail.remove();
  const cycles = task.assignmentCycles || [];
  if (task.changeRequest || task.changeReason || cycles.length || task.externalAreas?.length) {
    const workflow = document.createElement('section'); workflow.className = 'detail-body';
    workflow.innerHTML = `<h3>Assignment and approval flow</h3><table class="detail-table"><tbody><tr><th>External areas</th><td>${(task.externalAreas || []).map(escape).join(', ') || '—'}</td></tr><tr><th>Change request</th><td>${escape(task.changeRequest || '—')}</td></tr><tr><th>Change reason</th><td>${escape(task.changeReason || '—')}</td></tr><tr><th>Sent back for approval</th><td>${dateLabel(task.sentBackForApprovalAt)}</td></tr></tbody></table><h3>Previous cycles</h3><div class="list">${cycles.map((cycle, index) => `<div class="list-row"><div class="grow"><strong>Cycle ${index + 1} · ${escape(cycle.reviewOutcome || 'Recorded')}</strong><small>Execution: ${dateLabel(cycle.executionRequested)} → ${dateLabel(cycle.executionDelivered || cycle.executionRequired)} · Approval: ${dateLabel(cycle.approvalRequested)} → ${dateLabel(cycle.approved || cycle.approvalRequired)}</small>${cycle.changeRequest ? `<small>${escape(cycle.changeRequest)}</small>` : ''}</div></div>`).join('') || '<div class="empty">No completed assignment or approval cycles.</div>'}</div>`;
    $('.drawer', detail)?.append(workflow);
  }
}
function decorateSummaryDetail() {
  const entry = findEntry(selectedKey);
  const drawer = $('.drawer');
  if (!entry || !drawer || detailTab !== 'summary') return;
  const op = entry.opportunity;
  const quickLinks = getQuickLinks(op);
  const stakeholders = op.stakeholders || [];
  if (!$('#quickLinksStyles')) {
    const styles = document.createElement('style');
    styles.id = 'quickLinksStyles';
    styles.textContent = '.quick-links-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.quick-link-card{display:flex;gap:10px;align-items:flex-start;padding:13px;border:1px solid #cae9d1;border-radius:10px;background:linear-gradient(135deg,#f6fff8,#edf8f2);color:#162434;text-decoration:none;transition:transform .15s,box-shadow .15s,border-color .15s}.quick-link-card:hover{transform:translateY(-2px);border-color:#3DCD58;box-shadow:0 6px 16px #12314e18}.quick-link-card span:last-child{min-width:0}.quick-link-card strong,.quick-link-card small{display:block}.quick-link-card small{margin-top:4px;color:#667587;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.quick-link-icon{display:grid;place-content:center;width:28px;height:28px;flex:none;border-radius:8px;background:#3DCD58;color:#082513;font-weight:900}.stakeholders-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px}.stakeholder-card{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e4ebf0;border-radius:9px;background:#fafcfd}.stakeholder-card strong,.stakeholder-card small{display:block}.stakeholder-card small{margin-top:3px;color:#667587;font-size:11px}.stakeholder-avatar{display:grid;place-content:center;width:31px;height:31px;flex:none;border-radius:50%;background:#dcecf1;color:#173952;font-weight:850}.tender-note-row{cursor:pointer;position:relative}.tender-note-row::after{content:"Open";margin-left:auto;align-self:center;color:#16893a;font-size:11px;font-weight:800}.tender-note-row:hover{border-color:#3DCD58;background:#f6fff8}';
    document.head.append(styles);
  }
  const section = document.createElement('section');
  section.className = 'section card';
  section.style.marginTop = '18px';
  section.innerHTML = `<div class="section-title"><div><h2>Quick Links</h2><span>Shared proposal links; local folders are intentionally excluded.</span></div></div><div class="quick-links-grid">${quickLinks.length ? quickLinks.map(link => `<a class="quick-link-card" href="${escape(link.url)}" target="_blank" rel="noopener noreferrer"><span class="quick-link-icon">↗</span><span><strong>${escape(link.label)}</strong><small>${escape(link.url)}</small></span></a>`).join('') : '<div class="empty">No shared links available.</div>'}</div><div class="section-title" style="margin-top:22px"><div><h2>Stakeholders</h2><span>People involved in this opportunity.</span></div></div><div class="stakeholders-grid">${stakeholders.length ? stakeholders.map(person => `<div class="stakeholder-card"><span class="stakeholder-avatar">${escape((person.name || '?').slice(0, 1).toUpperCase())}</span><span><strong>${escape(person.name || 'Unnamed stakeholder')}</strong><small>${escape(person.email || '')}${person.role || person.roles?.length ? ` · ${escape(person.role || person.roles.join(', '))}` : ''}</small></span></div>`).join('') : '<div class="empty">No stakeholders registered.</div>'}</div>`;
  $('.detail-body', drawer)?.append(section);
  const flow = taskFlow(op), kpi = kpiMetrics(op);
  const insights = document.createElement('section');
  insights.className = 'section card'; insights.style.marginTop = '18px';
  insights.innerHTML = `<div class="section-title"><div><h2>Labels</h2><span>Classification from OpportunityOS</span></div></div>${labelsHtml(op)}<div class="section-title" style="margin-top:22px"><div><h2>Task flow</h2><span>Current execution and approval workflow</span></div></div><div class="detail-metrics"><div class="metric"><div class="label">Active tasks</div><div class="value">${flow.active}</div></div><div class="metric"><div class="label">Waiting / on hold</div><div class="value">${flow.waiting}</div></div><div class="metric"><div class="label">Approval</div><div class="value">${flow.approval}</div></div><div class="metric"><div class="label">Rework</div><div class="value">${flow.rework}</div></div></div><p class="muted"><strong>Next task:</strong> ${escape(flow.next ? `${flow.next.title} · ${flow.next.status}` : 'No active task')}</p><div class="section-title" style="margin-top:22px"><div><h2>KPI execution</h2><span>Read-only data from the tender report</span></div></div><div class="detail-metrics"><div class="metric"><div class="label">Elapsed calendar days</div><div class="value">${kpi.elapsed ?? '—'}</div><div class="sub">${dateLabel(kpi.received)} to ${dateLabel(kpi.delivered)}</div></div><div class="metric"><div class="label">Tender work</div><div class="value">${kpi.myDays} d</div><div class="sub">${kpi.myHours.toFixed(1)} hours</div></div><div class="metric"><div class="label">Waiting on others</div><div class="value">${kpi.waiting} d</div><div class="sub">All tracked areas</div></div><div class="metric"><div class="label">Unique execution days</div><div class="value">${kpi.unique} d</div><div class="sub">Worked or waiting</div></div></div><table class="detail-table"><thead><tr><th>Area</th><th>Worked days</th><th>Waiting days</th></tr></thead><tbody>${kpi.areas.map(area => `<tr><td>${escape(area.area || 'Unnamed area')}</td><td>${Number(area.daysSpent || 0)}</td><td>${Number(area.waitingDays || 0)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No KPI areas tracked.</td></tr>'}</tbody></table>`;
  $('.detail-body', drawer)?.append(insights);
  const timeline = dailyKpiTimeline(op);
  const timelineSection = document.createElement('section'); timelineSection.className = 'section card'; timelineSection.style.marginTop = '18px';
  timelineSection.innerHTML = `<div class="section-title"><div><h2>Daily KPI timeline</h2><span>Scroll horizontally to review every day of the opportunity.</span></div></div><div class="timeline-legend"><span class="worked">Worked</span><span class="waiting">Waiting</span><span class="inactive">Inactive</span><span class="event">Activity</span><span class="empty">No record</span></div><div class="daily-timeline">${timeline.days.map(item => `<div class="timeline-day ${item.state}" title="${escape(`${item.day}${item.detail.length ? `\n${item.detail.join('\n')}` : '\nNo tracked activity'}`)}"><strong>${item.day.slice(8)}</strong><small>${item.day.slice(5,7)}</small><i></i></div>`).join('') || '<div class="empty">No KPI timeline dates are available in this report.</div>'}</div>${timeline.truncated ? '<p class="muted" style="margin:12px 0 0">The first 730 days are shown. The KPI range is longer than two years.</p>' : ''}<p class="muted" style="margin:12px 0 0">Hover over a day to see the tracked areas and events. The timeline is read-only.</p>`;
  $('.detail-body', drawer)?.append(timelineSection);
  const noteHeading = [...$$('h3', drawer)].find(heading => heading.textContent.trim() === 'Tender notes');
  const noteList = noteHeading?.nextElementSibling;
  if (noteList) $$(':scope > .list-row', noteList).forEach((row, index) => {
    row.classList.add('tender-note-row');
    row.title = 'Open full tender note';
    row.onclick = () => showTenderNote((op.notes || [])[index]);
  });
}
function renderDetail() { const entry=findEntry(selectedKey);if(!entry)return;const op=entry.opportunity,stats=taskStats(op),health=risk(op),opKey=keyFor(entry.report,op),notes=state.notes.filter(note=>note.opKey===opKey); const tabContent={summary:`<div class="detail-metrics"><div class="metric"><div class="label">Expected</div><div class="value">${dateLabel(op.dates?.expected)}</div></div><div class="metric"><div class="label">Task progress</div><div class="value">${stats.pct}%</div><div class="sub">${stats.done}/${stats.total} done</div></div><div class="metric"><div class="label">Amount</div><div class="value">${money(amount(op))}</div></div><div class="metric"><div class="label">Revisions</div><div class="value">${(op.versions||[]).length+1}</div></div></div><p>${escape(op.description||'No description supplied.')}</p><h3>KPI</h3><table class="detail-table"><tbody><tr><th>Received</th><td>${dateLabel(op.kpis?.timeline?.receivedAt)}</td><th>Delivered</th><td>${dateLabel(op.kpis?.timeline?.deliveredAt)}</td></tr><tr><th>Language</th><td>${op.kpis?.languageSkill ?? '—'}</td><th>Technical</th><td>${op.kpis?.technicalUnderstanding ?? '—'}</td></tr><tr><th>Deal probability</th><td>${op.kpis?.dealProbability ?? '—'}</td><th>Effort</th><td>${op.kpis?.effortContribution ?? '—'}</td></tr></tbody></table><h3>Tender notes</h3><div class="list">${(op.notes||[]).map(note=>`<div class="list-row"><div class="grow"><strong>${escape(note.title||'Note')}</strong><small>${escape(textOnly(note.content))}</small></div></div>`).join('')||'<div class="empty">No tender notes.</div>'}</div><h3>Current alerts</h3><div class="list">${alertsFor(entry).map(alert=>`<div class="list-row alert-card ${alert.type}"><span class="dot ${alert.type}"></span><div class="grow"><strong>${escape(alert.label)}</strong></div></div>`).join('')||'<div class="empty">No active alerts.</div>'}</div>`,tasks:`<table class="detail-table"><thead><tr><th>Task</th><th>Status</th><th>Due</th><th>Responsible</th></tr></thead><tbody>${(op.tasks||[]).map(task=>`<tr><td><strong>${escape(task.title)}</strong><br/><small class="muted">${escape(textOnly(task.description))}</small></td><td>${badge(task.status==='Done'?'green':task.status==='In Progress'?'orange':'gray',task.status)}</td><td>${dateLabel(task.dueDate)}</td><td>${escape(task.responsible||task.owner||'—')}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">No tasks.</td></tr>'}</tbody></table>`,history:`<div class="list">${[...(op.history||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(history=>`<div class="list-row"><div class="grow"><strong>${dateLabel(history.date)}</strong><small>${escape(textOnly(history.content))}</small></div></div>`).join('')||'<div class="empty">No history entries.</div>'}</div>`,revisions:`<div class="list">${[{revision:op.revision||'Current',createdAt:op.lastUpdated,commitMessage:'Current working proposal'},...(op.versions||[])].map(version=>`<div class="list-row"><span class="dot green"></span><div class="grow"><strong>${escape(version.revision||version.snapshot?.revision||'Revision')}</strong><small>${dateLabel(version.createdAt)} · ${escape(version.commitMessage||'No reason supplied')}</small></div></div>`).join('')}</div>`,commercial:`<div class="detail-metrics"><div class="metric"><div class="label">Official sell price</div><div class="value">${money(op.commercial?.cqaOfficialSellPrice)}</div></div><div class="metric"><div class="label">Official margin</div><div class="value">${Number(op.commercial?.cqaOfficialMargin||0).toFixed(1)}%</div></div></div><p>${escape(op.commercial?.discountsAndNotes||'No commercial notes.')}</p>`,notes:`<div class="form"><textarea id="managerNote" placeholder="Private manager note for this OP"></textarea><div class="form-row"><button class="button primary" id="saveNote">Add open note</button></div></div><div class="list" style="margin-top:16px">${notes.map(note=>`<div class="list-row"><span class="dot ${note.status==='Open'?'yellow':'green'}"></span><div class="grow"><strong>${escape(note.text)}</strong><small>${dateLabel(note.createdAt)} · ${note.status}</small></div><button class="button" data-note-status="${note.id}">${note.status==='Open'?'Resolve':'Reopen'}</button></div>`).join('')||'<div class="empty">No manager notes yet.</div>'}</div>`}; const overlay=document.createElement('div');overlay.className='panel';overlay.innerHTML=`<aside class="drawer"><div class="drawer-head"><div><h2>${escape(op.title||op.id)}</h2><p class="muted">${escape(op.id)} · ${escape(entry.tender)} · ${escape(op.customer||'No customer')} · ${badge(health.className,health.name)}</p></div><button class="close" id="closeDrawer">×</button></div><div class="tabs">${[['summary','Summary'],['tasks','Tasks'],['history','History'],['revisions','Revisions'],['commercial','Commercial'],['notes','Manager notes']].map(([id,label])=>`<button data-tab="${id}" class="${detailTab===id?'active':''}">${label}</button>`).join('')}</div><div class="detail-body">${tabContent[detailTab]}</div></aside>`;overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};document.body.append(overlay);$('#closeDrawer',overlay).onclick=()=>overlay.remove();$$('[data-tab]',overlay).forEach(button=>button.onclick=()=>{detailTab=button.dataset.tab;overlay.remove();renderDetail();});if(detailTab==='notes'){$('#saveNote',overlay).onclick=()=>{const text=$('#managerNote',overlay).value.trim();if(text){state.notes.push({id:uid(),opKey,text,status:'Open',createdAt:new Date().toISOString()});save();overlay.remove();renderDetail();}};$$('[data-note-status]',overlay).forEach(button=>button.onclick=()=>{state.notes=state.notes.map(note=>note.id===button.dataset.noteStatus?{...note,status:note.status==='Open'?'Resolved':'Open'}:note);save();overlay.remove();renderDetail();});}}
function openManagerItemForm() { const overlay=document.createElement('div');overlay.className='panel';overlay.innerHTML=`<aside class="drawer" style="max-width:500px"><div class="drawer-head"><div><h2>Add follow-up</h2><p class="muted">A reminder may repeat automatically; a manager task is a simple personal action.</p></div><button class="close">×</button></div><div class="form"><select id="itemType"><option value="reminder">Reminder</option><option value="task">Manager task</option></select><input id="itemTitle" placeholder="Title"/><input id="itemDate" type="date" value="${today()}"/><textarea id="itemNote" placeholder="Internal note (optional)"></textarea><select id="repeat"><option value="">Does not repeat</option><option value="weekly">Repeat weekly</option><option value="monthly">Repeat monthly</option></select><button class="button primary" id="saveItem">Save</button></div></aside>`;document.body.append(overlay);$('.close',overlay).onclick=()=>overlay.remove();$('#saveItem',overlay).onclick=()=>{const title=$('#itemTitle',overlay).value.trim();if(!title)return;const target=$('#itemType',overlay).value==='reminder'?state.reminders:state.managerTasks;target.push({id:uid(),title,dueDate:$('#itemDate',overlay).value,note:$('#itemNote',overlay).value.trim(),repeat:$('#repeat',overlay).value,status:'Open',createdAt:new Date().toISOString()});save();overlay.remove();renderPage();}; }
function completeManagerItem(value) { const [type,id]=value.split(':');const key=type==='Reminder'?'reminders':'managerTasks';const item=state[key].find(entry=>entry.id===id);if(!item)return;item.status='Done';if(item.repeat){const date=isoDate(item.dueDate)||new Date();if(item.repeat==='weekly')date.setDate(date.getDate()+7);else date.setMonth(date.getMonth()+1);state[key].push({...item,id:uid(),dueDate:date.toISOString().slice(0,10),status:'Open',createdAt:new Date().toISOString()});}save();renderPage(); }
function editGroup(id) { const group=state.groups.find(item=>item.id===id);if(!group)return;const selected=new Set(group.tenderIds);const overlay=document.createElement('div');overlay.className='panel';overlay.innerHTML=`<aside class="drawer" style="max-width:500px"><div class="drawer-head"><div><h2>${escape(group.name)}</h2><p class="muted">Select the tenders that belong to this group.</p></div><button class="close">×</button></div><input id="groupTenderSearch" placeholder="Search tenders…" style="width:100%;margin-bottom:10px"/><div class="check-list" id="groupTenderList">${allTenders().map(tender=>`<label data-tender-name="${escape(tender.toLowerCase())}"><input type="checkbox" value="${escape(tender)}" ${selected.has(tender)?'checked':''}/> ${escape(tender)}</label>`).join('')}</div><button class="button primary" id="saveGroup" style="margin-top:14px">Save group</button></aside>`;document.body.append(overlay);$('.close',overlay).onclick=()=>overlay.remove();$$('input[type="checkbox"]',overlay).forEach(input=>input.onchange=()=>{if(input.checked)selected.add(input.value);else selected.delete(input.value);});$('#groupTenderSearch',overlay).oninput=event=>{const query=event.target.value.trim().toLowerCase();$$('[data-tender-name]',overlay).forEach(row=>row.hidden=!row.dataset.tenderName.includes(query));};$('#saveGroup',overlay).onclick=()=>{group.tenderIds=[...selected];save();overlay.remove();renderPage();}; }
async function chooseFolder() { try { if (window.showDirectoryPicker) { directoryHandle=await window.showDirectoryPicker({mode:'read'});await saveHandle(directoryHandle);state.folderLabel=directoryHandle.name;save();await scanFolder(); } else { $('#folderFallback').click(); } } catch(error) { if(error?.name!=='AbortError')alert(`Could not open this folder: ${error.message||error}`); } }
async function scanFolder(files) { const refresh=$('#refresh');if(refresh){refresh.textContent='Reading reports…';refresh.disabled=true;} const next={...state.reports};const invalid=[];const changed=[];try{let records=[];if(files){records=[...files].filter(file=>file.name.toLowerCase().endsWith(REPORT_SUFFIX)).map(file=>({name:file.name,file}));}else if(directoryHandle){for await(const [name,handle] of directoryHandle.entries())if(handle.kind==='file'&&name.toLowerCase().endsWith(REPORT_SUFFIX))records.push({name,file:await handle.getFile()});}for(const record of records){try{const report=hydrateReport(JSON.parse(await record.file.text()));if(report?.kind!=='opportunityos-manager-report'||!Array.isArray(report.opportunities)||!report.tender)throw new Error('Not an OpportunityOS Manager report');const old=next[report.tender];if(!old||new Date(report.exportedAt)>new Date(old.exportedAt)){next[report.tender]=report;changed.push(report);}}catch(error){invalid.push({name:record.name,error:error.message||'Invalid report'});}}state.reports=next;state.invalidReports=invalid;try{await writeReports(changed);}catch(error){console.warn('Browser report cache unavailable; reports remain in the Manager database.',error);}save();renderShell();}catch(error){alert(`Could not read reports: ${error.message||error}`);}finally{if(refresh){refresh.textContent='Refresh reports';refresh.disabled=false;}} }
async function init() {
  try {
    const indexedState = await readState(); const persistedReports = await readReports();
    let legacyState = null;
    if (!indexedState) { try { legacyState = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch {} localStorage.removeItem(STORE); }
    const stored = indexedState || legacyState || {}; const embeddedReports = stored.reports || {};
    state = { ...defaults(), ...stored, reports: Object.keys(persistedReports).length ? persistedReports : embeddedReports };
    state.settings = { ...defaults().settings, ...state.settings }; Object.values(state.reports).forEach(hydrateReport);
    if (!Object.keys(persistedReports).length && Object.keys(embeddedReports).length) await writeReports(Object.values(embeddedReports));

    managerDbHandle = await loadHandle('managerDatabase');
    if (managerDbHandle) {
      managerDbName = managerDbHandle.name; managerDbStatus = 'Database linked';
      const permission = await managerDbHandle.queryPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        try { await applyManagerDatabase(JSON.parse(await (await managerDbHandle.getFile()).text())); }
        catch (error) { console.warn('Could not load the selected Manager database.', error); }
      }
    }
    directoryHandle = await loadHandle();
    if (directoryHandle) { const permission = await directoryHandle.queryPermission({mode:'read'}); state.folderLabel=directoryHandle.name; if(permission==='granted') await scanFolder(); }
  } catch(error) { console.warn('Local Manager Tool setup failed',error); }
  renderShell();
  $('#folderFallback').addEventListener('change',event=>{const files=event.target.files;state.folderLabel=files?.[0]?.webkitRelativePath?.split('/')[0]||'Selected report folder';save();scanFolder(files);});
}
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('#createManagerDb')) { createManagerDatabase(); return; }
  if (event.target.closest('#openManagerDb')) { openManagerDatabase(); return; }
  if (event.target.closest('#saveManagerDb')) { saveManagerDatabase().then(() => alert('Manager database saved.')).catch(error => alert(`Could not save the Manager database: ${error.message || error}`)); return; }
  if (detailTab !== 'tasks' || event.target.closest('[data-task-detail]')) return;
  const row = event.target.closest('.drawer .detail-table tbody tr');
  if (!row) return;
  const entry = findEntry(selectedKey);
  const rows = [...row.parentElement.querySelectorAll(':scope > tr')];
  const task = entry?.opportunity?.tasks?.[rows.indexOf(row)];
  if (task) showTaskDetail(task);
});
init();
