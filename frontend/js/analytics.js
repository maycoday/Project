/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
const DEPTS = ['Engineering','Human Resources','Finance','Logistics','Legal','Operations','Marketing','Administration'];
const CATS  = ['Harassment','Safety','Financial','Discrimination','Misconduct','Whistleblower'];
const CAT_COLORS = {
  'Harassment':  '#F43F5E',
  'Safety':      '#F59E0B',
  'Financial':   '#3B82F6',
  'Discrimination':'#8B5CF6',
  'Misconduct':  '#06B6D4',
  'Whistleblower':'#10B981',
};

let reports  = [];
let alerts   = [];
let kanonOn  = true;
let currentView = 'analytics';

function mapRemoteReport(row){
  const meta = row?.metadata || {};
  const ts = row?.created_at ? Date.parse(row.created_at) : Date.now();
  const hourHint = typeof meta.hourOfDay === 'number' ? meta.hourOfDay : new Date(ts).getHours() + (Math.random()*0.25);
  return {
    id: row?.id || meta.reference || ('RPT-'+Math.random().toString(36).slice(2,8).toUpperCase()),
    token: meta.token_hint || '',
    blob: row?.ciphertext_b64 || fakeBlob(),
    category: meta.category || 'Unclassified',
    department: meta.department || 'Unknown',
    urgency: Number(meta.urgency || meta.urgency_score || 3),
    sentiment: Number(meta.sentiment || meta.sentiment_score || 5),
    timestamp: ts,
    hourOfDay: hourHint,
    blurredTime: meta.blurredTime || new Date(ts).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})+'xx'
  };
}

async function hydrateFromDatabase(){
  if(!window.AawaazData || !window.AawaazData.enabled) return false;
  try{
    const remote = await window.AawaazData.fetchPatternReports();
    if(!remote.length) return false;
    reports = remote.map(mapRemoteReport);
    runEngine();
    renderAll();
    return true;
  }catch(err){
    console.error('[Aawaaz] Unable to load pattern data from Supabase', err);
    return false;
  }
}

// Initialize with some sample data if database is empty
function initializeSampleData() {
  if(reports.length === 0) {
    console.log('No data found, initializing with sample data...');
    // Add a few sample reports for demonstration
    for(let i = 0; i < 5; i++) {
      reports.push(createReport());
    }
    runEngine();
    renderAll();
  }
}

/* Mode switcher navigation */
function navigateMode(target){
  if(target==='pattern'){
    return;
  }
  if(target==='sim'){
    window.location.href='index.html#sim';
    return;
  }
  if(target==='authority'){
    window.location.href='index.html?mode=authority';
    return;
  }
  window.location.href='index.html';
}

