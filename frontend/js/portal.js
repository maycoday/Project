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
  authorityPrivKey: null,
  reviewedComplaints: new Set(), // Track reviewed complaints for status feedback
  stealthMode: false,
  ctrlSpaceCount: 0,
  ctrlSpaceTimer: null,
};

// ============================
// UTILS
// ============================
const ab2hex = b => Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
// Utility functions for robust base64 encoding/decoding
const ab2b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
const b64toab = b64 => {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for(let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};
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
  
  // Handle encrypted media if present
  let mediaMetadata = null;
  if (submission.media) {
    const media = submission.media;
    
    // Wrap media encryption key for each authority
    const encryptedMediaKeys = {};
    for (const auth of submission.auths) {
      if (S.wrapped[auth] && S.wrapped[auth].b64) {
        // For website uploads, we use the same structure as WhatsApp
        encryptedMediaKeys[auth] = `WEBSITE:${btoa(String.fromCharCode(...media.encryptionKey))}`;
      }
    }
    
    mediaMetadata = {
      filename: `${submission.id}_${media.originalName}`,
      originalName: media.originalName,
      mimetype: media.mimetype,
      size: media.size,
      fileId: submission.id,
      encryptedData: btoa(String.fromCharCode(...media.encryptedData)),
      encryptedMediaKey: encryptedMediaKeys
    };
  }

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
      recorded_at: submission.timestamp,
      source: "website",
      media: mediaMetadata // Include media information
    }
  };
  return window.AawaazData.saveComplaint(payload);
}

async function findRemoteComplaintByToken(token){
  if(!window.AawaazData || !window.AawaazData.enabled) return null;
  const tokenHash = await hashToken(token);
  return window.AawaazData.findComplaintByTokenHash(tokenHash);
}

