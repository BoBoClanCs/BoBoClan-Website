// ── Config ─────────────────────────────────────────────────
const ADMIN_PW = 'unserPasswortIst124';
const GH_USER = 'BoBoClanCs';
const GH_REPO = 'BoBoClan-Website';
const GH_FILE = 'data.json';
const GH_BRANCH = 'main';

// ── State ──────────────────────────────────────────────────
// state.teams = [ { id, name, coach, dachcs, players:[], results:[], histoire:[] } ]
// state.news  = [ { date, title, text } ]
let state = {
  teams: [
    { id:'boot', name:'BoBoBoot', coach:'', dachcs:'', players:[], results:[] },
    { id:'rage', name:'BoBoRage', coach:'', dachcs:'', players:[], results:[] }
  ],
  matches: [], // upcoming matches: {id, team, opponent, date, twitch}
  histoire: [
    { id:'boot', name:'BoBoBoot', seasons:[] },
    { id:'rage', name:'BoBoRage', seasons:[] }
  ],
  news: []
};

// ── Helpers ────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function initials(n) { return (n||'?').split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2); }
function teamById(id) { return state.teams.find(t => t.id === id); }
function histById(id) { return state.histoire.find(t => t.id === id); }
function genId() { return 'team_' + Math.random().toString(36).slice(2,7); }

// ── Token ──────────────────────────────────────────────────
function getToken() { return localStorage.getItem('bobo_gh_token') || ''; }
function saveToken() {
  const t = document.getElementById('gh-token-input').value.trim();
  if (!t || t.startsWith('•')) return;
  localStorage.setItem('bobo_gh_token', t);
  document.getElementById('token-status').className = 'token-status ok';
  document.getElementById('token-status').textContent = '✓ Token gespeichert';
}