/* ══════════════════════════════════════════════
   FAKE ENCRYPTED BLOB
══════════════════════════════════════════════ */
function fakeBlob(){
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let s='';for(let i=0;i<80;i++)s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function fakeToken(){return 'tok_'+Math.random().toString(36).slice(2,10)}

/* ══════════════════════════════════════════════
   CLOCK
══════════════════════════════════════════════ */
function tick(){
  const e=document.getElementById('clock');
  if(e)e.textContent=new Date().toLocaleTimeString('en-IN',{hour12:true})+' IST';
}
setInterval(tick,1000);tick();

/* ══════════════════════════════════════════════
   DATA INJECTION (REAL COMPLAINT DATA)
══════════════════════════════════════════════ */

// Cache for real complaints data
let realComplaints = [];

// Fetch real complaints from the database
async function loadRealComplaints(){
  if(window.AawaazData && window.AawaazData.enabled) {
    try {
      realComplaints = await window.AawaazData.fetchAllComplaints(200);
      console.log(`📊 Loaded ${realComplaints.length} real complaints for pattern detection`);
    } catch(e) {
      console.warn('⚠️ Could not load real complaints, falling back to simulation data:', e);
      realComplaints = [];
    }
  }
}

// Convert real complaint to pattern detection format
function convertComplaintToReport(complaint){
  const meta = complaint.metadata || {};
  const timestamp = new Date(complaint.created_at).getTime();
  
  return {
    id: complaint.id || 'RPT-'+Math.random().toString(36).slice(2,8).toUpperCase(),
    token: complaint.token_hint || fakeToken(),
    blob: complaint.ciphertext_b64 ? complaint.ciphertext_b64.slice(0,80) : fakeBlob(),
    category: meta.category || CATS[Math.floor(Math.random()*CATS.length)],
    department: (complaint.authorities && complaint.authorities[0]) || DEPTS[Math.floor(Math.random()*DEPTS.length)],
    urgency: meta.severity || Math.floor(Math.random()*5)+1,
    sentiment: meta.sentiment || Math.floor(Math.random()*10)+1,
    timestamp: timestamp,
    hourOfDay: new Date(timestamp).getHours()+(Math.random()*0.99),
    blurredTime: new Date(timestamp).toLocaleTimeString('en-IN',{hour12:true}).split(':').slice(0,2).join(':')+'xx',
  };
}

// Create report from real data or fallback to simulation
function createReport(cat, dept, urgency, sentiment){
  // Try to use real complaint data first
  if(realComplaints.length > 0) {
    const randomComplaint = realComplaints[Math.floor(Math.random() * realComplaints.length)];
    const report = convertComplaintToReport(randomComplaint);
    
    // Override with specified parameters if provided
    if(cat) report.category = cat;
    if(dept) report.department = dept;
    if(urgency) report.urgency = urgency;
    if(sentiment) report.sentiment = sentiment;
    
    return report;
  }
  
  // Fallback to simulation data if no real complaints
  const now=Date.now();
  return {
    id: 'SIM-'+Math.random().toString(36).slice(2,8).toUpperCase(),
    token: fakeToken(),
    blob: fakeBlob(),
    category: cat || CATS[Math.floor(Math.random()*CATS.length)],
    department: dept || DEPTS[Math.floor(Math.random()*DEPTS.length)],
    urgency: urgency || Math.floor(Math.random()*5)+1,
    sentiment: sentiment || Math.floor(Math.random()*10)+1,
    timestamp: now,
    hourOfDay: new Date(now).getHours()+(Math.random()*0.99),
    blurredTime: new Date(now).toLocaleTimeString('en-IN',{hour12:true}).split(':').slice(0,2).join(':')+'xx',
  };
}

async function injectRandom(){
  console.log('🎲 Injecting real complaint data...');
  await loadRealComplaints(); // Ensure we have fresh data
  const r=createReport();
  reports.push(r);
  runEngine();
  renderAll();
  const dataSource = realComplaints.length > 0 ? 'real complaint data' : 'simulation data';
  console.log(`✅ Complaint injected from ${dataSource}. Total reports:`, reports.length);
}

async function injectHotspot(){
  console.log('🔥 Triggering hotspot detection with real data...');
  await loadRealComplaints(); // Ensure we have fresh data
  
  // Use real department if available, otherwise fallback
  let cat = 'Safety', dept = 'Logistics';
  if(realComplaints.length > 0) {
    const sampleComplaint = realComplaints[0];
    const meta = sampleComplaint.metadata || {};
    cat = meta.category || 'Safety';
    dept = (sampleComplaint.authorities && sampleComplaint.authorities[0]) || 'Logistics';
  }
  
  // Force 4 same cat+dept within 72h
  for(let i=0;i<4;i++) reports.push(createReport(cat,dept,4+Math.floor(Math.random()*2),7+Math.floor(Math.random()*3)));
  runEngine();
  renderAll();
  const dataSource = realComplaints.length > 0 ? 'real complaint data' : 'simulation data';
  console.log(`✅ Hotspot triggered using ${dataSource}: 4 ${cat}/${dept} complaints added. Total reports:`, reports.length);
}

async function injectBatch(n){
  console.log(`🌊 Flood injection starting: ${n} real complaints...`);
  await loadRealComplaints(); // Ensure we have fresh data
  for(let i=0;i<n;i++) reports.push(createReport());
  runEngine();
  renderAll();
  const dataSource = realComplaints.length > 0 ? 'real complaint data' : 'simulation data';
  console.log(`✅ Flood complete: ${n} complaints injected from ${dataSource}`);
}

function clearData(){
  if(confirm('⚠️ Clear all pattern detection data? This cannot be undone.')) {
    reports=[];alerts=[];
    runEngine();
    renderAll();
    console.log('🗑️ All pattern detection data cleared');
  }
}

function submitCustom(){
  const cat=document.getElementById('inp-cat').value;
  const dept=document.getElementById('inp-dept').value;
  const urg=parseInt(document.getElementById('inp-urgency').value);
  const sen=parseInt(document.getElementById('inp-sentiment').value);
  reports.push(createReport(cat,dept,urg,sen));
  runEngine();
  renderAll();
}

/* ══════════════════════════════════════════════
   PATTERN DETECTION ENGINE
══════════════════════════════════════════════ */
function runEngine(){
  alerts=[];
  const now=Date.now();
  const window72=72*60*60*1000;

  // 1. Cluster / Hotspot Detection
  const clusters={};
  reports.forEach(r=>{
    if(now-r.timestamp>window72) return;
    const key=r.category+'||'+r.department;
    if(!clusters[key]) clusters[key]={count:0,cat:r.category,dept:r.department};
    clusters[key].count++;
  });
  const hotspots=Object.values(clusters).filter(c=>c.count>=3);
  hotspots.forEach(h=>{
    pushAlert('hotspot',
      `High Frequency Alert: ${h.count} "${h.cat}" reports in "${h.dept}" in the last 72 hours.`,
      '🔥'
    );
  });

  // 2. Urgency spike detection
  const recent=reports.filter(r=>now-r.timestamp<window72);
  if(recent.length>=3){
    const avgUrg=recent.reduce((s,r)=>s+r.urgency,0)/recent.length;
    if(avgUrg>=4){
      pushAlert('trend',`Urgency Spike: Average urgency ${avgUrg.toFixed(1)}/5 across last ${recent.length} reports.`,'⚠');
    }
    const avgSent=recent.reduce((s,r)=>s+r.sentiment,0)/recent.length;
    if(avgSent>=7.5){
      pushAlert('trend',`High Distress Signal: Average sentiment intensity ${avgSent.toFixed(1)}/10.`,'😟');
    }
  }

  // 3. Department saturation
  const deptCounts={};
  recent.forEach(r=>{
    if(!deptCounts[r.department]) deptCounts[r.department]=0;
    deptCounts[r.department]++;
  });
  Object.entries(deptCounts).forEach(([dept,count])=>{
    if(count>=5) pushAlert('hotspot',`Department Alert: "${dept}" has ${count} reports in 72h — systemic issue possible.`,'🏢');
  });

  // 4. Low report info (k-anon guardrail notice)
  const totalDepts=Object.keys(deptCounts).length;
  const blurredDepts=Object.entries(deptCounts).filter(([d,c])=>c<3).length;
  if(blurredDepts>0){
    pushAlert('info',`K-Anonymity: ${blurredDepts} department(s) have <3 reports — data shown at org-level only.`,'🔒');
  }

  if(alerts.length===0 && reports.length>0){
    pushAlert('ok','No anomalies detected. All patterns within normal thresholds.','✅');
  }

  // Update counters
  document.getElementById('hotspotCount').textContent=hotspots.length;
  document.getElementById('kanonCount').textContent=blurredDepts;
}

function pushAlert(type,msg,icon){
  alerts.push({type,msg,icon,time:new Date().toLocaleTimeString('en-IN',{hour12:true})});
}

/* ══════════════════════════════════════════════
   RENDER
══════════════════════════════════════════════ */
function renderAll(){
  updateKPIs();
  renderAlertFeed();
  renderCategoryBars();
  renderSentimentChart();
  renderScatterChart();
  renderHeatmap();
  renderAdminView();
  
  // Update counts in sim bar
  const totalCount = reports.length;
  const hotspots = calcHotspots().length;
  const kAnon = 0; // K-anonymization count (placeholder)
  
  if(document.getElementById('totalCount')) document.getElementById('totalCount').textContent = totalCount;
  if(document.getElementById('hotspotCount')) document.getElementById('hotspotCount').textContent = hotspots;
  if(document.getElementById('kanonCount')) document.getElementById('kanonCount').textContent = kAnon;
}

/* KPIs */
function updateKPIs(){
  const now=Date.now(),w72=72*60*60*1000;
  const recent=reports.filter(r=>now-r.timestamp<w72);
  document.getElementById('kpi1').textContent=recent.length;
  document.getElementById('kpi1bar').style.width=Math.min(recent.length*5,100)+'%';

  const hotspots=calcHotspots().length;
  document.getElementById('kpi2').textContent=hotspots;
  document.getElementById('kpi2bar').style.width=Math.min(hotspots*20,100)+'%';

  if(reports.length){
    const avgS=(reports.reduce((s,r)=>s+r.sentiment,0)/reports.length).toFixed(1);
    document.getElementById('kpi3').textContent=avgS;
    document.getElementById('kpi3bar').style.width=(parseFloat(avgS)/10*100)+'%';
    const avgU=(reports.reduce((s,r)=>s+r.urgency,0)/reports.length).toFixed(1);
    document.getElementById('kpi4').textContent=avgU;
    document.getElementById('kpi4bar').style.width=(parseFloat(avgU)/5*100)+'%';
  } else {
    document.getElementById('kpi3').textContent='—';
    document.getElementById('kpi4').textContent='—';
    document.getElementById('kpi3bar').style.width='0%';
    document.getElementById('kpi4bar').style.width='0%';
  }

  document.getElementById('adm-total').textContent=reports.length;
  document.getElementById('adm-hot').textContent=hotspots;
}

function calcHotspots(){
  const now=Date.now(),w72=72*60*60*1000;
  const clusters={};
  reports.forEach(r=>{
    if(now-r.timestamp>w72)return;
    const k=r.category+'||'+r.department;
    if(!clusters[k])clusters[k]={count:0,cat:r.category,dept:r.department};
    clusters[k].count++;
  });
  return Object.values(clusters).filter(c=>c.count>=3);
}

/* Alert Feed */
function renderAlertFeed(){
  const feed=document.getElementById('alertFeed');
  document.getElementById('alertBadge').textContent=alerts.length+' alert'+(alerts.length!==1?'s':'');
  if(!alerts.length){
    feed.innerHTML='<div class="alert-empty"><span>📡</span>Awaiting data stream...<br>Inject test reports to see alerts.</div>';
    return;
  }
  feed.innerHTML=alerts.map(a=>`
    <div class="alert-card ${a.type}">
      <div class="alert-type">${a.type==='hotspot'?'🔥 HOTSPOT DETECTED':a.type==='trend'?'📈 TREND ALERT':a.type==='ok'?'✅ NOMINAL':'ℹ SYSTEM NOTICE'}</div>
      <div class="alert-msg">${a.icon} ${a.msg}</div>
      <div class="alert-time">${a.time}</div>
    </div>
  `).join('');
}

/* Category bars */
function renderCategoryBars(){
  const counts={};
  CATS.forEach(c=>counts[c]=0);
  reports.forEach(r=>counts[r.category]=(counts[r.category]||0)+1);
  const max=Math.max(...Object.values(counts),1);
  const total=reports.length||1;
  const el=document.getElementById('catList');
  if(!reports.length){el.innerHTML='<div style="text-align:center;color:var(--dim);font-size:11px;padding:20px;font-style:italic">No data yet</div>';return;}
  el.innerHTML=Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([cat,cnt])=>`
    <div class="cat-row">
      <div class="cat-name">${cat}</div>
      <div class="cat-track">
        <div class="cat-fill" style="width:${(cnt/max*100)}%;background:${CAT_COLORS[cat]}">${cnt>0?cnt:''}</div>
      </div>
      <div class="cat-pct">${cnt?Math.round(cnt/total*100)+'%':''}</div>
    </div>
  `).join('');
}