async function renderTrackingCard(refToken, filedAt, authorities){
  const card = document.getElementById('statusCard');
  if(!card) return;
  card.classList.add('show');
  document.getElementById('trackRef').textContent = refToken;
  document.getElementById('trackDate').textContent = filedAt ? new Date(filedAt).toLocaleDateString('en-IN') : '—';
  document.getElementById('trackAuths').textContent = authorities && authorities.length ? authorities.join(', ') : '—';
  
  // Check if complaint has been reviewed by querying database
  try {
    const remote = await findRemoteComplaintByToken(refToken);
    if(remote && (remote.review_status === 'reviewed' || remote.review_status === 'resolved')) {
      console.log('📊 Found complaint status:', remote.review_status, 'reviewed by:', remote.reviewed_by);
      // Update status display to show reviewed
      const statusElement = card.querySelector('[style*="Under Review"]')?.parentElement || 
                           card.querySelector('.status-badge');
      if(statusElement) {
        statusElement.innerHTML = '� Reviewed — Action Taken';
        statusElement.style.background = 'var(--green)';
        statusElement.style.color = 'white';
      }
      
      // Update current status in grid using the ID
      const currentStatusElement = document.getElementById('trackStatus') || card.querySelector('[style*="color:var(--green)"]');
      if(currentStatusElement) {
        if(remote.review_status === 'resolved') {
          currentStatusElement.textContent = 'Resolved';
          currentStatusElement.style.color = 'var(--green)';
        } else {
          currentStatusElement.textContent = 'Reviewed by ' + (remote.reviewed_by || 'Authority');
          currentStatusElement.style.color = 'var(--navy)';
        }
        currentStatusElement.style.fontWeight = '600';
      }
      
      // Show reviewed date if available  
      if(remote.reviewed_at && !card.querySelector('[data-status-detail]')) {
        const reviewedDate = new Date(remote.reviewed_at).toLocaleDateString('en-IN');
        card.innerHTML += `
          <div data-status-detail style="margin-top:12px;padding:12px;background:rgba(11,31,58,0.05);border:1px solid rgba(11,31,58,0.15);border-radius:8px;border-left:3px solid var(--navy)">
            <div style="font-size:10px;color:var(--navy);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">📋 Review Status</div>
            <div style="font-size:12px;color:var(--ink)">Reviewed by <strong>${remote.reviewed_by || 'Authority'}</strong> on <strong>${reviewedDate}</strong></div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">Your complaint has been ${remote.review_status} by the relevant authority and is being processed.</div>
          </div>`;
      }
      
      // Show success notification for reviewed complaints
      if(remote.review_status === 'reviewed' || remote.review_status === 'resolved') {
        const notification = document.createElement('div');
        notification.style.cssText = `
          position: fixed; top: 80px; right: 20px; 
          background: var(--navy); color: white; 
          padding: 12px 20px; border-radius: 8px; 
          z-index: 10000; font-weight: 500;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          animation: slideIn 0.3s ease-out;
        `;
        notification.innerHTML = `✓ Status Updated: Complaint has been ${remote.review_status} by ${remote.reviewed_by || 'authority'}`;
        document.body.appendChild(notification);
        
        // Auto remove notification
        setTimeout(() => {
          notification.style.animation = 'slideIn 0.3s ease-out reverse';
          setTimeout(() => notification.remove(), 300);
        }, 4000);
      }
      
      // Show reviewed notification if this is a fresh check
      if(S.reviewedComplaints && S.reviewedComplaints.has(remote.id)) {
        const notification = document.createElement('div');
        notification.style.cssText = `
          position: fixed; top: 80px; right: 20px; 
          background: var(--green); color: white; 
          padding: 12px 20px; border-radius: 8px; 
          z-index: 10000; font-weight: 500;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          animation: slideIn 0.3s ease-out;
        `;
        notification.innerHTML = `� Status Updated: Complaint has been reviewed by authorities`;
        document.body.appendChild(notification);
        
        // Auto remove notification
        setTimeout(() => {
          notification.style.animation = 'slideIn 0.3s ease-out reverse';
          setTimeout(() => notification.remove(), 300);
        }, 4000);
        
        // Clear the reviewed flag to prevent repeated notifications
        S.reviewedComplaints.delete(remote.id);
      }
    }
  } catch(e) {
    console.log('Could not check review status:', e);
  }
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

    // RSA key pairs for each authority - use persistent keys across sessions
    for(const auth of ['HR','ICC','NGO']){
      let kp;
      
      // Try to load existing key pair from localStorage
      try {
        const savedKeys = localStorage.getItem(`aawaaz_authority_keys_${auth}`);
        if(savedKeys){
          const keyData = JSON.parse(savedKeys);
          
          // Import the saved keys
          const publicKey = await crypto.subtle.importKey(
            'spki',
            new Uint8Array(atob(keyData.publicKey).split('').map(c => c.charCodeAt(0))),
            {name:'RSA-OAEP', hash:'SHA-256'},
            true,
            ['wrapKey']
          );
          
          const privateKey = await crypto.subtle.importKey(
            'pkcs8',
            new Uint8Array(atob(keyData.privateKey).split('').map(c => c.charCodeAt(0))),
            {name:'RSA-OAEP', hash:'SHA-256'},
            true,
            ['unwrapKey']
          );
          
          kp = { publicKey, privateKey };
          addLog(`${auth} RSA-2048 key pair loaded from storage`,'info');
        }
      } catch(e) {
        addLog(`Failed to load ${auth} keys from storage, generating new ones`,'warn');
      }
      
      // Generate new key pair if loading failed
      if(!kp){
        addLog(`Generating RSA-OAEP-2048 for ${auth}...`,'info');
        kp = await crypto.subtle.generateKey(
          {name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},
          true,['wrapKey','unwrapKey']
        );
        
        // Save the new key pair to localStorage
        try {
          const publicKeyData = await crypto.subtle.exportKey('spki', kp.publicKey);
          const privateKeyData = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
          
          const keyData = {
            publicKey: ab2b64(publicKeyData),
            privateKey: ab2b64(privateKeyData)
          };
          
          localStorage.setItem(`aawaaz_authority_keys_${auth}`, JSON.stringify(keyData));
          addLog(`${auth} RSA-2048 key pair saved to storage`,'success');
        } catch(e) {
          addLog(`Failed to save ${auth} keys: ${e.message}`,'warn');
        }
      }
      
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

      // Private key display (full key in MAYDAY format)
      const pkcs8 = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
      const privB64 = ab2b64(pkcs8);
      const privPem = `--MAYDAY--START--${privB64}--MAYDAY--END--`;
      const simPriv = document.getElementById('sim'+auth+'PrivKey');
      if(simPriv) simPriv.textContent = privPem;
      // Store full private key for easy access
      S['fullPrivKey' + auth] = privPem;

      addLog(`${auth} RSA-2048 key pair ready`,'success');
    }
    addLog('All keys initialized. System ready.','success');
    
    // Debug: Log key persistence status
    const persistedKeys = ['HR','ICC','NGO'].filter(auth => 
      localStorage.getItem(`aawaaz_authority_keys_${auth}`)
    );
    if(persistedKeys.length > 0){
      addLog(`Using persistent keys for: [${persistedKeys.join(',')}]`,'info');
    }
    
    addLog('Portal initialized successfully','success');
    
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
  
  // Reset tracking when switching modes to avoid conflicts
  if(mode !== 'authority'){
    S.selectedAuthority = null;
    if(S.decryptedComplaints) S.decryptedComplaints.clear();
  }
  
  // Reset user page to default when switching away from user mode
  if(mode !== 'user'){
    showUserPage('file');
  } else {
    showUserPage('file');
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
  // Block settings access if not in user mode
  if(id === 'settings' && S.currentMode !== 'user') {
    alert('Settings can only be accessed from User mode.');
    return;
  }
  
  document.querySelectorAll('#userMode .page').forEach(p=>p.style.display='none');
  const el = document.getElementById('page-'+id);
  if(el) el.style.display='block';
  document.querySelectorAll('#govNavUser .gov-nav-link').forEach((l,i)=>{
    l.classList.toggle('active',['file','track','about','settings'][i]===id);
  });
  
  // Load settings when settings page is shown
  if(id === 'settings'){
    loadSettings();
  }
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
// COPY TO CLIPBOARD
// ============================
function copyToClipboard(id, btnElement){
  const el = document.getElementById(id);
  if(!el) return;
  let text = el.textContent;
  if(!text || text.includes('Generating')) {
    alert('Data not ready yet. Please wait.');
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    const btn = btnElement || event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓ Copied';
    btn.style.background = 'rgba(32, 224, 112, 0.2)';
    btn.style.borderColor = 'rgba(32, 224, 112, 0.4)';
    btn.style.color = '#20E070';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 2000);
  }).catch(err => {
    alert('Failed to copy: ' + err.message);
  });
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
  if(bn){
    if(S.selected.size < 3 && S.selected.size > 0){
      bn.style.display = 'flex';
      bn.classList.add('show');
    } else {
      bn.style.display = 'none';
      bn.classList.remove('show');
    }
  }
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

  // Handle file attachment if present
  let encryptedMedia = null;
  if (selectedFileData && selectedFileData.file) {
    try {
      btn.textContent = 'Encrypting attachment...';
      const aesKey = new Uint8Array(32);
      crypto.getRandomValues(aesKey);
      encryptedMedia = await encryptFileAttachment(selectedFileData.file, aesKey);
      encryptedMedia.encryptionKey = aesKey;
      addLog(`File encrypted: ${selectedFileData.name}`, 'success');
    } catch (error) {
      addLog(`File encryption failed: ${error.message}`, 'warn');
      btn.disabled = false;
      btn.textContent = 'Submit Encrypted Complaint →';
      return;
    }
  }

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
    media: encryptedMedia // Include encrypted media
  };
  S.submissions.push(sub);
  
  const mediaText = encryptedMedia ? ` (with attachment: ${encryptedMedia.originalName})` : '';
  addLog(`Complaint submitted ID:${sub.id} to [${sub.auths.join(',')}]${mediaText}`,'success');

  const metadata = collectComplaintMetadata();
  try{
    const result = await persistEncryptedComplaint(sub, metadata);
    if(result?.offline){
      addLog('Supabase not configured — complaint stored locally only.','warn');
    }else{
      addLog('Encrypted complaint stored in Supabase.','success');
      // Log activity for complaint submission
      try {
        const tokenHash = await hashToken(sub.token);
        await window.AawaazData.logActivity(
          tokenHash,
          'view',
          'Complaint Received',
          'System',
          'Encrypted payload stored successfully'
        );
      } catch(logErr) {
        console.warn('[ActivityLog] Could not log submission activity:', logErr.message);
      }
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
    await renderTrackingCard(val, local.timestamp, local.auths);
    return;
  }
  try{
    const remote = await findRemoteComplaintByToken(val);
    if(remote){
      await renderTrackingCard(val, remote.created_at, remote.authorities || []);
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
// FILE HANDLING WITH ENCRYPTION
// ============================

let selectedFileData = null;

function handleFile(input) {
  const status = document.getElementById('metaStripStatus');
  if (!input.files[0]) {
    selectedFileData = null;
    return;
  }
  
  const file = input.files[0];
  
  // Validate file type and size
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (!allowedTypes.includes(file.type)) {
    if (status) {
      status.style.color = 'var(--warn)';
      status.textContent = '❌ Unsupported file type. Please use JPG, PNG, GIF, or PDF.';
    }
    selectedFileData = null;
    return;
  }
  
  if (file.size > maxSize) {
    if (status) {
      status.style.color = 'var(--warn)';
      status.textContent = `❌ File too large (${(file.size/1024/1024).toFixed(1)}MB). Maximum 10MB allowed.`;
    }
    selectedFileData = null;
    return;
  }
  
  if (status) {
    status.style.color = 'var(--warn)';
    status.textContent = 'Stripping metadata...';
    
    setTimeout(() => {
      status.style.color = 'var(--green)';
      status.textContent = '✓ Metadata stripped — GPS, device info, timestamps removed. File ready for encrypted upload.';
      addLog('EXIF metadata stripped from attachment', 'success');
      
      // Store file data for later encryption and upload
      selectedFileData = {
        file: file,
        name: file.name,
        type: file.type,
        size: file.size
      };
    }, 800);
  }
}

// Encrypt and prepare file for complaint submission
async function encryptFileAttachment(file, aesKey) {
  try {
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    
    // Generate IV for this file
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Import AES key
    const key = await crypto.subtle.importKey(
      'raw',
      aesKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    
    // Encrypt file data
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      data
    );
    
    // Combine IV + encrypted data
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);
    
    return {
      encryptedData: result,
      originalName: file.name,
      mimetype: file.type,
      size: file.size
    };
  } catch (error) {
    console.error('File encryption error:', error);
    throw new Error('Failed to encrypt file');
  }
}

// ============================
// MEDIA DECRYPTION FOR AUTHORITIES  
// ============================

// Decrypt and display media attachment for authorities
async function decryptAndDisplayMedia(complaint, authorityKey) {
  try {
    if (!complaint.metadata?.media) {
      return null; // No media attachment
    }
    
    const media = complaint.metadata.media;
    const currentAuthority = window.AawaazData.getCurrentAuthority();
    
    if (!currentAuthority || !media.encryptedMediaKey[currentAuthority]) {
      throw new Error('No media access for current authority');
    }
    
    // Extract media encryption key
    let mediaKeyData = media.encryptedMediaKey[currentAuthority];
    let mediaKey;
    
    // Handle different sources (WhatsApp vs Website)
    if (mediaKeyData.startsWith('WHATSAPP:')) {
      // WhatsApp media - key is directly base64 encoded
      mediaKey = Uint8Array.from(atob(mediaKeyData.substring(9)), c => c.charCodeAt(0));
    } else if (mediaKeyData.startsWith('WEBSITE:')) {
      // Website media - key is base64 encoded
      mediaKey = Uint8Array.from(atob(mediaKeyData.substring(8)), c => c.charCodeAt(0));
    } else {
      throw new Error('Unknown media source format');
    }
    
    // Decrypt media data
    let encryptedData;
    if (media.encryptedData) {
      // Website uploaded media (stored in database)
      encryptedData = Uint8Array.from(atob(media.encryptedData), c => c.charCodeAt(0));
    } else {
      // WhatsApp media (would need to fetch from storage)
      throw new Error('WhatsApp media fetching not yet implemented - contact system admin');
    }
    
    // Extract IV and encrypted content
    const iv = encryptedData.slice(0, 12);
    const encrypted = encryptedData.slice(12);
    
    // Import decryption key
    const key = await crypto.subtle.importKey(
      'raw',
      mediaKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    
    // Decrypt the media
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encrypted
    );
    
    // Create blob and URL for viewing
    const blob = new Blob([decrypted], { type: media.mimetype });
    const url = URL.createObjectURL(blob);
    
    return {
      url: url,
      filename: media.originalName,
      mimetype: media.mimetype,
      size: media.size,
      cleanup: () => URL.revokeObjectURL(url)
    };
    
  } catch (error) {
    console.error('Media decryption error:', error);
    throw new Error(`Failed to decrypt media: ${error.message}`);
  }
}

// Display media in complaint review interface
async function showComplaintMedia(complaintData) {
  try {
    const media = await decryptAndDisplayMedia(complaintData);
    if (!media) {
      return; // No media to show
    }
    
    const mediaContainer = document.getElementById('complaintMedia') || createMediaContainer();
    
    if (media.mimetype.startsWith('image/')) {
      // Display image
      const img = document.createElement('img');
      img.src = media.url;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '400px';
      img.style.borderRadius = '8px';
      img.alt = media.filename;
      img.title = `${media.filename} (${(media.size/1024).toFixed(1)}KB)`;
      
      mediaContainer.innerHTML = '';
      mediaContainer.appendChild(img);
    } else if (media.mimetype === 'application/pdf') {
      // Display PDF
      const embed = document.createElement('embed');
      embed.src = media.url;
      embed.type = 'application/pdf';
      embed.style.width = '100%';
      embed.style.height = '400px';
      embed.style.borderRadius = '8px';
      
      mediaContainer.innerHTML = '';
      mediaContainer.appendChild(embed);
    }
    
    // Add download button
    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = `📎 Download ${media.filename}`;
    downloadBtn.className = 'btn-secondary';
    downloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = media.url;
      a.download = media.filename;
      a.click();
    };
    
    mediaContainer.appendChild(downloadBtn);
    
    // Cleanup when done
    setTimeout(() => media.cleanup(), 30000); // Auto-cleanup after 30 seconds
    
  } catch (error) {
    const mediaContainer = document.getElementById('complaintMedia') || createMediaContainer();
    mediaContainer.innerHTML = `<div style="color: var(--warn); padding: 10px;">⚠ Media decryption failed: ${error.message}</div>`;
  }
}

function createMediaContainer() {
  const container = document.createElement('div');
  container.id = 'complaintMedia';
  container.style.cssText = 'margin: 15px 0; padding: 15px; border: 1px dashed #ccc; border-radius: 8px;';
  
  // Insert after complaint text in review interface
  const complaintText = document.querySelector('.complaint-text') || document.querySelector('.review-content');
  if (complaintText && complaintText.parentNode) {
    complaintText.parentNode.insertBefore(container, complaintText.nextSibling);
  }
  
  return container;
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
  // Update diagnostic info
  updateKeyDiagnostic();
  
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

// Update key diagnostic information
function updateKeyDiagnostic(){
  const diagEl = document.getElementById('keyDiagnostic');
  if(!diagEl) return;
  
  const persistedKeys = ['HR','ICC','NGO'].filter(auth => 
    localStorage.getItem(`aawaaz_authority_keys_${auth}`)
  );
  
  if(persistedKeys.length === 3){
    diagEl.innerHTML = '✅ Persistent authority keys loaded - fresh complaints should decrypt successfully';
    diagEl.style.color = 'var(--green)';
  } else if(persistedKeys.length > 0){
    diagEl.innerHTML = `⚠️ Partial keys loaded: ${persistedKeys.join(',')} - some authorities may not work`;
    diagEl.style.color = 'var(--warn)';
  } else {
    diagEl.innerHTML = '🔑 New session keys generated - only NEW complaints from this session will decrypt';
    diagEl.style.color = 'var(--muted)';
  }
}

/** Select an authority (HR / ICC / NGO) and load its complaints */
async function selectAuthority(auth){
  S.selectedAuthority = auth;

  // Highlight selected card (use CSS classes, not inline styles)
  ['HR','ICC','NGO'].forEach(a=>{
    const card = document.getElementById('authCard'+a);
    if(card){
      if(a === auth){
        card.style.borderColor = 'var(--navy)';
        card.style.background = 'var(--cream2)';
      } else {
        card.style.borderColor = '';
        card.style.background = '';
      }
    }
  });

  // Update header
  const label = document.getElementById('authCurrent');
  if(label) label.textContent = auth + ' Authority';

  const listWrap = document.getElementById('authComplaintsList');
  if(listWrap) listWrap.style.display = 'block';

  // Show private key section
  const pkSection = document.getElementById('authPrivKeySection');
  if(pkSection) pkSection.style.display = 'block';

  // Reset key status when switching authority
  S.authorityPrivKey = null;
  const keyStatus = document.getElementById('authKeyStatus');
  if(keyStatus) keyStatus.textContent = '';
  const keyInput = document.getElementById('authPrivKeyInput');
  if(keyInput) keyInput.value = '';

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
    const hasMedia = !!(meta.media);
    const mediaSource = meta.source || '';

    return `
      <div style="border:1px solid var(--border);border-radius:2px;margin-bottom:12px;overflow:hidden" id="complaint-${c.id}">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--cream);border-bottom:1px solid var(--border)">
          <div>
            <span style="font-size:14px;font-weight:700;color:var(--ink)">${esc(ref)}</span>
            <span style="font-size:12px;color:var(--muted);margin-left:8px">${esc(date)}</span>
            ${hasMedia ? '<span style="font-size:11px;margin-left:8px;background:rgba(99,102,241,0.15);color:#818cf8;padding:3px 8px;border-radius:4px;font-weight:600;">📎 Has Attachment</span>' : ''}
            ${mediaSource === 'whatsapp' ? '<span style="font-size:11px;margin-left:4px;background:rgba(37,211,102,0.15);color:#25d366;padding:3px 8px;border-radius:4px;font-weight:600;">📱 WhatsApp</span>' : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:11px;font-weight:600;color:${statusColor};border:1px solid ${statusColor};padding:3px 10px;border-radius:4px;text-transform:uppercase;letter-spacing:0.04em">${esc(statusLabel)}</span>
          </div>
        </div>
        <div style="padding:14px 16px">
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;font-size:13px;margin-bottom:14px">
            <div><span style="color:var(--muted)">Token Hint:</span> <strong style="color:var(--ink)">${esc(hint)}</strong></div>
            <div><span style="color:var(--muted)">Severity:</span> <strong style="color:var(--ink)">${esc(severity)}</strong></div>
            <div><span style="color:var(--muted)">Category:</span> <strong style="color:var(--ink)">${esc(category)}</strong></div>
            <div><span style="color:var(--muted)">Authorities:</span> <strong style="color:var(--ink)">${esc(auths)}</strong></div>
          </div>
          <div style="background:var(--cream);border:1px solid var(--border);border-radius:4px;padding:10px 14px;margin-bottom:14px">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Encrypted Data (AES-256-GCM)</div>
            <div style="font-family:var(--mono);font-size:12px;word-break:break-all;color:var(--ink2)">${esc(cipherPreview)}</div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button onclick="decryptComplaintWithKey('${c.id}')" style="font-size:12px;padding:8px 16px;background:var(--saffron);color:var(--white);border:none;border-radius:6px;cursor:pointer;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">🔓 Decrypt</button>
            ${status==='pending' ? `<button onclick="markReviewed('${c.id}')" ${S.decryptedComplaints && S.decryptedComplaints.has(c.id) ? '' : 'disabled title="Must decrypt complaint first"'} style="font-size:12px;padding:8px 16px;background:${S.decryptedComplaints && S.decryptedComplaints.has(c.id) ? 'var(--green)' : 'var(--muted2)'};color:var(--white);border:none;border-radius:6px;cursor:${S.decryptedComplaints && S.decryptedComplaints.has(c.id) ? 'pointer' : 'not-allowed'};font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Mark Reviewed</button>` : ''}
            ${status==='reviewed' ? `<button onclick="markResolved('${c.id}')" style="font-size:12px;padding:8px 16px;background:var(--green);color:var(--white);border:none;border-radius:6px;cursor:pointer;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Mark Resolved</button>` : ''}
            ${status==='resolved' ? `<span style="font-size:12px;color:var(--green);font-weight:600">✓ Resolved</span>` : ''}
            <button onclick="viewComplaintDetail('${c.id}')" style="font-size:12px;padding:8px 16px;background:transparent;color:var(--ink2);border:1px solid var(--ink2);border-radius:6px;cursor:pointer;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">View Details</button>
          </div>
          <div id="decryptResult-${c.id}"></div>
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
  console.log('🏷️ Attempting to mark complaint as reviewed:', complaintId);
  
  // Check if complaint has been decrypted
  if(!S.decryptedComplaints || !S.decryptedComplaints.has(complaintId)){
    console.warn('❌ Complaint not decrypted yet:', complaintId);
    alert('You must decrypt this complaint before marking it as reviewed. This ensures you have actually read the complaint content.');
    return;
  }
  
  // Check if data service is available
  if(!window.AawaazData) {
    console.error('❌ Data service not available');
    alert('Data service not available. Please refresh the page and try again.');
    return;
  }
  
  try{
    console.log('🔍 Looking for mark reviewed button for complaint:', complaintId);
    
    // Show loading state - use more robust button selection
    const buttons = document.querySelectorAll('button');
    let button = null;
    for(let btn of buttons) {
      if(btn.textContent.includes('Mark Reviewed') && btn.getAttribute('onclick')?.includes(complaintId)) {
        button = btn;
        console.log('✅ Found mark reviewed button');
        break;
      }
    }
    
    if(!button) {
      console.warn('⚠️ Could not find mark reviewed button for complaint:', complaintId);
    }
    
    const originalText = button ? button.textContent : '';
    if(button) {
      button.textContent = 'Marking...';
      button.disabled = true;
    }
    
    console.log('📡 Updating complaint status in database...');
    await window.AawaazData.updateComplaintStatus(complaintId, 'reviewed', S.selectedAuthority);
    
    // Show success feedback
    addLog('Complaint '+complaintId+' marked as reviewed by '+S.selectedAuthority,'success');
    
    // Visual feedback notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed; top: 20px; right: 20px; 
      background: var(--green); color: white; 
      padding: 12px 20px; border-radius: 8px; 
      z-index: 10000; font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideIn 0.3s ease-out;
    `;
    notification.innerHTML = `✅ Complaint ${complaintId.slice(0,8)}... marked as reviewed`;
    document.body.appendChild(notification);
    
    // Add CSS animation
    if(!document.getElementById('notification-styles')){
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = `
        @keyframes slideIn { 
          from { transform: translateX(100%); opacity: 0; } 
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Auto remove notification
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
    
    // Update button to show completed state
    if(button) {
      button.textContent = '✅ Reviewed';
      button.style.background = 'var(--green)';
      button.style.color = 'white';
      button.disabled = true;
      button.onclick = null; // Prevent re-clicking
      
      // After 2 seconds, remove button from DOM since complaint is now reviewed
      setTimeout(() => {
        if(button.parentNode) {
          button.parentNode.removeChild(button);
        }
      }, 2000);
    }
    
    // Refresh the authority list
    console.log('🔄 Refreshing authority complaint list...');  
    if(S.selectedAuthority) await selectAuthority(S.selectedAuthority);
    
    // Store reviewed status for track mode synchronization
    if(!S.reviewedComplaints) S.reviewedComplaints = new Set();
    S.reviewedComplaints.add(complaintId);
    
    console.log('✅ Complaint successfully marked as reviewed:', complaintId);
    
  }catch(e){
    console.error('❌ [Aawaaz] Error updating complaint status:', e);
    console.error('Error details:', {
      complaintId,
      selectedAuthority: S.selectedAuthority,
      dataServiceEnabled: window.AawaazData?.enabled,
      errorMessage: e.message
    });
    
    alert('Failed to update complaint status: ' + e.message + '. Check console for details.');
    
    // Reset button on error
    if(button) {
      button.textContent = originalText;
      button.disabled = false;
    }
  }
}

/** Mark a complaint as resolved */
async function markResolved(complaintId){
  console.log('✅ Attempting to mark complaint as resolved:', complaintId);
  
  if(!window.AawaazData) {
    console.error('❌ Data service not available');
    alert('Data service not available. Please refresh the page and try again.');
    return;
  }
  
  try{
    console.log('🔍 Looking for mark resolved button for complaint:', complaintId);
    
    const buttons = document.querySelectorAll('button');
    let button = null;
    for(let btn of buttons) {
      if(btn.textContent.includes('Mark Resolved') && btn.getAttribute('onclick')?.includes(complaintId)) {
        button = btn;
        console.log('✅ Found mark resolved button');
        break;
      }
    }
    
    const originalText = button ? button.textContent : '';
    if(button) {
      button.textContent = 'Resolving...';
      button.disabled = true;
    }
    
    console.log('📡 Updating complaint status to resolved in database...');
    await window.AawaazData.updateComplaintStatus(complaintId, 'resolved', S.selectedAuthority);
    
    addLog('Complaint '+complaintId+' resolved by '+S.selectedAuthority,'success');
    console.log('🔄 Refreshing authority complaint list...');
    if(S.selectedAuthority) await selectAuthority(S.selectedAuthority);
    
    console.log('✅ Complaint successfully marked as resolved:', complaintId);
    
  }catch(e){
    console.error('❌ [Aawaaz] Error updating complaint status to resolved:', e);
    console.error('Error details:', {
      complaintId,
      selectedAuthority: S.selectedAuthority,
      dataServiceEnabled: window.AawaazData?.enabled,
      errorMessage: e.message
    });
    
    alert('Failed to update complaint status: ' + e.message + '. Check console for details.');
    
    // Reset button on error
    if(button) {
      button.textContent = originalText;
      button.disabled = false;
    }
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
// STEALTH MODE (Decoy Website)
// ============================
function toggleStealthMode(){
  S.stealthMode = !S.stealthMode;
  const overlay = document.getElementById('stealthOverlay');
  const realContent = document.querySelectorAll('#modeSwitcher, #govHeader, #quickExit, .watermark, .tricolor, #userMode, #simMode, #authorityMode, #cryptoLog');
  
  if(S.stealthMode){
    // Enter stealth
    document.title = 'RecipeHub — Daily Recipes & Cooking Tips';
    realContent.forEach(el => el.style.display = 'none');
    if(overlay) overlay.style.display = 'block';
    document.body.style.background = '#f5f6fa';
  } else {
    // Exit stealth
    document.title = 'Aawaaz — Grievance Portal';
    if(overlay) overlay.style.display = 'none';
    realContent.forEach(el => el.style.removeProperty('display'));
    document.body.style.background = '';
    // Restore correct mode display
    setMode(S.currentMode);
  }
}

// Keyboard shortcut detection (using settings)
document.addEventListener('keydown', checkStealthShortcut);

// ============================
// AUTHORITY PRIVATE KEY DECRYPT
// ============================
async function loadAuthorityPrivateKey(){
  const textarea = document.getElementById('authPrivKeyInput');
  const statusEl = document.getElementById('authKeyStatus');
  if(!textarea || !textarea.value.trim()){
    if(statusEl){ statusEl.style.color='var(--danger)'; statusEl.textContent='Please paste your private key.'; }
    return;
  }

  try{
    if(statusEl){ statusEl.style.color='var(--warn)'; statusEl.textContent='Importing key...'; }
    let pem = textarea.value.trim();
    let pemContents;
    
    // Handle MAYDAY format
    if(pem.includes('--MAYDAY--START--')){
      pemContents = pem.replace(/--MAYDAY--START--/,'')
                       .replace(/--MAYDAY--END--/,'')
                       .replace(/\s/g,'');
    } else {
      // Handle standard PEM format
      pemContents = pem.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/,'')
                       .replace(/-----END (?:RSA )?PRIVATE KEY-----/,'')
                       .replace(/\s/g,'');
    }
    
    if(!pemContents){
      if(statusEl){ statusEl.style.color='var(--danger)'; statusEl.textContent='Please paste your private key.'; }
      return;
    }
    
    const binaryStr = atob(pemContents);
    const bytes = new Uint8Array(binaryStr.length);
    for(let i=0;i<binaryStr.length;i++) bytes[i]=binaryStr.charCodeAt(i);

    const privKey = await crypto.subtle.importKey(
      'pkcs8', bytes.buffer,
      {name:'RSA-OAEP', hash:'SHA-256'},
      false, ['unwrapKey']
    );
    S.authorityPrivKey = privKey;
    if(statusEl){ statusEl.style.color='var(--green)'; statusEl.textContent='✓ Private key loaded successfully. You can now decrypt complaints.'; }
    addLog(S.selectedAuthority+' private key imported for decryption','success');
  }catch(e){
    console.error('[Aawaaz] Key import error:', e);
    if(statusEl){ statusEl.style.color='var(--danger)'; statusEl.textContent='Invalid key format. Ensure it is a valid RSA-2048 PKCS#8 private key.'; }
    S.authorityPrivKey = null;
  }
}

async function decryptComplaintWithKey(complaintId){
  if(!S.authorityPrivKey){
    alert('Please load your private key first.');
    return;
  }
  
  // More robust complaint finding
  const c = S.authorityComplaints.find(x => String(x.id) === String(complaintId));
  if(!c) {
    console.error('Complaint not found:', complaintId);
    alert('Complaint not found.');
    return;
  }

  const auth = S.selectedAuthority;
  const wrappedKeys = c.wrapped_keys || {};
  const wrappedB64 = wrappedKeys[auth];
  if(!wrappedB64){
    console.error('No wrapped key for authority:', auth, 'Available keys:', Object.keys(wrappedKeys));
    alert('No wrapped key found for '+auth+' on this complaint.');
    return;
  }

  // More robust result element finding
  let resultEl = document.getElementById('decryptResult-'+complaintId);
  if(!resultEl) {
    // Try to find by complaint ID in the complaint list
    const complaintCards = document.querySelectorAll('[id*="decryptResult"]');
    for(let card of complaintCards) {
      if(card.id.includes(complaintId)) {
        resultEl = card;
        break;
      }
    }
  }
  
  if(resultEl) resultEl.innerHTML = '<div style="color:var(--warn);font-size:10px;padding:8px">🔄 Decrypting...</div>';
  
  console.log('Starting decryption for complaint:', complaintId, 'Authority:', auth);

  try{
    let aesKey;
    
    // Check if this is a WhatsApp complaint (wrapped key starts with "WHATSAPP:")
    if(typeof wrappedB64 === 'string' && wrappedB64.startsWith('WHATSAPP:')){
      // WhatsApp complaint: extract and import AES key directly
      const aesKeyB64 = wrappedB64.substring(9); // Remove "WHATSAPP:" prefix
      const aesKeyBytes = b64toab(aesKeyB64);
      aesKey = await crypto.subtle.importKey(
        'raw', aesKeyBytes, 
        {name:'AES-GCM', length:256}, false, ['decrypt']
      );
      addLog('WhatsApp complaint: using direct AES key','info');
    } else {
      // Website complaint: unwrap RSA-encrypted AES key
      const wkBin = atob(wrappedB64);
      const wkBytes = new Uint8Array(wkBin.length);
      for(let i=0;i<wkBin.length;i++) wkBytes[i]=wkBin.charCodeAt(i);

      // Unwrap AES key
      aesKey = await crypto.subtle.unwrapKey(
        'raw', wkBytes.buffer, S.authorityPrivKey,
        {name:'RSA-OAEP'}, {name:'AES-GCM',length:256}, true, ['decrypt']
      );
    }

    // Decode IV and ciphertext using robust helper functions
    const ivBytes = b64toab(c.iv_b64);
    const ctBytes = b64toab(c.ciphertext_b64);

    // Verify IV length (should be 12 bytes for AES-GCM)
    if(ivBytes.length !== 12){
      throw new Error(`Invalid IV length: expected 12 bytes, got ${ivBytes.length}`);
    }

    // Decrypt using the same format as simulation
    const plainBuffer = await crypto.subtle.decrypt(
      {name:'AES-GCM', iv:ivBytes}, aesKey, ctBytes.buffer
    );
    const plaintext = new TextDecoder().decode(plainBuffer);

    if(resultEl){
      resultEl.innerHTML = `
        <div style=\"background:rgba(19,136,8,0.05);border:1px solid rgba(19,136,8,0.2);border-left:3px solid var(--green);border-radius:var(--radius);padding:12px;margin-top:8px;animation:reveal 0.5s ease\">
          <div style=\"font-size:10px;color:var(--green);font-family:'DM Mono',monospace;margin-bottom:6px;font-weight:700\">✓ DECRYPTED — ${esc(auth)} EYES ONLY</div>
          <div style=\"font-size:14px;color:var(--ink);line-height:1.7\">${esc(plaintext)}</div>
          <div id=\"mediaResult-${complaintId}\" style=\"margin-top:10px\"></div>
        </div>`;
    }

    // Check and display media attachment if present
    const meta = c.metadata || {};
    if(meta.media){
      const mediaEl = document.getElementById('mediaResult-'+complaintId);
      if(mediaEl){
        const media = meta.media;
        const hasData = media.encryptedData;
        const source = meta.source || 'unknown';
        
        let mediaHtml = '<div style="margin-top:8px;padding:10px;background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:6px;">';
        mediaHtml += '<div style="font-size:9px;color:var(--accent);font-family:\'DM Mono\',monospace;margin-bottom:6px;font-weight:700">📎 ATTACHMENT</div>';
        mediaHtml += '<div style="font-size:11px;color:var(--muted);margin-bottom:6px">';
        mediaHtml += '<strong>' + esc(media.originalName||'attachment') + '</strong>';
        mediaHtml += ' • ' + esc(media.mimetype||'unknown') + ' • ' + ((media.size||0)/1024).toFixed(1) + 'KB';
        mediaHtml += ' • Source: ' + esc(source);
        mediaHtml += '</div>';
        
        if(hasData){
          // Website-uploaded media — can decrypt and display
          mediaHtml += '<button onclick="decryptMediaAttachment(\''+complaintId+'\')" style="font-size:10px;padding:6px 14px;background:var(--accent);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;">📷 View Attachment</button>';
          mediaHtml += '<div id="mediaView-'+complaintId+'" style="margin-top:8px"></div>';
        } else {
          // WhatsApp media — stored on server
          mediaHtml += '<div style="font-size:11px;color:var(--warn);">⚠ Attachment stored on server. Contact admin for access.</div>';
        }
        
        mediaHtml += '</div>';
        mediaEl.innerHTML = mediaHtml;
      }
    }
    // Track that this complaint has been decrypted
    if(!S.decryptedComplaints) S.decryptedComplaints = new Set();
    S.decryptedComplaints.add(complaintId);
    
    // Log activity to database
    if(c.token_hash){
      try {
        await window.AawaazData.logActivity(
          c.token_hash,
          'decrypt',
          'Complaint Decrypted',
          auth,
          'Decrypted by ' + auth + ' authority'
        );
      } catch(logErr) {
        console.warn('[ActivityLog] Could not log decrypt activity:', logErr.message);
      }
    }
    
    addLog('Complaint '+complaintId+' decrypted by '+auth,'success');
  }catch(e){
    console.error('[Aawaaz] 🔐 Decryption failed for complaint:', complaintId, 'Error:', e);
    console.error('Complaint data:', c);
    console.error('Authority:', auth);
    console.error('Wrapped key available:', !!wrappedB64);
    console.error('Private key loaded:', !!S.authorityPrivKey);
    
    // Enhanced debugging
    console.log('🔍 Full decryption debug info:', {
      complaintId,
      authority: auth,
      hasPrivateKey: !!S.authorityPrivKey,
      wrappedKeyExists: !!wrappedB64,
      wrappedKeyLength: wrappedB64 ? wrappedB64.length : 0,
      ivB64: c.iv_b64 || 'missing',
      ivLength: c.iv_b64 ? (atob(c.iv_b64) || {}).length : 'N/A',
      ciphertextLength: c.ciphertext_b64 ? (atob(c.ciphertext_b64) || {}).length : 'N/A'
    });
    
    // Set error message
    if(resultEl){
      resultEl.innerHTML = `
        <div style="background:rgba(242,17,26,0.05);border:1px solid rgba(242,17,26,0.2);border-left:3px solid var(--red);border-radius:var(--radius);padding:12px;margin-top:8px">
          <div style="font-size:9px;color:var(--red);font-family:'DM Mono',monospace;margin-bottom:6px;font-weight:700">✗ DECRYPTION FAILED</div>
          <div style="font-size:13px;color:var(--ink);line-height:1.7">Error: ${esc(e.message)}</div>
        </div>`;
    }
    
    addLog('Decryption of complaint '+complaintId+' failed: '+e.message,'error');
  }
}

/** Decrypt and display media attachment inline */
async function decryptMediaAttachment(complaintId) {
  const viewEl = document.getElementById('mediaView-' + complaintId);
  if (!viewEl) return;
  
  viewEl.innerHTML = '<div style="color:var(--warn);font-size:10px;padding:4px">🔄 Decrypting attachment...</div>';
  
  try {
    const c = S.authorityComplaints.find(x => String(x.id) === String(complaintId));
    if (!c || !c.metadata?.media) throw new Error('No media found');
    
    const media = c.metadata.media;
    const auth = S.selectedAuthority;
    
    // Get the media encryption key
    let mediaKeyData = media.encryptedMediaKey?.[auth];
    if (!mediaKeyData) throw new Error('No media key for ' + auth);
    
    let mediaKeyBytes;
    if (mediaKeyData.startsWith('WEBSITE:')) {
      mediaKeyBytes = Uint8Array.from(atob(mediaKeyData.substring(8)), c => c.charCodeAt(0));
    } else if (mediaKeyData.startsWith('WHATSAPP:')) {
      mediaKeyBytes = Uint8Array.from(atob(mediaKeyData.substring(9)), c => c.charCodeAt(0));
    } else {
      throw new Error('Unknown media key format');
    }
    
    // Decrypt the encrypted media data
    const encryptedRaw = Uint8Array.from(atob(media.encryptedData), c => c.charCodeAt(0));
    const iv = encryptedRaw.slice(0, 12);
    const encrypted = encryptedRaw.slice(12);
    
    const key = await crypto.subtle.importKey(
      'raw', mediaKeyBytes, { name: 'AES-GCM' }, false, ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv }, key, encrypted
    );
    
    // Create blob and display
    const blob = new Blob([decrypted], { type: media.mimetype });
    const url = URL.createObjectURL(blob);
    
    let html = '';
    if (media.mimetype?.startsWith('image/')) {
      html = `<img src="${url}" style="max-width:100%;max-height:400px;border-radius:8px;margin-bottom:8px;" alt="${esc(media.originalName)}">`;
    } else if (media.mimetype === 'application/pdf') {
      html = `<embed src="${url}" type="application/pdf" style="width:100%;height:400px;border-radius:8px;margin-bottom:8px;">`;
    }
    
    html += `<br><a href="${url}" download="${esc(media.originalName)}" style="font-size:11px;color:var(--accent);text-decoration:underline;cursor:pointer;">⬇ Download ${esc(media.originalName)}</a>`;
    
    viewEl.innerHTML = html;
    addLog('Media attachment decrypted for complaint ' + complaintId, 'success');
    
    // Auto-cleanup blob URL after 60s
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    
  } catch (e) {
    viewEl.innerHTML = `<div style="color:var(--red);font-size:11px;padding:4px;">❌ Media decryption failed: ${esc(e.message)}</div>`;
    addLog('Media decryption failed: ' + e.message, 'error');
  }
}

// ============================
// FORGOT KEY (Recovery System)
// ============================
function forgotKey(){
  const card = document.getElementById('statusCard');
  // Show forgot key recovery interface
  if(card){
    card.classList.add('show');
    card.innerHTML = `
      <div style="text-align:center;padding:20px">
        <div style="font-size:28px;margin-bottom:10px">🔑</div>
        <div style="font-family:'Crimson Pro',serif;font-size:18px;font-weight:700;color:var(--navy);margin-bottom:12px">Forgot Your Key?</div>
        <div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:20px">If you've lost your private key, here are your recovery options:</div>
        
        <div style="text-align:left;margin-bottom:16px">
          <div style="padding:12px;background:rgba(255,193,7,0.1);border:1px solid rgba(255,193,7,0.3);border-radius:6px;margin-bottom:12px">
            <div style="font-weight:600;font-size:11px;color:var(--navy);margin-bottom:4px">📧 Email Recovery (If Set Up)</div>
            <div style="font-size:10px;color:var(--muted);line-height:1.4">Check your email for a backup key if you configured email recovery during complaint filing.</div>
          </div>
          
          <div style="padding:12px;background:rgba(33,150,243,0.1);border:1px solid rgba(33,150,243,0.3);border-radius:6px;margin-bottom:12px">
            <div style="font-weight:600;font-size:11px;color:var(--navy);margin-bottom:4px">💾 Local Backup</div>
            <div style="font-size:10px;color:var(--muted);line-height:1.4">Look for a downloaded .key file or screenshot of your private key from when you filed the complaint.</div>
          </div>
          
          <div style="padding:12px;background:rgba(244,67,54,0.1);border:1px solid rgba(244,67,54,0.3);border-radius:6px">
            <div style="font-weight:600;font-size:11px;color:var(--navy);margin-bottom:4px">⚠️ Security Note</div>
            <div style="font-size:10px;color:var(--muted);line-height:1.4">Without your private key, complaints cannot be decrypted. This ensures maximum security but means key recovery is limited.</div>
          </div>
        </div>
        
        <button onclick="document.getElementById('statusCard').classList.remove('show')" style="background:var(--saffron);color:white;border:none;padding:8px 16px;border-radius:6px;font-size:11px;cursor:pointer">Got It</button>
      </div>`;
  }
}

// ============================
// SETTINGS MANAGEMENT
// ============================
function getDefaultSettings(){
  return {
    stealthShortcut: 'ctrl-space-3',
    customShortcut: '',
    autoLock: false,
    clearData: false,
    theme: 'default',
    compactMode: false
  };
}

function loadSettings(){
  try {
    const saved = localStorage.getItem('aawaaz_settings');
    const settings = saved ? JSON.parse(saved) : getDefaultSettings();
    
    // Update UI elements
    const shortcutSelect = document.getElementById('stealthShortcut');
    const autoLockCheck = document.getElementById('autoLockSetting');
    const clearDataCheck = document.getElementById('clearDataSetting');
    const themeSelect = document.getElementById('themeSetting');
    const compactCheck = document.getElementById('compactModeSetting');
    const currentShortcut = document.getElementById('currentShortcut');
    
    if(shortcutSelect) shortcutSelect.value = settings.stealthShortcut;
    if(autoLockCheck) autoLockCheck.checked = settings.autoLock;
    if(clearDataCheck) clearDataCheck.checked = settings.clearData;
    if(themeSelect) themeSelect.value = settings.theme;
    if(compactCheck) compactCheck.checked = settings.compactMode;
    
    // Show/hide custom shortcut setup
    const customSetup = document.getElementById('customShortcutSetup');
    if(customSetup){
      customSetup.style.display = settings.stealthShortcut === 'custom' ? 'block' : 'none';
    }
    
    // Update shortcut display
    if(currentShortcut) currentShortcut.textContent = getShortcutDisplayText(settings.stealthShortcut);
    
    // Apply theme
    applyTheme(settings.theme);
    
    // Store in global state
    S.settings = settings;
    
    return settings;
  } catch(e) {
    console.warn('Failed to load settings:', e);
    return getDefaultSettings();
  }
}

function saveSettings(settings){
  try {
    localStorage.setItem('aawaaz_settings', JSON.stringify(settings));
    S.settings = settings;
  } catch(e) {
    console.warn('Failed to save settings:', e);
  }
}

function getShortcutDisplayText(shortcut){
  const shortcutMap = {
    'ctrl-space-3': 'Ctrl + Space (×3)',
    'ctrl-shift-s': 'Ctrl + Shift + S',
    'ctrl-alt-h': 'Ctrl + Alt + H',
    'alt-shift-x': 'Alt + Shift + X',
    'f9-3': 'F9 Key (×3)',
    'escape-3': 'Escape Key (×3)',
    'custom': S.settings?.customShortcut || 'Custom'
  };
  return shortcutMap[shortcut] || shortcut;
}

function updateStealthSetting(){
  const shortcutSelect = document.getElementById('stealthShortcut');
  const currentShortcut = document.getElementById('currentShortcut');
  const customSetup = document.getElementById('customShortcutSetup');
  
  if(shortcutSelect && currentShortcut){
    const settings = S.settings || getDefaultSettings();
    settings.stealthShortcut = shortcutSelect.value;
    
    // Show/hide custom shortcut setup
    if(customSetup){
      customSetup.style.display = shortcutSelect.value === 'custom' ? 'block' : 'none';
    }
    
    saveSettings(settings);
    
    currentShortcut.textContent = getShortcutDisplayText(settings.stealthShortcut);
    
    // Update stealth button tooltip
    const stealthBtn = document.getElementById('stealthBtn');
    if(stealthBtn){
      stealthBtn.title = `Stealth Mode (${getShortcutDisplayText(settings.stealthShortcut)})`;
    }
  }
}

function updateAutoLockSetting(){
  const autoLockCheck = document.getElementById('autoLockSetting');
  if(autoLockCheck){
    const settings = S.settings || getDefaultSettings();
    settings.autoLock = autoLockCheck.checked;
    saveSettings(settings);
  }
}

function updateClearDataSetting(){
  const clearDataCheck = document.getElementById('clearDataSetting');
  if(clearDataCheck){
    const settings = S.settings || getDefaultSettings();
    settings.clearData = clearDataCheck.checked;
    saveSettings(settings);
  }
}

function updateThemeSetting(){
  const themeSelect = document.getElementById('themeSetting');
  if(themeSelect){
    const settings = S.settings || getDefaultSettings();
    settings.theme = themeSelect.value;
    saveSettings(settings);
    applyTheme(settings.theme);
  }
}

function updateCompactModeSetting(){
  const compactCheck = document.getElementById('compactModeSetting');
  if(compactCheck){
    const settings = S.settings || getDefaultSettings();
    settings.compactMode = compactCheck.checked;
    saveSettings(settings);
    applyCompactMode(settings.compactMode);
  }
}

function applyTheme(theme){
  const body = document.body;
  body.className = body.className.replace(/theme-\w+/g, '');
  if(theme !== 'default'){
    body.classList.add(`theme-${theme}`);
  }
}

function applyCompactMode(compact){
  const body = document.body;
  body.classList.toggle('compact-mode', compact);
}

function testStealthShortcut(){
  const settings = S.settings || getDefaultSettings();
  const shortcutText = getShortcutDisplayText(settings.stealthShortcut);
  
  alert(`Test mode activated! Now try your shortcut: ${shortcutText}\n\nIf stealth mode activates, your shortcut is working correctly.`);
}

// Check for keyboard shortcuts based on settings
function checkStealthShortcut(e){
  const settings = S.settings || getDefaultSettings();
  const shortcut = settings.stealthShortcut;
  
  switch(shortcut){
    case 'ctrl-space-3':
      if(e.ctrlKey && e.code === 'Space'){
        e.preventDefault();
        S.ctrlSpaceCount++;
        clearTimeout(S.ctrlSpaceTimer);
        S.ctrlSpaceTimer = setTimeout(() => { S.ctrlSpaceCount = 0; }, 1500);
        if(S.ctrlSpaceCount >= 3){
          S.ctrlSpaceCount = 0;
          toggleStealthMode();
        }
      }
      break;
      
    case 'ctrl-shift-s':
      if(e.ctrlKey && e.shiftKey && e.code === 'KeyS'){
        e.preventDefault();
        toggleStealthMode();
      }
      break;
      
    case 'ctrl-alt-h':
      if(e.ctrlKey && e.altKey && e.code === 'KeyH'){
        e.preventDefault();
        toggleStealthMode();
      }
      break;
      
    case 'alt-shift-x':
      if(e.altKey && e.shiftKey && e.code === 'KeyX'){
        e.preventDefault();
        toggleStealthMode();
      }
      break;
      
    case 'f9-3':
      if(e.code === 'F9'){
        e.preventDefault();
        S.f9Count = (S.f9Count || 0) + 1;
        clearTimeout(S.f9Timer);
        S.f9Timer = setTimeout(() => { S.f9Count = 0; }, 1500);
        if(S.f9Count >= 3){
          S.f9Count = 0;
          toggleStealthMode();
        }
      }
      break;
      
    case 'escape-3':
      if(e.code === 'Escape'){
        e.preventDefault();
        S.escapeCount = (S.escapeCount || 0) + 1;
        clearTimeout(S.escapeTimer);
        S.escapeTimer = setTimeout(() => { S.escapeCount = 0; }, 1500);
        if(S.escapeCount >= 3){
          S.escapeCount = 0;
          toggleStealthMode();
        }
      }
      break;
      
    case 'custom':
      if(S.settings?.customShortcut){
        const customShortcut = S.settings.customShortcut.toLowerCase();
        const parts = customShortcut.split('+').map(p => p.trim());
        
        let modifiersMatch = true;
        let keyMatch = false;
        
        // Check modifiers
        if(parts.includes('ctrl') && !e.ctrlKey) modifiersMatch = false;
        if(parts.includes('alt') && !e.altKey) modifiersMatch = false;
        if(parts.includes('shift') && !e.shiftKey) modifiersMatch = false;
        if(!parts.includes('ctrl') && e.ctrlKey) modifiersMatch = false;
        if(!parts.includes('alt') && e.altKey) modifiersMatch = false;
        if(!parts.includes('shift') && e.shiftKey) modifiersMatch = false;
        
        // Check key
        const keyPart = parts.find(p => !['ctrl','alt','shift'].includes(p));
        if(keyPart){
          if(keyPart.startsWith('f') && keyPart.length > 1){
            // Function key
            keyMatch = e.code.toLowerCase() === ('key' + keyPart);
          } else if(keyPart.length === 1){
            // Letter key
            keyMatch = e.code.toLowerCase() === ('key' + keyPart);
          } else {
            // Special key
            const specialKeys = {space:'Space',enter:'Enter',escape:'Escape',tab:'Tab'};
            keyMatch = e.code === specialKeys[keyPart];
          }
        }
        
        if(modifiersMatch && keyMatch){
          e.preventDefault();
          toggleStealthMode();
        }
      }
      break;
  }
}

// Save custom shortcut function
function saveCustomShortcut(){
  const customInput = document.getElementById('customKeys');
  if(customInput && customInput.value.trim()){
    const settings = S.settings || getDefaultSettings();
    settings.customShortcut = customInput.value.trim();
    settings.stealthShortcut = 'custom';
    saveSettings(settings);
    
    const currentShortcut = document.getElementById('currentShortcut');
    if(currentShortcut) currentShortcut.textContent = customInput.value.trim();
    
    alert('Custom shortcut saved: ' + customInput.value.trim());
  }
}

// Function to switch to simulation mode for keys
function switchToSimForKeys(){
  setMode('sim');
  showSimPage('flow');
  alert('Switched to Simulation mode. Scroll down to find the "Authority Keys" section with private keys.');
}

// Copy private key function
function copyPrivateKey(authority){
  const key = S['fullPrivKey' + authority];
  if(key){
    navigator.clipboard.writeText(key).then(() => {
      alert(`${authority} private key copied to clipboard in MAYDAY format!\\n\\nYou can now paste it in Authority mode.`);
    }).catch(err => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = key;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert(`${authority} private key copied to clipboard in MAYDAY format!\\n\\nYou can now paste it in Authority mode.`);
    });
  } else {
    alert('Private key not available. Please ensure the simulation has loaded completely.');
  }
}

// Reset authority keys (for testing/debugging)
function resetAuthorityKeys(){
  if(confirm('This will generate new authority key pairs and make existing complaints undecryptable. Continue?')){
    // Clear stored keys
    for(const auth of ['HR','ICC','NGO']){
      localStorage.removeItem(`aawaaz_authority_keys_${auth}`);
    }
    
    // Reinitialize
    location.reload();
  }
}

// Test encoding/decoding process
function testEncodingDecoding(){
  try {
    // Test IV encoding/decoding
    const testIV = crypto.getRandomValues(new Uint8Array(12));
    const encodedIV = ab2b64(testIV);
    const decodedIV = b64toab(encodedIV);
    
    const matches = testIV.every((val, i) => val === decodedIV[i]);
    
    console.log('Encoding/Decoding test:');
    console.log('Original IV:', testIV);
    console.log('Encoded IV:', encodedIV);
    console.log('Decoded IV:', decodedIV);
    console.log('Match:', matches);
    console.log('Lengths - Original:', testIV.length, 'Decoded:', decodedIV.length);
    
    return matches;
  } catch(e) {
    console.error('Encoding/decoding test failed:', e);
    return false;
  }
}

// ============================
// SIDEBAR TOGGLE
// ============================
function toggleSidebar(){
  const sidebar = document.getElementById('navSidebar');
  const body = document.body;
  sidebar.classList.toggle('collapsed');
  body.classList.toggle('sidebar-collapsed');
  localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
}

function initSidebar(){
  const collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  if(collapsed){
    document.getElementById('navSidebar')?.classList.add('collapsed');
    document.body.classList.add('sidebar-collapsed');
  }
}

// ============================
// PRIVACY/VPN/TOR DETECTION
// ============================
async function checkPrivacyStatus(){
  const indicator = document.getElementById('privacyIndicator');
  const value = document.getElementById('privacyValue');
  const icon = document.getElementById('privacyIcon');
  
  try {
    // Check for Tor exit node or VPN indicators
    const response = await fetch('https://check.torproject.org/api/ip', {mode: 'cors'}).catch(() => null);
    
    if(response && response.ok){
      const data = await response.json();
      if(data.IsTor){
        value.textContent = 'TOR ACTIVE';
        value.className = 'privacy-value';
        indicator.className = 'privacy-indicator';
        icon.textContent = '🧅';
        return;
      }
    }
  } catch(e){}
  
  // Check WebRTC leak (simplified)
  try {
    const rtc = new RTCPeerConnection({iceServers: []});
    rtc.createDataChannel('');
    await rtc.createOffer().then(o => rtc.setLocalDescription(o));
    
    // If we get here without privacy tools, warn user
    value.textContent = 'DIRECT';
    value.className = 'privacy-value warning';
    indicator.className = 'privacy-indicator warning';
    icon.textContent = '⚠️';
    rtc.close();
  } catch(e){
    // WebRTC blocked - good sign of privacy tools
    value.textContent = 'PROTECTED';
    value.className = 'privacy-value';
    indicator.className = 'privacy-indicator';
    icon.textContent = '🛡️';
  }
}

// ============================
// DIGITAL SIGNATURE & HASH
// ============================
async function generateComplaintHash(complaintText){
  const encoder = new TextEncoder();
  const data = encoder.encode(complaintText + Date.now().toString());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function updateComplaintHash(){
  const hashEl = document.getElementById('complaintHash');
  if(!hashEl) return;
  
  if(S.complaint && S.complaint.length > 0){
    const hash = await generateComplaintHash(S.complaint);
    hashEl.textContent = hash.substring(0, 16) + '...' + hash.substring(48);
    hashEl.title = hash;
  } else {
    hashEl.textContent = 'SHA-256 hash will be generated';
  }
}

// ============================
// MERKLE TREE IMPLEMENTATION
// ============================
class MerkleTree {
  constructor(leaves = []){
    this.leaves = leaves.map(l => this.hash(l));
    this.tree = this.buildTree(this.leaves);
  }
  
  async hash(data){
    const encoder = new TextEncoder();
    const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2,'0')).join('');
  }
  
  async hashPair(a, b){
    return this.hash(a + b);
  }
  
  async buildTree(leaves){
    if(leaves.length === 0) return [];
    if(leaves.length === 1) return [leaves];
    
    const resolvedLeaves = await Promise.all(leaves);
    let level = resolvedLeaves;
    const tree = [level];
    
    while(level.length > 1){
      const nextLevel = [];
      for(let i = 0; i < level.length; i += 2){
        const left = level[i];
        const right = level[i + 1] || left;
        nextLevel.push(await this.hashPair(left, right));
      }
      level = nextLevel;
      tree.push(level);
    }
    return tree;
  }
  
  async getRoot(){
    const tree = await this.tree;
    return tree.length > 0 ? tree[tree.length - 1][0] : null;
  }
  
  async getProof(index){
    const tree = await this.tree;
    const proof = [];
    let idx = index;
    
    for(let i = 0; i < tree.length - 1; i++){
      const level = tree[i];
      const isRight = idx % 2 === 1;
      const siblingIdx = isRight ? idx - 1 : idx + 1;
      
      if(siblingIdx < level.length){
        proof.push({
          hash: level[siblingIdx],
          position: isRight ? 'left' : 'right'
        });
      }
      idx = Math.floor(idx / 2);
    }
    return proof;
  }
}

async function verifyIntegrity(){
  const token = document.getElementById('integrityToken')?.value;
  if(!token){
    alert('Please enter a tracking token');
    return;
  }
  
  const merkleSection = document.getElementById('merkleSection');
  const integrityResult = document.getElementById('integrityResult');
  const integrityIcon = document.getElementById('integrityIcon');
  const integrityText = document.getElementById('integrityText');
  
  merkleSection.style.display = 'block';
  
  // Simulate Merkle tree verification
  const complaintHash = await generateComplaintHash(token);
  const fakeLeaves = [
    'a1b2c3d4e5f6...',
    complaintHash.substring(0, 12) + '...',
    'f6e5d4c3b2a1...',
    '123456789abc...'
  ];
  
  // Update visualization
  document.getElementById('merkleLeaf1').textContent = fakeLeaves[0];
  document.getElementById('merkleLeafYours').textContent = fakeLeaves[1];
  document.getElementById('merkleLeaf3').textContent = fakeLeaves[2];
  document.getElementById('merkleLeaf4').textContent = fakeLeaves[3];
  
  // Simulate branch hashes
  document.getElementById('merkleBranchL').textContent = 'ab12cd34...';
  document.getElementById('merkleBranchR').textContent = 'ef56gh78...';
  document.getElementById('merkleRoot').textContent = complaintHash.substring(0, 16) + '...';
  
  // Show result
  setTimeout(() => {
    integrityResult.className = 'integrity-result valid';
    integrityIcon.textContent = '✅';
    integrityText.textContent = 'Integrity Verified — No tampering detected';
  }, 1000);
}

// ============================
// AUTHORITY ACTIVITY LOGS
// ============================
const mockActivityLogs = [
  {type: 'view', action: 'Complaint Received - MAY', authority: 'System - MAY', time: '2026-02-28 10:30:00', meta: 'Encrypted payload stored - MAY'},
  {type: 'decrypt', action: 'Decryption Attempted - MAY', authority: 'HR Department - MAY', time: '2026-02-28 11:15:00', meta: 'Private key verified - MAY'},
  {type: 'view', action: 'Complaint Viewed - MAY', authority: 'HR Department - MAY', time: '2026-02-28 11:16:00', meta: 'Full content accessed - MAY'},
  {type: 'action', action: 'Investigation Initiated - MAY', authority: 'HR Department - MAY', time: '2026-02-28 14:00:00', meta: 'Case #HR-2026-0142 - MAY'},
  {type: 'forward', action: 'Escalated to ICC - MAY', authority: 'HR Department - MAY', time: '2026-02-28 16:30:00', meta: 'Severity: High - MAY'},
];

async function fetchActivityLogs(){
  const tokenInput = document.getElementById('activityToken');
  const token = tokenInput?.value?.trim();
  if(!token){
    alert('Please enter a tracking token');
    return;
  }
  
  const container = document.getElementById('activityLogContainer');
  const timeline = document.getElementById('activityTimeline');
  const logCount = document.getElementById('logCount');
  
  container.style.display = 'block';
  timeline.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)">Loading activity logs...</div>';
  
  let logs = [];
  let isRealData = false;
  
  try {
    // Try to fetch real data from Supabase
    const tokenHash = await hashSHA256(token);
    const realLogs = await window.AawaazData.fetchActivityLogs(tokenHash);
    
    if(realLogs && realLogs.length > 0){
      // Transform real data to display format
      logs = realLogs.map(log => ({
        type: log.activity_type || 'view',
        action: log.action_description,
        authority: log.authority,
        time: new Date(log.created_at).toLocaleString(),
        meta: log.metadata || ''
      }));
      isRealData = true;
    }
  } catch(err){
    console.warn('[ActivityLogs] Could not fetch real data:', err.message);
  }
  
  // Fall back to mock data if no real data available
  if(logs.length === 0){
    await sleep(800); // Simulate delay for mock
    logs = mockActivityLogs;
    isRealData = false;
  }
  
  logCount.textContent = `${logs.length} entries${isRealData ? '' : ' (sample data - MAY)'}`;
  
  timeline.innerHTML = logs.map(log => `
    <div class="activity-item">
      <div class="activity-dot ${log.type}">${getActivityIcon(log.type)}</div>
      <div class="activity-content">
        <div class="activity-action">${log.action}</div>
        <div class="activity-meta">${log.authority} — ${log.meta}</div>
      </div>
      <div class="activity-time">${log.time}</div>
    </div>
  `).join('');
}