// ── Login ──────────────────────────────────────────────────
function openAdmin() {
  document.getElementById('admin-login-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('admin-pw-input').focus(), 100);
}
function closeLogin() {
  document.getElementById('admin-login-overlay').style.display = 'none';
  document.getElementById('admin-pw-input').value = '';
  document.getElementById('login-err').classList.remove('show');
}
function checkLogin() {
  if (document.getElementById('admin-pw-input').value === ADMIN_PW) {
    closeLogin(); openAdminPanel();
  } else {
    document.getElementById('login-err').classList.add('show');
    document.getElementById('admin-pw-input').value = '';
  }
}
function openAdminPanel() {
  const ap = document.getElementById('admin-panel');
  ap.style.display = 'flex';
  document.getElementById('admin-toggle-btn').classList.add('active');
  const tok = getToken();
  if (tok) {
    document.getElementById('gh-token-input').value = '••••••••••••••••';
    document.getElementById('token-status').className = 'token-status ok';
    document.getElementById('token-status').textContent = '✓ Token vorhanden';
  }
  rebuildAdminSidebar();
  rebuildTeamPages();
  refreshAllAdminForms();
  showAdminPage('page-settings');
}
function closeAdmin() {
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('admin-toggle-btn').classList.remove('active');
}

// ── Admin navigation ───────────────────────────────────────
function showAdminPage(id) {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
  const page = document.getElementById(id);
  if (page) page.classList.add('active');
  document.querySelectorAll(`.admin-nav-item[data-page="${id}"]`).forEach(b => b.classList.add('active'));
  // Re-render dynamic pages on switch
  if (id === 'page-histoire') renderHistoireAdminPage();
  if (id === 'page-matches') renderMatchesAdmin();
  if (id === 'page-news') {
    document.getElementById('news-edit').innerHTML = state.news.map((n,i) => newsRowHTML(i,n)).join('');
    document.getElementById('news-count-lbl').textContent = state.news.length + ' Einträge';
  }
}
function toggleCard(head) {
  const body = head.nextElementSibling;
  const arrow = head.querySelector('.admin-card-arrow');
  body.classList.toggle('open');
  if (arrow) arrow.classList.toggle('open');
}

// ── Sidebar rebuild ────────────────────────────────────────
function rebuildAdminSidebar() {
  const container = document.getElementById('sidebar-team-links');
  container.innerHTML = '<span class="admin-sidebar-label">Kader & Ergebnisse</span>' +
    state.teams.map(t =>
      `<button class="admin-nav-item" data-page="page-team-${t.id}" onclick="showAdminPage('page-team-${t.id}')">${esc(t.name)}</button>`
    ).join('');
  // count labels
  document.getElementById('teams-count-label').textContent = state.teams.length + ' Teams';
  document.getElementById('news-count-lbl').textContent = state.news.length + ' Einträge';
}

// ── Team management page ───────────────────────────────────
function renderTeamMgmtList() {
  document.getElementById('team-mgmt-list').innerHTML = state.teams.map((t,i) => `
    <div class="team-mgmt-item">
      <span class="team-id-badge">#${i+1}</span>
      <input type="text" value="${esc(t.name)}" placeholder="Teamname" oninput="renameTeam('${t.id}',this.value)">
      <button class="del-btn" onclick="deleteTeam('${t.id}')" title="Team löschen">&#128465;</button>
    </div>`).join('');
}
function addTeam() {
  const id = genId();
  state.teams.push({ id, name:'Neues Team', coach:'', dachcs:'', players:[], results:[] });
  renderTeamMgmtList();
  rebuildAdminSidebar();
  rebuildTeamPages();
  renderPublic();
}
function renameTeam(id, name) {
  const t = teamById(id); if (!t) return;
  t.name = name;
  rebuildAdminSidebar();
  renderPublic();
}
function deleteTeam(id) {
  if (!confirm('Team wirklich löschen? Kader und Ergebnisse werden gelöscht. Die Historie bleibt erhalten.')) return;
  state.teams = state.teams.filter(t => t.id !== id);
  renderTeamMgmtList();
  rebuildAdminSidebar();
  rebuildTeamPages();
  renderPublic();
}

// ── Per-team admin pages ───────────────────────────────────
function rebuildTeamPages() {
  const container = document.getElementById('team-pages-container');
  container.innerHTML = state.teams.map(t => teamPageHTML(t)).join('');
  renderTeamMgmtList();
  // re-attach coach/dachcs listeners
  state.teams.forEach(t => {
    const ci = document.getElementById('coach-'+t.id);
    const di = document.getElementById('dachcs-'+t.id);
    if (ci) ci.addEventListener('input', () => { t.coach = ci.value; renderPublic(); });
    if (di) di.addEventListener('input', () => { t.dachcs = di.value; updateDachcsLinks(); });
  });
}

function teamPageHTML(t) {
  return `<div class="admin-page" id="page-team-${t.id}">

    <!-- Info card -->
    <div class="admin-card">
      <div class="admin-card-head" onclick="toggleCard(this)">
        <div class="admin-card-title">${esc(t.name)} – Info</div>
        <div class="admin-card-arrow open">&#9660;</div>
      </div>
      <div class="admin-card-body open">
        <div class="field-row">
          <label>Coach</label>
          <input type="text" id="coach-${t.id}" value="${esc(t.coach)}" placeholder="Name des Coaches">
        </div>
        <div class="field-row">
          <label>DachCS URL</label>
          <input type="text" id="dachcs-${t.id}" value="${esc(t.dachcs)}" placeholder="https://www.dachcs.de/teams/...">
        </div>
      </div>
    </div>

    <!-- Players card -->
    <div class="admin-card">
      <div class="admin-card-head" onclick="toggleCard(this)">
        <div class="admin-card-title">Kader</div>
        <div class="admin-card-subtitle">${t.players.length} Spieler</div>
        <div class="admin-card-arrow">&#9660;</div>
      </div>
      <div class="admin-card-body">
        <div class="tbl-editor-head tbl-row grid-player"><span>Name</span><span>Rolle</span><span>Steam-URL</span><span>Typ</span><span></span></div>
        <div id="players-${t.id}">${t.players.map((p,i) => playerRowHTML(t.id,i,p)).join('')}</div>
        <button class="tbl-add-btn" onclick="addPlayer('${t.id}')">+ Spieler hinzufügen</button>
      </div>
    </div>

    <!-- Results card -->
    <div class="admin-card">
      <div class="admin-card-head" onclick="toggleCard(this)">
        <div class="admin-card-title">Ergebnisse</div>
        <div class="admin-card-subtitle">${t.results.length} Einträge</div>
        <div class="admin-card-arrow">&#9660;</div>
      </div>
      <div class="admin-card-body">
        <div class="tbl-editor-head tbl-row grid-result"><span>Gegner</span><span>Wir</span><span>Sie</span><span>Map</span><span>Ergebnis</span><span></span></div>
        <div id="results-${t.id}">${t.results.map((r,i) => resultRowHTML(t.id,i,r)).join('')}</div>
        <button class="tbl-add-btn" onclick="addResult('${t.id}')">+ Ergebnis hinzufügen</button>
      </div>
    </div>

  </div>`;
}

// ── Row templates ──────────────────────────────────────────
function playerRowHTML(tid, i, p) {
  return `<div class="tbl-row grid-player">
    <input type="text" placeholder="Spielername" value="${esc(p.name)}" oninput="updatePlayer('${tid}',${i},'name',this.value)">
    <input type="text" placeholder="Rolle" value="${esc(p.role)}" oninput="updatePlayer('${tid}',${i},'role',this.value)">
    <input type="text" placeholder="https://steamcommunity.com/id/..." value="${esc(p.steam||'')}" oninput="updatePlayer('${tid}',${i},'steam',this.value)">
    <select onchange="updatePlayer('${tid}',${i},'type',this.value)">
      <option value="main"${(p.type||'main')==='main'?' selected':''}>Stammspieler</option>
      <option value="standin"${p.type==='standin'?' selected':''}>Stand-in</option>
    </select>
    <button class="del-btn" onclick="delPlayer('${tid}',${i})">&#10005;</button>
  </div>`;
}
function resultRowHTML(tid, i, r) {
  return `<div class="tbl-row grid-result">
    <input type="text" placeholder="Gegner" value="${esc(r.opp)}" oninput="updateResult('${tid}',${i},'opp',this.value)">
    <input type="number" placeholder="16" value="${esc(r.s1)}" oninput="updateResult('${tid}',${i},'s1',this.value)">
    <input type="number" placeholder="8"  value="${esc(r.s2)}" oninput="updateResult('${tid}',${i},'s2',this.value)">
    <input type="text" placeholder="Mirage" value="${esc(r.map)}" oninput="updateResult('${tid}',${i},'map',this.value)">
    <select onchange="updateResult('${tid}',${i},'res',this.value)">
      <option value="win"${r.res==='win'?' selected':''}>Sieg</option>
      <option value="loss"${r.res==='loss'?' selected':''}>Niederlage</option>
      <option value="draw"${(r.res||'draw')==='draw'?' selected':''}>Unentschieden</option>
    </select>
    <button class="del-btn" onclick="delResult('${tid}',${i})">&#10005;</button>
  </div>`;
}
function newsRowHTML(i, n) {
  return `<div class="tbl-row grid-news">
    <input type="text" placeholder="Mai 2025" value="${esc(n.date)}" oninput="updateNews(${i},'date',this.value)">
    <input type="text" placeholder="Titel" value="${esc(n.title)}" oninput="updateNews(${i},'title',this.value)">
    <textarea class="news-textarea" placeholder="Text..." oninput="updateNews(${i},'text',this.value)">${esc(n.text)}</textarea>
    <button class="del-btn" onclick="delNews(${i})">&#10005;</button>
  </div>`;
}

// ── State updaters ─────────────────────────────────────────
function updatePlayer(tid,i,k,v) { const t=teamById(tid); if(t){t.players[i][k]=v; renderPublic();} }
function updateResult(tid,i,k,v) { const t=teamById(tid); if(t){t.results[i][k]=v; renderPublic();} }
function updateNews(i,k,v) { state.news[i][k]=v; renderPublic(); }

function addPlayer(tid) {
  const t = teamById(tid); if(!t) return;
  t.players.push({name:'',role:'',steam:'',type:'main'});
  document.getElementById('players-'+tid).innerHTML = t.players.map((p,i) => playerRowHTML(tid,i,p)).join('');
  updateCardSubtitle(tid, 'players');
}
function delPlayer(tid,i) {
  const t = teamById(tid); if(!t) return;
  t.players.splice(i,1);
  document.getElementById('players-'+tid).innerHTML = t.players.map((p,j) => playerRowHTML(tid,j,p)).join('');
  updateCardSubtitle(tid, 'players');
  renderPublic();
}
function addResult(tid) {
  const t = teamById(tid); if(!t) return;
  t.results.push({opp:'',s1:'',s2:'',map:'',res:'win'});
  document.getElementById('results-'+tid).innerHTML = t.results.map((r,i) => resultRowHTML(tid,i,r)).join('');
  updateCardSubtitle(tid, 'results');
}
function delResult(tid,i) {
  const t = teamById(tid); if(!t) return;
  t.results.splice(i,1);
  document.getElementById('results-'+tid).innerHTML = t.results.map((r,j) => resultRowHTML(tid,j,r)).join('');
  updateCardSubtitle(tid, 'results');
  renderPublic();
}
function addNews() {
  state.news.push({date:'',title:'',text:''});
  const i = state.news.length-1;
  document.getElementById('news-edit').insertAdjacentHTML('beforeend', newsRowHTML(i, state.news[i]));
  document.getElementById('news-count-lbl').textContent = state.news.length + ' Einträge';
}
function delNews(i) {
  state.news.splice(i,1);
  document.getElementById('news-edit').innerHTML = state.news.map((n,j) => newsRowHTML(j,n)).join('');
  document.getElementById('news-count-lbl').textContent = state.news.length + ' Einträge';
  renderPublic();
}
function updateCardSubtitle(tid, type) {
  const t = teamById(tid); if(!t) return;
  const count = type === 'players' ? t.players.length + ' Spieler' : t.results.length + ' Einträge';
  // find the card subtitle in the team page
  const page = document.getElementById('page-team-'+tid);
  if (!page) return;
  const cards = page.querySelectorAll('.admin-card');
  const idx = type === 'players' ? 1 : 2;
  if (cards[idx]) { const sub = cards[idx].querySelector('.admin-card-subtitle'); if(sub) sub.textContent = count; }
}

function refreshAllAdminForms() {
  document.getElementById('news-edit').innerHTML = state.news.map((n,i) => newsRowHTML(i,n)).join('');
  document.getElementById('news-count-lbl').textContent = state.news.length + ' Einträge';
  renderHistoireAdminPage();
}

// ── Public render ──────────────────────────────────────────
function updateDachcsLinks() {
  state.teams.forEach(t => {
    const url = t.dachcs || 'https://www.dachcs.de';
    document.querySelectorAll('.dacha-link-'+t.id).forEach(el => el.href = url);
  });
}

function renderPublic() {
  // Render team tabs + panels dynamically
  const tabsEl = document.getElementById('teams-tabs');
  const panelsEl = document.getElementById('teams-panels');
  const rtabsEl = document.getElementById('results-tabs');
  const rpanelsEl = document.getElementById('results-panels');

  tabsEl.innerHTML = state.teams.map((t,i) =>
    `<button class="tab-btn${i===0?' active':''}" id="tab-${t.id}" onclick="switchTeam('${t.id}')">${esc(t.name)}</button>`
  ).join('');
  rtabsEl.innerHTML = state.teams.map((t,i) =>
    `<button class="tab-btn${i===0?' active':''}" id="rtab-${t.id}" onclick="switchResults('${t.id}')">${esc(t.name)}</button>`
  ).join('');

  panelsEl.innerHTML = state.teams.map((t,i) => `
    <div class="team-panel${i===0?' active':''}" id="panel-${t.id}">
      <div class="team-meta">
        <div>
          <div class="team-meta-name">${esc(t.name)}</div>
          <div class="team-meta-coach" id="coach-display-${t.id}">${t.coach ? 'Coach: <span>'+esc(t.coach)+'</span>' : 'Coach: <span style="color:#555">&#8211;</span>'}</div>
        </div>
        <a href="${esc(t.dachcs||'https://www.dachcs.de')}" target="_blank" rel="noopener" class="dacha-link dacha-link-${t.id}">&#x2197; DachCS</a>
      </div>
      <div class="roster-section">
        <div class="roster-label">Stammkader</div>
        <div class="team-grid">${renderRoster(t, false)}</div>
      </div>
      ${renderStandins(t)}
    </div>`).join('');

  rpanelsEl.innerHTML = state.teams.map((t,i) => `
    <div class="team-panel${i===0?' active':''}" id="rpanel-${t.id}">
      <div class="results-list">${renderResultsList(t)}</div>
    </div>`).join('');

  // Nav team links
  const navTeamLinks = document.getElementById('nav-team-links');
  if (navTeamLinks) {
    navTeamLinks.innerHTML = state.teams.map((t,i) =>
      `<button class="hero-team-btn" onclick="scrollToTeam('${t.id}')">${esc(t.name)}</button>`
    ).join('');
  }

  // News
  const newsEl = document.getElementById('news-display');
  newsEl.innerHTML = state.news.length === 0
    ? '<div class="empty" style="grid-column:1/-1">Noch keine News eingetragen</div>'
    : state.news.map(n => `<div class="news-card"><div class="news-date">${esc(n.date)}</div><div class="news-title">${esc(n.title)}</div><div class="news-text">${esc(n.text)}</div></div>`).join('');

  updateDachcsLinks();
  renderMatches();
}

function renderRoster(t, standin) {
  const players = t.players.filter(p => (p.type||'main') === (standin ? 'standin' : 'main'));
  if (players.length === 0 && !standin) return '<div class="empty">Noch keine Spieler eingetragen</div>';
  return players.map(p => memberCardHTML(p, standin)).join('');
}
function renderStandins(t) {
  const standins = t.players.filter(p => p.type === 'standin');
  if (standins.length === 0) return '';
  return `<div class="roster-section"><div class="roster-label">Stand-ins</div><div class="team-grid">${standins.map(p => memberCardHTML(p, true)).join('')}</div></div>`;
}
function renderResultsList(t) {
  if (t.results.length === 0) return '<div class="empty">Noch keine Ergebnisse eingetragen</div>';
  const m = {win:'badge-win',loss:'badge-loss',draw:'badge-draw'};
  const l = {win:'Sieg',loss:'Niederlage',draw:'Unentschieden'};
  return t.results.map(r => {
    const res = r.res||'draw';
    return `<div class="result-row ${res}">
      <div><div class="r-name">${esc(t.name)}</div></div>
      <div class="score-box">
        <div class="score">${esc(r.s1)} &ndash; ${esc(r.s2)}</div>
        ${r.map ? '<div class="result-meta">'+esc(r.map)+'</div>' : ''}
        <span class="badge ${m[res]||'badge-draw'}">${l[res]||res}</span>
      </div>
      <div><div class="r-name right">${esc(r.opp||'?')}</div></div>
    </div>`;
  }).join('');
}


// Steam avatar queue to avoid rate limits



// ── Histoire ───────────────────────────────────────────────
function buildSeasonCard(s) {
  let pHTML;
  if (!s.players || s.players.length === 0) {
    pHTML = '<div class="empty" style="padding:1rem">Keine Spieler</div>';
  } else {
    let rows = '';
    s.players.forEach(p => {
      const kd = calcKD(p.kills, p.deaths);
      const kdColor = parseFloat(kd) >= 1 ? '#2ecc71' : parseFloat(kd) < 0.8 ? 'var(--red-light)' : '#f39c12';
      rows += '<tr>'
        + '<td>' + esc(p.name) + '</td>'
        + '<td class="num">' + esc(p.games||'-') + '</td>'
        + '<td class="num">' + esc(p.kills||'-') + '</td>'
        + '<td class="num">' + esc(p.assists||'-') + '</td>'
        + '<td class="num">' + esc(p.deaths||'-') + '</td>'
        + '<td class="num" style="color:' + kdColor + '">' + kd + '</td>'
        + '<td class="num hltv-rating ' + hltvClass(p.hltv) + '">' + esc(p.hltv||'-') + '</td>'
        + '</tr>';
    });
    pHTML = '<table class="stats-table"><thead><tr>'
      + '<th>Spieler</th><th class="num">Spiele</th><th class="num">Kills</th>'
      + '<th class="num">Assists</th><th class="num">Tode</th><th class="num">K/D</th>'
      + '<th class="num">HLTV</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  const coachLine = s.coach ? '<div style="font-size:0.85rem;color:#888;margin-bottom:1rem">Coach: <span style="color:var(--red-light);font-weight:600">' + esc(s.coach) + '</span></div>' : '';
  const ytBtn = s.youtube ? '<a href="' + esc(s.youtube) + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;font-family:Oswald,sans-serif;font-size:0.75rem;letter-spacing:2px;text-transform:uppercase;text-decoration:none;color:#ff4444;border:1px solid #ff4444;padding:4px 12px;margin-bottom:1rem;">&#9654; Playlist</a>' : ''
  const placementHTML = s.placement ? '<div class="season-placement">' + esc(s.placement) + '</div>' : '';
  const recordHTML = (s.wins || s.losses) ? '<div class="season-record">W/L: <span>' + esc(s.wins||'0') + '</span>/<span>' + esc(s.losses||'0') + '</span></div>' : '';
  return '<div class="season-card">'
    + '<div class="season-head" onclick="toggleSeason(this)">'
    + '<div class="season-name">' + esc(s.season||'Unbekannte Saison') + '</div>'
    + placementHTML + recordHTML
    + '<div class="season-toggle">&#9660;</div>'
    + '</div>'
    + '<div class="season-body">' + ytBtn + coachLine + pHTML + '</div>'
    + '</div>';
}

function renderHistoire() {
  const tabsEl = document.getElementById('hist-tabs');
  const panelsEl = document.getElementById('hist-panels');
  const loadingEl = document.getElementById('hist-loading');
  if (loadingEl) loadingEl.style.display = 'none';
  tabsEl.style.display = '';
  if (!state.histoire || state.histoire.length === 0) {
    tabsEl.innerHTML = '';
    panelsEl.innerHTML = '<div class="empty">Noch keine Teams in der Historie angelegt</div>';
    return;
  }
  tabsEl.innerHTML = state.histoire.map((t,i) =>
    '<button class="hist-tab' + (i===0?' active':'') + '" id="htab-' + t.id + '" onclick="switchHist(\'' + t.id + '\')">' + esc(t.name) + '</button>'
  ).join('');
  panelsEl.innerHTML = state.histoire.map((t,i) => {
    const seasons = t.seasons || [];
    const content = seasons.length === 0
      ? '<div class="empty">Noch keine Saisonen eingetragen</div>'
      : [...seasons].reverse().map(s => buildSeasonCard(s)).join('');
    return '<div class="hist-panel' + (i===0?' active':'') + '" id="hpanel-' + t.id + '">' + content + '</div>';
  }).join('');
}


function switchHist(id) {
  document.querySelectorAll('.hist-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.hist-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('htab-'+id).classList.add('active');
  document.getElementById('hpanel-'+id).classList.add('active');
}
function showPage(page, e) {
  if(e) e.preventDefault();
  // Hide all public pages
  ['page-home', 'pub-histoire', 'pub-spieler'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = 'none';
  });
  // Show target
  const idMap = { home:'page-home', histoire:'pub-histoire', spieler:'pub-spieler' };
  const targetId = idMap[page] || 'page-home';
  const target = document.getElementById(targetId);
  if(target) target.style.display = 'block';
  // Scroll to top
  window.scrollTo({top:0});
  // Render content - wrapped in try/catch so errors don't break navigation
  try { if(page === 'histoire') renderHistoire(); } catch(err) { console.error('renderHistoire error:', err); }
  try { if(page === 'spieler') renderSpielerList(); } catch(err) { console.error('renderSpielerList error:', err); }
  // Mark active nav links
  document.querySelectorAll('.nav-links a').forEach(a => {
    const ap = a.getAttribute('data-page');
    a.classList.toggle('nav-active', ap === page);
  });
}

function toggleHistorie(e) { showPage('histoire', e); }
function toggleSpieler(e) { showPage('spieler', e); }

// ── Histoire Admin ─────────────────────────────────────────
function renderHistoireAdminPage() {
  const el = document.getElementById('histoire-admin-content');
  // Team management for histoire
  const teamMgmt = `<div class="admin-card">
    <div class="admin-card-head" onclick="toggleCard(this)">
      <div class="admin-card-title">Teams in der Historie</div>
      <div class="admin-card-subtitle">${state.histoire.length} Teams</div>
      <div class="admin-card-arrow open">&#9660;</div>
    </div>
    <div class="admin-card-body open">
      <p style="font-size:0.85rem;color:#666;margin-bottom:1rem;line-height:1.6">Hier kannst du Teams für die Saisonhistorie anlegen – unabhängig von den aktuellen Teams.</p>
      <div id="hist-team-mgmt-list">${state.histoire.map((t,i) => `
        <div class="team-mgmt-item">
          <span class="team-id-badge">#${i+1}</span>
          <input type="text" value="${esc(t.name)}" placeholder="Teamname" oninput="renameHistTeam('${t.id}',this.value)">
          <button class="del-btn" onclick="deleteHistTeam('${t.id}')" title="Aus Historie löschen">&#128465;</button>
        </div>`).join('')}
      </div>
      <button class="tbl-add-btn" onclick="addHistTeam()">+ Team zur Historie hinzufügen</button>
    </div>
  </div>`;

  const seasonCards = state.histoire.map(t => `
    <div class="admin-card">
      <div class="admin-card-head" onclick="toggleCard(this)">
        <div class="admin-card-title">${esc(t.name)}</div>
        <div class="admin-card-subtitle">${(t.seasons||[]).length} Saisonen</div>
        <div class="admin-card-arrow open">&#9660;</div>
      </div>
      <div class="admin-card-body open">
        <div id="hist-admin-${t.id}">${(t.seasons||[]).map((s,i) => histSeasonHTML(t.id,i,s)).join('')}</div>
        <button class="tbl-add-btn" onclick="addSeason('${t.id}')">+ Saison hinzufügen</button>
      </div>
    </div>`).join('');

  el.innerHTML = teamMgmt + seasonCards;
}

function addHistTeam() {
  const id = genId();
  state.histoire.push({ id, name:'Neues Team', seasons:[] });
  renderHistoireAdminPage();
}
function renameHistTeam(id, name) {
  const t = histById(id); if(t) t.name = name;
  // update sidebar label live
  const btn = document.querySelector(`[data-histid="${id}"]`);
  if (btn) btn.textContent = name;
}
function deleteHistTeam(id) {
  if (!confirm('Team aus der Historie löschen? Alle Saisondaten dieses Teams gehen verloren.')) return;
  state.histoire = state.histoire.filter(t => t.id !== id);
  renderHistoireAdminPage();
}
function histSeasonHTML(tid, i, s) {
  const players = (s.players||[]).map((p,pi) => histPlayerHTML(tid,i,pi,p)).join('');
  const seasonLabel = s.season || 'Neue Saison';
  return `<div class="season-admin-card">
    <div class="season-admin-head" onclick="toggleSeasonAdmin(this)">
      <span style="font-family:'Oswald',sans-serif;font-size:0.85rem;color:var(--cream);min-width:120px;pointer-events:none">${esc(seasonLabel)}</span>
      <span style="flex:1;pointer-events:none"></span>
      <span style="font-size:0.7rem;color:#555;letter-spacing:1px;pointer-events:none">▲ EINKLAPPEN</span>
      <button class="del-btn" onclick="delSeason('${tid}',${i});event.stopPropagation()" style="margin-left:0.5rem">&#128465;</button>
    </div>
    <div class="season-admin-body open">
      <div style="display:grid;grid-template-columns:1fr 150px 65px 65px;gap:0.5rem;margin-bottom:1rem;">
        <input type="text" placeholder="Saison (z.B. Saison 1 – Frühjahr 2025)" value="${esc(s.season||'')}" oninput="updateSeason('${tid}',${i},'season',this.value);updateSeasonLabel(this)">
        <input type="text" placeholder="Platzierung" value="${esc(s.placement||'')}" oninput="updateSeason('${tid}',${i},'placement',this.value)">
        <input type="number" placeholder="Siege" value="${esc(s.wins||'')}" oninput="updateSeason('${tid}',${i},'wins',this.value)">
        <input type="number" placeholder="NL" value="${esc(s.losses||'')}" oninput="updateSeason('${tid}',${i},'losses',this.value)">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:1rem;">
        <div class="field-row" style="margin-bottom:0">
          <label>Coach</label>
          <input type="text" placeholder="Name des Coaches" value="${esc(s.coach||'')}" oninput="updateSeason('${tid}',${i},'coach',this.value)">
        </div>
        <div class="field-row" style="margin-bottom:0">
          <label style="white-space:nowrap">&#9654; YouTube</label>
          <input type="text" placeholder="https://youtube.com/playlist?list=..." value="${esc(s.youtube||'')}" oninput="updateSeason('${tid}',${i},'youtube',this.value)">
        </div>
      </div>
      <div class="tbl-editor-head tbl-row grid-hist-player"><span>Name</span><span>Spiele</span><span>Kills</span><span>Assists</span><span>Tode</span><span>K/D</span><span>HLTV</span><span>Steam-URL</span><span></span></div>
      <div id="hist-players-${tid}-${i}">${players}</div>
      <button class="tbl-add-btn" onclick="addHistPlayer('${tid}',${i})">+ Spieler hinzufügen</button>
    </div>
  </div>`;
}
function calcKD(kills, deaths) {
  const k = parseFloat(kills), d = parseFloat(deaths);
  if (isNaN(k) || isNaN(d) || d === 0) return k > 0 ? k.toFixed(2) : '-';
  return (k / d).toFixed(2);
}
function histPlayerHTML(tid,si,pi,p) {
  const kd = calcKD(p.kills, p.deaths);
  return `<div class="tbl-row grid-hist-player">
    <input type="text" placeholder="Name" value="${esc(p.name||'')}" oninput="updateHistPlayer('${tid}',${si},${pi},'name',this.value)">
    <input type="number" placeholder="0" value="${esc(p.games||'')}" oninput="updateHistPlayer('${tid}',${si},${pi},'games',this.value)">
    <input type="number" placeholder="0" value="${esc(p.kills||'')}" oninput="updateHistPlayer('${tid}',${si},${pi},'kills',this.value); refreshKD('${tid}',${si},${pi})">
    <input type="number" placeholder="0" value="${esc(p.assists||'')}" oninput="updateHistPlayer('${tid}',${si},${pi},'assists',this.value)">
    <input type="number" placeholder="0" value="${esc(p.deaths||'')}" oninput="updateHistPlayer('${tid}',${si},${pi},'deaths',this.value); refreshKD('${tid}',${si},${pi})">
    <span class="kd-display" id="kd-${tid}-${si}-${pi}" style="font-family:'Oswald',sans-serif;font-size:0.9rem;color:var(--cream);display:flex;align-items:center;justify-content:center;">${kd}</span>
    <input type="text" placeholder="1.05" value="${esc(p.hltv||'')}" oninput="updateHistPlayer('${tid}',${si},${pi},'hltv',this.value)">
    <input type="text" placeholder="steamcommunity.com/id/..." value="${esc(p.steam||'')}" oninput="updateHistPlayer('${tid}',${si},${pi},'steam',this.value)">
    <button class="del-btn" onclick="delHistPlayer('${tid}',${si},${pi})">&#10005;</button>
  </div>`;
}
function refreshKD(tid,si,pi) {
  const t = histById(tid); if(!t||!t.seasons[si]) return;
  const p = t.seasons[si].players[pi];
  const el = document.getElementById('kd-'+tid+'-'+si+'-'+pi);
  if(el) el.textContent = calcKD(p.kills, p.deaths);
}
function addSeason(tid) {
  const t = histById(tid); if(!t) return;
  if(!t.seasons) t.seasons=[];
  t.seasons.push({season:'',placement:'',wins:'',losses:'',players:[]});
  renderHistoireAdminPage();
}
function delSeason(tid,i) {
  const t = histById(tid); if(!t) return;
  t.seasons.splice(i,1); renderHistoireAdminPage();
}
function updateSeason(tid,i,k,v) { const t=histById(tid); if(t&&t.seasons&&t.seasons[i]) t.seasons[i][k]=v; }
function addHistPlayer(tid,si) {
  const t = histById(tid); if(!t) return;
  t.seasons[si].players.push({name:'',games:'',kills:'',assists:'',deaths:'',hltv:'',steam:''});
  const pi = t.seasons[si].players.length-1;
  document.getElementById('hist-players-'+tid+'-'+si).insertAdjacentHTML('beforeend', histPlayerHTML(tid,si,pi,t.seasons[si].players[pi]));
}
function updateHistPlayer(tid,si,pi,k,v) { const t=histById(tid); if(t&&t.seasons&&t.seasons[si]) t.seasons[si].players[pi][k]=v; }
function delHistPlayer(tid,si,pi) {
  const t = histById(tid); if(!t) return;
  t.seasons[si].players.splice(pi,1);
  document.getElementById('hist-players-'+tid+'-'+si).innerHTML = t.seasons[si].players.map((p,i) => histPlayerHTML(tid,si,i,p)).join('');
}

// ── GitHub Save ────────────────────────────────────────────

function toggleSeasonAdmin(head) {
  const body = head.nextElementSibling;
  const lbl = head.querySelector('span:last-of-type');
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open');
  if (lbl) lbl.textContent = isOpen ? '▼ AUFKLAPPEN' : '▲ EINKLAPPEN';
}
function updateSeasonLabel(input) {
  const head = input.closest('.season-admin-body').previousElementSibling;
  if (head) {
    const span = head.querySelector('span');
    if (span) span.textContent = input.value || 'Neue Saison';
  }
}
async function saveAll() {
  const token = getToken();
  if (!token) { setStatus('⚠ Kein Token gespeichert!', true); return; }
  const btn = document.getElementById('save-btn');
  const btnText = document.getElementById('save-btn-text');
  btn.disabled = true; btnText.textContent = 'Wird gespeichert...'; setStatus('','');

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(state, null, 2))));
  const apiUrl = `https://api.github.com/repos/${GH_USER}/${GH_REPO}/contents/${GH_FILE}`;
  const headers = { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };

  try {
    // Step 1: Always fetch current SHA fresh
    let sha = null;
    const shaRes = await fetch(apiUrl + '?ref=' + GH_BRANCH + '&_=' + Date.now(), { headers });
    if (shaRes.ok) {
      const d = await shaRes.json();
      sha = d.sha || null;
    } else if (shaRes.status !== 404) {
      // Not a 404 = real error (e.g. auth failure)
      const err = await shaRes.json();
      setStatus('Fehler beim SHA-Abruf: ' + (err.message || shaRes.status), true);
      btn.disabled = false; btnText.textContent = '💾 Speichern & Veröffentlichen';
      return;
    }
    // 404 = file doesn't exist yet → sha stays null → GitHub creates it

    // Step 2: PUT file
    const putBody = { message: 'Update clan data via admin panel', content, branch: GH_BRANCH };
    if (sha) putBody.sha = sha;

    const res = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(putBody) });
    if (res.ok) {
      setStatus('✓ Gespeichert!', false);
    } else {
      const err = await res.json();
      setStatus('Fehler: ' + (err.message || res.status), true);
    }
  } catch(e) {
    setStatus('Netzwerkfehler: ' + e.message, true);
  }
  btn.disabled = false; btnText.textContent = '💾 Speichern & Veröffentlichen';
}
function setStatus(msg, isErr) {
  const el = document.getElementById('save-status');
  el.textContent = msg;
  el.className = 'save-status' + (isErr ? ' err' : (msg ? ' ok' : ''));
}