/* Sentiment Trend Chart (canvas line) */
function renderSentimentChart(){
  const canvas=document.getElementById('sentimentChart');
  const ctx=canvas.getContext('2d');
  const W=canvas.offsetWidth||600;
  canvas.width=W;canvas.height=120;
  ctx.clearRect(0,0,W,120);
  if(reports.length<2){
    ctx.fillStyle='rgba(255,255,255,0.1)';
    ctx.font='12px system-ui';ctx.textAlign='center';
    ctx.fillText('Need 2+ reports to draw trend',W/2,60);
    return;
  }

  const sorted=[...reports].sort((a,b)=>a.timestamp-b.timestamp).slice(-30);
  const vals=sorted.map(r=>r.sentiment);
  const minV=1,maxV=10;
  const padL=36,padR=16,padT=12,padB=24;
  const chartW=W-padL-padR,chartH=120-padT-padB;

  // Grid
  ctx.strokeStyle='rgba(255,255,255,0.05)';ctx.lineWidth=1;
  [2,4,6,8,10].forEach(v=>{
    const y=padT+chartH-(v-minV)/(maxV-minV)*chartH;
    ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(W-padR,y);ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.2)';ctx.font='9px monospace';ctx.textAlign='right';
    ctx.fillText(v,padL-5,y+3);
  });

  // Fill area
  const pts=vals.map((v,i)=>({
    x:padL+(i/(vals.length-1||1))*chartW,
    y:padT+chartH-(v-minV)/(maxV-minV)*chartH
  }));

  const grad=ctx.createLinearGradient(0,padT,0,padT+chartH);
  grad.addColorStop(0,'rgba(0,196,97,0.25)');
  grad.addColorStop(1,'rgba(0,196,97,0)');
  ctx.beginPath();ctx.moveTo(pts[0].x,padT+chartH);
  pts.forEach(p=>ctx.lineTo(p.x,p.y));
  ctx.lineTo(pts[pts.length-1].x,padT+chartH);ctx.closePath();
  ctx.fillStyle=grad;ctx.fill();

  // Line
  ctx.beginPath();ctx.strokeStyle='#00C461';ctx.lineWidth=2;
  ctx.lineJoin='round';ctx.lineCap='round';
  pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
  ctx.stroke();

  // Dots
  pts.forEach(p=>{
    ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);
    ctx.fillStyle='#00C461';ctx.fill();
  });

  // Moving average
  if(vals.length>=4){
    const ma=[];
    for(let i=2;i<vals.length-1;i++){
      const avg=(vals[i-2]+vals[i-1]+vals[i]+vals[i+1])/4;
      ma.push({i,avg});
    }
    ctx.beginPath();ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1;ctx.setLineDash([4,4]);
    ma.forEach((p,idx)=>{
      const x=padL+(p.i/(vals.length-1))*chartW;
      const y=padT+chartH-(p.avg-minV)/(maxV-minV)*chartH;
      idx===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    });
    ctx.stroke();ctx.setLineDash([]);
  }

  document.getElementById('sentMeta').textContent=`${sorted.length} data points · Latest: ${vals[vals.length-1]}/10`;
}