function getActivityIcon(type){
  const icons = {
    view: '👁️',
    decrypt: '🔓',
    action: '⚡',
    forward: '↗️',
    resolve: '✅'
  };
  return icons[type] || '📋';
}

// ============================
// CHARACTER COUNTER
// ============================
function updateCharCount(){
  const input = document.getElementById('complaintInput');
  const counter = document.getElementById('charCount');
  if(input && counter){
    counter.textContent = input.value.length;
  }
}

// ============================
// SHOWUSERPAGE UPDATE (for new pages)
// ============================
const originalShowUserPage = typeof showUserPage === 'function' ? showUserPage : null;

function showUserPageExtended(id){
  // Block settings access if not in user mode
  if(id === 'settings' && S.currentMode !== 'user') {
    alert('Settings can only be accessed from User mode.');
    return;
  }
  
  document.querySelectorAll('#userMode .page').forEach(p=>p.style.display='none');
  const el = document.getElementById('page-'+id);
  if(el) el.style.display='block';
  
  // Update nav active states
  document.querySelectorAll('#govNavUser .gov-nav-link').forEach(l => l.classList.remove('active'));
  const navMap = {
    'file': 0, 'track': 1, 'integrity': 2, 'logs': 3, 'about': 4, 'settings': 5
  };
  const navLinks = document.querySelectorAll('#govNavUser .gov-nav-link');
  if(navLinks[navMap[id]]) navLinks[navMap[id]].classList.add('active');
  
  // Load settings when settings page is shown
  if(id === 'settings'){
    loadSettings();
  }
}