// ── SPIELER ────────────────────────────────────────────────
// Derived from state.histoire – no manual editing needed

function getSpielerList() {
  const players = {};
  state.histoire.forEach(team => {
    (team.seasons || []).forEach(season => {
      (season.players || []).forEach(p => {
        if (!p.name || !p.name.trim()) return;
        const key = p.name.trim().toLowerCase();
        if (!players[key]) {
          players[key] = { name: p.name.trim(), steam: p.steam || '', seasons: [] };
        }
        // Update steam if this entry has one
        if (p.steam && p.steam.trim()) players[key].steam = p.steam.trim();
        players[key].seasons.push({
          teamId: team.id, teamName: team.name,
          season: season.season, coach: season.coach || '',
          games: p.games || '', kills: p.kills || '',
          assists: p.assists || '', deaths: p.deaths || '',
          hltv: p.hltv || ''
        });
        // Always update steam from any season entry
        if (p.steam && p.steam.trim()) players[key].steam = p.steam.trim();
      });
    });
  });
  // Also check current rosters for steam URLs
  state.teams.forEach(team => {
    (team.players || []).forEach(p => {
      if (!p.name || !p.steam) return;
      const key = p.name.trim().toLowerCase();
      if (players[key] && !players[key].steam) {
        players[key].steam = p.steam;
      }
    });
  });
  return Object.values(players).sort((a,b) => a.name.localeCompare(b.name));
}