/* Scatter Chart: Urgency vs Time of Day */
function renderScatterChart(){
  const canvas=document.getElementById('scatterChart');
  const ctx=canvas.getContext('2d');
  const W=canvas.offsetWidth||500;
  canvas.width=W;canvas.height=180;
  ctx.clearRect(0,0,W,180);
  if(!reports.length){
    ctx.fillStyle='rgba(255,255,255,0.1)';ctx.font='12px system-ui';ctx.textAlign='center';
    ctx.fillText('No data yet',W/2,90);return;
  }
  const padL=32,padR=16,padT=14,padB=28;
  const cW=W-padL-padR,cH=180-padT-padB;

  // Grid
  ctx.strokeStyle='rgba(255,255,255,0.04)';ctx.lineWidth=1;
  for(let h=0;h<=24;h+=6){
    const x=padL+h/24*cW;
    ctx.beginPath();ctx.moveTo(x,padT);ctx.lineTo(x,padT+cH);ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.2)';ctx.font='9px monospace';ctx.textAlign='center';
    ctx.fillText(h>0?h+'h':'0',x,padT+cH+14);
  }
  for(let u=1;u<=5;u++){
    const y=padT+cH-(u-1)/4*cH;
    ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(padL+cW,y);ctx.stroke();
    ctx.textAlign='right';
    ctx.fillText(u,padL-5,y+3);
  }

  // Axis labels
  ctx.fillStyle='rgba(255,255,255,0.25)';ctx.font='9px monospace';
  ctx.textAlign='center';ctx.fillText('Hour of Day →',padL+cW/2,padT+cH+26);
  ctx.save();ctx.translate(10,padT+cH/2);ctx.rotate(-Math.PI/2);
  ctx.fillText('← Urgency',0,0);ctx.restore();

  // Scatter dots
  reports.forEach(r=>{
    const x=padL+(r.hourOfDay/24)*cW;
    const y=padT+cH-((r.urgency-1)/4)*cH;
    const col=CAT_COLORS[r.category]||'#fff';
    ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);
    ctx.fillStyle=col+'BB';ctx.fill();
    ctx.strokeStyle=col;ctx.lineWidth=0.5;ctx.stroke();
  });

  // Legend (unique cats in reports)
  const seen=new Set(reports.map(r=>r.category));
  const leg=document.getElementById('scatterLegend');
  leg.innerHTML=[...seen].map(c=>`<div class="cl-item"><div class="cl-swatch" style="background:${CAT_COLORS[c]}"></div>${c}</div>`).join('');
}

