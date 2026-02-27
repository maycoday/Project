// ============================
// GLOBAL STATE
// ============================
const S = {
  aesKey: null,
  aesHex: '',
  token: '',
  complaint: '',
  encrypted: null,
  authPairs: {HR:null,ICC:null,NGO:null},
  selected: new Set(),
  wrapped: {},
  submissions: [],
  log: [],
  currentMode: 'user',
  simStep: 2,
  simAuthTab: 'HR',
  selectedAuthority: null,
  authorityComplaints: [],
};

// ============================
// UTILS
// ============================
const ab2hex = b => Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
const ab2b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
const trunc = (s,n=36) => s.length>n ? s.slice(0,n)+'…' : s;
const esc = s => {const d=document.createElement('div');d.textContent=s;return d.innerHTML};
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const fmtPem = b64 => `-----BEGIN PUBLIC KEY-----\n${b64.slice(0,48)}…\n-----END PUBLIC KEY-----`;

async function hashToken(token){
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function collectComplaintMetadata(){
  const val = id => {
    const el = document.getElementById(id);
    if(!el) return null;
    const v = (el.value||'').trim();
    return v.length? v : null;
  };
  return {
    category: val('incidentCategory'),
    incidentDate: val('incidentDate'),
    department: val('incidentDept'),
    delayRelease: val('delayRelease')
  };
}

async function persistEncryptedComplaint(submission, metadata){
  if(!window.AawaazData) return {offline:true};
  const wrappedKeys = {};
  Object.entries(S.wrapped).forEach(([auth,val])=>{
    if(val && val.b64) wrappedKeys[auth] = val.b64;
  });
  const payload = {
    reference: submission.id,
    created_at: submission.timestamp,
    token_hash: await hashToken(submission.token),
    token_hint: submission.token.slice(0,8),
    ciphertext_b64: submission.blob,
    iv_b64: submission.iv,
    authorities: submission.auths,
    wrapped_keys: wrappedKeys,
    metadata: {
      category: metadata.category || null,
      department: metadata.department || null,
      incident_date: metadata.incidentDate || null,
      delay_release: metadata.delayRelease || null,
      recorded_at: submission.timestamp
    }
  };
  return window.AawaazData.saveComplaint(payload);
}

async function findRemoteComplaintByToken(token){
  if(!window.AawaazData || !window.AawaazData.enabled) return null;
  const tokenHash = await hashToken(token);
  return window.AawaazData.findComplaintByTokenHash(tokenHash);
}

function renderTrackingCard(refToken, filedAt, authorities){
  const card = document.getElementById('statusCard');
  if(!card) return;
  card.classList.add('show');
  document.getElementById('trackRef').textContent = refToken;
  document.getElementById('trackDate').textContent = filedAt ? new Date(filedAt).toLocaleDateString('en-IN') : '—';
  document.getElementById('trackAuths').textContent = authorities && authorities.length ? authorities.join(', ') : '—';
}

// ============================
// LIVE CLOCK
// ============================
function updateClock(){
  const el = document.getElementById('liveTime');
  if(el) el.textContent = new Date().toLocaleTimeString('en-IN',{hour12:true})+', IST';
}
setInterval(updateClock,1000);
updateClock();

// ============================
// CRYPTO LOG
// ============================
function addLog(msg,type='info'){
  S.log.unshift({t:new Date().toLocaleTimeString(),msg,type});
  const count = document.getElementById('simLogCount');
  if(count) count.textContent = S.log.length;
  renderCryptoLog();
}
function renderCryptoLog(){
  const body = document.getElementById('cryptoLogBody');
  if(!body) return;
  const colors = {info:'rgba(201,168,76,0.8)',success:'#6ee7b7',warn:'#fca5a5'};
  body.innerHTML = S.log.slice(0,15).map(e=>
    `<div style="display:flex;gap:10px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
      <span style="color:rgba(255,255,255,0.25);flex-shrink:0">${e.t}</span>
      <span style="color:${colors[e.type]||colors.info}">${esc(e.msg)}</span>
    </div>`
  ).join('');
}
function toggleCryptoLog(){
  document.getElementById('cryptoLog').classList.toggle('open');
}

// ============================
// INIT CRYPTO
// ============================
async function init(){
  addLog('Initializing Aawaaz crypto engine...','info');
  try{
    // AES key
    S.aesKey = await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
    const raw = await crypto.subtle.exportKey('raw',S.aesKey);
    S.aesHex = ab2hex(raw);
    addLog('AES-256-GCM key generated','success');

    // Token
    S.token = crypto.randomUUID();
    addLog('Tracking token generated: '+trunc(S.token,20),'success');

    // Display in user mode
    if(document.getElementById('userAesDisp')) document.getElementById('userAesDisp').textContent = S.aesHex;
    if(document.getElementById('userToken')) document.getElementById('userToken').textContent = S.token;
    if(document.getElementById('cryptoStatus')) document.getElementById('cryptoStatus').textContent = 'AES-256-GCM · Ready';

    // Display in sim mode
    if(document.getElementById('simAesKey')) document.getElementById('simAesKey').textContent = S.aesHex;
    if(document.getElementById('simToken')) document.getElementById('simToken').textContent = S.token;

    // RSA key pairs for each authority
    for(const auth of ['HR','ICC','NGO']){
      addLog(`Generating RSA-OAEP-2048 for ${auth}...`,'info');
      const kp = await crypto.subtle.generateKey(
        {name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},
        true,['wrapKey','unwrapKey']
      );
      S.authPairs[auth] = kp;

      // Public key display
      const spki = await crypto.subtle.exportKey('spki', kp.publicKey);
      const pubB64 = ab2b64(spki);
      const pem = fmtPem(pubB64);
      ['','sim'].forEach(pre=>{
        const el = document.getElementById(pre+'pubkey'+auth) || document.getElementById(pre+'Pubkey'+auth);
        if(el) el.textContent = pem;
      });
      // Sim pubkey
      const simPub = document.getElementById('simPubkey'+auth);
      if(simPub) simPub.textContent = pem;

      // Private key display
      const pkcs8 = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
      const privB64 = ab2b64(pkcs8);
      const privPem = `-----BEGIN PRIVATE KEY-----\n${privB64.slice(0,64)}…\n-----END PRIVATE KEY-----`;
      const simPriv = document.getElementById('sim'+auth+'PrivKey');
      if(simPriv) simPriv.textContent = privPem;

      addLog(`${auth} RSA-2048 key pair ready`,'success');
    }
    addLog('All keys initialized. System ready.','success');
  }catch(e){
    addLog('Init error: '+e.message,'warn');
    console.error(e);
  }
}

// ============================
// MODE SWITCH
// ============================
function setMode(mode){
  S.currentMode = mode;
  document.getElementById('userMode').style.display = mode==='user'?'block':'none';
  document.getElementById('simMode').style.display = mode==='sim'?'block':'none';
  document.getElementById('authorityMode').style.display = mode==='authority'?'block':'none';
  document.getElementById('govNavUser').style.display = mode==='user'?'flex':'none';
  document.getElementById('govNavSim').style.display = mode==='sim'?'flex':'none';
  document.getElementById('govNavAuth').style.display = mode==='authority'?'flex':'none';
  document.getElementById('btnUser').classList.toggle('active', mode==='user');
  document.getElementById('btnSim').classList.toggle('active', mode==='sim');
  document.getElementById('btnAuth').classList.toggle('active', mode==='authority');
  if(mode==='sim'){
    // Update sim fields from current state
    if(S.aesHex) document.getElementById('simAesKey').textContent = S.aesHex;
    if(S.token) document.getElementById('simToken').textContent = S.token;
    updateSimPayload();
    updateSimAuthPanel();
  }
  if(mode==='authority'){
    loadAuthorityCounts();
  }
}

function detectStartupMode(){
  const params = new URLSearchParams(window.location.search);
  const paramMode = params.get('mode');
  const hashMode = (window.location.hash||'').replace('#','').toLowerCase();
  if((paramMode && paramMode.toLowerCase()==='sim') || hashMode==='sim'){
    return 'sim';
  }
  if((paramMode && paramMode.toLowerCase()==='authority') || hashMode==='authority'){
    return 'authority';
  }
  return 'user';
}

function goToPatternPage(){
  window.location.href = 'index2.html';
}

// ============================
// USER MODE PAGES
// ============================
function showUserPage(id){
  document.querySelectorAll('#userMode .page').forEach(p=>p.style.display='none');
  const el = document.getElementById('page-'+id);
  if(el) el.style.display='block';
  document.querySelectorAll('#govNavUser .gov-nav-link').forEach((l,i)=>{
    l.classList.toggle('active',['file','track','about'][i]===id);
  });
}

// ============================
// SIM MODE PAGES
// ============================
function showSimPage(id){
  document.querySelectorAll('#simMode .page').forEach(p=>p.style.display='none');
  const el = document.getElementById('simpage-'+id);
  if(el) el.style.display='block';
  document.querySelectorAll('#govNavSim .gov-nav-link').forEach((l,i)=>{
    l.classList.toggle('active',['live','flow','security'][i]===id);
  });
}

// ============================
// KEY TOGGLE
// ============================
function toggleKey(id){
  const el = document.getElementById(id);
  if(el) el.classList.toggle('revealed');
}

// ============================
// COMPLAINT TYPING (user)
// ============================
let encTimer;
async function onComplaintType(val){
  S.complaint = val;
  const plain = document.getElementById('encPlainPrev');
  const cipher = document.getElementById('encCipherPrev');
  if(plain) plain.textContent = val || 'Start typing...';
  clearTimeout(encTimer);
  if(!val){if(cipher) cipher.textContent='awaiting input...';return}
  // Scramble preview
  const scramble = () => {
    let r='';for(let i=0;i<Math.min(val.length*3,120);i++)r+='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='[Math.floor(Math.random()*65)];
    return r;
  };
  if(cipher) cipher.textContent = scramble();
  encTimer = setTimeout(async()=>{
    if(!S.aesKey) return;
    try{
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({name:'AES-GCM',iv},S.aesKey,new TextEncoder().encode(val));
      S.encrypted = {ciphertext:ct,iv,b64:ab2b64(ct)};
      if(cipher) cipher.textContent = S.encrypted.b64.slice(0,140)+'…';
    }catch(e){}
  },350);
}

// ============================
// COMPLAINT TYPING (sim)
// ============================
let simEncTimer;
async function onSimType(val){
  S.complaint = val;
  const plain = document.getElementById('simPlainPrev');
  const cipher = document.getElementById('simCipherPrev');
  if(plain) plain.textContent = val || 'Type below...';
  clearTimeout(simEncTimer);
  if(!val){if(cipher)cipher.textContent='...';return}
  const scramble=()=>{let r='';for(let i=0;i<Math.min(val.length*3,100);i++)r+='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='[Math.floor(Math.random()*65)];return r};
  if(cipher) cipher.textContent = scramble();
  simEncTimer = setTimeout(async()=>{
    if(!S.aesKey) return;
    try{
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({name:'AES-GCM',iv},S.aesKey,new TextEncoder().encode(val));
      S.encrypted = {ciphertext:ct,iv,b64:ab2b64(ct)};
      if(cipher) cipher.textContent = S.encrypted.b64.slice(0,100)+'…';
      addLog(`Complaint encrypted: ${val.length}chars → ciphertext`,'success');
    }catch(e){}
  },350);
}

// ============================
// AUTHORITY TOGGLE (user)
// ============================
async function toggleAuth(auth){
  const card = document.getElementById('auth'+auth);
  const chk = document.getElementById('chk'+auth);
  if(S.selected.has(auth)){
    S.selected.delete(auth);
    delete S.wrapped[auth];
    card.classList.remove('selected');
    chk.textContent='';
  } else {
    S.selected.add(auth);
    card.classList.add('selected');
    chk.textContent='✓';
    if(S.aesKey && S.authPairs[auth]){
      const wk = await crypto.subtle.wrapKey('raw',S.aesKey,S.authPairs[auth].publicKey,{name:'RSA-OAEP'});
      S.wrapped[auth] = {wk,b64:ab2b64(wk)};
    }
  }
  const bn = document.getElementById('bypassNote');
  if(bn) bn.style.display = S.selected.size<3 && S.selected.size>0 ? 'block':'none';
}

// ============================
// AUTHORITY TOGGLE (sim)
// ============================
async function simToggleAuth(auth){
  const card = document.getElementById('simAuth'+auth);
  const chk = document.getElementById('simChk'+auth);
  const wrapOut = document.getElementById('wrapOut'+auth);
  const wrapRow = document.getElementById('wrapRow'+auth);
  if(S.selected.has(auth)){
    S.selected.delete(auth);
    delete S.wrapped[auth];
    card.classList.remove('selected');
    chk.textContent='';
    if(wrapOut) wrapOut.textContent='not wrapped';
    if(wrapRow) wrapRow.classList.remove('active');
    addLog(`${auth} excluded — no key wrap`,'warn');
  } else {
    S.selected.add(auth);
    card.classList.add('selected');
    chk.textContent='✓';
    if(S.aesKey && S.authPairs[auth]){
      addLog(`Wrapping AES key with ${auth} RSA public key...`,'info');
      const wk = await crypto.subtle.wrapKey('raw',S.aesKey,S.authPairs[auth].publicKey,{name:'RSA-OAEP'});
      S.wrapped[auth] = {wk,b64:ab2b64(wk)};
      if(wrapOut){wrapOut.textContent=ab2b64(wk).slice(0,20)+'…'}
      if(wrapRow) wrapRow.classList.add('active');
      addLog(`${auth} AES key wrapped: ${ab2b64(wk).slice(0,16)}...`,'success');
    }
  }
  updateSimPayload();
}

// ============================
// SIM STEPS
// ============================
function simSetStep(n){
  S.simStep = n;
  [1,2,3,4].forEach(i=>{
    const cont = document.getElementById('simStep'+i);
    if(cont) cont.style.display = i===n ? 'block':'none';
    const node = document.getElementById('sn'+i);
    const line = document.getElementById('sl'+i);
    if(node){
      node.classList.remove('active','done');
      if(i<n) node.classList.add('done');
      else if(i===n) node.classList.add('active');
    }
    if(line && i<4){
      if(line) line.style.background = i<n ? 'var(--green)':'var(--border)';
    }
  });
  if(n===4) updateSimPayload();
}

function updateSimPayload(){
  const pPayload = document.getElementById('simPPayload');
  const pKeys = document.getElementById('simPKeys');
  const pToken = document.getElementById('simPToken');
  if(S.encrypted && pPayload) pPayload.textContent = trunc(S.encrypted.b64, 40);
  if(pKeys){
    const wk={};
    S.selected.forEach(a=>{if(S.wrapped[a]) wk[a]=trunc(S.wrapped[a].b64,16)+'…'});
    pKeys.textContent = JSON.stringify(wk);
  }
  if(pToken && S.token) pToken.textContent = btoa(S.token).slice(0,24)+'… (hashed)';
}

// ============================
// SUBMIT (user)
// ============================
async function submitComplaint(){
  const input = document.getElementById('complaintInput');
  if(!S.encrypted && input && input.value){
    await onComplaintType(input.value);
    await sleep(400);
  }
  if(!S.encrypted){alert('Please write your complaint first.');return}
  if(S.selected.size===0){alert('Please select at least one receiving authority.');return}

  const btn = document.getElementById('submitBtn');
  btn.disabled=true; btn.textContent='Submitting...';

  const sub = {
    id: crypto.randomUUID().slice(0,8),
    timestamp: new Date().toISOString(),
    blob: S.encrypted.b64,
    iv: ab2b64(S.encrypted.iv),
    wrapped: {...S.wrapped},
    ivRaw: S.encrypted.iv,
    ciphertextRaw: S.encrypted.ciphertext,
    tokenHash: btoa(S.token),
    token: S.token,
    auths: [...S.selected],
  };
  S.submissions.push(sub);
  addLog(`Complaint submitted ID:${sub.id} to [${sub.auths.join(',')}]`,'success');

  const metadata = collectComplaintMetadata();
  try{
    const result = await persistEncryptedComplaint(sub, metadata);
    if(result?.offline){
      addLog('Supabase not configured — complaint stored locally only.','warn');
    }else{
      addLog('Encrypted complaint stored in Supabase.','success');
    }
  }catch(e){
    addLog('Secure storage error: '+e.message,'warn');
    console.error(e);
    alert('Encrypted storage could not be reached. Your complaint stays encrypted locally; please retry once connectivity is restored.');
  }

  const successBox = document.getElementById('successBox');
  if(successBox) successBox.classList.add('show');
  const ref = document.getElementById('successRef');
  if(ref) ref.textContent = S.token;

  btn.textContent='✓ Filed';
  setTimeout(()=>{btn.disabled=false;btn.textContent='Submit Encrypted Complaint →'},4000);
}

// ============================
// SUBMIT (sim)
// ============================
async function simSubmit(){
  if(!S.encrypted){
    alert('Please type a complaint in Step 2 first.');
    return;
  }
  const btn = document.getElementById('simSubmitBtn');
  btn.disabled=true; btn.textContent='Submitting...';

  const sub = {
    id: crypto.randomUUID().slice(0,8),
    timestamp: new Date().toISOString(),
    blob: S.encrypted.b64,
    iv: ab2b64(S.encrypted.iv),
    wrapped: {...S.wrapped},
    ivRaw: S.encrypted.iv,
    ciphertextRaw: S.encrypted.ciphertext,
    tokenHash: btoa(S.token),
    token: S.token,
    auths: [...S.selected],
  };
  S.submissions.push(sub);
  addLog(`Complaint submitted — ID:${sub.id}`,'success');
  addLog(`Server received: encrypted blob only. IP=[STRIPPED]`,'success');

  updateSimServerPanel(sub);
  updateSimAuthPanel();

  const sb = document.getElementById('simSuccessBox');
  if(sb) sb.classList.add('show');
  const st = document.getElementById('simSuccessToken');
  if(st) st.textContent = S.token;
  document.getElementById('simSubCount').textContent = S.submissions.length;
  document.getElementById('simKeyCount').textContent = Object.keys(sub.wrapped).length;

  btn.textContent='✓ Submitted';
  setTimeout(()=>{btn.disabled=false;btn.textContent='🔐 Submit Another'},3000);
}

// ============================
// SERVER PANEL (sim)
// ============================
function updateSimServerPanel(sub){
  const log = document.getElementById('simServerLog');
  if(log) log.innerHTML=`
    <div class="tl"><span class="tk">timestamp:</span><span class="tv">${sub.timestamp}</span></div>
    <div class="tl"><span class="tk">id:</span><span class="tv">${sub.id}</span></div>
    <div class="tl"><span class="tk">encrypted_blob:</span><span class="tv">${trunc(sub.blob,35)}</span></div>
    <div class="tl"><span class="tk">wrapped_keys:</span><span class="tv">[${sub.auths.join(', ')}]</span></div>
    <div class="tl"><span class="tk">tracking_hash:</span><span class="tv">${trunc(sub.tokenHash,20)}</span></div>
    <div class="tl"><span class="tk">ip_address:</span><span class="tv red">[STRIPPED]</span></div>
    <div class="tl"><span class="tk">user_identity:</span><span class="tv red">[UNKNOWN]</span></div>
    <div class="tl"><span class="tk">plaintext:</span><span class="tv dim">[DOES NOT EXIST]</span></div>
  `;
  const stored = document.getElementById('simStoredRecords');
  if(stored) stored.innerHTML = S.submissions.map(s=>`
    <div style="background:var(--navy);border-radius:2px;padding:8px 10px;margin-bottom:6px;font-family:'DM Mono',monospace;font-size:8px;color:var(--gold)">
      <div style="color:rgba(255,255,255,0.3);margin-bottom:3px">ID: ${s.id}</div>
      <div>${trunc(s.blob,45)}</div>
    </div>`).join('');
}

// ============================
// AUTHORITY PANEL (sim)
// ============================
function updateSimAuthPanel(){
  ['HR','ICC','NGO'].forEach(auth=>{
    const container = document.getElementById(auth.toLowerCase()+'SimComplaints');
    if(!container) return;
    const authSubs = S.submissions.filter(s=>s.wrapped[auth]);
    if(authSubs.length===0){
      const excluded = !S.selected.has(auth) && S.submissions.length>0;
      container.innerHTML=`<div class="excluded-sim">
        <span class="lock">${excluded?'🔒':'📭'}</span>
        ${excluded
          ? `<strong style="color:var(--danger)">Cryptographically Excluded</strong><br><small>No wrapped key for ${auth}. Mathematically impossible to read this complaint.</small>`
          : 'No complaints addressed to this authority yet.'
        }
      </div>`;
      return;
    }
    container.innerHTML = authSubs.map(sub=>`
      <div class="sim-complaint" id="sc_${auth}_${sub.id}">
        <div class="sim-complaint-top">
          <span class="sim-complaint-id">ID: ${sub.id}</span>
          <span class="sim-complaint-id">${new Date(sub.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="sim-blob">${sub.blob}</div>
        <div class="decrypt-steps-sim" id="dsp_${auth}_${sub.id}">
          <div class="dstep" id="ds1_${auth}_${sub.id}"><div class="dstep-icon">○</div>Loading ${auth} private key...</div>
          <div class="dstep" id="ds2_${auth}_${sub.id}"><div class="dstep-icon">○</div>Unwrapping AES key with RSA private key...</div>
          <div class="dstep" id="ds3_${auth}_${sub.id}"><div class="dstep-icon">○</div>Decrypting complaint blob...</div>
        </div>
        <div class="decrypted-reveal" id="dr_${auth}_${sub.id}"></div>
        <button class="btn btn-outline" style="width:100%;justify-content:center;margin-top:8px;font-size:10px;border-color:var(--border2);color:var(--navy)" onclick="decryptFor('${auth}','${sub.id}')">
          🔓 Decrypt with ${auth} Private Key
        </button>
      </div>`).join('');
  });
}

// ============================
// DECRYPT
// ============================
async function decryptFor(auth, subId){
  const sub = S.submissions.find(s=>s.id===subId);
  if(!sub||!sub.wrapped[auth]) return;
  const kp = S.authPairs[auth];
  if(!kp) return;

  const dpEl = document.getElementById(`dsp_${auth}_${subId}`);
  const drEl = document.getElementById(`dr_${auth}_${subId}`);
  const steps = [1,2,3].map(i=>document.getElementById(`ds${i}_${auth}_${subId}`));
  if(dpEl) dpEl.style.display='block';

  const markDone = (i) => {
    if(steps[i]){steps[i].classList.add('done');steps[i].querySelector('.dstep-icon').textContent='✓'}
    if(i+1<3 && steps[i+1]) steps[i+1].classList.add('running');
  };

  try{
    addLog(`${auth}: initiating decryption for ${subId}`,'info');
    if(steps[0]) steps[0].classList.add('running');
    await sleep(600); markDone(0);

    addLog(`${auth}: unwrapping AES key with RSA private key...`,'info');
    await sleep(700);
    const unwrappedAes = await crypto.subtle.unwrapKey(
      'raw', sub.wrapped[auth].wk, kp.privateKey,
      {name:'RSA-OAEP'},{name:'AES-GCM',length:256},true,['encrypt','decrypt']
    );
    markDone(1);
    addLog(`${auth}: AES key recovered`,'success');

    await sleep(600);
    const dec = await crypto.subtle.decrypt({name:'AES-GCM',iv:sub.ivRaw}, unwrappedAes, sub.ciphertextRaw);
    const text = new TextDecoder().decode(dec);
    markDone(2);
    addLog(`${auth}: Decryption complete — ${text.length} chars`,'success');

    await sleep(400);
    if(drEl){
      drEl.innerHTML=`<div style="font-size:9px;color:var(--green);font-family:'DM Mono',monospace;margin-bottom:6px">✓ DECRYPTED — ${auth} EYES ONLY</div>${esc(text)}`;
      drEl.classList.add('show');
    }
    if(dpEl) dpEl.style.display='none';
  }catch(e){
    if(drEl) drEl.innerHTML=`<div style="color:var(--danger);font-size:11px">Decryption failed: ${e.message}</div>`;
    addLog('Error: '+e.message,'warn');
    console.error(e);
  }
}

// ============================
// SIM AUTH TAB
// ============================
function simSwitchAuth(auth){
  S.simAuthTab = auth;
  ['HR','ICC','NGO'].forEach(a=>{
    const c = document.getElementById('simAuthContent_'+a);
    if(c) c.style.display = a===auth?'block':'none';
  });
  document.querySelectorAll('.sim-auth-tab').forEach(t=>{
    t.classList.toggle('active', t.textContent.includes(auth));
  });
}

// ============================
// TRACK COMPLAINT
// ============================
async function trackComplaint(){
  const val = document.getElementById('trackInput').value.trim();
  if(!val){alert('Please enter your tracking token.');return}
  const local = S.submissions.find(s=>s.token===val);
  if(local){
    renderTrackingCard(val, local.timestamp, local.auths);
    return;
  }
  try{
    const remote = await findRemoteComplaintByToken(val);
    if(remote){
      renderTrackingCard(val, remote.created_at, remote.authorities || []);
      return;
    }
  }catch(e){
    console.error(e);
    alert('Unable to query secure storage right now. Please try again later.');
    return;
  }
  alert('No complaint found with this token. If you just submitted, please allow a moment before retrying.');
}

// ============================
// ZKP SIMULATION
// ============================
async function runZKP(){
  const out = document.getElementById('zkpOutput');
  if(!out) return;
  out.style.display='block';
  out.innerHTML='';
  const steps=[
    {t:0,msg:'> Generating membership proof for org-ID-0x4f9a...',c:'rgba(201,168,76,0.6)'},
    {t:600,msg:'> Computing witness from secret credential...',c:'rgba(201,168,76,0.6)'},
    {t:1200,msg:'> Running Groth16 circuit over Merkle tree (depth=20)...',c:'var(--gold)'},
    {t:2000,msg:'> Proof π = (A:0x3f4a2c..., B:0x8c2d7a..., C:0x1e7f3b...)',c:'var(--gold)'},
    {t:2800,msg:'> Verifier checking proof without accessing identity...',c:'rgba(245,158,11,0.8)'},
    {t:3500,msg:'> Verification: PASS ✓',c:'#6ee7b7'},
    {t:4000,msg:'> User is legitimate employee of org-ID-0x4f9a',c:'#6ee7b7'},
    {t:4300,msg:'> Identity revealed to verifier: [UNKNOWN]',c:'#6ee7b7'},
    {t:4500,msg:'> ZKP guarantees: membership proven, identity protected.',c:'#6ee7b7'},
  ];
  steps.forEach(s=>setTimeout(()=>{
    out.innerHTML += `<div style="color:${s.c}">${s.msg}</div>`;
    out.scrollTop=out.scrollHeight;
  },s.t));
  addLog('ZKP membership proof simulation run','success');
}

// ============================
// EMERGENCY DELETE
// ============================
async function emergencyDelete(){
  S.complaint='';
  const inp = document.getElementById('complaintInput');
  if(inp) inp.value='';
  sessionStorage.clear();
  try{localStorage.clear()}catch(e){}
  if(window.caches) (await caches.keys()).forEach(k=>caches.delete(k));
  addLog('Emergency delete executed — all local data wiped','warn');
  alert('All local data cleared. Refreshing page.');
  location.reload();
}

function runEmergencyDeleteSim(){
  const steps = document.getElementById('emergencySteps');
  if(steps) steps.style.display='block';
  const ids=['edel1','edel2','edel3','edel4','edel5','edel6'];
  ids.forEach((id,i)=>setTimeout(()=>{
    const el=document.getElementById(id);
    if(el){
      el.classList.remove('running');
      el.classList.add('done');
      el.querySelector('.dstep-icon').textContent='✓';
    }
    addLog('Emergency delete step '+(i+1)+' complete','warn');
  },400*(i+1)));
}

// ============================
// QUICK EXIT
// ============================
function quickExit(){
  sessionStorage.clear();
  try{localStorage.clear()}catch(e){}
  if(window.caches) caches.keys().then(ks=>ks.forEach(k=>caches.delete(k)));
  document.title='Weather Today';
  window.location.href='https://www.google.com';
}

// ============================
// FILE HANDLING (meta strip sim)
// ============================
function handleFile(input){
  const status = document.getElementById('metaStripStatus');
  if(!input.files[0]) return;
  if(status){
    status.style.color='var(--warn)';
    status.textContent='Stripping metadata...';
    setTimeout(()=>{
      status.style.color='var(--green)';
      status.textContent='✓ Metadata stripped — GPS, device info, timestamps removed. File ready for encrypted upload.';
      addLog('EXIF metadata stripped from attachment','success');
    },800);
  }
}

// ============================
// AUTHORITY MODE
// ============================

/** Show authority sub-pages (review / stats) */
function showAuthPage(id){
  document.querySelectorAll('#authorityMode .page').forEach(p=>{
    p.style.display = 'none';
    p.classList.remove('active');
  });
  const target = document.getElementById('auth-'+id);
  if(target){
    target.style.display = 'block';
    target.classList.add('active');
  }
  // Update nav active state
  document.querySelectorAll('#govNavAuth .gov-nav-link').forEach((l,i)=>{
    l.classList.toggle('active', (id==='review'&&i===0)||(id==='stats'&&i===1));
  });
  // Refresh stats when switching to stats tab
  if(id==='stats' && S.selectedAuthority) refreshAuthorityStats();
}

/** Load complaint counts for all three authority cards */
async function loadAuthorityCounts(){
  try{
    const allComplaints = await window.AawaazData.fetchAllComplaints();
    ['HR','ICC','NGO'].forEach(auth=>{
      const count = allComplaints.filter(c=>c.authorities && c.authorities.includes(auth)).length;
      const el = document.getElementById(auth.toLowerCase()+'Count');
      if(el) el.textContent = count + ' complaint'+(count!==1?'s':'');
    });
  }catch(e){
    console.warn('[Aawaaz] Could not load authority counts:', e);
  }
}

/** Select an authority (HR / ICC / NGO) and load its complaints */
async function selectAuthority(auth){
  S.selectedAuthority = auth;

  // Highlight selected card
  ['HR','ICC','NGO'].forEach(a=>{
    const card = document.getElementById('authCard'+a);
    if(card){
      card.style.borderColor = a===auth ? 'var(--navy)' : 'var(--border)';
      card.style.background  = a===auth ? 'var(--cream)' : 'var(--white)';
    }
  });

  // Update header
  const label = document.getElementById('authCurrent');
  if(label) label.textContent = auth + ' Authority';

  const listWrap = document.getElementById('authComplaintsList');
  if(listWrap) listWrap.style.display = 'block';

  const selectedLabel = document.getElementById('selectedAuthLabel');
  if(selectedLabel) selectedLabel.textContent = auth;

  // Show loading
  const listEl = document.getElementById('complaintsList');
  if(listEl) listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted)">Loading complaints...</div>';

  try{
    const complaints = await window.AawaazData.fetchComplaintsByAuthority(auth);
    S.authorityComplaints = complaints;
    renderAuthorityComplaints(complaints, auth);
    updateAuthorityCounts(complaints);
  }catch(e){
    console.error('[Aawaaz] Error fetching complaints:', e);
    if(listEl) listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--danger)">Error loading complaints. Check console for details.</div>';
  }
}