function calcAllTime(seasons) {
  let kills=0, assists=0, deaths=0, games=0, hltvVals=[], hltvCount=0;
  seasons.forEach(s => {
    kills   += parseInt(s.kills)   || 0;
    assists += parseInt(s.assists) || 0;
    deaths  += parseInt(s.deaths)  || 0;
    games   += parseInt(s.games)   || 0;
    const h = parseFloat(s.hltv);
    if (!isNaN(h)) { hltvVals.push(h); hltvCount++; }
  });
  const kd = deaths > 0 ? (kills/deaths).toFixed(2) : kills > 0 ? kills.toFixed(2) : '-';
  const hltv = hltvCount > 0 ? (hltvVals.reduce((a,b)=>a+b,0)/hltvCount).toFixed(2) : '-';
  return { kills, assists, deaths, games, kd, hltv };
}



function renderSpielerList() {
  const players = getSpielerList();
  const listEl = document.getElementById('spieler-list');
  const detailEl = document.getElementById('spieler-detail');
  const topEl = document.getElementById('spieler-top-stats');
  detailEl.style.display = 'none';
  listEl.style.display = '';

  if (players.length === 0) {
    listEl.innerHTML = '<div class="empty">Noch keine Spieler in der Historie eingetragen</div>';
    topEl.style.display = 'none';
  const swEl2 = document.getElementById('spieler-search-wrap'); if(swEl2) swEl2.style.display='none';
    return;
  }

  // Build top stats
  const withStats = players.map(p => ({ ...p, at: calcAllTime(p.seasons) }));
  const topGames  = withStats.reduce((a,b) => (parseInt(b.at.games)||0) > (parseInt(a.at.games)||0) ? b : a);
  const topKills  = withStats.reduce((a,b) => (b.at.kills||0) > (a.at.kills||0) ? b : a);
  const topAssists= withStats.reduce((a,b) => (b.at.assists||0) > (a.at.assists||0) ? b : a);
  const topDeaths = withStats.reduce((a,b) => (b.at.deaths||0) > (a.at.deaths||0) ? b : a);

  const topCards = [
    { label:'Meiste Spiele',   player:topGames,   val:topGames.at.games||0   },
    { label:'Meiste Kills',    player:topKills,   val:topKills.at.kills||0   },
    { label:'Meiste Assists',  player:topAssists, val:topAssists.at.assists||0},
    { label:'Meiste Tode',     player:topDeaths,  val:topDeaths.at.deaths||0 },
  ];

  topEl.style.display = 'block';
  const swEl = document.getElementById('spieler-search-wrap');
  if(swEl) swEl.style.display = 'block';
  topEl.innerHTML = '<div class="top-stats-grid">' + topCards.map(({label, player, val}) => {
    const uid = 'tsp-' + label.replace(/\s+/g,'') + '-' + Math.random().toString(36).slice(2,6);
    const card = `<div class="top-stat-card" onclick="showSpielerDetail('${esc(player.name.replace(/'/g,"\'"))}')">
      <div class="top-stat-label">${esc(label)}</div>
      <div class="top-stat-avatar" id="${uid}">${initials(player.name)}</div>
      <div class="top-stat-name">${esc(player.name)}</div>
      <div class="top-stat-value">${val}</div>
    </div>`;
        return card;
  }).join('') + '</div>';

  // Player grid
  listEl.innerHTML = '<div class="spieler-grid">' + players.map(p => {
    const at = calcAllTime(p.seasons);
    const uid = 'sp-av-' + p.name.replace(/\s+/g,'').toLowerCase().slice(0,12) + Math.random().toString(36).slice(2,5);
    const teamNames = [...new Set(p.seasons.map(s => s.teamName))].join(' · ');
    const card = `<div class="spieler-card" onclick="showSpielerDetail('${esc(p.name.replace(/'/g,"\'"))}')">
      <div class="spieler-avatar" id="${uid}">${initials(p.name)}</div>
      <div class="spieler-name">${esc(p.name)}</div>
      <div class="spieler-teams">${esc(teamNames)}</div>
    </div>`;
    
    return card;
  }).join('') + '</div>';
}