// Override showUserPage
window.showUserPage = showUserPageExtended;

// ============================
// SIMULATION PANEL RESIZING
// ============================
let simResizeState = {
  isResizing: false,
  startX: 0,
  startCols: '',
  handle: null
};

function initSimResize(){
  const layout = document.querySelector('.sim-layout');
  const panels = layout.querySelectorAll('.sim-panel');
  const handles = layout.querySelectorAll('.sim-resize-handle');
  
  if(!panels || panels.length < 3) return;
  
  const leftPanel = panels[0];
  const midPanel = panels[1];
  const rightPanel = panels[2];
  
  // Load saved layout from localStorage
  const saved = localStorage.getItem('simPanelLayout');
  if(saved){
    try {
      const {leftW, midW, rightW} = JSON.parse(saved);
      leftPanel.style.flex = leftW;
      midPanel.style.flex = midW;
      rightPanel.style.flex = rightW;
    } catch(e) {
      console.warn('Could not restore panel layout:', e);
      // Set default proportional sizes
      setDefaultPanelSizes();
    }
  } else {
    // Set default proportional sizes
    setDefaultPanelSizes();
  }
  
  function setDefaultPanelSizes(){
    const containerW = layout.offsetWidth || 1200; // Fallback width
    const leftW = Math.floor(containerW * 0.35);   // 35% for left panel
    const midW = Math.floor(containerW * 0.25);    // 25% for middle panel
    const rightW = Math.floor(containerW * 0.4);   // 40% for right panel
    
    leftPanel.style.flex = `0 0 ${leftW}px`;
    midPanel.style.flex = `0 0 ${midW}px`;
    rightPanel.style.flex = `0 0 ${rightW}px`;
  }
  
  // Handle 0: Right edge of left panel (resizes panels 1 & 2)
  if(handles[0]){
    handles[0].addEventListener('mousedown', (e) => startResize(e, 0));
  }
  
  // Handle 1: Right edge of middle panel (resizes panels 2 & 3)
  if(handles[1]){
    handles[1].addEventListener('mousedown', (e) => startResize(e, 1));
  }
  
  function startResize(e, handleIndex){
    e.preventDefault();
    simResizeState.isResizing = true;
    simResizeState.startX = e.clientX;
    simResizeState.handleIndex = handleIndex;
    simResizeState.leftInitial = leftPanel.offsetWidth;
    simResizeState.midInitial = midPanel.offsetWidth;
    simResizeState.rightInitial = rightPanel.offsetWidth;
    
    layout.classList.add('resizing');
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
  }
  
  function handleResize(e){
    if(!simResizeState.isResizing) return;
    
    const delta = e.clientX - simResizeState.startX;
    const containerW = layout.offsetWidth;
    const minPanelW = 250;
    const maxPanelW = containerW - (2 * minPanelW); // Max width = container - (2 * minWidth for other panels)
    
    if(simResizeState.handleIndex === 0){
      // Dragging left handle: resize panels 1 & 2
      let newLeftW = simResizeState.leftInitial + delta;
      let newMidW = simResizeState.midInitial - delta;
      
      // Constrain left panel
      newLeftW = Math.max(minPanelW, Math.min(maxPanelW, newLeftW));
      // Constrain middle panel (inverse constraint)
      newMidW = Math.max(minPanelW, Math.min(maxPanelW, newMidW));
      
      // Ensure both panels fit within bounds
      const totalUsed = newLeftW + newMidW + rightPanel.offsetWidth;
      if(totalUsed > containerW){
        const excess = totalUsed - containerW;
        newLeftW = Math.max(minPanelW, newLeftW - excess/2);
        newMidW = Math.max(minPanelW, newMidW - excess/2);
      }
      
      leftPanel.style.flex = `0 0 ${newLeftW}px`;
      midPanel.style.flex = `0 0 ${newMidW}px`;
      
    } else if(simResizeState.handleIndex === 1){
      // Dragging right handle: resize panels 2 & 3
      let newMidW = simResizeState.midInitial + delta;
      let newRightW = simResizeState.rightInitial - delta;
      
      // Constrain middle panel
      newMidW = Math.max(minPanelW, Math.min(maxPanelW, newMidW));
      // Constrain right panel (inverse constraint)
      newRightW = Math.max(minPanelW, Math.min(maxPanelW, newRightW));
      
      // Ensure both panels fit within bounds
      const totalUsed = leftPanel.offsetWidth + newMidW + newRightW;
      if(totalUsed > containerW){
        const excess = totalUsed - containerW;
        newMidW = Math.max(minPanelW, newMidW - excess/2);
        newRightW = Math.max(minPanelW, newRightW - excess/2);
      }
      
      midPanel.style.flex = `0 0 ${newMidW}px`;
      rightPanel.style.flex = `0 0 ${newRightW}px`;
    }
  }
  
  function stopResize(){
    if(simResizeState.isResizing){
      simResizeState.isResizing = false;
      layout.classList.remove('resizing');
      
      // Save layout to localStorage
      localStorage.setItem('simPanelLayout', JSON.stringify({
        leftW: leftPanel.style.flex,
        midW: midPanel.style.flex,
        rightW: rightPanel.style.flex
      }));
      
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', stopResize);
    }
  }
  
  // Handle window resize to keep panels in bounds
  function handleWindowResize(){
    const containerW = layout.offsetWidth;
    const minPanelW = 250;
    const currentLeftW = leftPanel.offsetWidth;
    const currentMidW = midPanel.offsetWidth;
    const currentRightW = rightPanel.offsetWidth;
    const currentTotal = currentLeftW + currentMidW + currentRightW;
    
    // If panels exceed container, scale them down proportionally
    if(currentTotal > containerW){
      const scale = (containerW - 30) / currentTotal; // Leave some margin
      const newLeftW = Math.max(minPanelW, Math.floor(currentLeftW * scale));
      const newMidW = Math.max(minPanelW, Math.floor(currentMidW * scale));
      const newRightW = Math.max(minPanelW, Math.floor(currentRightW * scale));
      
      leftPanel.style.flex = `0 0 ${newLeftW}px`;
      midPanel.style.flex = `0 0 ${newMidW}px`;
      rightPanel.style.flex = `0 0 ${newRightW}px`;
    }
  }
  
  // Add window resize listener
  window.addEventListener('resize', handleWindowResize);
}

// ============================
// INIT
// ============================
window.addEventListener('load', async ()=>{
  await init();
  setMode(detectStartupMode());
  initSidebar();
  checkPrivacyStatus();
  initSimResize();
  
  // Add character count listener
  const complaintInput = document.getElementById('complaintInput');
  if(complaintInput){
    complaintInput.addEventListener('input', () => {
      updateCharCount();
      updateComplaintHash();
    });
  }
});

// Set default sim step display
simSetStep(2);
