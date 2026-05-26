// ── Config ─────────────────────────────────────────────────
const GH_USER = 'BoBoClanCs';
const GH_REPO = 'BoBoClan-Website';
const GH_FILE = 'data.json';
const GH_BRANCH = 'main';
const DEFAULT_DISCORD = 'https://discord.gg/bobo';
// Shared write token for coaches/players (Fine-grained: Contents Write only)
// Replace with your Fine-grained GitHub token
const GH_SHARED_TOKEN = '';

// ── State ──────────────────────────────────────────────────
let state = {
  users: [],
  spielerProfiles: [],
  teamData: {},
  teams: [
    {id:'boot',name:'BoBoBoot',coach:'',dachcs:'',players:[],results:[]},
    {id:'rage',name:'BoBoRage',coach:'',dachcs:'',players:[],results:[]}
  ],
  matches: [],
  histoire: [
    {id:'boot',name:'BoBoBoot',seasons:[]},
    {id:'rage',name:'BoBoRage',seasons:[]}
  ],
  news: [],
  discordLink: ''
};
let currentUser = null;
let countdownInterval = null;
let _steamQueue = [];
let _steamRunning = false;
let _todosCount = {};

// ── Helpers ────────────────────────────────────────────────
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function initials(n){return (n||'?').split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2);}
function teamById(id){return state.teams.find(t=>t.id===id);}
function histById(id){return state.histoire.find(t=>t.id===id);}
function genId(){return 'team_'+Math.random().toString(36).slice(2,7);}
function calcKD(k,d){const kn=parseFloat(k),dn=parseFloat(d);if(isNaN(kn)||isNaN(dn)||dn===0)return kn>0?kn.toFixed(2):'-';return (kn/dn).toFixed(2);}
function hltvClass(v){const n=parseFloat(v);if(isNaN(n))return '';return n>=1.15?'hltv-good':n>=0.95?'hltv-avg':'hltv-bad';}
function toggleSeason(head){head.nextElementSibling.classList.toggle('open');head.querySelector('.season-toggle').classList.toggle('open');}

// ── Role Helpers ───────────────────────────────────────────
function getDiscordLink(){return state.discordLink||DEFAULT_DISCORD;}
function updateDiscordLinks(){
  document.querySelectorAll('.discord-invite-btn').forEach(a=>{a.href=getDiscordLink();});
  const inp=document.getElementById('discord-link-input');
  if(inp)inp.value=state.discordLink||'';
}
function saveDiscordLink(){
  const val=(document.getElementById('discord-link-input').value||'').trim();
  state.discordLink=val;
  updateDiscordLinks();
}

function getRoleLabel(role){
  if(!role||role==='none')return '';
  if(role==='admin')return 'Admin';
  if(role==='pending')return 'Ausstehend';
  const m=role.match(/^(coach|player)_(.+)$/);
  if(!m)return role;
  const type=m[1]==='coach'?'Coach':'Spieler';
  const team=state.teams.find(t=>t.id===m[2]);
  return type+' '+(team?team.name:m[2]);
}
function getRoleColor(role){
  if(role==='admin')return 'var(--red-light)';
  if(role==='pending')return '#f39c12';
  if(role&&role.startsWith('coach_'))return '#3498db';
  return '#888';
}
function isAdmin(){return currentUser&&currentUser.role==='admin';}
function isCoachOf(teamId){return isAdmin()||(currentUser&&currentUser.role==='coach_'+teamId);}
function isPlayerOf(teamId){return isAdmin()||isCoachOf(teamId)||(currentUser&&currentUser.role==='player_'+teamId);}
function getMyTeamId(){
  if(!currentUser)return null;
  const r=currentUser.role;
  if(!r||r==='admin'||r==='none'||r==='pending')return null;
  const m=r.match(/^(?:coach|player)_(.+)$/);
  return m?m[1]:null;
}
function getTeamData(teamId){
  if(!state.teamData)state.teamData={};
  if(!state.teamData[teamId])state.teamData[teamId]={tactics:[],training:[]};
  return state.teamData[teamId];
}
function buildRoleOptions(currentRole){
  const opts=[{v:'none',l:'Keine Rolle'},{v:'admin',l:'Admin'}];
  state.teams.forEach(t=>{
    opts.push({v:'coach_'+t.id,l:'Coach '+t.name});
    opts.push({v:'player_'+t.id,l:'Spieler '+t.name});
  });
  return opts.map(o=>'<option value="'+o.v+'" '+(currentRole===o.v?'selected':'')+'>'+o.l+'</option>').join('');
}

// ── GitHub Token ───────────────────────────────────────────
function getToken(){
  const local=localStorage.getItem('bobo_gh_token');
  if(local)return local;
  // Try shared token from state (set by admin on their device)
  if(state._t){try{return atob(state._t).split('').reverse().join('');}catch(e){}}
  return '';
}
function saveToken(){
  const t=document.getElementById('gh-token-input').value.trim();
  if(!t||t.startsWith('•'))return;
  localStorage.setItem('bobo_gh_token',t);
  document.getElementById('token-status').className='token-status ok';
  document.getElementById('token-status').textContent='✓ Token gespeichert';
}