function showSpielerDetail(name) {
  const players = getSpielerList();
  const p = players.find(pl => pl.name === name);
  if (!p) return;

  document.getElementById('spieler-list').style.display = 'none';
  const detailEl = document.getElementById('spieler-detail');
  detailEl.style.display = 'block';

  const allTime = calcAllTime(p.seasons);
  const uid = 'detail-av-' + Math.random().toString(36).slice(2,7);
  const teamNames = [...new Set(p.seasons.map(s => s.teamName))].join(' · ');

  const kdColor = (v) => {
    const n = parseFloat(v);
    if(isNaN(n)) return 'var(--cream)';
    return n>=1.2?'#2ecc71':n>=0.9?'#f39c12':'var(--red-light)';
  };
  const hltvColor = (v) => {
    const n = parseFloat(v);
    if(isNaN(n)) return 'var(--cream)';
    return n>=1.15?'#2ecc71':n>=0.95?'#f39c12':'var(--red-light)';
  };

  let html = `
    <div class="spieler-detail-header">
      <div class="spieler-detail-avatar" id="${uid}">${initials(p.name)}</div>
      <div>
        <div class="spieler-detail-name">${esc(p.name)}</div>
        <div class="spieler-detail-teams">${esc(teamNames)}</div>
      </div>
    </div>

    <h3 style="font-family:'Oswald',sans-serif;font-size:1rem;letter-spacing:3px;text-transform:uppercase;color:#888;margin-bottom:1rem;">&#9733; All Time Stats</h3>
    <div class="alltime-box">
      ${allTime.games ? `<div class="alltime-stat"><div class="alltime-stat-val">${allTime.games}</div><div class="alltime-stat-lbl">Spiele</div></div>` : ''}
      <div class="alltime-stat"><div class="alltime-stat-val">${allTime.kills}</div><div class="alltime-stat-lbl">Kills</div></div>
      <div class="alltime-stat"><div class="alltime-stat-val">${allTime.assists}</div><div class="alltime-stat-lbl">Assists</div></div>
      <div class="alltime-stat"><div class="alltime-stat-val">${allTime.deaths}</div><div class="alltime-stat-lbl">Tode</div></div>
      <div class="alltime-stat"><div class="alltime-stat-val" style="color:${kdColor(allTime.kd)}">${allTime.kd}</div><div class="alltime-stat-lbl">K/D</div></div>
      <div class="alltime-stat"><div class="alltime-stat-val" style="color:${hltvColor(allTime.hltv)}">${allTime.hltv}</div><div class="alltime-stat-lbl">HLTV &#216;</div></div>
    </div>

    <h3 style="font-family:'Oswald',sans-serif;font-size:1rem;letter-spacing:3px;text-transform:uppercase;color:#888;margin-bottom:1rem;">&#128218; Saisonhistorie</h3>
    <div class="season-history-list">
      ${p.seasons.map(s => {
        const kd = calcKD(s.kills, s.deaths);
        return `<div class="season-history-item">
          <div class="season-history-head">
            <span class="season-history-team">${esc(s.teamName)}</span>
            <span class="season-history-name">${esc(s.season||'Unbekannte Saison')}</span>
            ${s.coach ? `<span style="font-size:0.8rem;color:#666">Coach: <span style="color:var(--red-light)">${esc(s.coach)}</span></span>` : ''}
          </div>
          <div class="season-history-stats">
            ${s.games ? `<div class="season-stat"><div class="season-stat-val">${esc(s.games)}</div><div class="season-stat-lbl">Spiele</div></div>` : ''}
            <div class="season-stat"><div class="season-stat-val">${esc(s.kills||'-')}</div><div class="season-stat-lbl">Kills</div></div>
            <div class="season-stat"><div class="season-stat-val">${esc(s.assists||'-')}</div><div class="season-stat-lbl">Assists</div></div>
            <div class="season-stat"><div class="season-stat-val">${esc(s.deaths||'-')}</div><div class="season-stat-lbl">Tode</div></div>
            <div class="season-stat"><div class="season-stat-val" style="color:${kdColor(kd)}">${kd}</div><div class="season-stat-lbl">K/D</div></div>
            ${s.hltv ? `<div class="season-stat"><div class="season-stat-val" style="color:${hltvColor(s.hltv)}">${esc(s.hltv)}</div><div class="season-stat-lbl">HLTV</div></div>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>`;

  document.getElementById('spieler-detail-content').innerHTML = html;
  
}

function closeSpielerDetail() {
  document.getElementById('spieler-detail').style.display = 'none';
  document.getElementById('spieler-list').style.display = '';
}

// Also render member cards clickable linking to spieler detail
function memberCardHTML(p, isStandin) {
  const uid = 'av' + Math.random().toString(36).slice(2,9);
  const borderColor = isStandin ? '#3a3a3a' : 'var(--red)';
  // Check if player has histoire entry
  const players = getSpielerList();
  const hasProfile = players.some(pl => pl.name.toLowerCase() === (p.name||'').toLowerCase());
  const clickAttr = hasProfile ? `onclick="openSpielerFromCard('${esc((p.name||'').replace(/'/g,"\'"))}'); event.stopPropagation();" style="cursor:pointer"` : '';
  const card = `<div class="member-card ${isStandin?'standin':''}" ${clickAttr}>
    <div class="member-avatar" id="${uid}" style="border-color:${borderColor}">${initials(p.name)}</div>
    <div class="member-name">${esc(p.name||'?')}</div>
    ${p.role ? '<div class="member-role">'+esc(p.role)+'</div>' : ''}
    ${hasProfile ? '<div style="font-size:0.7rem;color:var(--red-light);margin-top:4px;letter-spacing:1px">PROFIL ›</div>' : ''}
  </div>`;
  
  return card;
}

function openSpielerFromCard(name) {
  showPage('spieler');
  setTimeout(() => showSpielerDetail(name), 50);
}



// ── MATCHES / COUNTDOWN ────────────────────────────────────
function matchRowHTML(i, m) {
  const teamOptions = state.teams.map(t =>
    `<option value="${esc(t.id)}" ${m.teamId===t.id?'selected':''}>${esc(t.name)}</option>`
  ).join('');
  return `<div class="tbl-row" style="grid-template-columns:1fr 1fr 180px 1fr 32px" id="match-row-${i}">
    <select onchange="updateMatch(${i},'teamId',this.value)" style="background:var(--dark4);border:1px solid #2a2a2a;color:var(--cream);padding:7px 10px;font-family:'Rajdhani',sans-serif;font-size:0.9rem;outline:none;width:100%;">
      <option value="">Team wählen</option>${teamOptions}
    </select>
    <input type="text" placeholder="Gegner" value="${esc(m.opponent||'')}" oninput="updateMatch(${i},'opponent',this.value)">
    <input type="datetime-local" value="${esc(m.date||'')}" oninput="updateMatch(${i},'date',this.value)" style="background:var(--dark4);border:1px solid #2a2a2a;color:var(--cream);padding:7px 10px;font-family:'Rajdhani',sans-serif;font-size:0.9rem;outline:none;width:100%;">
    <input type="text" placeholder="https://twitch.tv/..." value="${esc(m.twitch||'')}" oninput="updateMatch(${i},'twitch',this.value)">
    <button class="del-btn" onclick="delMatch(${i})">&#10005;</button>
  </div>`;
}

function addMatch() {
  if (!state.matches) state.matches = [];
  state.matches.push({teamId:'', opponent:'', date:'', twitch:''});
  const i = state.matches.length - 1;
  document.getElementById('matches-edit').insertAdjacentHTML('beforeend', matchRowHTML(i, state.matches[i]));
  document.getElementById('matches-count-lbl').textContent = state.matches.length + ' Einträge';
}
function updateMatch(i,k,v) {
  if (!state.matches) state.matches = [];
  if (state.matches[i]) { state.matches[i][k] = v; renderMatches(); }
}
function delMatch(i) {
  state.matches.splice(i,1);
  document.getElementById('matches-edit').innerHTML = (state.matches||[]).map((m,j) => matchRowHTML(j,m)).join('');
  document.getElementById('matches-count-lbl').textContent = state.matches.length + ' Einträge';
  renderMatches();
}

function renderMatchesAdmin() {
  if (!state.matches) state.matches = [];
  document.getElementById('matches-edit').innerHTML = state.matches.map((m,i) => matchRowHTML(i,m)).join('');
  document.getElementById('matches-count-lbl').textContent = state.matches.length + ' Einträge';
}

function renderMatches() {
  const now = Date.now();
  const upcoming = (state.matches||[])
    .filter(m => m.date && new Date(m.date).getTime() > now - 3600000) // hide >1h past
    .sort((a,b) => new Date(a.date) - new Date(b.date));

  const sec = document.getElementById('section-matches');
  const el = document.getElementById('matches-display');
  if (!sec || !el) return;

  if (upcoming.length === 0) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';

  el.innerHTML = '<div class="matches-grid">' + upcoming.map(m => {
    const matchTime = new Date(m.date).getTime();
    const diff = matchTime - now;
    const teamName = (state.teams.find(t => t.id === m.teamId)||{name:m.teamId||'BoBo Clan'}).name;
    const uid = 'cd-' + Math.random().toString(36).slice(2,7);

    let countdownHTML;
    if (diff <= 0) {
      countdownHTML = `<div class="match-live">&#9679; LIVE</div>`;
    } else {
      const d = Math.floor(diff/86400000);
      const h = Math.floor((diff%86400000)/3600000);
      const min = Math.floor((diff%3600000)/60000);
      const s = Math.floor((diff%60000)/1000);
      const parts = d > 0 ? `${d}T ${h}h ${min}m` : h > 0 ? `${h}h ${min}m ${s}s` : `${min}m ${s}s`;
      countdownHTML = `<div class="match-countdown" id="${uid}">${parts}</div>`;
    }

    const dateStr = new Date(m.date).toLocaleString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const twitchBtn = m.twitch ? `<a href="${esc(m.twitch)}" target="_blank" rel="noopener" class="match-twitch-btn"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11.6 6H13v4h-1.4V6zm3.8 0H17v4h-1.6V6zM2.1 0L0 5.5V21h6v3h3.4l3-3H17l7-7V0H2.1zm19.5 13-3.4 3.4h-5l-3 3v-3H4.5V2.3h17.1V13z"/></svg> Stream ansehen</a>` : '';

    return `<div class="match-card">
      <div class="match-team">${esc(teamName)}</div>
      <div class="match-center">
        <div class="match-vs">VS</div>
        ${countdownHTML}
        <div class="match-date">${dateStr}</div>
        ${twitchBtn}
      </div>
      <div class="match-opponent">${esc(m.opponent||'?')}</div>
    </div>`;
  }).join('') + '</div>';

  // Start live countdowns
  startCountdowns();
}

let countdownInterval = null;
function startCountdowns() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    const now = Date.now();
    (state.matches||[]).forEach(m => {
      if (!m.date) return;
      const diff = new Date(m.date).getTime() - now;
      // Find countdown element by checking all cd- elements
      document.querySelectorAll('.match-countdown').forEach(el => {
        if (diff <= 0) { el.outerHTML = '<div class="match-live">&#9679; LIVE</div>'; return; }
        const d = Math.floor(diff/86400000);
        const h = Math.floor((diff%86400000)/3600000);
        const min = Math.floor((diff%3600000)/60000);
        const s = Math.floor((diff%60000)/1000);
        el.textContent = d > 0 ? `${d}T ${h}h ${min}m` : h > 0 ? `${h}h ${min}m ${s}s` : `${min}m ${s}s`;
      });
    });
  }, 1000);
}