/** Render complaint cards in the authority review list */
function renderAuthorityComplaints(complaints, auth){
  const listEl = document.getElementById('complaintsList');
  if(!listEl) return;

  if(!complaints || complaints.length === 0){
    listEl.innerHTML = '<div style="text-align:center;color:var(--muted);padding:32px;font-style:italic">No complaints assigned to '+esc(auth)+' authority yet.</div>';
    return;
  }

  listEl.innerHTML = complaints.map((c, idx) => {
    const date = new Date(c.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const ref = c.reference || '—';
    const hint = c.token_hint || '—';
    const status = c.review_status || 'pending';
    const statusColor = status==='resolved' ? 'var(--green)' : status==='reviewed' ? 'var(--navy)' : 'var(--warn)';
    const statusLabel = status.charAt(0).toUpperCase()+status.slice(1);
    const meta = c.metadata || {};
    const severity = meta.severity || '—';
    const category = meta.category || '—';
    const auths = (c.authorities||[]).join(', ');
    const cipherPreview = c.ciphertext_b64 ? c.ciphertext_b64.slice(0,40)+'…' : '—';

    return `
      <div style="border:1px solid var(--border);border-radius:2px;margin-bottom:12px;overflow:hidden" id="complaint-${c.id}">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--cream);border-bottom:1px solid var(--border)">
          <div>
            <span style="font-size:12px;font-weight:700;color:var(--navy)">${esc(ref)}</span>
            <span style="font-size:10px;color:var(--muted);margin-left:8px">${esc(date)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:10px;font-weight:600;color:${statusColor};border:1px solid ${statusColor};padding:2px 8px;border-radius:2px;text-transform:uppercase;letter-spacing:0.04em">${esc(statusLabel)}</span>
          </div>
        </div>
        <div style="padding:12px 16px">
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-size:11px;margin-bottom:12px">
            <div><span style="color:var(--muted)">Token Hint:</span> <strong>${esc(hint)}</strong></div>
            <div><span style="color:var(--muted)">Severity:</span> <strong>${esc(severity)}</strong></div>
            <div><span style="color:var(--muted)">Category:</span> <strong>${esc(category)}</strong></div>
            <div><span style="color:var(--muted)">Authorities:</span> <strong>${esc(auths)}</strong></div>
          </div>
          <div style="background:var(--cream);border:1px solid var(--border);border-radius:2px;padding:8px 12px;margin-bottom:12px">
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Encrypted Data (AES-256-GCM)</div>
            <div style="font-family:var(--mono);font-size:10px;word-break:break-all;color:var(--navy)">${esc(cipherPreview)}</div>
          </div>
          <div style="display:flex;gap:8px">
            ${status==='pending' ? `<button onclick="markReviewed('${c.id}')" style="font-size:10px;padding:6px 14px;background:var(--navy);color:var(--white);border:none;border-radius:2px;cursor:pointer;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Mark Reviewed</button>` : ''}
            ${status==='reviewed' ? `<button onclick="markResolved('${c.id}')" style="font-size:10px;padding:6px 14px;background:var(--green);color:var(--white);border:none;border-radius:2px;cursor:pointer;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Mark Resolved</button>` : ''}
            ${status==='resolved' ? `<span style="font-size:10px;color:var(--green);font-weight:600">✓ Resolved</span>` : ''}
            <button onclick="viewComplaintDetail('${c.id}')" style="font-size:10px;padding:6px 14px;background:transparent;color:var(--navy);border:1px solid var(--navy);border-radius:2px;cursor:pointer;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">View Details</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

/** Update the count displays (total, reviewed, pending) */
function updateAuthorityCounts(complaints){
  const total = complaints.length;
  const reviewed = complaints.filter(c=>(c.review_status==='reviewed'||c.review_status==='resolved')).length;
  const resolved = complaints.filter(c=>c.review_status==='resolved').length;
  const pending = total - reviewed;

  const el = id => document.getElementById(id);
  if(el('totalComplaintsCount')) el('totalComplaintsCount').textContent = total;
  if(el('reviewedCount')) el('reviewedCount').textContent = reviewed;
  if(el('pendingCount')) el('pendingCount').textContent = pending;
}

/** Mark a complaint as reviewed */
async function markReviewed(complaintId){
  try{
    await window.AawaazData.updateComplaintStatus(complaintId, 'reviewed', S.selectedAuthority);
    addLog('Complaint '+complaintId+' marked as reviewed by '+S.selectedAuthority,'success');
    // Refresh the list
    if(S.selectedAuthority) await selectAuthority(S.selectedAuthority);
  }catch(e){
    console.error('[Aawaaz] Error updating status:', e);
    alert('Failed to update complaint status. Check console.');
  }
}

/** Mark a complaint as resolved */
async function markResolved(complaintId){
  try{
    await window.AawaazData.updateComplaintStatus(complaintId, 'resolved', S.selectedAuthority);
    addLog('Complaint '+complaintId+' resolved by '+S.selectedAuthority,'success');
    if(S.selectedAuthority) await selectAuthority(S.selectedAuthority);
  }catch(e){
    console.error('[Aawaaz] Error updating status:', e);
    alert('Failed to update complaint status. Check console.');
  }
}

/** View full complaint detail (expand in place) */
function viewComplaintDetail(complaintId){
  const c = S.authorityComplaints.find(x=>String(x.id)===String(complaintId));
  if(!c) return;
  const el = document.getElementById('complaint-'+complaintId);
  if(!el) return;

  const meta = c.metadata || {};
  const detail = `
    <div style="padding:12px 16px;border-top:1px solid var(--border);background:var(--bg)">
      <div style="font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px">Full Details</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px">
        <div><span style="color:var(--muted)">ID:</span> ${esc(String(c.id))}</div>
        <div><span style="color:var(--muted)">Reference:</span> ${esc(c.reference||'—')}</div>
        <div><span style="color:var(--muted)">Created:</span> ${esc(new Date(c.created_at).toLocaleString('en-IN'))}</div>
        <div><span style="color:var(--muted)">Review Status:</span> ${esc(c.review_status||'pending')}</div>
        <div><span style="color:var(--muted)">Reviewed By:</span> ${esc(c.reviewed_by||'—')}</div>
        <div><span style="color:var(--muted)">Reviewed At:</span> ${esc(c.reviewed_at ? new Date(c.reviewed_at).toLocaleString('en-IN') : '—')}</div>
        <div style="grid-column:1/-1"><span style="color:var(--muted)">IV (Base64):</span> <span style="font-family:var(--mono);font-size:10px">${esc(c.iv_b64||'—')}</span></div>
        <div style="grid-column:1/-1"><span style="color:var(--muted)">Metadata:</span> <pre style="font-size:10px;margin:4px 0;white-space:pre-wrap;font-family:var(--mono);color:var(--navy)">${esc(JSON.stringify(meta,null,2))}</pre></div>
      </div>
      <button onclick="this.parentElement.remove()" style="margin-top:8px;font-size:10px;padding:4px 12px;background:var(--border);border:none;border-radius:2px;cursor:pointer">Collapse</button>
    </div>`;

  // Remove existing detail if already expanded
  const existing = el.querySelector('[data-detail]');
  if(existing){ existing.remove(); return; }

  const div = document.createElement('div');
  div.setAttribute('data-detail','1');
  div.innerHTML = detail;
  el.appendChild(div);
}

/** Refresh authority stats page */
function refreshAuthorityStats(){
  const complaints = S.authorityComplaints || [];
  const total = complaints.length;
  const pending = complaints.filter(c=>!c.review_status || c.review_status==='pending').length;
  const resolved = complaints.filter(c=>c.review_status==='resolved').length;

  const el = id => document.getElementById(id);
  if(el('statTotal')) el('statTotal').textContent = total;
  if(el('statPending')) el('statPending').textContent = pending;
  if(el('statResolved')) el('statResolved').textContent = resolved;

  // Calculate average resolution time
  const resolvedComplaints = complaints.filter(c=>c.review_status==='resolved' && c.reviewed_at && c.created_at);
  if(resolvedComplaints.length > 0){
    const totalMs = resolvedComplaints.reduce((sum,c)=>{
      return sum + (new Date(c.reviewed_at) - new Date(c.created_at));
    },0);
    const avgMs = totalMs / resolvedComplaints.length;
    const avgDays = Math.round(avgMs / (1000*60*60*24)*10)/10;
    if(el('statAvgTime')) el('statAvgTime').textContent = avgDays < 1 ? '<1 day' : avgDays+'d';
  } else {
    if(el('statAvgTime')) el('statAvgTime').textContent = '—';
  }

  // Render recent activity
  const actEl = el('authActivity');
  if(actEl){
    const reviewed = complaints.filter(c=>c.reviewed_at).sort((a,b)=>new Date(b.reviewed_at)-new Date(a.reviewed_at)).slice(0,5);
    if(reviewed.length>0){
      actEl.innerHTML = reviewed.map(c=>{
        const date = new Date(c.reviewed_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
        return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="font-weight:600;color:var(--navy)">${esc(c.reference||c.id)}</span>
          <span>${esc(c.review_status||'reviewed')} · ${esc(date)}</span>
        </div>`;
      }).join('');
    } else {
      actEl.innerHTML = '<div style="text-align:center;padding:16px;font-style:italic">No activity yet</div>';
    }
  }
}

// ============================
// INIT
// ============================
window.addEventListener('load', async ()=>{
  await init();
  setMode(detectStartupMode());
});

// Set default sim step display
simSetStep(2);