/* Heatmap */
function renderHeatmap(){
  const counts={};
  const deptDetails={};
  DEPTS.forEach(d=>{counts[d]=0;deptDetails[d]={cats:{},topCat:null,hotspot:false};});
  reports.forEach(r=>{
    counts[r.department]=(counts[r.department]||0)+1;
    if(!deptDetails[r.department])deptDetails[r.department]={cats:{},topCat:null,hotspot:false};
    deptDetails[r.department].cats[r.category]=(deptDetails[r.department].cats[r.category]||0)+1;
  });

  // Mark hotspots
  calcHotspots().forEach(h=>{
    if(deptDetails[h.dept]) deptDetails[h.dept].hotspot=true;
  });

  const maxC=Math.max(...Object.values(counts),1);
  const grid=document.getElementById('deptGrid');
  document.getElementById('heatmapMeta').textContent=`${DEPTS.length} departments tracked`;

  grid.innerHTML=DEPTS.map(dept=>{
    const cnt=counts[dept]||0;
    const detail=deptDetails[dept];
    const topCat=cnt>0?Object.entries(detail.cats).sort((a,b)=>b[1]-a[1])[0][0]:'None';
    const ratio=cnt/maxC;
    let riskClass='risk-0';
    if(ratio>0.8)riskClass='risk-5';
    else if(ratio>0.6)riskClass='risk-4';
    else if(ratio>0.4)riskClass='risk-3';
    else if(ratio>0.2)riskClass='risk-2';
    else if(ratio>0)riskClass='risk-1';

    const blurred=kanonOn&&cnt>0&&cnt<3;
    const shortDept=dept.length>12?dept.slice(0,11)+'…':dept;
    const riskLabel=riskClass==='risk-0'?'NONE':riskClass==='risk-1'?'LOW':riskClass==='risk-2'?'MODERATE':riskClass==='risk-3'?'ELEVATED':riskClass==='risk-4'?'HIGH':'CRITICAL';

    return `<div class="dept-cell ${riskClass}${blurred?' blurred':''}" title="${dept}: ${cnt} report${cnt!==1?'s':''}" style="position:relative">
      ${detail.hotspot?'<div class="hotspot-badge">!</div>':''}
      <div class="dept-name">${shortDept} <span class="dept-privacy">${blurred?'🔒':''}</span></div>
      <div class="dept-count">${cnt}</div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div class="dept-tag">${riskLabel}</div>
        ${cnt>0&&!blurred?`<div style="font-size:9px;color:rgba(255,255,255,0.4)">${topCat}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

/* Admin View */
function renderAdminView(){
  const grid=document.getElementById('adminGrid');
  if(!reports.length){
    grid.innerHTML='<div style="text-align:center;color:var(--dim);font-size:11px;padding:32px;font-style:italic;grid-column:span 3">No records. Inject test data to populate.</div>';
    return;
  }
  grid.innerHTML=[...reports].reverse().slice(0,12).map(r=>`
    <div class="admin-record">
      <div class="admin-record-id">ID: ${r.id} &nbsp;·&nbsp; ${new Date(r.timestamp).toLocaleTimeString()}</div>
      <div class="admin-record-meta">
        <div class="arm"><span class="arm-k">CATEGORY</span><span class="arm-v" style="color:${CAT_COLORS[r.category]}">${r.category}</span></div>
        <div class="arm"><span class="arm-k">DEPARTMENT</span><span class="arm-v">${r.department}</span></div>
        <div class="arm"><span class="arm-k">URGENCY</span><span class="arm-v">${'▮'.repeat(r.urgency)}${'▯'.repeat(5-r.urgency)} ${r.urgency}/5</span></div>
        <div class="arm"><span class="arm-k">SENTIMENT</span><span class="arm-v">${r.sentiment}/10</span></div>
        <div class="arm"><span class="arm-k">TIME (BLURRED)</span><span class="arm-v" style="color:var(--cyan)">${r.blurredTime}</span></div>
      </div>
      <div class="admin-blob">${r.blob}</div>
      <div class="btn-disabled">🔒 Read Complaint — Disabled for Sys Admin</div>
    </div>
  `).join('');
}

/* ══════════════════════════════════════════════
   VIEW SWITCHING
══════════════════════════════════════════════ */
function setView(v){
  currentView=v;
  document.querySelectorAll('.vt').forEach(b=>b.classList.remove('on'));
  event.target.classList.add('on');

  document.getElementById('analyticsView').style.display=v==='analytics'?'flex':'none';
  document.getElementById('heatmapView').style.display=v==='heatmap'?'flex':'none';
  document.getElementById('adminView').style.display=v==='admin'?'block':'none';

  if(v==='heatmap') renderHeatmap();
  if(v==='analytics'){renderSentimentChart();renderScatterChart();}
}

/* K-Anon toggle */
function toggleKAnon(){
  kanonOn=!kanonOn;
  document.getElementById('kanonCheck').className='pt-check'+(kanonOn?'':' off');
  renderHeatmap();
}

/* ══════════════════════════════════════════════
   RESIZE — redraw charts
══════════════════════════════════════════════ */
let resizeTimer;
window.addEventListener('resize',()=>{
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(()=>{renderSentimentChart();renderScatterChart();},200);
});

/* ══════════════════════════════════════════════
   INIT — seed some demo data
══════════════════════════════════════════════ */
function seedDemo(){
  const seed=[
    ['Harassment','Engineering',4,8],
    ['Safety','Logistics',3,6],
    ['Safety','Logistics',4,7],
    ['Financial','Finance',2,4],
    ['Discrimination','HR',5,9],
    ['Safety','Logistics',5,8],
    ['Misconduct','Operations',3,5],
    ['Harassment','Engineering',3,7],
    ['Whistleblower','Legal',2,6],
  ];
  seed.forEach(([c,d,u,s])=>{
    const r=createReport(c,d,u,s);
    // Spread timestamps over last 48h
    r.timestamp-=Math.random()*48*60*60*1000;
    r.hourOfDay=Math.random()*24;
    reports.push(r);
  });
  runEngine();
  renderAll();
}

window.addEventListener('load', async ()=>{
  const loaded = await hydrateFromDatabase();
  if(!loaded) seedDemo();
  
  // Load real complaints for pattern detection
  await loadRealComplaints();
  if(realComplaints.length > 0) {
    console.log(`🎯 Pattern detection initialized with ${realComplaints.length} real complaints`);
  } else {
    console.log('⚠️ Pattern detection using simulation data (no real complaints found)');
  }
  
  // resize charts after fonts load
  setTimeout(()=>{renderSentimentChart();renderScatterChart();},300);
});