// ── SPIELERVERGLEICH ───────────────────────────────────────
function switchSpielerTab(tab) {
  document.getElementById('spieler-tab-list').style.display = tab === 'list' ? '' : 'none';
  document.getElementById('spieler-tab-compare').style.display = tab === 'compare' ? '' : 'none';
  document.getElementById('stab-list').classList.toggle('active', tab === 'list');
  document.getElementById('stab-compare').classList.toggle('active', tab === 'compare');
  if (tab === 'compare') populateCompareSelects();
}

function populateCompareSelects() {
  const players = getSpielerList();
  const opts = '<option value="">Spieler wählen...</option>' +
    players.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
  document.getElementById('compare-select-a').innerHTML = opts;
  document.getElementById('compare-select-b').innerHTML = opts;
  document.getElementById('compare-result').innerHTML = '<div class="empty">Wähle zwei Spieler zum Vergleichen</div>';
}

function renderCompare() {
  const nameA = document.getElementById('compare-select-a').value;
  const nameB = document.getElementById('compare-select-b').value;
  if (!nameA || !nameB || nameA === nameB) {
    document.getElementById('compare-result').innerHTML = nameA === nameB && nameA
      ? '<div class="empty">Bitte zwei verschiedene Spieler wählen</div>'
      : '<div class="empty">Wähle zwei Spieler zum Vergleichen</div>';
    return;
  }
  const players = getSpielerList();
  const pA = players.find(p => p.name === nameA);
  const pB = players.find(p => p.name === nameB);
  if (!pA || !pB) return;

  const atA = calcAllTime(pA.seasons);
  const atB = calcAllTime(pB.seasons);

  const stats = [
    { label:'Spiele',   a: parseInt(atA.games)||0,    b: parseInt(atB.games)||0,    higher:true,  fmt:v=>v },
    { label:'Kills',    a: atA.kills||0,               b: atB.kills||0,               higher:true,  fmt:v=>v },
    { label:'Assists',  a: atA.assists||0,             b: atB.assists||0,             higher:true,  fmt:v=>v },
    { label:'Tode',     a: atA.deaths||0,              b: atB.deaths||0,              higher:false, fmt:v=>v },
    { label:'K/D',      a: parseFloat(atA.kd)||0,      b: parseFloat(atB.kd)||0,      higher:true,  fmt:v=>isNaN(v)||v===0?'-':v.toFixed(2) },
    { label:'HLTV Ø',  a: parseFloat(atA.hltv)||0,    b: parseFloat(atB.hltv)||0,    higher:true,  fmt:v=>isNaN(v)||v===0?'-':v.toFixed(2) },
    { label:'Saisonen', a: pA.seasons.length,          b: pB.seasons.length,          higher:true,  fmt:v=>v },
  ];

  function headerHTML(p, side) {
    const uid = 'cmp-av-' + side + Math.random().toString(36).slice(2,5);
    const align = side === 'b' ? 'flex-direction:row-reverse;text-align:right' : '';
    const h = `<div class="compare-header" style="${align}">
      <div class="compare-header-avatar" id="${uid}">${initials(p.name)}</div>
      <div>
        <div class="compare-header-name">${esc(p.name)}</div>
        <div class="compare-header-teams">${esc([...new Set(p.seasons.map(s=>s.teamName))].join(' · '))}</div>
      </div>
    </div>`;
    
    return h;
  }

  const rows = stats.map(s => {
    const aWins = s.higher ? s.a > s.b : s.a < s.b;
    const bWins = s.higher ? s.b > s.a : s.b < s.a;
    const aClass = aWins ? 'winner' : bWins ? 'loser' : '';
    const bClass = bWins ? 'winner' : aWins ? 'loser' : '';
    return `<tr class="stat-row">
      <td class="${aClass}" style="text-align:right">${s.fmt(s.a)}</td>
      <td class="stat-label">${s.label}</td>
      <td class="${bClass}">${s.fmt(s.b)}</td>
    </tr>`;
  }).join('');

  document.getElementById('compare-result').innerHTML = `
    <div class="compare-grid">
      ${headerHTML(pA,'a')}
      <div style="display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-size:1.2rem;color:#555;letter-spacing:3px;">VS</div>
      ${headerHTML(pB,'b')}
    </div>
    <table class="compare-table" style="margin-top:1rem;background:var(--dark3);border:1px solid #2a2a2a;">
      ${rows}
    </table>`;
}