// ── SHA-256 ────────────────────────────────────────────────
async function sha256(str){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ── Auth ───────────────────────────────────────────────────
async function authLogin(name,password){
  const hash=await sha256(password);
  return (state.users||[]).find(u=>u.name.trim().toLowerCase()===name.trim().toLowerCase()&&u.hash===hash)||null;
}
function setCurrentUser(user){
  currentUser=user;
  localStorage.setItem('bobo_session',JSON.stringify(user));
  updateAuthUI();
}
function logout(){
  currentUser=null;
  localStorage.removeItem('bobo_session');
  closeAdmin();
  updateAuthUI();
  showPage('home');
}
function restoreSession(){
  try{const s=localStorage.getItem('bobo_session');if(s)currentUser=JSON.parse(s);}catch(e){currentUser=null;}
}

// ── Invite System ──────────────────────────────────────────
function generateInviteLink(){
  const token=getToken();
  if(!token){alert('Kein GitHub Token. Bitte erst Token eintragen.');return;}
  const expires=Date.now()+7*24*60*60*1000;
  const payload=btoa(JSON.stringify({t:token,e:expires}));
  const url=window.location.origin+window.location.pathname+'?invite='+payload;
  const el=document.getElementById('invite-link-output');
  if(el){el.value=url;el.style.display='block';el.select();try{document.execCommand('copy');}catch(e){}}
  const st=document.getElementById('invite-link-status');
  if(st){st.textContent='✓ Link kopiert! Gültig für 7 Tage.';st.style.display='block';}
}
function checkInviteParam(){
  const params=new URLSearchParams(window.location.search);
  const invite=params.get('invite');
  if(!invite)return;
  try{
    const payload=JSON.parse(atob(invite));
    if(!payload.t||!payload.e)return;
    if(Date.now()>payload.e){alert('Einladungslink abgelaufen.');return;}
    sessionStorage.setItem('bobo_invite_token',payload.t);
    sessionStorage.setItem('bobo_invite_expires',payload.e);
    window.history.replaceState({},'',window.location.pathname);
    openLoginOverlay();
    switchLoginTab('register');
    const n=document.getElementById('reg-invite-notice');
    if(n)n.style.display='block';
  }catch(e){}
}
function getRegistrationToken(){
  const t=sessionStorage.getItem('bobo_invite_token');
  const e=sessionStorage.getItem('bobo_invite_expires');
  if(t&&e&&Date.now()<parseInt(e))return t;
  return getToken();
}

// ── Login UI ───────────────────────────────────────────────
function updateAuthUI(){
  const btn=document.getElementById('admin-toggle-btn');
  const logoutBtn=document.getElementById('logout-btn');
  const loginBtn=document.getElementById('login-btn');
  const userLabel=document.getElementById('user-label');
  const teamAreaBtn=document.getElementById('team-area-btn');
  if(currentUser){
    if(btn)btn.style.display=currentUser.role==='admin'?'block':'none';
    if(logoutBtn)logoutBtn.style.display='block';
    if(loginBtn)loginBtn.style.display='none';
    if(userLabel){userLabel.textContent=currentUser.name+(getRoleLabel(currentUser.role)?' ('+getRoleLabel(currentUser.role)+')':'');userLabel.style.display='block';}
    const teamId=getMyTeamId();
    const hasTeamRole=isAdmin()||teamId;
    if(teamAreaBtn){
      teamAreaBtn.style.display=hasTeamRole?'block':'none';
      if(teamId){const team=state.teams.find(t=>t.id===teamId);teamAreaBtn.textContent='🔒 '+(team?team.name:teamId);}
      else if(isAdmin())teamAreaBtn.textContent='🔒 Teams';
    }
  }else{
    if(btn)btn.style.display='none';
    if(logoutBtn)logoutBtn.style.display='none';
    if(loginBtn)loginBtn.style.display='block';
    if(userLabel)userLabel.style.display='none';
    if(teamAreaBtn)teamAreaBtn.style.display='none';
  }
}
function openLoginOverlay(){
  document.getElementById('login-overlay').style.display='flex';
  setTimeout(()=>document.getElementById('login-name-input').focus(),100);
}
function closeLoginOverlay(){
  document.getElementById('login-overlay').style.display='none';
  document.getElementById('login-name-input').value='';
  document.getElementById('login-pw-input').value='';
  document.getElementById('login-err').style.display='none';
}
function switchLoginTab(tab){
  ['login','register'].forEach(t=>{
    const tb=document.getElementById('login-overlay-tab-'+t);
    const p=document.getElementById('login-panel-'+t);
    if(tb)tb.classList.toggle('active',t===tab);
    if(p)p.style.display=t===tab?'block':'none';
  });
  ['login-err','reg-err','reg-success'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
}
async function doLogin(){
  const name=document.getElementById('login-name-input').value.trim();
  const pw=document.getElementById('login-pw-input').value;
  if(!name||!pw)return;
  const btn=document.getElementById('login-submit-btn');
  btn.textContent='...';btn.disabled=true;
  const user=await authLogin(name,pw);
  btn.textContent='Einloggen';btn.disabled=false;
  if(user){
    closeLoginOverlay();
    setCurrentUser({name:user.name,role:user.role});
    if(user.role==='admin')openAdminPanel();
    else{openPlayerPanel();}
  }else{
    document.getElementById('login-err').textContent='Falscher Name oder Passwort.';
    document.getElementById('login-err').style.display='block';
  }
}
async function doRegister(){
  const name=document.getElementById('reg-name-input').value.trim();
  const pw=document.getElementById('reg-pw-input').value;
  const pw2=document.getElementById('reg-pw2-input').value;
  const errEl=document.getElementById('reg-err');
  errEl.style.display='none';
  if(!name||!pw){errEl.textContent='Name und Passwort erforderlich.';errEl.style.display='block';return;}
  if(pw!==pw2){errEl.textContent='Passwörter stimmen nicht überein.';errEl.style.display='block';return;}
  if(!state.users)state.users=[];
  if(state.users.find(u=>u.name.toLowerCase()===name.toLowerCase())){errEl.textContent='Benutzername bereits vergeben.';errEl.style.display='block';return;}
  const regToken=getRegistrationToken();
  if(!regToken){errEl.textContent='Kein gültiger Einladungslink. Bitte Admin kontaktieren.';errEl.style.display='block';return;}
  const btn=document.getElementById('reg-submit-btn');
  btn.textContent='...';btn.disabled=true;
  const hash=await sha256(pw);
  state.users.push({name,hash,role:'none'});
  await saveAllWithToken(regToken);
  sessionStorage.removeItem('bobo_invite_token');
  sessionStorage.removeItem('bobo_invite_expires');
  btn.textContent='Registrieren';btn.disabled=false;
  document.getElementById('reg-name-input').value='';
  document.getElementById('reg-pw-input').value='';
  document.getElementById('reg-pw2-input').value='';
  document.getElementById('reg-success').style.display='block';
  setTimeout(()=>{document.getElementById('reg-success').style.display='none';switchLoginTab('login');},3000);
}

// ── Player Panel ───────────────────────────────────────────
function openPlayerPanel(){
  document.getElementById('player-panel').style.display='flex';
  const profile=(state.spielerProfiles||[]).find(p=>p.name.trim().toLowerCase()===currentUser.name.trim().toLowerCase());
  const roleLabel=getRoleLabel(currentUser.role);
  document.getElementById('player-panel-name').textContent=currentUser.name;
  const roleEl=document.getElementById('player-panel-role');
  if(roleEl){roleEl.textContent=roleLabel||'';roleEl.style.display=roleLabel?'block':'none';}
  document.getElementById('player-steam-input').value=profile?profile.steam||'':'';
  document.getElementById('player-discord-input').value=profile?profile.discord||'':'';
  document.getElementById('player-bio-input').value=profile?profile.bio||'':'';
  document.getElementById('player-faceit-input').value=profile?profile.faceit||'':'';
  // Token field
  const tokEl=document.getElementById('player-token-input');
  if(tokEl){
    const t=localStorage.getItem('bobo_gh_token');
    tokEl.value=t?'••••••••••••••••':'';
    tokEl.placeholder=t?'Token gespeichert':'Token eintragen...';
  }
  // Show team button if has team role
  const teamId=getMyTeamId();
  const teamBtn=document.getElementById('player-panel-team-btn');
  if(teamBtn){
    if(teamId||isAdmin()){
      const team=state.teams.find(t=>t.id===teamId);
      teamBtn.style.display='block';
      teamBtn.textContent='🔒 '+(team?team.name:'Teams')+' öffnen';
    } else {
      teamBtn.style.display='none';
    }
  }
}

function savePlayerToken(){
  const tokEl=document.getElementById('player-token-input');
  if(!tokEl)return;
  const val=tokEl.value.trim();
  if(!val||val.startsWith('•'))return;
  localStorage.setItem('bobo_gh_token',val);
  tokEl.value='••••••••••••••••';
  tokEl.placeholder='Token gespeichert';
  document.getElementById('player-token-status').textContent='✓ Token gespeichert';
  document.getElementById('player-token-status').style.display='block';
  setTimeout(()=>{
    const s=document.getElementById('player-token-status');
    if(s)s.style.display='none';
  },3000);
}

function closePlayerPanel(){document.getElementById('player-panel').style.display='none';}
async function savePlayerProfile(){
  if(!currentUser)return;
  const steam=(document.getElementById('player-steam-input').value||'').trim();
  const discord=(document.getElementById('player-discord-input').value||'').trim();
  const bio=(document.getElementById('player-bio-input').value||'').trim();
  const faceit=(document.getElementById('player-faceit-input').value||'').trim();
  if(!state.spielerProfiles)state.spielerProfiles=[];
  const existing=state.spielerProfiles.find(p=>p.name.trim().toLowerCase()===currentUser.name.trim().toLowerCase());
  if(existing){existing.steam=steam;existing.discord=discord;existing.bio=bio;existing.faceit=faceit;}
  else{state.spielerProfiles.push({name:currentUser.name,steam,discord,bio:'',faceit:''});}
  localStorage.removeItem('bobo_av_'+currentUser.name.trim().toLowerCase().replace(/\s+/g,'_'));
  const btn=document.getElementById('player-save-btn');
  btn.textContent='Wird gespeichert...';btn.disabled=true;
  await saveAll();
  btn.textContent='✓ Gespeichert!';
  setTimeout(()=>{btn.textContent='Speichern';btn.disabled=false;closePlayerPanel();},1500);
  renderPublic();
}
async function saveAdminProfile(){
  if(!currentUser)return;
  const steamEl=document.getElementById('admin-steam-input');
  const discordEl=document.getElementById('admin-discord-input');
  const steam=steamEl?steamEl.value.trim():'';
  const discord=discordEl?discordEl.value.trim():'';
  const bioEl=document.getElementById('admin-bio-input');
  const faceitEl=document.getElementById('admin-faceit-input');
  const bio=bioEl?bioEl.value.trim():'';
  const faceit=faceitEl?faceitEl.value.trim():'';
  if(!state.spielerProfiles)state.spielerProfiles=[];
  const existing=state.spielerProfiles.find(p=>p.name.trim().toLowerCase()===currentUser.name.trim().toLowerCase());
  if(existing){existing.steam=steam;existing.discord=discord;existing.bio=bio;existing.faceit=faceit;}
  else{state.spielerProfiles.push({name:currentUser.name,steam,discord,bio:'',faceit:''});}
  localStorage.removeItem('bobo_av_'+currentUser.name.trim().toLowerCase().replace(/\s+/g,'_'));
  const btn=document.getElementById('admin-profile-save-btn');
  if(btn){btn.textContent='Wird gespeichert...';btn.disabled=true;}
  await saveAll();
  if(btn){btn.textContent='✓ Gespeichert!';setTimeout(()=>{btn.textContent='Speichern';btn.disabled=false;},2000);}
  renderPublic();
}

// ── Users Admin ────────────────────────────────────────────
function renderUsersAdmin(){
  const el=document.getElementById('users-admin-list');
  if(!el)return;
  if(!state.users)state.users=[];
  el.innerHTML=state.users.length===0
    ?'<div class="empty">Noch keine registrierten Benutzer</div>'
    :state.users.map((u,i)=>`<div class="tbl-row" style="grid-template-columns:1fr 1fr 32px;margin-bottom:0.4rem;align-items:center;">
<span style="font-family:'Oswald',sans-serif;color:var(--cream);padding:0 8px;">${esc(u.name)}</span>
<select onchange="changeRole(${i},this.value)" style="background:var(--dark4);border:1px solid #2a2a2a;color:var(--cream);padding:6px 10px;font-family:'Rajdhani',sans-serif;font-size:0.9rem;outline:none;">
<option value="none" ${u.role==='none'?'selected':''}>Keine Rolle</option>
${buildRoleOptions(u.role)}
</select>
<button class="del-btn" onclick="delUser(${i})">&#10005;</button>
</div>`).join('');
  const cnt=document.getElementById('users-count');
  if(cnt)cnt.textContent=state.users.length+' Benutzer';
}
function changeRole(i,role){
  state.users[i].role=role;
  // Update own session immediately if it's the current user
  if(currentUser&&state.users[i].name===currentUser.name){
    currentUser.role=role;
    localStorage.setItem('bobo_session',JSON.stringify(currentUser));
    updateAuthUI();
    if(role!=='admin'){
      const ap=document.getElementById('admin-panel');
      if(ap&&ap.style.display!=='none')closeAdmin();
    }
  }
}
function delUser(i){if(!confirm('Benutzer löschen?'))return;state.users.splice(i,1);renderUsersAdmin();}
async function changePlayerPassword(){
  if(!currentUser)return;
  const oldPw=document.getElementById('player-old-pw')?.value;
  const newPw=document.getElementById('player-new-pw')?.value;
  if(!oldPw||!newPw)return;
  const oldHash=await sha256(oldPw);
  const user=(state.users||[]).find(u=>u.name.toLowerCase()===currentUser.name.toLowerCase()&&u.hash===oldHash);
  if(!user){alert('Altes Passwort falsch');return;}
  user.hash=await sha256(newPw);
  await saveAll();
  alert('Passwort geändert!');
}

// ── Admin Panel ────────────────────────────────────────────
function openAdmin(){
  if(currentUser&&currentUser.role==='admin')openAdminPanel();
  else openLoginOverlay();
}
function openAdminPanel(){
  const ap=document.getElementById('admin-panel');
  ap.style.display='flex';
  document.getElementById('admin-toggle-btn').classList.add('active');
  const tok=getToken();
  if(tok){document.getElementById('gh-token-input').value='••••••••••••••••';document.getElementById('token-status').className='token-status ok';document.getElementById('token-status').textContent='✓ Token vorhanden';}
  if(currentUser){
    const profile=(state.spielerProfiles||[]).find(p=>p.name.trim().toLowerCase()===currentUser.name.trim().toLowerCase());
    const steamEl=document.getElementById('admin-steam-input');
    const discordEl=document.getElementById('admin-discord-input');
    if(steamEl)steamEl.value=profile?profile.steam||'':'';
    if(discordEl)discordEl.value=profile?profile.discord||'':'';
    const bioEl2=document.getElementById('admin-bio-input');
    const faceitEl2=document.getElementById('admin-faceit-input');
    if(bioEl2)bioEl2.value=profile?profile.bio||'':'';
    if(faceitEl2)faceitEl2.value=profile?profile.faceit||'':'';
    const nameEl=document.getElementById('admin-profile-name');
    if(nameEl)nameEl.textContent=currentUser.name;
  }
  rebuildAdminSidebar();
  rebuildTeamPages();
  refreshAllAdminForms();
  renderHistoireAdminPage();
  renderUsersAdmin();
  renderSpielerProfilesAdmin();
  renderMatchesAdmin();
  showAdminPage('page-settings');
}
function closeAdmin(){
  document.getElementById('admin-panel').style.display='none';
  document.getElementById('admin-toggle-btn').classList.remove('active');
}
function showAdminPage(id){
  document.querySelectorAll('.admin-page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(b=>b.classList.remove('active'));
  const page=document.getElementById(id);
  if(page)page.classList.add('active');
  document.querySelectorAll('.admin-nav-item[data-page="'+id+'"]').forEach(b=>b.classList.add('active'));
  if(id==='page-histoire')renderHistoireAdminPage();
  if(id==='page-news'){document.getElementById('news-edit').innerHTML=state.news.map((n,i)=>newsRowHTML(i,n)).join('');const l=document.getElementById('news-count-lbl');if(l)l.textContent=state.news.length+' Einträge';}
  if(id==='page-users')renderUsersAdmin();
  if(id==='page-spieler-profiles')renderSpielerProfilesAdmin();
  if(id==='page-matches')renderMatchesAdmin();
}
function toggleCard(head){
  const body=head.nextElementSibling;
  const arrow=head.querySelector('.admin-card-arrow');
  body.classList.toggle('open');
  if(arrow)arrow.classList.toggle('open');
}
function refreshAdminIfOpen(){
  const panel=document.getElementById('admin-panel');
  if(!panel||panel.style.display==='none')return;
  const activePage=document.querySelector('.admin-page.active');
  if(!activePage)return;
  const id=activePage.id;
  if(id==='page-histoire')renderHistoireAdminPage();
  if(id==='page-news')refreshAllAdminForms();
  if(id==='page-teams')renderTeamMgmtList();
  if(id==='page-users')renderUsersAdmin();
  if(id==='page-spieler-profiles')renderSpielerProfilesAdmin();
  if(id==='page-matches')renderMatchesAdmin();
  rebuildAdminSidebar();
  rebuildTeamPages();
}
function refreshAllAdminForms(){
  document.getElementById('news-edit').innerHTML=state.news.map((n,i)=>newsRowHTML(i,n)).join('');
  const l=document.getElementById('news-count-lbl');
  if(l)l.textContent=state.news.length+' Einträge';
}

// ── Sidebar & Teams ────────────────────────────────────────
function rebuildAdminSidebar(){
  const container=document.getElementById('sidebar-team-links');
  if(!container)return;
  container.innerHTML='<span class="admin-sidebar-label">Kader &amp; Ergebnisse</span>'+
    state.teams.map(t=>'<button class="admin-nav-item" data-page="page-team-'+t.id+'" onclick="showAdminPage(\'page-team-'+t.id+'\')">'+esc(t.name)+'</button>').join('');
  const lbl=document.getElementById('teams-count-label');
  if(lbl)lbl.textContent=state.teams.length+' Teams';
  const nl=document.getElementById('news-count-lbl');
  if(nl)nl.textContent=state.news.length+' Einträge';
}
function renderTeamMgmtList(){
  const el=document.getElementById('team-mgmt-list');
  if(!el)return;
  el.innerHTML=state.teams.map((t,i)=>`<div class="team-mgmt-item">
<span class="team-id-badge">#${i+1}</span>
<input type="text" value="${esc(t.name)}" placeholder="Teamname" oninput="renameTeam('${t.id}',this.value)">
<button class="del-btn" onclick="deleteTeam('${t.id}')" title="Löschen">&#128465;</button>
</div>`).join('');
}
function addTeam(){
  const id=genId();
  state.teams.push({id,name:'Neues Team',coach:'',dachcs:'',players:[],results:[]});
  renderTeamMgmtList();rebuildAdminSidebar();rebuildTeamPages();renderPublic();
}
function renameTeam(id,name){const t=teamById(id);if(t){t.name=name;rebuildAdminSidebar();renderPublic();}}
function deleteTeam(id){
  if(!confirm('Team löschen? Kader und Ergebnisse werden gelöscht. Historie bleibt.'))return;
  state.teams=state.teams.filter(t=>t.id!==id);
  renderTeamMgmtList();rebuildAdminSidebar();rebuildTeamPages();renderPublic();
}
function rebuildTeamPages(){
  const container=document.getElementById('team-pages-container');
  if(!container)return;
  container.innerHTML=state.teams.map(t=>teamPageHTML(t)).join('');
  renderTeamMgmtList();
  state.teams.forEach(t=>{
    const ci=document.getElementById('coach-'+t.id);
    const di=document.getElementById('dachcs-'+t.id);
    if(ci)ci.addEventListener('input',()=>{t.coach=ci.value;renderPublic();});
    if(di)di.addEventListener('input',()=>{t.dachcs=di.value;updateDachcsLinks();});
  });
}
function teamPageHTML(t){
  return `<div class="admin-page" id="page-team-${t.id}">
<div class="admin-card"><div class="admin-card-head" onclick="toggleCard(this)"><div class="admin-card-title">${esc(t.name)} – Info</div><div class="admin-card-arrow open">&#9660;</div></div>
<div class="admin-card-body open">
<div class="field-row"><label>Coach</label><input type="text" id="coach-${t.id}" value="${esc(t.coach)}" placeholder="Coach"></div>
<div class="field-row"><label>DachCS</label><input type="text" id="dachcs-${t.id}" value="${esc(t.dachcs)}" placeholder="https://www.dachcs.de/..."></div>
</div></div>
<div class="admin-card"><div class="admin-card-head" onclick="toggleCard(this)"><div class="admin-card-title">Kader</div><div class="admin-card-subtitle">${t.players.length} Spieler</div><div class="admin-card-arrow">&#9660;</div></div>
<div class="admin-card-body">
<div class="tbl-editor-head tbl-row grid-player"><span>Name</span><span>Rolle</span><span>Steam-URL</span><span>Typ</span><span></span></div>
<div id="players-${t.id}">${t.players.map((p,i)=>playerRowHTML(t.id,i,p)).join('')}</div>
<button class="tbl-add-btn" onclick="addPlayer('${t.id}')">+ Spieler</button>
</div></div>
<div class="admin-card"><div class="admin-card-head" onclick="toggleCard(this)"><div class="admin-card-title">Ergebnisse</div><div class="admin-card-subtitle">${t.results.length} Einträge</div><div class="admin-card-arrow">&#9660;</div></div>
<div class="admin-card-body">
<div class="tbl-editor-head tbl-row grid-result"><span>Gegner</span><span>Wir</span><span>Sie</span><span>Map</span><span>Ergebnis</span><span></span></div>
<div id="results-${t.id}">${t.results.map((r,i)=>resultRowHTML(t.id,i,r)).join('')}</div>
<button class="tbl-add-btn" onclick="addResult('${t.id}')">+ Ergebnis</button>
</div></div>
</div>`;
}
function playerRowHTML(tid,i,p){return `<div class="tbl-row grid-player">
<input type="text" placeholder="Name" value="${esc(p.name)}" oninput="updatePlayer('${tid}',${i},'name',this.value)">
<input type="text" placeholder="Rolle" value="${esc(p.role)}" oninput="updatePlayer('${tid}',${i},'role',this.value)">
<input type="text" placeholder="https://steamcommunity.com/id/..." value="${esc(p.steam||'')}" oninput="updatePlayer('${tid}',${i},'steam',this.value)">
<select onchange="updatePlayer('${tid}',${i},'type',this.value)">
<option value="main" ${(p.type||'main')==='main'?'selected':''}>Stammspieler</option>
<option value="standin" ${p.type==='standin'?'selected':''}>Stand-in</option>
</select>
<button class="del-btn" onclick="delPlayer('${tid}',${i})">&#10005;</button>
</div>`;}
function resultRowHTML(tid,i,r){return `<div class="tbl-row grid-result">
<input type="text" placeholder="Gegner" value="${esc(r.opp)}" oninput="updateResult('${tid}',${i},'opp',this.value)">
<input type="number" placeholder="16" value="${esc(r.s1)}" oninput="updateResult('${tid}',${i},'s1',this.value)">
<input type="number" placeholder="8" value="${esc(r.s2)}" oninput="updateResult('${tid}',${i},'s2',this.value)">
<input type="text" placeholder="Mirage" value="${esc(r.map)}" oninput="updateResult('${tid}',${i},'map',this.value)">
<select onchange="updateResult('${tid}',${i},'res',this.value)">
<option value="win" ${r.res==='win'?'selected':''}>Sieg</option>
<option value="loss" ${r.res==='loss'?'selected':''}>Niederlage</option>
<option value="draw" ${(r.res||'draw')==='draw'?'selected':''}>Unentschieden</option>
</select>
<button class="del-btn" onclick="delResult('${tid}',${i})">&#10005;</button>
</div>`;}
function newsRowHTML(i,n){return `<div class="tbl-row grid-news">
<input type="text" placeholder="Mai 2025" value="${esc(n.date)}" oninput="updateNews(${i},'date',this.value)">
<input type="text" placeholder="Titel" value="${esc(n.title)}" oninput="updateNews(${i},'title',this.value)">
<textarea class="news-textarea" oninput="updateNews(${i},'text',this.value)">${esc(n.text)}</textarea>
<button class="del-btn" onclick="delNews(${i})">&#10005;</button>
</div>`;}
function updatePlayer(tid,i,k,v){const t=teamById(tid);if(t){t.players[i][k]=v;renderPublic();}}
function updateResult(tid,i,k,v){const t=teamById(tid);if(t){t.results[i][k]=v;renderPublic();}}
function updateNews(i,k,v){state.news[i][k]=v;renderPublic();}
function addPlayer(tid){const t=teamById(tid);if(!t)return;t.players.push({name:'',role:'',steam:'',type:'main'});document.getElementById('players-'+tid).innerHTML=t.players.map((p,i)=>playerRowHTML(tid,i,p)).join('');}
function delPlayer(tid,i){const t=teamById(tid);if(!t)return;t.players.splice(i,1);document.getElementById('players-'+tid).innerHTML=t.players.map((p,j)=>playerRowHTML(tid,j,p)).join('');renderPublic();}
function addResult(tid){const t=teamById(tid);if(!t)return;t.results.push({opp:'',s1:'',s2:'',map:'',res:'win'});document.getElementById('results-'+tid).innerHTML=t.results.map((r,i)=>resultRowHTML(tid,i,r)).join('');}
function delResult(tid,i){const t=teamById(tid);if(!t)return;t.results.splice(i,1);document.getElementById('results-'+tid).innerHTML=t.results.map((r,j)=>resultRowHTML(tid,j,r)).join('');renderPublic();}
function addNews(){state.news.push({date:'',title:'',text:''});const i=state.news.length-1;document.getElementById('news-edit').insertAdjacentHTML('beforeend',newsRowHTML(i,state.news[i]));}
function delNews(i){state.news.splice(i,1);document.getElementById('news-edit').innerHTML=state.news.map((n,j)=>newsRowHTML(j,n)).join('');renderPublic();}
function updateCardSubtitle(tid,type){const t=teamById(tid);if(!t)return;const page=document.getElementById('page-team-'+tid);if(!page)return;const cards=page.querySelectorAll('.admin-card');const idx=type==='players'?1:2;if(cards[idx]){const sub=cards[idx].querySelector('.admin-card-subtitle');if(sub)sub.textContent=type==='players'?t.players.length+' Spieler':t.results.length+' Einträge';}}

// ── Spieler Profiles Admin ──────────────────────────────────
function renderSpielerProfilesAdmin(){
  const el=document.getElementById('spieler-profiles-admin');
  if(!el)return;
  if(!state.spielerProfiles)state.spielerProfiles=[];
  el.innerHTML=state.spielerProfiles.map((p,i)=>`<div class="tbl-row" style="grid-template-columns:1fr 2fr 32px;margin-bottom:0.4rem;">
<input type="text" placeholder="Spielername" value="${esc(p.name||'')}" oninput="updateSpielerProfile(${i},'name',this.value)" style="background:var(--dark4);border:1px solid #2a2a2a;color:var(--cream);padding:7px 10px;font-family:'Rajdhani',sans-serif;font-size:0.9rem;outline:none;width:100%;">
<input type="text" placeholder="https://steamcommunity.com/id/..." value="${esc(p.steam||'')}" oninput="updateSpielerProfile(${i},'steam',this.value)" style="background:var(--dark4);border:1px solid #2a2a2a;color:var(--cream);padding:7px 10px;font-family:'Rajdhani',sans-serif;font-size:0.9rem;outline:none;width:100%;">
<button class="del-btn" onclick="delSpielerProfile(${i})">&#10005;</button>
</div>`).join('');
  const cnt=document.getElementById('spieler-profiles-count');
  if(cnt)cnt.textContent=state.spielerProfiles.length+' Einträge';
}
function addSpielerProfile(){if(!state.spielerProfiles)state.spielerProfiles=[];state.spielerProfiles.push({name:'',steam:''});renderSpielerProfilesAdmin();}
function updateSpielerProfile(i,k,v){if(state.spielerProfiles[i]){state.spielerProfiles[i][k]=v;if(k==='steam'){localStorage.removeItem('bobo_av_'+(state.spielerProfiles[i].name||'').trim().toLowerCase().replace(/\s+/g,'_'));}}}
function delSpielerProfile(i){const name=state.spielerProfiles[i]?.name;if(name)localStorage.removeItem('bobo_av_'+name.trim().toLowerCase().replace(/\s+/g,'_'));state.spielerProfiles.splice(i,1);renderSpielerProfilesAdmin();}

// ── Matches Admin ──────────────────────────────────────────
function matchRowHTML(i,m){
  const teamOptions=state.teams.map(t=>'<option value="'+t.id+'" '+(m.teamId===t.id?'selected':'')+'>'+esc(t.name)+'</option>').join('');
  return `<div class="tbl-row" style="grid-template-columns:1fr 1fr 180px 1fr 32px" id="match-row-${i}">
<select onchange="updateMatch(${i},'teamId',this.value)" style="background:var(--dark4);border:1px solid #2a2a2a;color:var(--cream);padding:7px 10px;font-family:'Rajdhani',sans-serif;font-size:0.9rem;outline:none;width:100%;"><option value="">Team wählen</option>${teamOptions}</select>
<input type="text" placeholder="Gegner" value="${esc(m.opponent||'')}" oninput="updateMatch(${i},'opponent',this.value)">
<input type="datetime-local" value="${esc(m.date||'')}" oninput="updateMatch(${i},'date',this.value)" style="background:var(--dark4);border:1px solid #2a2a2a;color:var(--cream);padding:7px 10px;font-family:'Rajdhani',sans-serif;font-size:0.9rem;outline:none;width:100%;">
<input type="text" placeholder="https://twitch.tv/..." value="${esc(m.twitch||'')}" oninput="updateMatch(${i},'twitch',this.value)">
<button class="del-btn" onclick="delMatch(${i})">&#10005;</button>
</div>`;
}
function addMatch(){if(!state.matches)state.matches=[];state.matches.push({teamId:'',opponent:'',date:'',twitch:''});const i=state.matches.length-1;document.getElementById('matches-edit').insertAdjacentHTML('beforeend',matchRowHTML(i,state.matches[i]));const c=document.getElementById('matches-count-lbl');if(c)c.textContent=state.matches.length+' Einträge';}
function updateMatch(i,k,v){if(!state.matches)state.matches=[];if(state.matches[i]){state.matches[i][k]=v;renderMatches();}}
function delMatch(i){state.matches.splice(i,1);document.getElementById('matches-edit').innerHTML=(state.matches||[]).map((m,j)=>matchRowHTML(j,m)).join('');const c=document.getElementById('matches-count-lbl');if(c)c.textContent=state.matches.length+' Einträge';renderMatches();}
function renderMatchesAdmin(){if(!state.matches)state.matches=[];document.getElementById('matches-edit').innerHTML=state.matches.map((m,i)=>matchRowHTML(i,m)).join('');const c=document.getElementById('matches-count-lbl');if(c)c.textContent=state.matches.length+' Einträge';}

// ── Histoire Admin ─────────────────────────────────────────
function renderHistoireAdminPage(){
const el=document.getElementById('histoire-admin-content');
if(!el)return;
// Team management section
let html='<div class="admin-card"><div class="admin-card-head" onclick="toggleCard(this)"><div class="admin-card-title">Teams in der Historie</div><div class="admin-card-subtitle">'+state.histoire.length+' Teams</div><div class="admin-card-arrow open">&#9660;</div></div><div class="admin-card-body open"><p style="font-size:0.85rem;color:#666;margin-bottom:1rem;line-height:1.6">Teams für die Saisonhistorie anlegen.</p><div id="hist-team-mgmt-list">';
state.histoire.forEach((t,i)=>{
  html+='<div class="team-mgmt-item"><span class="team-id-badge">#'+(i+1)+'</span><input type="text" value="'+esc(t.name)+'" placeholder="Teamname" oninput="renameHistTeam(\''+t.id+'\',this.value)"><button class="del-btn" onclick="deleteHistTeam(\''+t.id+'\')">&#128465;</button></div>';
});
html+='</div><button class="tbl-add-btn" onclick="addHistTeam()">+ Team hinzufügen</button></div></div>';
// Season cards per team
state.histoire.forEach(t=>{
  html+='<div class="admin-card"><div class="admin-card-head" onclick="toggleCard(this)"><div class="admin-card-title">'+esc(t.name)+'</div><div class="admin-card-subtitle">'+((t.seasons||[]).length)+' Saisonen</div><div class="admin-card-arrow open">&#9660;</div></div><div class="admin-card-body open">';
  html+='<div id="hist-admin-'+t.id+'">';
  (t.seasons||[]).forEach((s,i)=>{ html+=histSeasonHTML(t.id,i,s); });
  html+='</div>';
  html+='<button class="tbl-add-btn" onclick="addSeason(\''+t.id+'\')">+ Saison hinzufügen</button>';
  html+='</div></div>';
});
el.innerHTML=html;
}
function addHistTeam(){const id=genId();state.histoire.push({id,name:'Neues Team',seasons:[]});renderHistoireAdminPage();}
function renameHistTeam(id,name){const t=histById(id);if(t)t.name=name;}
function deleteHistTeam(id){if(!confirm('Team aus Historie löschen?'))return;state.histoire=state.histoire.filter(t=>t.id!==id);renderHistoireAdminPage();}
function histSeasonHTML(tid,i,s){
  const players=(s.players||[]).map((p,pi)=>histPlayerHTML(tid,i,pi,p)).join('');
  const seasonLabel=s.season||'Neue Saison';
  return `<div class="season-admin-card">
<div class="season-admin-head" onclick="toggleSeasonAdmin(this)">
<span style="font-family:'Oswald',sans-serif;font-size:0.85rem;color:var(--cream);min-width:120px;pointer-events:none">${esc(seasonLabel)}</span>
<span style="flex:1;pointer-events:none"></span>
<span style="font-size:0.7rem;color:#555;letter-spacing:1px;pointer-events:none">▲ EINKLAPPEN</span>
<button class="del-btn" onclick="delSeason('${tid}',${i});event.stopPropagation()" style="margin-left:0.5rem">&#128465;</button>
</div>
<div class="season-admin-body open">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:1rem;">
<div class="field-row" style="margin-bottom:0"><label>Saison</label><input type="text" placeholder="Saison 1 – Frühjahr 2025" value="${esc(s.season||'')}" oninput="updateSeason('${tid}',${i},'season',this.value);updateSeasonLabel(this)"></div>
<div class="field-row" style="margin-bottom:0"><label>Platzierung</label><input type="text" placeholder="3. Platz" value="${esc(s.placement||'')}" oninput="updateSeason('${tid}',${i},'placement',this.value)"></div>
<div class="field-row" style="margin-bottom:0"><label>Siege</label><input type="number" placeholder="0" value="${esc(s.wins||'')}" oninput="updateSeason('${tid}',${i},'wins',this.value)"></div>
<div class="field-row" style="margin-bottom:0"><label>Niederl.</label><input type="number" placeholder="0" value="${esc(s.losses||'')}" oninput="updateSeason('${tid}',${i},'losses',this.value)"></div>
<div class="field-row" style="margin-bottom:0"><label>Coach</label><input type="text" placeholder="Coach Name" value="${esc(s.coach||'')}" oninput="updateSeason('${tid}',${i},'coach',this.value)"></div>
<div class="field-row" style="margin-bottom:0"><label>&#9654; YouTube</label><input type="text" placeholder="https://youtube.com/playlist?..." value="${esc(s.youtube||'')}" oninput="updateSeason('${tid}',${i},'youtube',this.value)"></div>
</div>
<div class="tbl-editor-head tbl-row grid-hist-player"><span>Name</span><span>Spiele</span><span>Kills</span><span>Assists</span><span>Tode</span><span>K/D</span><span>HLTV</span><span>Steam-URL</span><span></span></div>
<div id="hist-players-${tid}-${i}">${players}</div>
<button class="tbl-add-btn" onclick="addHistPlayer('${tid}',${i})">+ Spieler</button>
</div></div>`;
}
function toggleSeasonAdmin(head){const body=head.nextElementSibling;const lbl=head.querySelector('span:last-of-type');const isOpen=body.classList.contains('open');body.classList.toggle('open');if(lbl)lbl.textContent=isOpen?'▼ AUFKLAPPEN':'▲ EINKLAPPEN';}
function updateSeasonLabel(input){const head=input.closest('.season-admin-head');if(head){const span=head.querySelector('span:first-of-type');if(span)span.textContent=input.value||'Neue Saison';}}

function histPlayerHTML(tid,si,pi,p){
  const kd=calcKD(p.kills,p.deaths);
  return `<div class="tbl-row grid-hist-player">
<input type="text" placeholder="Name" value="${esc(p.name||'')}" oninput="updateHistPlayer('${tid}',${si},${pi},'name',this.value)">
<input type="number" placeholder="0" value="${esc(p.games||'')}" oninput="updateHistPlayer('${tid}',${si},${pi},'games',this.value)">
<input type="number" placeholder="0" value="${esc(p.kills||'')}" oninput="updateHistPlayer('${tid}',${si},${pi},'kills',this.value);refreshKD('${tid}',${si},${pi})">
<input type="number" placeholder="0" value="${esc(p.assists||'')}" oninput="updateHistPlayer('${tid}',${si},${pi},'assists',this.value)">
<input type="number" placeholder="0" value="${esc(p.deaths||'')}" oninput="updateHistPlayer('${tid}',${si},${pi},'deaths',this.value);refreshKD('${tid}',${si},${pi})">
<span class="kd-display" id="kd-${tid}-${si}-${pi}" style="font-family:'Oswald',sans-serif;font-size:0.9rem;color:var(--cream);display:flex;align-items:center;justify-content:center;">${kd}</span>
<input type="text" placeholder="1.05" value="${esc(p.hltv||'')}" oninput="updateHistPlayer('${tid}',${si},${pi},'hltv',this.value)">
<input type="text" placeholder="steamcommunity.com/id/..." value="${esc(p.steam||'')}" oninput="updateHistPlayer('${tid}',${si},${pi},'steam',this.value)">
<button class="del-btn" onclick="delHistPlayer('${tid}',${si},${pi})">&#10005;</button>
</div>`;
}
function refreshKD(tid,si,pi){const t=histById(tid);if(!t||!t.seasons[si])return;const p=t.seasons[si].players[pi];const el=document.getElementById('kd-'+tid+'-'+si+'-'+pi);if(el)el.textContent=calcKD(p.kills,p.deaths);}
function addSeason(tid){const t=histById(tid);if(!t)return;if(!t.seasons)t.seasons=[];t.seasons.push({season:'',placement:'',wins:'',losses:'',players:[],coach:'',youtube:''});renderHistoireAdminPage();}
function delSeason(tid,i){const t=histById(tid);if(!t)return;t.seasons.splice(i,1);renderHistoireAdminPage();}
function updateSeason(tid,i,k,v){const t=histById(tid);if(t&&t.seasons&&t.seasons[i])t.seasons[i][k]=v;}
function addHistPlayer(tid,si){const t=histById(tid);if(!t)return;t.seasons[si].players.push({name:'',games:'',kills:'',assists:'',deaths:'',hltv:'',steam:''});const pi=t.seasons[si].players.length-1;document.getElementById('hist-players-'+tid+'-'+si).insertAdjacentHTML('beforeend',histPlayerHTML(tid,si,pi,t.seasons[si].players[pi]));}
function updateHistPlayer(tid,si,pi,k,v){const t=histById(tid);if(t&&t.seasons&&t.seasons[si])t.seasons[si].players[pi][k]=v;}
function delHistPlayer(tid,si,pi){const t=histById(tid);if(!t)return;t.seasons[si].players.splice(pi,1);document.getElementById('hist-players-'+tid+'-'+si).innerHTML=t.seasons[si].players.map((p,i)=>histPlayerHTML(tid,si,i,p)).join('');}

// ── Public Render ──────────────────────────────────────────
function updateDachcsLinks(){state.teams.forEach(t=>{const url=t.dachcs||'https://www.dachcs.de';document.querySelectorAll('.dacha-link-'+t.id).forEach(el=>el.href=url);});}
function renderPublic(){
  const tabsEl=document.getElementById('teams-tabs');
  const panelsEl=document.getElementById('teams-panels');
  const rtabsEl=document.getElementById('results-tabs');
  const rpanelsEl=document.getElementById('results-panels');
  if(!tabsEl)return;
  tabsEl.innerHTML=state.teams.map((t,i)=>'<button class="tab-btn'+(i===0?' active':'')+'" id="tab-'+t.id+'" onclick="switchTeam(\'+t.id+\')">'+esc(t.name)+'</button>').join('');
  rtabsEl.innerHTML=state.teams.map((t,i)=>'<button class="tab-btn'+(i===0?' active':'')+'" id="rtab-'+t.id+'" onclick="switchResults(\'+t.id+\')">'+esc(t.name)+'</button>').join('');
  panelsEl.innerHTML=state.teams.map((t,i)=>`<div class="team-panel${i===0?' active':''}" id="panel-${t.id}">
<div class="team-meta"><div><div class="team-meta-name">${esc(t.name)}</div><div class="team-meta-coach" id="coach-display-${t.id}">${t.coach?'Coach: <span>'+esc(t.coach)+'</span>':'Coach: <span style="color:#555">–</span>'}</div></div>
<a href="${esc(t.dachcs||'https://www.dachcs.de')}" target="_blank" rel="noopener" class="dacha-link dacha-link-${t.id}">&#x2197; DachCS</a></div>
<div class="roster-section"><div class="roster-label">Stammkader</div><div class="team-grid">${renderRoster(t,false)}</div></div>
${renderStandins(t)}</div>`).join('');
  rpanelsEl.innerHTML=state.teams.map((t,i)=>'<div class="team-panel'+(i===0?' active':'')+'" id="rpanel-'+t.id+'"><div class="results-list">'+renderResultsList(t)+'</div></div>').join('');
  const navTeamLinks=document.getElementById('nav-team-links');
  if(navTeamLinks)navTeamLinks.innerHTML=state.teams.map((t,i)=>'<button class="hero-team-btn" onclick="scrollToTeam(\'+t.id+\')">'+esc(t.name)+'</button>').join('');
  const newsEl=document.getElementById('news-display');
  if(newsEl)newsEl.innerHTML=state.news.length===0?'<div class="empty" style="grid-column:1/-1">Noch keine News</div>':state.news.map(n=>'<div class="news-card"><div class="news-date">'+esc(n.date)+'</div><div class="news-title">'+esc(n.title)+'</div><div class="news-text">'+esc(n.text)+'</div></div>').join('');
  updateDachcsLinks();
  updateDiscordLinks();
  renderMatches();
}
function renderRoster(t,standin){
  const players=t.players.filter(p=>(p.type||'main')===(standin?'standin':'main'));
  if(players.length===0&&!standin)return '<div class="empty">Noch keine Spieler</div>';
  return players.map(p=>memberCardHTML(p,standin)).join('');
}
function renderStandins(t){
  const standins=t.players.filter(p=>p.type==='standin');
  if(standins.length===0)return '';
  return '<div class="roster-section"><div class="roster-label">Stand-ins</div><div class="team-grid">'+standins.map(p=>memberCardHTML(p,true)).join('')+'</div></div>';
}
function renderResultsList(t){
  if(t.results.length===0)return '<div class="empty">Noch keine Ergebnisse</div>';
  const m={'win':'badge-win','loss':'badge-loss','draw':'badge-draw'};
  const l={'win':'Sieg','loss':'Niederlage','draw':'Unentschieden'};
  return t.results.map(r=>{const res=r.res||'draw';return '<div class="result-row '+res+'"><div><div class="r-name">'+esc(t.name)+'</div></div><div class="score-box"><div class="score">'+esc(r.s1)+' &ndash; '+esc(r.s2)+'</div>'+(r.map?'<div class="result-meta">'+esc(r.map)+'</div>':'')+'<span class="badge '+(m[res]||'badge-draw')+'">'+(l[res]||res)+'</span></div><div><div class="r-name right">'+esc(r.opp||'?')+'</div></div></div>';}).join('');
}
function memberCardHTML(p,isStandin){
  const uid='av'+Math.random().toString(36).slice(2,9);
  const borderColor=isStandin?'#3a3a3a':'var(--red)';
  const players=getSpielerList();
  const hasProfile=players.some(pl=>pl.name.toLowerCase()===(p.name||'').toLowerCase());
  const safeName=esc((p.name||'').replace(/'/g,"\'"));
const clickAttr=hasProfile?'onclick="openSpielerFromCard(\'' +safeName+ '\'); event.stopPropagation();" style="cursor:pointer"':'';
  const card='<div class="member-card '+(isStandin?'standin':'')+'" '+clickAttr+'><div class="member-avatar" id="'+uid+'" style="border-color:'+borderColor+'">'+initials(p.name)+'</div><div class="member-name">'+esc(p.name||'?')+'</div>'+(p.role?'<div class="member-role">'+esc(p.role)+'</div>':'')+(hasProfile?'<div style="font-size:0.7rem;color:var(--red-light);margin-top:4px;letter-spacing:1px">PROFIL ›</div>':'')+'</div>';
  const sp=getSteamProfile(p.name||'');
  if(sp&&sp.steam)setTimeout(()=>applyAvatarToEl(uid,sp.name,sp.steam),50);
  return card;
}

// ── Histoire Public ────────────────────────────────────────


function buildSeasonCard(s){
  let pHTML;
  if(!s.players||s.players.length===0){pHTML='<div class="empty" style="padding:1rem">Keine Spieler</div>';}
  else{
    let rows='';
    s.players.forEach(p=>{
      const kd=calcKD(p.kills,p.deaths);
      const kdColor=parseFloat(kd)>=1?'#2ecc71':parseFloat(kd)<0.8?'var(--red-light)':'#f39c12';
      rows+='<tr><td>'+esc(p.name)+'</td><td class="num">'+esc(p.games||'-')+'</td><td class="num">'+esc(p.kills||'-')+'</td><td class="num">'+esc(p.assists||'-')+'</td><td class="num">'+esc(p.deaths||'-')+'</td><td class="num" style="color:'+kdColor+'">'+kd+'</td><td class="num hltv-rating '+hltvClass(p.hltv)+'">'+esc(p.hltv||'-')+'</td></tr>';
    });
    pHTML='<table class="stats-table"><thead><tr><th>Spieler</th><th class="num">Spiele</th><th class="num">Kills</th><th class="num">Assists</th><th class="num">Tode</th><th class="num">K/D</th><th class="num">HLTV</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }
  const coachLine=s.coach?'<div style="font-size:0.85rem;color:#888;margin-bottom:1rem">Coach: <span style="color:var(--red-light);font-weight:600">'+esc(s.coach)+'</span></div>':'';
  const ytBtn=s.youtube?'<a href="'+esc(s.youtube)+'" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;font-size:0.75rem;letter-spacing:2px;text-transform:uppercase;text-decoration:none;color:#ff4444;border:1px solid #ff4444;padding:4px 12px;margin-bottom:1rem;">&#9654; Playlist</a>':'';
  const placementHTML=s.placement?'<div class="season-placement">'+esc(s.placement)+'</div>':'';
  const recordHTML=(s.wins||s.losses)?'<div class="season-record">W/L: <span>'+esc(s.wins||'0')+'</span>/<span>'+esc(s.losses||'0')+'</span></div>':'';
  return '<div class="season-card"><div class="season-head" onclick="toggleSeason(this)"><div class="season-name">'+esc(s.season||'Unbekannte Saison')+'</div>'+placementHTML+recordHTML+'<div class="season-toggle">&#9660;</div></div><div class="season-body">'+ytBtn+coachLine+pHTML+'</div></div>';
}
function renderHistoire(){
  const tabsEl=document.getElementById('hist-tabs');
  const panelsEl=document.getElementById('hist-panels');
  const loadingEl=document.getElementById('hist-loading');
  if(loadingEl)loadingEl.style.display='none';
  if(!tabsEl)return;
  tabsEl.style.display='';
  if(!state.histoire||state.histoire.length===0){tabsEl.innerHTML='';panelsEl.innerHTML='<div class="empty">Noch keine Teams in der Historie</div>';return;}
  // Build tabs using DOM to avoid quoting issues
  tabsEl.innerHTML='';
  state.histoire.forEach((t,i)=>{
    const btn=document.createElement('button');
    btn.className='hist-tab'+(i===0?' active':'');
    btn.id='htab-'+t.id;
    btn.textContent=t.name||t.id;
    btn.onclick=()=>switchHist(t.id);
    tabsEl.appendChild(btn);
  });
  panelsEl.innerHTML=state.histoire.map((t,i)=>{
    const seasons=t.seasons||[];
    const content=seasons.length===0?'<div class="empty">Noch keine Saisonen</div>':[...seasons].reverse().map(s=>buildSeasonCard(s)).join('');
    return '<div class="hist-panel'+(i===0?' active':'')+'" id="hpanel-'+t.id+'">'+content+'</div>';
  }).join('');
}
function switchHist(id){
  console.log('[BoBo] switchHist', id);
  document.querySelectorAll('.hist-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.hist-panel').forEach(p=>p.classList.remove('active'));
  const tab=document.getElementById('htab-'+id);
  const panel=document.getElementById('hpanel-'+id);
  console.log('[BoBo] panel found:', !!panel, 'classes:', panel?.className, 'style:', panel?.style.display);
  if(tab)tab.classList.add('active');
  if(panel)panel.classList.add('active');
  console.log('[BoBo] panel after:', panel?.className, 'computed display:', panel?window.getComputedStyle(panel).display:'?');
}

// ── Spieler Page ───────────────────────────────────────────
function getSteamProfile(name){return (state.spielerProfiles||[]).find(p=>p.name.trim().toLowerCase()===name.trim().toLowerCase());}
function getSpielerList(){
  const players={};
  const profileIndex={};
  (state.spielerProfiles||[]).forEach(p=>{profileIndex[p.name.trim().toLowerCase()]=p;});
  state.histoire.forEach(team=>{
    (team.seasons||[]).forEach(season=>{
      (season.players||[]).forEach(p=>{
        if(!p.name||!p.name.trim())return;
        const key=p.name.trim().toLowerCase();
        if(!players[key])players[key]={name:p.name.trim(),steam:'',seasons:[]};
        const prof=profileIndex[key];
        if(prof&&prof.steam)players[key].steam=prof.steam;
        if(p.steam&&p.steam.trim())players[key].steam=p.steam.trim();
        players[key].seasons.push({teamId:team.id,teamName:team.name,season:season.season,coach:season.coach||'',games:p.games||'',kills:p.kills||'',assists:p.assists||'',deaths:p.deaths||'',hltv:p.hltv||''});
      });
    });
  });
  (state.teams||[]).forEach(team=>{
    (team.players||[]).forEach(p=>{
      if(!p.name||!p.steam)return;
      const key=p.name.trim().toLowerCase();
      if(players[key]&&!players[key].steam)players[key].steam=p.steam;
    });
  });
  return Object.values(players).sort((a,b)=>a.name.localeCompare(b.name));
}
function calcAllTime(seasons){
  let kills=0,assists=0,deaths=0,games=0,hltvVals=[];
  seasons.forEach(s=>{kills+=parseInt(s.kills)||0;assists+=parseInt(s.assists)||0;deaths+=parseInt(s.deaths)||0;games+=parseInt(s.games)||0;const h=parseFloat(s.hltv);if(!isNaN(h))hltvVals.push(h);});
  const kd=deaths>0?(kills/deaths).toFixed(2):kills>0?kills.toFixed(2):'-';
  const hltv=hltvVals.length>0?(hltvVals.reduce((a,b)=>a+b,0)/hltvVals.length).toFixed(2):'-';
  return {kills,assists,deaths,games,kd,hltv};
}
function renderSpielerList(){
  const players=getSpielerList();
  const listEl=document.getElementById('spieler-list');
  const detailEl=document.getElementById('spieler-detail');
  const topEl=document.getElementById('spieler-top-stats');
  const searchEl=document.getElementById('spieler-search');
  detailEl.style.display='none';
  listEl.style.display='';
  if(players.length===0){listEl.innerHTML='<div class="empty">Noch keine Spieler in der Historie</div>';if(topEl)topEl.style.display='none';if(searchEl)searchEl.style.display='none';return;}
  const withStats=players.map(p=>({...p,at:calcAllTime(p.seasons)}));
  const topGames=withStats.reduce((a,b)=>(parseInt(b.at.games)||0)>(parseInt(a.at.games)||0)?b:a);
  const topKills=withStats.reduce((a,b)=>(b.at.kills||0)>(a.at.kills||0)?b:a);
  const topAssists=withStats.reduce((a,b)=>(b.at.assists||0)>(a.at.assists||0)?b:a);
  const topDeaths=withStats.reduce((a,b)=>(b.at.deaths||0)>(a.at.deaths||0)?b:a);
  const topCards=[{label:'Meiste Spiele',player:topGames,val:topGames.at.games||0},{label:'Meiste Kills',player:topKills,val:topKills.at.kills||0},{label:'Meiste Assists',player:topAssists,val:topAssists.at.assists||0},{label:'Meiste Tode',player:topDeaths,val:topDeaths.at.deaths||0}];
  if(topEl){
    topEl.style.display='block';
    topEl.innerHTML='<div class="top-stats-grid">'+topCards.map(({label,player,val})=>{
      const uid='tsp-'+Math.random().toString(36).slice(2,7);
      const safePN=esc(player.name.replace(/'/g,"\'"));const card='<div class="top-stat-card" onclick="showSpielerDetail(\''+safePN+'\')">'+'<div class="top-stat-label">'+esc(label)+'</div><div class="top-stat-avatar" id="'+uid+'">'+initials(player.name)+'</div><div class="top-stat-name">'+esc(player.name)+'</div><div class="top-stat-value">'+val+'</div></div>';
      const sp=getSteamProfile(player.name);
      if(sp&&sp.steam)setTimeout(()=>applyAvatarToEl(uid,sp.name,sp.steam),50);
      return card;
    }).join('')+'</div>';
  }
  if(searchEl)searchEl.style.display='block';
  listEl.innerHTML='<div class="spieler-grid">'+players.map(p=>{
    const uid='sp-av-'+Math.random().toString(36).slice(2,9);
    const teamNames=[...new Set(p.seasons.map(s=>s.teamName))].join(' · ');
    const safeN2=esc(p.name.replace(/'/g,"\'"));const card='<div class="spieler-card" onclick="showSpielerDetail(\''+safeN2+'\')"><div class="spieler-avatar" id="'+uid+'">'+initials(p.name)+'</div><div class="spieler-name">'+esc(p.name)+'</div><div class="spieler-teams">'+esc(teamNames)+'</div></div>';
    const sp=getSteamProfile(p.name);
    if(sp&&sp.steam)setTimeout(()=>applyAvatarToEl(uid,sp.name,sp.steam),50);
    return card;
  }).join('')+'</div>';
}
function showSpielerDetail(name){
  const players=getSpielerList();
  const p=players.find(pl=>pl.name===name);
  if(!p)return;
  document.getElementById('spieler-list').style.display='none';
  const detailEl=document.getElementById('spieler-detail');
  detailEl.style.display='block';
  const allTime=calcAllTime(p.seasons);
  const uid='detail-av-'+Math.random().toString(36).slice(2,7);
  const teamNames=[...new Set(p.seasons.map(s=>s.teamName))].join(' · ');
  const kdColor=v=>{const n=parseFloat(v);if(isNaN(n))return 'var(--cream)';return n>=1.2?'#2ecc71':n>=0.9?'#f39c12':'var(--red-light)';};
  const hltvColor=v=>{const n=parseFloat(v);if(isNaN(n))return 'var(--cream)';return n>=1.15?'#2ecc71':n>=0.95?'#f39c12':'var(--red-light)';};
  const prof=getSteamProfile(p.name);
  const bioHTML=prof&&prof.bio?'<div style="font-size:0.9rem;color:#aaa;margin-top:6px;line-height:1.6;">'+esc(prof.bio)+'</div>':'';
  const faceitHTML=prof&&prof.faceit?'<a href="https://www.faceit.com/en/players/'+esc(prof.faceit)+'" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-family:Oswald,sans-serif;font-size:0.75rem;letter-spacing:2px;text-transform:uppercase;text-decoration:none;color:#ff5500;border:1px solid #ff5500;padding:4px 12px;">&#9654; FACEIT</a>':'';
  const discordHTML=prof&&prof.discord?'<div style="font-size:0.8rem;color:#7289da;margin-top:4px;">&#128172; '+esc(prof.discord)+'</div>':'';
  let html='<div class="spieler-detail-header"><div class="spieler-detail-avatar" id="'+uid+'">'+initials(p.name)+'</div><div><div class="spieler-detail-name">'+esc(p.name)+'</div><div class="spieler-detail-teams">'+esc(teamNames)+'</div>'+discordHTML+bioHTML+faceitHTML+'</div></div>';
  html+='<h3 style="font-family:Oswald,sans-serif;font-size:1rem;letter-spacing:3px;text-transform:uppercase;color:#888;margin-bottom:1rem;">&#9733; All Time Stats</h3>';
  html+='<div class="alltime-box">'+(allTime.games?'<div class="alltime-stat"><div class="alltime-stat-val">'+allTime.games+'</div><div class="alltime-stat-lbl">Spiele</div></div>':'')+'<div class="alltime-stat"><div class="alltime-stat-val">'+allTime.kills+'</div><div class="alltime-stat-lbl">Kills</div></div><div class="alltime-stat"><div class="alltime-stat-val">'+allTime.assists+'</div><div class="alltime-stat-lbl">Assists</div></div><div class="alltime-stat"><div class="alltime-stat-val">'+allTime.deaths+'</div><div class="alltime-stat-lbl">Tode</div></div><div class="alltime-stat"><div class="alltime-stat-val" style="color:'+kdColor(allTime.kd)+'">'+allTime.kd+'</div><div class="alltime-stat-lbl">K/D</div></div><div class="alltime-stat"><div class="alltime-stat-val" style="color:'+hltvColor(allTime.hltv)+'">'+allTime.hltv+'</div><div class="alltime-stat-lbl">HLTV &#216;</div></div></div>';
  html+='<h3 style="font-family:Oswald,sans-serif;font-size:1rem;letter-spacing:3px;text-transform:uppercase;color:#888;margin-bottom:1rem;">&#128218; Saisonhistorie</h3>';
  html+='<div class="season-history-list">'+p.seasons.map(s=>{
    const kd=calcKD(s.kills,s.deaths);
    return '<div class="season-history-item"><div class="season-history-head"><span class="season-history-team">'+esc(s.teamName)+'</span><span class="season-history-name">'+esc(s.season||'Unbekannte Saison')+'</span>'+(s.coach?'<span style="font-size:0.8rem;color:#666">Coach: <span style="color:var(--red-light)">'+esc(s.coach)+'</span></span>':'')+'</div><div class="season-history-stats">'+(s.games?'<div class="season-stat"><div class="season-stat-val">'+esc(s.games)+'</div><div class="season-stat-lbl">Spiele</div></div>':'')+'<div class="season-stat"><div class="season-stat-val">'+esc(s.kills||'-')+'</div><div class="season-stat-lbl">Kills</div></div><div class="season-stat"><div class="season-stat-val">'+esc(s.assists||'-')+'</div><div class="season-stat-lbl">Assists</div></div><div class="season-stat"><div class="season-stat-val">'+esc(s.deaths||'-')+'</div><div class="season-stat-lbl">Tode</div></div><div class="season-stat"><div class="season-stat-val" style="color:'+kdColor(kd)+'">'+kd+'</div><div class="season-stat-lbl">K/D</div></div>'+(s.hltv?'<div class="season-stat"><div class="season-stat-val" style="color:'+hltvColor(s.hltv)+'">'+esc(s.hltv)+'</div><div class="season-stat-lbl">HLTV</div></div>':'')+'</div></div>';
  }).join('')+'</div>';
  document.getElementById('spieler-detail-content').innerHTML=html;
  const sp=getSteamProfile(p.name);
  if(sp&&sp.steam)setTimeout(()=>applyAvatarToEl(uid,sp.name,sp.steam),50);
}
function closeSpielerDetail(){document.getElementById('spieler-detail').style.display='none';document.getElementById('spieler-list').style.display='';}
function openSpielerFromCard(name){
  const sec=document.getElementById('pub-spieler');
  const link=document.getElementById('nav-spieler-link');
  if(sec){sec.style.display='block';sec.setAttribute('data-open','1');}
  if(link)link.style.borderBottom='2px solid var(--red)';
  renderSpielerList();showSpielerDetail(name);
  setTimeout(()=>{if(sec)sec.scrollIntoView({behavior:'smooth'});},50);
}




// ── Matches / Countdown ────────────────────────────────────
function renderMatches(){
  const now=Date.now();
  const upcoming=(state.matches||[]).filter(m=>m.date&&new Date(m.date).getTime()>now-3600000).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const sec=document.getElementById('section-matches');
  const el=document.getElementById('matches-display');
  if(!sec||!el)return;
  if(upcoming.length===0){sec.style.display='none';return;}
  sec.style.display='block';
  el.innerHTML='<div class="matches-grid">'+upcoming.map(m=>{
    const matchTime=new Date(m.date).getTime();
    const diff=matchTime-now;
    const teamName=(state.teams.find(t=>t.id===m.teamId)||{name:m.teamId||'BoBo Clan'}).name;
    const uid='cd-'+Math.random().toString(36).slice(2,7);
    let countdownHTML;
    if(diff<=0){countdownHTML='<div class="match-live">&#9679; LIVE</div>';}
    else{const d=Math.floor(diff/86400000),h=Math.floor((diff%86400000)/3600000),min=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);countdownHTML='<div class="match-countdown" id="'+uid+'">'+(d>0?d+'T '+h+'h '+min+'m':h>0?h+'h '+min+'m '+s+'s':min+'m '+s+'s')+'</div>';}
    const dateStr=new Date(m.date).toLocaleString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const twitchBtn=m.twitch?'<a href="'+esc(m.twitch)+'" target="_blank" rel="noopener" class="match-twitch-btn"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11.6 6H13v4h-1.4V6zm3.8 0H17v4h-1.6V6zM2.1 0L0 5.5V21h6v3h3.4l3-3H17l7-7V0H2.1zm19.5 13-3.4 3.4h-5l-3 3v-3H4.5V2.3h17.1V13z"/></svg> Stream</a>':'';
    return '<div class="match-card"><div class="match-team">'+esc(teamName)+'</div><div class="match-center"><div class="match-vs">VS</div>'+countdownHTML+'<div class="match-date">'+dateStr+'</div>'+twitchBtn+'</div><div class="match-opponent">'+esc(m.opponent||'?')+'</div></div>';
  }).join('')+'</div>';
  startCountdowns();
}
function startCountdowns(){
  if(countdownInterval)clearInterval(countdownInterval);
  countdownInterval=setInterval(()=>{
    const now=Date.now();
    document.querySelectorAll('.match-countdown').forEach(el=>{
      const matchCard=el.closest('.match-card');
      if(!matchCard)return;
      const m=(state.matches||[]).find(m=>m.date&&Math.abs(new Date(m.date).getTime()-now)<86400000*7);
      if(!m)return;
      const diff=new Date(m.date).getTime()-now;
      if(diff<=0){el.outerHTML='<div class="match-live">&#9679; LIVE</div>';return;}
      const d=Math.floor(diff/86400000),h=Math.floor((diff%86400000)/3600000),min=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);
      el.textContent=d>0?d+'T '+h+'h '+min+'m':h>0?h+'h '+min+'m '+s+'s':min+'m '+s+'s';
    });
  },1000);
}

// ── Steam Avatars ──────────────────────────────────────────
function getSteamAvatarUrl(steamUrl){
  const clean=steamUrl.replace(/\/+$/,'');
  const parts=clean.split('/').filter(Boolean);
  const last=parts[parts.length-1],type=parts[parts.length-2];
  return (type==='profiles'&&/^\d{15,}$/.test(last))?'https://steamcommunity.com/profiles/'+last+'?xml=1':'https://steamcommunity.com/id/'+last+'?xml=1';
}
function getCachedAvatar(name){return localStorage.getItem('bobo_av_'+name.trim().toLowerCase().replace(/\s+/g,'_'));}
function setCachedAvatar(name,url){try{localStorage.setItem('bobo_av_'+name.trim().toLowerCase().replace(/\s+/g,'_'),url);}catch(e){}}
function setAvatarImg(el,url){
  if(!el)return;
  el.innerHTML='';el.style.cssText+=';background:none;overflow:hidden;padding:0;';
  const img=document.createElement('img');
  img.src=url;img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;';
  img.onerror=()=>{el.style.background='var(--dark4)';};
  el.appendChild(img);
}
function applyAvatarToEl(elId,name,steamUrl){
  const el=document.getElementById(elId);
  if(!el)return;
  el.setAttribute('data-initials',el.textContent);
  const cached=getCachedAvatar(name);
  if(cached){setAvatarImg(el,cached);return;}
  _steamQueue.push({elId,name,steamUrl});
  if(!_steamRunning)_processSteamQueue();
}
function _processSteamQueue(){
  if(_steamRunning||_steamQueue.length===0)return;
  _steamRunning=true;
  const {elId,name,steamUrl}=_steamQueue.shift();
  _doLoadSteamAvatar(elId,name,steamUrl).finally(()=>{_steamRunning=false;setTimeout(_processSteamQueue,200);});
}
async function _doLoadSteamAvatar(elId,name,steamUrl){
  const el=document.getElementById(elId);if(!el)return;
  const xmlUrl=getSteamAvatarUrl(steamUrl);
  try{
    let xml='';
    for(const proxy of['https://corsproxy.io/?'+encodeURIComponent(xmlUrl),'https://api.allorigins.win/get?url='+encodeURIComponent(xmlUrl)]){
      try{
        const r=await fetch(proxy);if(!r.ok)continue;
        const text=await r.text();
        xml=text.trim().startsWith('{')?((JSON.parse(text).contents)||''):text;
        if(xml.includes('<avatarFull'))break;
      }catch(e){continue;}
    }
    const m=xml.match(/<avatarFull[^>]*><!\[CDATA\[([^\]]+)\]\]><\/avatarFull>/)||xml.match(/<avatarFull[^>]*>([^<]+)<\/avatarFull>/);
    if(m&&m[1]&&m[1].startsWith('http')){setCachedAvatar(name,m[1].trim());setAvatarImg(el,m[1].trim());}
  }catch(e){}
}
async function loadAndCacheAvatar(name,steamUrl,callback){
  const cached=getCachedAvatar(name);if(cached){callback(cached);return;}
  const xmlUrl=getSteamAvatarUrl(steamUrl);
  try{
    let xml='';
    for(const proxy of['https://corsproxy.io/?'+encodeURIComponent(xmlUrl),'https://api.allorigins.win/get?url='+encodeURIComponent(xmlUrl)]){
      try{const r=await fetch(proxy);if(!r.ok)continue;const text=await r.text();xml=text.trim().startsWith('{')?((JSON.parse(text).contents)||''):text;if(xml.includes('<avatarFull'))break;}catch(e){continue;}
    }
    const m=xml.match(/<avatarFull[^>]*><!\[CDATA\[([^\]]+)\]\]><\/avatarFull>/)||xml.match(/<avatarFull[^>]*>([^<]+)<\/avatarFull>/);
    if(m&&m[1]&&m[1].startsWith('http')){setCachedAvatar(name,m[1].trim());callback(m[1].trim());}
  }catch(e){}
}

// ── Search ─────────────────────────────────────────────────

// ── SPIELERVERGLEICH ───────────────────────────────────────




function filterSpieler(q){
  const term=q.toLowerCase().trim();
  document.querySelectorAll('#spieler-list .spieler-card').forEach(card=>{
    const name=card.querySelector('.spieler-name')?.textContent.toLowerCase()||'';
    const teams=card.querySelector('.spieler-teams')?.textContent.toLowerCase()||'';
    card.style.display=(!term||name.includes(term)||teams.includes(term))?'':'none';
  });
}
function filterHistoire(q){
  const term=q.toLowerCase().trim();
  document.querySelectorAll('#hist-panels .hist-panel').forEach(panel=>{
    const teamId=panel.id.replace('hpanel-','');
    const team=state.histoire.find(t=>t.id===teamId);
    const teamName=team?team.name.toLowerCase():'';
    const teamMatches=!term||teamName.includes(term);
    const cards=panel.querySelectorAll('.season-card');
    let anyCardVisible=false;
    cards.forEach(card=>{
      const text=card.textContent.toLowerCase();
      const cardMatches=!term||text.includes(term)||teamMatches;
      card.style.display=cardMatches?'':'none';
      if(cardMatches)anyCardVisible=true;
    });
    const panelVisible=!term||teamMatches||anyCardVisible;
    // Use classList instead of inline style to not override switchHist
    panel.classList.toggle('hist-hidden',!panelVisible);
    const tab=document.getElementById('htab-'+teamId);
    if(tab)tab.classList.toggle('hist-hidden',!panelVisible);
  });
}

// ── Team Area ──────────────────────────────────────────────
function openTeamArea(){
  if(!currentUser){openLoginOverlay();return;}
  const teamId=getMyTeamId();
  const teamIds=isAdmin()?state.teams.map(t=>t.id):(teamId?[teamId]:[]);
  console.log('[BoBo] openTeamArea teams:', JSON.stringify(state.teams.map(t=>t.id)), 'teamIds:', teamIds);
  if(teamIds.length===0){console.warn('[BoBo] No teams');return;}
  const panel=document.getElementById('team-area-panel');
  panel.style.display='flex';
  console.log('[BoBo] panel display set to:', panel.style.display);
  try{
    renderTeamArea(teamIds[0]);
    console.log('[BoBo] renderTeamArea done');
    // Debug: check what's actually in the panel
    const p=document.getElementById('team-area-panel');
    const t=document.getElementById('team-area-tactics');
    const titleEl=document.getElementById('team-area-title');
    console.log('[BoBo] panel rect:', JSON.stringify(p.getBoundingClientRect()));
    console.log('[BoBo] tactics innerHTML length:', t?t.innerHTML.length:0);
    console.log('[BoBo] title:', titleEl?titleEl.textContent:'?');
  }catch(e){
    console.error('[BoBo] renderTeamArea ERROR:', e.message, '\n', e.stack);
  }
}
function closeTeamArea(){document.getElementById('team-area-panel').style.display='none';}
function switchTeamAreaTab(tab){
  ['tactics','training'].forEach(t=>{
    document.getElementById('team-tab-'+t).classList.toggle('active',t===tab);
    document.getElementById('team-section-'+t).style.display=t===tab?'block':'none';
  });
}
function renderTeamArea(teamId){
const team=state.teams.find(t=>t.id===teamId);if(!team)return;
const td=getTeamData(teamId);
const coach=isCoachOf(teamId);
document.getElementById('team-area-title').textContent=team.name;
// Team tabs
const teamIds=isAdmin()?state.teams.map(t=>t.id):[getMyTeamId()].filter(Boolean);
const tabsEl=document.getElementById('team-area-tabs');
if(teamIds.length>1){
  tabsEl.innerHTML='';
  const wrap=document.createElement('div');
  wrap.style.cssText='display:flex;gap:0;border:1px solid #2a2a2a;width:fit-content;margin-bottom:1.5rem;';
  teamIds.forEach(id=>{
    const t=state.teams.find(x=>x.id===id);
    const btn=document.createElement('button');
    btn.className='tab-btn'+(id===teamId?' active':'');
    btn.textContent=t?t.name:id;
    btn.onclick=()=>renderTeamArea(id);
    wrap.appendChild(btn);
  });
  tabsEl.appendChild(wrap);
}else{tabsEl.innerHTML='';}
// Tactics
const tacticsEl=document.getElementById('team-area-tactics');
tacticsEl.innerHTML='';
if((td.tactics||[]).length===0){tacticsEl.innerHTML='<div class="empty">Noch keine Taktiken</div>';}
else{td.tactics.forEach((t,i)=>{
  const d=document.createElement('div');d.className='tactic-card';
  let h='<div class="tactic-head"><div class="tactic-title">'+esc(t.title)+'</div>';
  if(t.date)h+='<div class="tactic-date">'+esc(t.date)+'</div>';
  if(coach)h+='<button class="mini-btn danger">&#10005;</button>';
  h+='</div>';
  if(t.desc)h+='<div class="tactic-desc">'+esc(t.desc)+'</div>';
  if(t.image)h+='<img src="'+esc(t.image)+'" alt="Taktik" style="max-width:100%;margin-top:0.75rem;border:1px solid #2a2a2a;">';
  d.innerHTML=h;
  if(coach){const btn=d.querySelector('.mini-btn');if(btn){const ci=i;btn.onclick=()=>deleteTactic(teamId,ci);}}
  tacticsEl.appendChild(d);
});}
if(coach){
  const f=document.createElement('div');f.className='team-area-form';
  f.innerHTML='<div class="form-title">+ Neue Taktik</div><input type="text" id="tactic-title-'+teamId+'" placeholder="Titel" class="area-input"><textarea id="tactic-desc-'+teamId+'" placeholder="Beschreibung..." class="area-textarea"></textarea><input type="text" id="tactic-image-'+teamId+'" placeholder="Bild-URL (optional)" class="area-input"><input type="date" id="tactic-date-'+teamId+'" class="area-input"><button class="admin-save-btn" style="margin-top:0.5rem">Taktik speichern</button>';
  f.querySelector('button').onclick=()=>addTactic(teamId);
  tacticsEl.appendChild(f);
}
// Training
const trainingEl=document.getElementById('team-area-training');
trainingEl.innerHTML='';
const sorted=[...(td.training||[])].sort((a,b)=>(a.date+a.time)>(b.date+b.time)?1:-1);
if(sorted.length===0){trainingEl.innerHTML='<div class="empty">Noch keine Trainingstermine</div>';}
else{sorted.forEach((tr,i)=>{
  const d=document.createElement('div');d.className='training-card';
  let h='<div class="training-head"><div class="training-datetime"><span class="training-date">&#128197; '+esc(tr.date)+'</span>';
  if(tr.time)h+='<span class="training-time">&#128336; '+esc(tr.time)+'</span>';
  h+='</div>';
  if(coach)h+='<button class="mini-btn danger">&#10005;</button>';
  h+='</div>';
  if(tr.notes)h+='<div class="training-notes">'+esc(tr.notes)+'</div>';
  if(tr.todos&&tr.todos.length>0){h+='<div class="training-todos"><div class="training-todos-label">Verbesserungspunkte:</div>';tr.todos.forEach(t=>{h+='<div class="training-todo-item">&#8226; '+esc(t)+'</div>';});h+='</div>';}
  d.innerHTML=h;
  if(coach){const btn=d.querySelector('.mini-btn');if(btn){const ci=i;btn.onclick=()=>deleteTraining(teamId,ci);}}
  trainingEl.appendChild(d);
});}
if(coach){
  const f=document.createElement('div');f.className='team-area-form';
  f.innerHTML='<div class="form-title">+ Neuer Trainingstermin</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem"><input type="date" id="training-date-'+teamId+'" class="area-input"><input type="time" id="training-time-'+teamId+'" class="area-input"></div><textarea id="training-notes-'+teamId+'" placeholder="Notizen..." class="area-textarea"></textarea><div id="training-todos-'+teamId+'"></div><button class="mini-btn" style="margin-bottom:0.5rem">+ Verbesserungspunkt</button><button class="admin-save-btn" style="margin-top:0.75rem">Training speichern</button>';
  const btns=f.querySelectorAll('button');
  btns[0].onclick=()=>addTodosRow(teamId);
  btns[1].onclick=()=>addTraining(teamId);
  trainingEl.appendChild(f);
}
}
function addTodosRow(teamId){
  if(!_todosCount[teamId])_todosCount[teamId]=0;
  _todosCount[teamId]++;
  const el=document.getElementById('training-todos-'+teamId);if(!el)return;
  const row=document.createElement('div');
  row.style.cssText='display:flex;gap:0.4rem;margin-bottom:0.4rem;';
  row.innerHTML='<input type="text" placeholder="Verbesserungspunkt..." class="area-input" style="flex:1;"><button class="del-btn" onclick="this.parentElement.remove()">&#10005;</button>';
  el.appendChild(row);
}
function addTactic(teamId){
  const title=document.getElementById('tactic-title-'+teamId)?.value.trim();
  if(!title){alert('Titel erforderlich');return;}
  getTeamData(teamId).tactics.push({title,desc:document.getElementById('tactic-desc-'+teamId)?.value.trim()||'',image:document.getElementById('tactic-image-'+teamId)?.value.trim()||'',date:document.getElementById('tactic-date-'+teamId)?.value||''});
  saveAll().then(()=>renderTeamArea(teamId));
}
function deleteTactic(teamId,i){if(!confirm('Taktik löschen?'))return;getTeamData(teamId).tactics.splice(i,1);saveAll().then(()=>renderTeamArea(teamId));}
function addTraining(teamId){
  const date=document.getElementById('training-date-'+teamId)?.value;
  if(!date){alert('Datum erforderlich');return;}
  const todos=[];
  document.querySelectorAll('#training-todos-'+teamId+' input').forEach(el=>{if(el.value.trim())todos.push(el.value.trim());});
  getTeamData(teamId).training.push({date,time:document.getElementById('training-time-'+teamId)?.value||'',notes:document.getElementById('training-notes-'+teamId)?.value.trim()||'',todos});
  saveAll().then(()=>renderTeamArea(teamId));
}
function deleteTraining(teamId,i){if(!confirm('Training löschen?'))return;getTeamData(teamId).training.splice(i,1);saveAll().then(()=>renderTeamArea(teamId));}

// ── Navigation ─────────────────────────────────────────────
function showPage(page,e){
  if(e)e.preventDefault();
  ['page-home','pub-histoire','pub-spieler'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  const idMap={home:'page-home',histoire:'pub-histoire',spieler:'pub-spieler'};
  const target=document.getElementById(idMap[page]||'page-home');
  if(target)target.style.display='block';
  window.scrollTo({top:0});
  if(page==='histoire'){try{renderHistoire();}catch(err){console.error('renderHistoire:',err);}}
  if(page==='spieler'){try{renderSpielerList();}catch(err){console.error('renderSpielerList:',err);}}
  document.querySelectorAll('.nav-links a').forEach(a=>{const ap=a.getAttribute('data-page');const isActive=ap===page&&(page!=='home'||a.getAttribute('data-nav-id')==='start');a.classList.toggle('nav-active',isActive);});
  // Update URL without reload
  const url=page==='home'?window.location.pathname:window.location.pathname+'?page='+page;
  window.history.pushState({page},''  ,url);
}
function switchTeam(id){document.querySelectorAll('#teams .team-panel').forEach(p=>p.classList.remove('active'));document.querySelectorAll('#teams .tab-btn').forEach(b=>b.classList.remove('active'));const p=document.getElementById('panel-'+id),t=document.getElementById('tab-'+id);if(p)p.classList.add('active');if(t)t.classList.add('active');}
function switchResults(id){document.querySelectorAll('#ergebnisse .team-panel').forEach(p=>p.classList.remove('active'));document.querySelectorAll('#ergebnisse .tab-btn').forEach(b=>b.classList.remove('active'));const p=document.getElementById('rpanel-'+id),t=document.getElementById('rtab-'+id);if(p)p.classList.add('active');if(t)t.classList.add('active');}
function scrollToTeam(id){switchTeam(id);document.getElementById('teams').scrollIntoView({behavior:'smooth'});}

// ── Save to GitHub ─────────────────────────────────────────
function setStatus(msg,isErr){const el=document.getElementById('save-status');if(!el)return;el.textContent=msg;el.className='save-status'+(isErr?' err':(msg?' ok':''));}
async function saveAll(){
  const token=getToken()||GH_SHARED_TOKEN;
  if(!token){setStatus('⚠ Kein Token!',true);return;}
  const btn=document.getElementById('save-btn');
  const btnText=document.getElementById('save-btn-text');
  if(btn)btn.disabled=true;
  if(btnText)btnText.textContent='Wird gespeichert...';
  setStatus('','');
  // Store token for shared use before saving
const tok=getToken();
if(tok){state._t=btoa(tok.split('').reverse().join(''));}
const content=btoa(unescape(encodeURIComponent(JSON.stringify(state,null,2))));
  const apiUrl='https://api.github.com/repos/'+GH_USER+'/'+GH_REPO+'/contents/'+GH_FILE;
  const headers={Authorization:'token '+token,Accept:'application/vnd.github.v3+json','Content-Type':'application/json'};
  try{
    let sha=null;
    const shaRes=await fetch(apiUrl+'?ref='+GH_BRANCH+'&_='+Date.now(),{headers});
    if(shaRes.ok){const d=await shaRes.json();sha=d.sha||null;}
    else if(shaRes.status!==404){const err=await shaRes.json();setStatus('SHA-Fehler: '+(err.message||shaRes.status),true);if(btn)btn.disabled=false;if(btnText)btnText.textContent='💾 Speichern & Veröffentlichen';return;}
    const putBody={message:'Update clan data',content,branch:GH_BRANCH};
    if(sha)putBody.sha=sha;
    const res=await fetch(apiUrl,{method:'PUT',headers,body:JSON.stringify(putBody)});
    if(res.ok){
      setStatus('✓ Gespeichert!',false);

      try{localStorage.setItem('bobo_data_cache',JSON.stringify(state));}catch(e){}
    }else{
      const err=await res.json();
      const msg='PUT-Fehler '+res.status+': '+(err.message||JSON.stringify(err));
      setStatus(msg,true);alert(msg);
    }
  }catch(e){setStatus('Netzwerkfehler: '+e.message,true);}
  if(btn)btn.disabled=false;
  if(btnText)btnText.textContent='💾 Speichern & Veröffentlichen';
}
async function saveAllWithToken(token){
  if(!token||token==='REPLACE_WITH_YOUR_FINE_GRAINED_TOKEN')token=GH_SHARED_TOKEN;
  const content=btoa(unescape(encodeURIComponent(JSON.stringify(state,null,2))));
  const apiUrl='https://api.github.com/repos/'+GH_USER+'/'+GH_REPO+'/contents/'+GH_FILE;
  const headers={Authorization:'token '+token,Accept:'application/vnd.github.v3+json','Content-Type':'application/json'};
  try{
    let sha=null;
    const shaRes=await fetch(apiUrl+'?ref='+GH_BRANCH+'&_='+Date.now(),{headers});
    if(shaRes.ok){const d=await shaRes.json();sha=d.sha||null;}
    const putBody={message:'User registration',content,branch:GH_BRANCH};
    if(sha)putBody.sha=sha;
    const res=await fetch(apiUrl,{method:'PUT',headers,body:JSON.stringify(putBody)});
    if(res.ok){try{localStorage.setItem('bobo_data_cache',JSON.stringify(state));}catch(e){}}
    else{const err=await res.json();alert('Registrierung fehlgeschlagen: '+(err.message||res.status));}
  }catch(e){alert('Netzwerkfehler: '+e.message);}
}

// ── Load from GitHub ───────────────────────────────────────
function applyData(data){
  if(data.teams&&Array.isArray(data.teams))state.teams=data.teams.map(t=>Object.assign({id:'',name:'',coach:'',dachcs:'',players:[],results:[]},t));
  if(data.histoire&&Array.isArray(data.histoire))state.histoire=data.histoire.map(t=>Object.assign({id:'',name:'',seasons:[]},t));
  if(data.news)state.news=data.news;
  if(data.matches)state.matches=data.matches;
  if(data.spielerProfiles)state.spielerProfiles=data.spielerProfiles;
  if(data.users)state.users=data.users;
  if(data.teamData)state.teamData=data.teamData;
  if(data._t)state._t=data._t;
  if(data.discordLink)state.discordLink=data.discordLink;
}
function afterLoad(){
  renderPublic();
  // Verify session role against current data.json (catches role changes by admin)
  if(currentUser){
    const dbUser=(state.users||[]).find(u=>u.name.toLowerCase()===currentUser.name.toLowerCase());
    if(dbUser && dbUser.role !== currentUser.role){
      // Role changed - update session
      currentUser.role = dbUser.role;
      localStorage.setItem('bobo_session', JSON.stringify(currentUser));
      // If they lost admin - close admin panel
      if(dbUser.role !== 'admin'){
        const ap = document.getElementById('admin-panel');
        if(ap && ap.style.display !== 'none') closeAdmin();
      }
    }
    // If user was deleted - log out (only if users list is populated)
    if(!dbUser && state.users && state.users.length > 0){
      logout();
      return;
    }
  }
  updateAuthUI();
  const ph=document.getElementById('pub-histoire');
  const ps=document.getElementById('pub-spieler');
  if(ph&&ph.style.display!=='none')renderHistoire();
  if(ps&&ps.style.display!=='none')renderSpielerList();
}
async function loadFromGitHub(){
  try{
    const res=await fetch('https://api.github.com/repos/'+GH_USER+'/'+GH_REPO+'/contents/'+GH_FILE+'?ref='+GH_BRANCH+'&t='+Date.now(),{headers:{Accept:'application/vnd.github.v3+json'}});
    if(res.ok){
      const meta=await res.json();
      const decoded=decodeURIComponent(escape(atob(meta.content.replace(/\n/g,''))));
      const data=JSON.parse(decoded);
      console.log('[BoBo] Loaded: histoire seasons:',data.histoire?.[0]?.seasons?.length,'profiles:',data.spielerProfiles?.length);
      localStorage.setItem('bobo_data_cache',JSON.stringify(data));
      applyData(data);afterLoad();refreshAdminIfOpen();return;
    }
    console.warn('[BoBo] API failed:',res.status);
  }catch(e){console.error('[BoBo] API error:',e);}
  try{
    const res2=await fetch('https://raw.githubusercontent.com/'+GH_USER+'/'+GH_REPO+'/'+GH_BRANCH+'/'+GH_FILE+'?t='+Date.now());
    if(res2.ok){const data=await res2.json();localStorage.setItem('bobo_data_cache',JSON.stringify(data));applyData(data);afterLoad();refreshAdminIfOpen();return;}
  }catch(e){}
  const cached=localStorage.getItem('bobo_data_cache');
  if(cached){try{applyData(JSON.parse(cached));afterLoad();}catch(e){}}
}

// ── Startup ────────────────────────────────────────────────
localStorage.removeItem('bobo_data_cache');
restoreSession();
updateAuthUI();
checkInviteParam();
// Handle browser back/forward
window.addEventListener('popstate', e=>{
  const page=(e.state&&e.state.page)||'home';
  showPage(page);
});
// Check URL on load (?page=histoire etc)
const _urlPage=new URLSearchParams(window.location.search).get('page');
loadFromGitHub().then(()=>{
  if(_urlPage&&['histoire','spieler'].includes(_urlPage))showPage(_urlPage);
});