// ── SEARCH ─────────────────────────────────────────────────
function filterSpieler(q) {
  const term = q.toLowerCase().trim();
  document.querySelectorAll('#spieler-list .spieler-card').forEach(card => {
    const name = card.querySelector('.spieler-name')?.textContent.toLowerCase() || '';
    const teams = card.querySelector('.spieler-teams')?.textContent.toLowerCase() || '';
    card.style.display = (!term || name.includes(term) || teams.includes(term)) ? '' : 'none';
  });
}

function filterHistoire(q) {
  const term = q.toLowerCase().trim();
  document.querySelectorAll('#hist-panels .season-card').forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = (!term || text.includes(term)) ? '' : 'none';
  });
  // Also filter tabs – show/hide panels based on whether they have visible seasons
  document.querySelectorAll('#hist-panels .hist-panel').forEach(panel => {
    const visible = [...panel.querySelectorAll('.season-card')].some(c => c.style.display !== 'none');
    const tid = panel.id.replace('hpanel-','');
    const tab = document.getElementById('htab-'+tid);
    if (tab) tab.style.display = (!term || visible) ? '' : 'none';
  });
}

// ── Load from GitHub ───────────────────────────────────────
async function loadFromGitHub() {
  try {
    // Use GitHub API instead of raw.githubusercontent.com to avoid caching
    const res = await fetch(
      `https://api.github.com/repos/${GH_USER}/${GH_REPO}/contents/${GH_FILE}?ref=${GH_BRANCH}&t=${Date.now()}`,
      { headers: { Accept: 'application/vnd.github.v3+json' } }
    );
    if (res.ok) {
      const meta = await res.json();
      // Content is base64-encoded
      const decoded = decodeURIComponent(escape(atob(meta.content.replace(/\n/g, ''))));
      const data = JSON.parse(decoded);
      if (data.teams && Array.isArray(data.teams)) {
        state.teams = data.teams.map(t => Object.assign({id:'',name:'',coach:'',dachcs:'',players:[],results:[]}, t));
      }
      if (data.histoire && Array.isArray(data.histoire)) {
        state.histoire = data.histoire.map(t => Object.assign({id:'',name:'',seasons:[]}, t));
      }
      if (data.news) state.news = data.news;
      if (data.matches) state.matches = data.matches;
    }
  } catch(e) {
    // Fallback to raw if API fails
    try {
      const res2 = await fetch(`https://raw.githubusercontent.com/${GH_USER}/${GH_REPO}/${GH_BRANCH}/${GH_FILE}?t=${Date.now()}`);
      if (res2.ok) {
        const data = await res2.json();
        if (data.teams && Array.isArray(data.teams)) {
          state.teams = data.teams.map(t => Object.assign({id:'',name:'',coach:'',dachcs:'',players:[],results:[]}, t));
        }
        if (data.histoire && Array.isArray(data.histoire)) {
          state.histoire = data.histoire.map(t => Object.assign({id:'',name:'',seasons:[]}, t));
        }
        if (data.news) state.news = data.news;
      if (data.matches) state.matches = data.matches;
      }
    } catch(e2) {}
  }
  renderPublic();
  // If user already navigated to histoire/spieler before data loaded, re-render
  const ph = document.getElementById('pub-histoire');
  const ps = document.getElementById('pub-spieler');
  if (ph && ph.style.display !== 'none') renderHistoire();
  if (ps && ps.style.display !== 'none') renderSpielerList();
}

// ── Public UI switching ────────────────────────────────────
function switchTeam(id) {
  document.querySelectorAll('#teams .team-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('#teams .tab-btn').forEach(b=>b.classList.remove('active'));
  const panel = document.getElementById('panel-'+id);
  const tab = document.getElementById('tab-'+id);
  if(panel) panel.classList.add('active');
  if(tab) tab.classList.add('active');
}
function switchResults(id) {
  document.querySelectorAll('#ergebnisse .team-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('#ergebnisse .tab-btn').forEach(b=>b.classList.remove('active'));
  const panel = document.getElementById('rpanel-'+id);
  const tab = document.getElementById('rtab-'+id);
  if(panel) panel.classList.add('active');
  if(tab) tab.classList.add('active');
}
function scrollToTeam(id) {
  switchTeam(id);
  document.getElementById('teams').scrollIntoView({behavior:'smooth'});
}

loadFromGitHub();