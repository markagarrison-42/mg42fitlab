const { useState, useEffect, useRef } = React;

function loadLS(k,fb){try{const s=localStorage.getItem(k);return s?JSON.parse(s):fb;}catch{return fb;}}
function saveLS(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}
function loadRestDefaults(){return loadLS('fitlog_rest_defaults',{bench_press:180,incline_press_b:180,lat_pulldown_a:180,pullup_b:180,seated_row_a:180,squat_a:180,rdl_a:180,rdl_b:180,incline_db_press:90,arnold_press:90,db_chest_fly_a:90,lateral_raise_pa:90,lateral_raise_pb:90,lateral_raise_pf:90,tate_press_a:90,tate_press_b:90,cable_pushdown_a:90,flat_db_press_b:90,cable_crossover_b:90,db_shoulder_press_b:90,overhead_tri_b:90,db_row_a:90,face_pull_a:90,face_pull_b:90,face_pull_pf:90,shrug_a:90,incline_curl_a:90,hammer_curl_a:90,hammer_curl_b:90,hammer_curl_pf:90,chest_row_b:90,straight_arm_b:90,rear_delt_b:90,rear_delt_pf:90,cable_curl_b:90,bicep_curl_pf:90,bss_a:90,leg_ext_a:90,leg_ext_b:90,lying_curl_a:90,standing_calf_a:90,leg_press_b:90,seated_curl_b:90,lunge_b:90,seated_calf_b:90,lat_pulldown_pf:90,seated_row_pf:90,weighted_dips:90,cable_fly_b:90,deadlift:180,_default:120});}
function getRestDuration(id,def){return(def&&def[id])||(def&&def._default)||120;}
async function fetchAllLogs(){try{const r=await fetch('/api/logs');return r.ok?await r.json():{};}catch{return{};}}
async function pushExerciseLogs(id,entries){try{await fetch('/api/logs/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entries)});}catch{}}
async function fetchServerWorkouts(){try{const r=await fetch('/api/workouts');return r.ok?await r.json():null;}catch{return null;}}
async function saveServerWorkouts(data){try{await fetch('/api/workouts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});}catch{}}
function e1rm(w,r){return(!w||!r||r<=0)?0:Math.round(w*(1+r/30));}
function getBestE1rm(logs){return logs&&logs.length?Math.max(...logs.map(l=>l.e1rm||0)):0;}
function fmtVol(v){return v>=1000?(v/1000).toFixed(1)+'k':String(v);}
function fmtDate(iso){const d=new Date(iso);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function fmtDur(ms){const m=Math.round(ms/60000);return m>0?m+'m':'<1m';}

function buildSessions(allLogs,workouts){
  const customNames=loadLS('fitlog_custom_ex_names',{});
  const all=[];
  Object.entries(allLogs).forEach(([exId,entries])=>{
    // Fallback name only used if entry doesn't already have its own exName
    let fallbackName=customNames[exId]||exId.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase());
    Object.values(workouts).forEach(w=>{const found=w.exercises&&w.exercises.find(e=>e.id===exId);if(found)fallbackName=found.name;});
    entries.forEach(entry=>{all.push({...entry,exId,exName:entry.exName||fallbackName});});
  });
  all.sort((a,b)=>new Date(a.date)-new Date(b.date));
  const sessions=[];let current=null;
  all.forEach(entry=>{
    const t=new Date(entry.date).getTime();
    if(!current||entry.sessionId!==current.sessionId||(entry.sessionId===undefined&&t-current.lastTime>4*60*60*1000)){
      if(current)sessions.push(current);
      current={id:entry.sessionId||('reconstructed_'+t),date:entry.date,workoutLabel:entry.workoutLabel||'Workout',sets:[],lastTime:t,reconstructed:!entry.sessionId&&!entry.workoutName};
    }
    current.sets.push(entry);current.lastTime=t;
  });
  if(current)sessions.push(current);
  sessions.forEach(s=>{
    // Priority: 1) user manual rename, 2) workoutName stored in log entries, 3) overlap algorithm
    const savedLabel=loadLS('session_label_'+s.id,null);
    if(savedLabel){
      s.workoutLabel=savedLabel;
    } else {
      // Check if any set has a workoutName stored (from Strong import)
      const storedName=s.sets.find(x=>x.workoutName)?.workoutName;
      if(storedName){
        s.workoutLabel=storedName;
      } else if(s.reconstructed){
        const exIds=new Set(s.sets.map(x=>x.exId));
        let best=null,bestScore=0;
        Object.values(workouts).forEach(w=>{
          if(!w.exercises||!w.exercises.length)return;
          const overlap=w.exercises.filter(e=>exIds.has(e.id)).length;
          if(overlap===0)return;
          const score=overlap/w.exercises.length;
          if(score>bestScore){bestScore=score;best=w.label;}
        });
        if(best)s.workoutLabel=best;
      }
    }
    s.volume=s.sets.reduce((v,x)=>v+(x.weight*x.reps||0),0);
    s.duration=s.sets.length>0?(new Date(s.sets[s.sets.length-1].date)-new Date(s.sets[0].date)):0;
  });
  return sessions.reverse();
}

// Pre-unlock audio on first gesture (iOS requires this)
let _audioCtx=null;
function getAudioCtx(){
  if(!_audioCtx)_audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  if(_audioCtx.state==='suspended')_audioCtx.resume();
  return _audioCtx;
}
document.addEventListener('touchstart',()=>getAudioCtx(),{once:true});
document.addEventListener('click',()=>getAudioCtx(),{once:true});

// ── PUSH NOTIFICATIONS ─────────────────────────────────────────────────────
let _pushSub=null;
let _activeTimerJobId=null;

async function initPush(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window))return;
  try{
    const perm=await Notification.requestPermission();
    if(perm!=='granted')return;
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub){
      const keyRes=await fetch('/api/push/vapid-public-key');
      const{key}=await keyRes.json();
      if(!key)return;
      const app=urlB64ToU8(key);
      sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:app});
    }
    _pushSub=sub;
    const subJson=sub.toJSON();await fetch('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:sub.endpoint,keys:{p256dh:subJson.keys.p256dh,auth:subJson.keys.auth}})});
  }catch(e){console.warn('push init:',e);}
}

async function schedulePushTimer(seconds,exerciseName){
  try{
    const res=await fetch('/api/push/timer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({seconds,exercise:exerciseName})});
    const d=await res.json();
    if(d.job_id)_activeTimerJobId=d.job_id;
  }catch(e){}
}

async function cancelPushTimer(){
  if(!_activeTimerJobId)return;
  try{await fetch('/api/push/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({job_id:_activeTimerJobId})});}catch(e){}
  _activeTimerJobId=null;
}

function urlB64ToU8(b64){
  const pad='='.repeat((4-b64.length%4)%4);
  const raw=atob((b64+pad).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}

function playDoneChime(){try{const ctx=getAudioCtx(),t=ctx.currentTime;[[523.25,0,1.2,0.6],[659.25,0.06,1.0,0.45],[783.99,0.12,1.4,0.5],[1046.5,0.18,0.9,0.35]].forEach(([freq,start,dur,vol])=>{const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(0,t+start);g.gain.linearRampToValueAtTime(vol,t+start+0.015);g.gain.exponentialRampToValueAtTime(0.001,t+start+dur);o.start(t+start);o.stop(t+start+dur+0.05);});}catch(e){console.warn('chime err',e);}}
function playBeep(){try{const ctx=getAudioCtx(),t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.type='square';o.frequency.value=880;g.gain.setValueAtTime(0.3,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.15);o.start(t);o.stop(t+0.2);}catch(e){}}
function playChimeOrBeep(){const snd=loadLS('fitlog_rest_defaults',{}).sound||'chime';if(snd==='chime')playDoneChime();else if(snd==='beep')playBeep();}
function vibrateAlert(){if(navigator.vibrate)navigator.vibrate([200,100,200]);}
function useWakeLock(){const ref=useRef(null);const[active,setActive]=useState(false);async function request(){try{if('wakeLock' in navigator){ref.current=await navigator.wakeLock.request('screen');ref.current.addEventListener('release',()=>setActive(false));setActive(true);}}catch(e){}}function release(){if(ref.current){ref.current.release();ref.current=null;setActive(false);}}return{active,toggle:()=>active?release():request()};}
function makeWorkerTimer(){
  // Try Web Worker first, fall back to enhanced setInterval
  try{
    const blob=new Blob([`let id=null;self.onmessage=function(e){if(e.data==='start'){if(id)clearInterval(id);id=setInterval(()=>self.postMessage('tick'),1000);}else if(e.data==='stop'){clearInterval(id);id=null;}};`],{type:'application/javascript'});
    const w=new Worker(URL.createObjectURL(blob));
    // Test it works
    w._isWorker=true;
    return w;
  }catch(e){}
  // Fallback: fake worker interface using setInterval + Page Visibility API
  let id=null,cb=null,startTime=null,elapsed=0;
  const obj={
    _isWorker:false,
    onmessage:null,
    postMessage(msg){
      if(msg==='start'){
        if(id)clearInterval(id);
        startTime=Date.now()-elapsed*1000;
        id=setInterval(()=>{
          elapsed=Math.floor((Date.now()-startTime)/1000);
          if(obj.onmessage)obj.onmessage({data:'tick'});
        },1000);
      } else if(msg==='stop'){
        clearInterval(id);id=null;
      }
    },
    terminate(){clearInterval(id);id=null;}
  };
  // When page becomes visible again, sync elapsed time
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&id){
      clearInterval(id);
      // Fire any missed ticks immediately
      const missed=Math.floor((Date.now()-startTime)/1000)-elapsed;
      for(let i=0;i<missed&&i<3600;i++){if(obj.onmessage)obj.onmessage({data:'tick'});}
      elapsed=Math.floor((Date.now()-startTime)/1000);
      id=setInterval(()=>{
        elapsed=Math.floor((Date.now()-startTime)/1000);
        if(obj.onmessage)obj.onmessage({data:'tick'});
      },1000);
    }
  });
  return obj;
}

const T={bg:'#0a0c0f',bg2:'#111318',bg3:'#1a1f2e',bg4:'#0f1117',border:'rgba(148,163,184,0.12)',border2:'rgba(148,163,184,0.22)',text:'#f1f5f9',sub:'#cbd5e1',muted:'#94a3b8',dim:'#64748b',green:'#14b8a6',mono:"'Courier New',monospace",sans:"-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',sans-serif",tabH:64};
const GRAD={accent:'linear-gradient(135deg,#7c3aed 0%,#14b8a6 100%)',button:'linear-gradient(135deg,rgba(124,58,237,0.9),rgba(20,184,166,0.9))'};
const CAT={push:'#e8a020',pull:'#4a9eff',legs:'#7ed9a8',pf:'#b06ae8'};
const GYM_LABELS={pm:'Power Matrix',anthropic:'Anthropic',rrb:'RRB',golds:"Gold's Gym",anytime:'Anytime Fitness',pf:'Planet Fitness',home:'Home',hotel:'Hotel',rahway:'Rahway',general:'General'};
const TYPE_LABELS={push:'Push',pull:'Pull',legs:'Legs',upper:'Upper Body',full:'Full Body',core:'Core / Abs',other:'Other'};
const TYPE_COLORS={push:'#e8a020',pull:'#4a9eff',legs:'#7ed9a8',upper:'#a78bfa',full:'#14b8a6',core:'#f472b6',other:'#64748b'};

const DEFAULT_WORKOUTS={
  pm_push:{label:'Power Matrix Push',tag:'PM Heavy',category:'push',gym:'pm',wtype:'push',note:'Power Matrix bench day. Complete every rep before advancing.',exercises:[{id:'bench_press',name:'Barbell Bench Press',sets:7,reps:'8/8/3/1/1/1/5'},{id:'incline_db_press',name:'Incline DB Press',sets:3,reps:'10-12'},{id:'arnold_press',name:'Arnold Press',sets:3,reps:'10-12'},{id:'db_chest_fly_a',name:'DB Chest Fly',sets:3,reps:'12-15'},{id:'lateral_raise_pa',name:'Lateral Raise',sets:4,reps:'15-20'},{id:'tate_press_a',name:'Tate Press',sets:3,reps:'12-15'},{id:'cable_pushdown_a',name:'Cable Pushdown',sets:3,reps:'15-20'}]},
  pm_pull:{label:'Power Matrix Pull',tag:'PM Heavy',category:'pull',gym:'pm',wtype:'pull',note:'Power Matrix deadlift day. Complete every rep before advancing.',exercises:[{id:'deadlift',name:'Deadlift (Barbell)',sets:7,reps:'8/8/3/1/1/1/5'},{id:'lat_pulldown_a',name:'Lat Pulldown',sets:4,reps:'6-10'},{id:'seated_row_a',name:'Seated Row',sets:4,reps:'8-10'},{id:'db_row_a',name:'DB Row',sets:3,reps:'10-12'},{id:'face_pull_a',name:'Face Pull',sets:3,reps:'15-20'},{id:'shrug_a',name:'DB Shrug',sets:3,reps:'12-15'},{id:'incline_curl_a',name:'Incline Curl',sets:3,reps:'10-12'},{id:'hammer_curl_a',name:'Hammer Curl',sets:3,reps:'12-15'}]},
  pm_legs:{label:'Power Matrix Legs',tag:'PM Heavy',category:'legs',gym:'pm',wtype:'legs',note:'Power Matrix squat day. Complete every rep before advancing.',exercises:[{id:'squat_a',name:'Barbell Squat',sets:7,reps:'8/8/3/1/1/1/5'},{id:'bss_a',name:'Bulgarian Split Squat',sets:3,reps:'10-12'},{id:'leg_ext_a',name:'Leg Extension',sets:3,reps:'12-15'},{id:'rdl_a',name:'Romanian Deadlift',sets:3,reps:'10-12'},{id:'lying_curl_a',name:'Lying Curl',sets:3,reps:'12-15'},{id:'standing_calf_a',name:'Calf Raise',sets:4,reps:'15-20'}]},
  push_a:{label:'Push A',tag:'Heavy',category:'push',gym:'rrb',wtype:'push',note:'Rest 2-3 min compound, 60-90 sec isolation.',exercises:[{id:'bench_press',name:'Barbell Bench Press',sets:4,reps:'6-8'},{id:'incline_db_press',name:'Incline DB Press',sets:3,reps:'10-12'},{id:'arnold_press',name:'Arnold Press',sets:3,reps:'10-12'},{id:'db_chest_fly_a',name:'DB Chest Fly',sets:3,reps:'12-15'},{id:'lateral_raise_pa',name:'Lateral Raise',sets:4,reps:'15-20'},{id:'tate_press_a',name:'Tate Press',sets:3,reps:'12-15'},{id:'cable_pushdown_a',name:'Cable Pushdown',sets:3,reps:'15-20'}]},
  push_b:{label:'Push B',tag:'Volume',category:'push',gym:'rrb',wtype:'push',note:'Lighter. 60-90 sec rest.',exercises:[{id:'incline_press_b',name:'Incline Barbell Press',sets:4,reps:'10-12'},{id:'weighted_dips',name:'Weighted Dips',sets:3,reps:'8-12'},{id:'flat_db_press_b',name:'Flat DB Press',sets:3,reps:'12-15'},{id:'cable_fly_b',name:'Cable Fly',sets:3,reps:'12-15'},{id:'cable_crossover_b',name:'Cable Crossover',sets:3,reps:'12-15'},{id:'db_shoulder_press_b',name:'DB Shoulder Press',sets:3,reps:'10-12'},{id:'lateral_raise_pb',name:'Lateral Raise',sets:4,reps:'15-20'},{id:'overhead_tri_b',name:'Overhead Tricep',sets:3,reps:'12-15'},{id:'tate_press_b',name:'Tate Press',sets:3,reps:'15-20'}]},
  pull_a:{label:'Pull A',tag:'Heavy',category:'pull',gym:'rrb',wtype:'pull',note:'Rest 2-3 min compounds.',exercises:[{id:'deadlift',name:'Deadlift (Barbell)',sets:5,reps:'5'},{id:'lat_pulldown_a',name:'Lat Pulldown',sets:4,reps:'6-10'},{id:'seated_row_a',name:'Seated Row',sets:4,reps:'8-10'},{id:'db_row_a',name:'DB Row',sets:3,reps:'10-12'},{id:'face_pull_a',name:'Face Pull',sets:3,reps:'15-20'},{id:'shrug_a',name:'DB Shrug',sets:3,reps:'12-15'},{id:'incline_curl_a',name:'Incline Curl',sets:3,reps:'10-12'},{id:'hammer_curl_a',name:'Hammer Curl',sets:3,reps:'12-15'}]},
  pull_b:{label:'Pull B',tag:'Volume',category:'pull',gym:'rrb',wtype:'pull',note:'Isolation focus.',exercises:[{id:'pullup_b',name:'Pull-Up',sets:4,reps:'8-12'},{id:'chest_row_b',name:'Chest Row',sets:3,reps:'10-12'},{id:'straight_arm_b',name:'Straight Arm',sets:3,reps:'12-15'},{id:'rear_delt_b',name:'Rear Delt Fly',sets:3,reps:'15-20'},{id:'face_pull_b',name:'Face Pull',sets:3,reps:'15-20'},{id:'cable_curl_b',name:'Cable Curl',sets:3,reps:'12-15'},{id:'hammer_curl_b',name:'Hammer Curl',sets:3,reps:'12-15'}]},
  legs_a:{label:'Legs A',tag:'Quad',category:'legs',gym:'rrb',wtype:'legs',note:'Rest 2-3 min after squats.',exercises:[{id:'squat_a',name:'Barbell Squat',sets:4,reps:'6-8'},{id:'bss_a',name:'Bulgarian Split Squat',sets:3,reps:'10-12'},{id:'leg_ext_a',name:'Leg Extension',sets:3,reps:'12-15'},{id:'rdl_a',name:'Romanian Deadlift',sets:3,reps:'10-12'},{id:'lying_curl_a',name:'Lying Curl',sets:3,reps:'12-15'},{id:'standing_calf_a',name:'Calf Raise',sets:4,reps:'15-20'}]},
  legs_b:{label:'Legs B',tag:'Hinge',category:'legs',gym:'rrb',wtype:'legs',note:'Less CNS.',exercises:[{id:'rdl_b',name:'Romanian Deadlift',sets:4,reps:'8-10'},{id:'leg_press_b',name:'Leg Press',sets:4,reps:'10-15'},{id:'seated_curl_b',name:'Seated Curl',sets:3,reps:'10-12'},{id:'lunge_b',name:'Reverse Lunge',sets:3,reps:'12'},{id:'leg_ext_b',name:'Leg Extension',sets:3,reps:'15-20'},{id:'seated_calf_b',name:'Seated Calf',sets:4,reps:'15-20'}]},
  rrb_push:{label:'RRB Push',tag:'Heavy A',category:'push',gym:'rrb',wtype:'push',note:'RRB Push Heavy A. Rest 2-3 min compounds.',exercises:[{id:'bench_press_db',name:'Bench Press (Dumbbell)',sets:4,reps:'8-12'},{id:'chest_fly_db',name:'Chest Fly (Dumbbell)',sets:3,reps:'12-15'},{id:'arnold_press_db',name:'Arnold Press (Dumbbell)',sets:3,reps:'10-12'},{id:'lateral_raise_db',name:'Lateral Raise (Dumbbell)',sets:3,reps:'15-20'},{id:'shrug_db',name:'Shrug (Dumbbell)',sets:3,reps:'12-15'},{id:'skullcrusher_bb',name:'Skullcrusher (Barbell)',sets:3,reps:'10-12'},{id:'tate_press_rrb',name:'Tate Press',sets:3,reps:'12-15'},{id:'single_arm_pushdown',name:'Single Arm Pushdown',sets:3,reps:'15-20'},{id:'decline_chest_raise',name:'Decline Chest Raise',sets:3,reps:'12-15'},{id:'single_arm_tri_ext',name:'Single Arm Tricep Extension',sets:3,reps:'15-20'}]},
  rrb_pull:{label:'RRB Pull',tag:'Heavy A',category:'pull',gym:'rrb',wtype:'pull',note:'RRB Pull Heavy A.',exercises:[{id:'bicep_curl_db',name:'Bicep Curl (Dumbbell)',sets:3,reps:'10-12'},{id:'hammer_curl_db',name:'Hammer Curl (Dumbbell)',sets:3,reps:'10-12'},{id:'incline_curl_db',name:'Incline Curl (Dumbbell)',sets:3,reps:'10-12'},{id:'incline_shrug_db',name:'Incline Shrugs (Dumbbell)',sets:4,reps:'12-15'},{id:'single_arm_row',name:'Single Arm Row',sets:3,reps:'10-12'},{id:'face_pull_rrb',name:'Face Pull',sets:3,reps:'15-20'},{id:'lat_pulldown_rrb',name:'Lat Pulldown',sets:3,reps:'8-12'},{id:'seated_row_rrb',name:'Seated Row',sets:3,reps:'10-12'},{id:'standing_lat_pushdown',name:'Standing Lat Pushdown',sets:3,reps:'12-15'},{id:'reverse_fly_db',name:'Reverse Fly (Dumbbell)',sets:3,reps:'15-20'},{id:'overhead_curl',name:'Overhead Curl',sets:3,reps:'12-15'},{id:'shrug_pull_db',name:'Shrug (Dumbbell)',sets:3,reps:'12-15'}]},
  rrb_legs:{label:'RRB Legs',tag:'Heavy',category:'legs',gym:'rrb',wtype:'legs',note:'RRB Legs Heavy. Rest 2-3 min.',exercises:[{id:'ghd_raises',name:'GHD Glute/Ham Raises',sets:5,reps:'8-12'},{id:'leg_press_rrb',name:'Leg Press',sets:5,reps:'10-15'},{id:'calf_press_lp',name:'Calf Press on Leg Press',sets:5,reps:'15-20'},{id:'seated_leg_curl_rrb',name:'Seated Leg Curl',sets:5,reps:'10-12'},{id:'leg_ext_rrb',name:'Leg Extension',sets:5,reps:'12-15'},{id:'rdl_rrb',name:'Romanian Deadlift (Barbell)',sets:4,reps:'8-10'},{id:'standing_calf_machine',name:'Standing Calf Raise (Machine)',sets:4,reps:'15-20'},{id:'bss_rrb',name:'Bulgarian Split Squat',sets:4,reps:'10-12'},{id:'tibialis_raises',name:'Tibialis Raises',sets:4,reps:'15-20'}]},
  anthropic_push_mod:{label:'Push (Moderate)',tag:'Moderate',category:'push',gym:'anthropic',wtype:'push',note:'Power Matrix bench ramp + accessories.',exercises:[
    {id:'bench_press_barbell',name:'Bench Press (Barbell)',sets:7,reps:'8/8/3/1/1/1/5'},
    {id:'incline_bench_press_db',name:'Incline Bench Press (DB)',sets:3,reps:'10-12'},
    {id:'chest_fly_db',name:'Chest Fly (DB)',sets:3,reps:'12-15'},
    {id:'shoulder_press_machine',name:'Shoulder Press (Machine)',sets:3,reps:'10-12'},
    {id:'lateral_raise_db',name:'Lateral Raise (DB)',sets:3,reps:'12-15'},
    {id:'tricep_pushdown_rope',name:'Tricep Pushdown (Rope)',sets:4,reps:'10-12'},
    {id:'overhead_tricep_extension',name:'Overhead Tricep Extension',sets:3,reps:'10-12'}]},
  anthropic_pull_mod:{label:'Pull (Moderate)',tag:'Moderate',category:'pull',gym:'anthropic',wtype:'pull',note:'Power Matrix deadlift ramp + accessories.',exercises:[
    {id:'deadlift_barbell',name:'Deadlift (Barbell)',sets:7,reps:'8/8/3/1/1/1/5'},
    {id:'lat_pulldown_cable',name:'Lat Pulldown (Cable)',sets:3,reps:'10-12'},
    {id:'seated_row_cable',name:'Seated Row (Cable)',sets:3,reps:'10-12'},
    {id:'shrug_db',name:'Shrug (DB)',sets:3,reps:'12-15'},
    {id:'face_pull_cable',name:'Face Pull (Cable)',sets:3,reps:'12-15'},
    {id:'bicep_curl_db',name:'Bicep Curl (DB)',sets:4,reps:'10-12'},
    {id:'hammer_curl',name:'Hammer Curl',sets:3,reps:'10-12'}]},
  anthropic_legs_mod:{label:'Legs (Moderate)',tag:'Moderate',category:'legs',gym:'anthropic',wtype:'legs',note:'Power Matrix squat ramp + accessories.',exercises:[
    {id:'squat_barbell',name:'Squat (Barbell)',sets:7,reps:'8/8/3/1/1/1/5'},
    {id:'romanian_deadlift_barbell',name:'Romanian Deadlift (Barbell)',sets:5,reps:'8-10'},
    {id:'leg_extension',name:'Leg Extension',sets:3,reps:'12-15'},
    {id:'seated_leg_curl',name:'Seated Leg Curl',sets:4,reps:'12-15'},
    {id:'calf_press',name:'Calf Press',sets:5,reps:'12-15'}]},
  anthropic_push_heavy:{label:'Push (Heavy)',tag:'Heavy',category:'push',gym:'anthropic',wtype:'push',note:'Smith machine heavy push day.',exercises:[
    {id:'bench_press_smith',name:'Bench Press (Smith)',sets:7,reps:'8/8/3/1/1/1/5'},
    {id:'incline_bench_press_smith',name:'Incline Bench Press (Smith)',sets:3,reps:'6-8'},
    {id:'shoulder_press_smith',name:'Shoulder Press (Smith)',sets:4,reps:'6-8'},
    {id:'lateral_raise_cable',name:'Lateral Raise (Cable)',sets:3,reps:'12-15'},
    {id:'rope_tricep_pushdown',name:'Rope Tricep Pushdown',sets:4,reps:'8-10'},
    {id:'single_arm_tricep_extension',name:'Single Arm Tricep Extension',sets:3,reps:'10-12'}]},
  anthropic_pull_heavy:{label:'Pull (Heavy)',tag:'Heavy',category:'pull',gym:'anthropic',wtype:'pull',note:'Heavy pull day.',exercises:[
    {id:'deadlift_barbell',name:'Deadlift (Barbell)',sets:7,reps:'8/8/3/1/1/1/5'},
    {id:'seated_row_heavy',name:'Seated Row (Heavy)',sets:4,reps:'6-8'},
    {id:'shrug_db',name:'Shrug (DB)',sets:4,reps:'12-15'},
    {id:'face_pull_cable',name:'Face Pull (Cable)',sets:3,reps:'12-15'},
    {id:'incline_curl_db',name:'Incline Curl (DB)',sets:4,reps:'10-12'},
    {id:'overhead_cable_curl',name:'Overhead Cable Curl',sets:3,reps:'10-12'}]},
  anthropic_legs_heavy:{label:'Legs (Heavy)',tag:'Heavy',category:'legs',gym:'anthropic',wtype:'legs',note:'Heavy leg day.',exercises:[
    {id:'squat_barbell',name:'Squat (Barbell)',sets:7,reps:'8/8/3/1/1/1/5'},
    {id:'romanian_deadlift_smith',name:'Romanian Deadlift (Smith)',sets:4,reps:'6-8'},
    {id:'bulgarian_split_squat',name:'Bulgarian Split Squat',sets:3,reps:'8-10'},
    {id:'leg_extension',name:'Leg Extension',sets:3,reps:'12-15'},
    {id:'glute_kickback_machine',name:'Glute Kickback (Machine)',sets:4,reps:'12-15'},
    {id:'seated_leg_curl',name:'Seated Leg Curl',sets:3,reps:'12-15'},
    {id:'standing_calf_raise',name:'Standing Calf Raise',sets:5,reps:'12-15'}]},
  anthropic_upper_topup:{label:'Upper Top-Up (Sat)',tag:'Top-Up',category:'pull',gym:'anthropic',wtype:'upper',note:'Saturday arm and shoulder isolation.',exercises:[
    {id:'waiter_curl',name:'Waiter Curl',sets:4,reps:'10-12'},
    {id:'hammer_curl',name:'Hammer Curl',sets:4,reps:'10-12'},
    {id:'skullcrusher',name:'Skullcrusher',sets:4,reps:'10-12'},
    {id:'overhead_cable_tricep_extension',name:'Overhead Cable Tricep Extension',sets:4,reps:'10-12'},
    {id:'lateral_raise_db',name:'Lateral Raise (DB)',sets:3,reps:'15-20'},
    {id:'rear_delt_fly_matrix',name:'Rear Delt Fly (Matrix)',sets:3,reps:'15-20'},
    {id:'seated_calf_raise',name:'Seated Calf Raise',sets:5,reps:'15-20'},
    {id:'standing_calf_raise_db',name:'Standing Calf Raise (DB)',sets:5,reps:'15-20'}]},
  pf_sat:{label:'PF Sat',tag:'Pull',category:'pf',gym:'pf',wtype:'pull',note:'Planet Fitness.',exercises:[{id:'lat_pulldown_pf',name:'Lat Pulldown',sets:4,reps:'10-12'},{id:'seated_row_pf',name:'Seated Row',sets:4,reps:'10-12'},{id:'face_pull_pf',name:'Face Pull',sets:3,reps:'15-20'},{id:'rear_delt_pf',name:'Rear Delt',sets:3,reps:'15-20'},{id:'bicep_curl_pf',name:'Bicep Curl',sets:3,reps:'12-15'},{id:'hammer_curl_pf',name:'Hammer Curl',sets:3,reps:'12-15'},{id:'lateral_raise_pf',name:'Lateral Raise',sets:3,reps:'15-20'}]},
};
const DEFAULT_SCHEDULE=[{day:'Mon',workoutKey:'pull_a'},{day:'Tue',workoutKey:'push_a'},{day:'Wed',workoutKey:'legs_a'},{day:'Thu',workoutKey:null},{day:'Fri',workoutKey:'pull_b'},{day:'Sat',workoutKey:'push_b'},{day:'Sun',workoutKey:'legs_b'}];
const PROTECTED_KEYS=new Set(['push_a','push_b','pull_a','pull_b','legs_a','legs_b','pf_sat','pm_push','pm_pull','pm_legs','rrb_push','rrb_pull','rrb_legs','anthropic_push_mod','anthropic_pull_mod','anthropic_legs_mod','anthropic_push_heavy','anthropic_pull_heavy','anthropic_legs_heavy','anthropic_upper_topup']);

function RestTimer({seconds,exerciseName,onDone}){
  const endTimeRef=useRef(null);
  const[remaining,setRemaining]=useState(seconds);
  const[paused,setPaused]=useState(false);
  const[pausedRemaining,setPausedRemaining]=useState(null);
  const[editing,setEditing]=useState(false);
  const[editVal,setEditVal]=useState(String(seconds));
  const doneRef=useRef(false);
  const rafRef=useRef(null);

  function tick(){
    if(doneRef.current)return;
    const now=Date.now();
    const r=Math.max(0,Math.round((endTimeRef.current-now)/1000));
    setRemaining(r);
    if(r<=0){
      if(!doneRef.current){doneRef.current=true;playChimeOrBeep();vibrateAlert();setTimeout(onDone,3500);}
      return;
    }
    rafRef.current=setTimeout(tick,250);
  }

  useEffect(()=>{
    endTimeRef.current=Date.now()+seconds*1000;
    tick();
    // On visibility change, recalculate from wall clock
    function onVisible(){
      if(!document.hidden&&!paused&&!doneRef.current){
        clearTimeout(rafRef.current);
        tick();
      }
    }
    document.addEventListener('visibilitychange',onVisible);
    return()=>{clearTimeout(rafRef.current);document.removeEventListener('visibilitychange',onVisible);};
  },[]);

  useEffect(()=>{
    if(paused){
      clearTimeout(rafRef.current);
      setPausedRemaining(Math.max(0,Math.round((endTimeRef.current-Date.now())/1000)));
    } else {
      if(pausedRemaining!==null){
        endTimeRef.current=Date.now()+pausedRemaining*1000;
        setPausedRemaining(null);
        tick();
      }
    }
  },[paused]);

  useEffect(()=>()=>clearTimeout(rafRef.current),[]);
  const pct=Math.round((remaining/seconds)*100);
  const mins=String(Math.floor(remaining/60)).padStart(2,'0'),secs=String(remaining%60).padStart(2,'0');
  const isDone=remaining===0,isUrgent=remaining<=10&&!isDone;
  const rc=isDone?'#14b8a6':isUrgent?'#f59e0b':'#06b6d4';
  const C=2*Math.PI*23;
  function addTime(amt){setRemaining(r=>Math.max(0,r+amt));}
  function applyEdit(){const v=parseInt(editVal);if(v>0){setRemaining(v);setEditing(false);}else setEditVal(String(remaining));}
  return React.createElement('div',{style:{position:'fixed',top:0,left:0,right:0,zIndex:1000,background:'linear-gradient(180deg,rgba(10,12,15,0.98),rgba(10,12,15,0.95))',borderBottom:'2px solid '+rc,paddingTop:'calc(env(safe-area-inset-top) + 12px)',paddingBottom:'12px',paddingLeft:'16px',paddingRight:'16px',display:'flex',alignItems:'center',gap:'14px',boxShadow:'0 6px 32px rgba('+(isDone?'20,184,172':isUrgent?'245,158,11':'6,182,212')+',0.35)'}},
    React.createElement('div',{style:{position:'relative',width:56,height:56,flexShrink:0,cursor:'pointer'},onClick:()=>!isDone&&!editing&&setEditing(true)},
      React.createElement('svg',{width:56,height:56,style:{transform:'rotate(-90deg)'}},
        React.createElement('circle',{cx:28,cy:28,r:23,fill:'none',stroke:'rgba(148,163,184,0.15)',strokeWidth:4}),
        React.createElement('circle',{cx:28,cy:28,r:23,fill:'none',stroke:rc,strokeWidth:4,strokeLinecap:'round',strokeDasharray:C,strokeDashoffset:C*(1-pct/100),style:{transition:'stroke-dashoffset 0.9s linear,stroke 0.3s',filter:'drop-shadow(0 0 8px '+rc+'90)'}}),
      ),
      React.createElement('div',{style:{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:rc,fontWeight:700,fontFamily:T.mono}},isDone?'OK':mins+':'+secs)
    ),
    editing?React.createElement('div',{style:{flex:1,display:'flex',gap:8,alignItems:'center'}},
      React.createElement('input',{type:'number',value:editVal,onChange:e=>setEditVal(e.target.value),style:{width:64,padding:'8px 10px',background:'rgba(10,12,15,0.9)',border:'1px solid '+rc,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:44}}),
      React.createElement('span',{style:{fontSize:12,color:T.muted}},'sec'),
      React.createElement('button',{onClick:applyEdit,style:{padding:'8px 14px',borderRadius:8,border:'none',background:rc,color:'#0a0c0f',fontSize:13,fontWeight:700,cursor:'pointer',minHeight:44}},'OK'),
    ):React.createElement('div',{style:{flex:1}},
      React.createElement('div',{style:{fontSize:11,color:'#7dd3fc',textTransform:'uppercase',fontWeight:700,letterSpacing:'0.1em',marginBottom:3}},'Rest Timer'),
      React.createElement('div',{style:{fontSize:15,color:T.sub}},exerciseName)
    ),
    !editing&&React.createElement('div',{style:{display:'flex',gap:7}},
      !isDone&&!paused&&React.createElement('button',{onClick:()=>addTime(10),style:{background:'rgba(30,41,59,0.8)',border:'1px solid '+T.border2,borderRadius:8,color:T.sub,fontSize:13,padding:'8px 11px',cursor:'pointer',minHeight:44,WebkitTapHighlightColor:'transparent'}},'+10s'),
      !isDone&&!paused&&React.createElement('button',{onClick:()=>addTime(-10),style:{background:'rgba(30,41,59,0.8)',border:'1px solid '+T.border2,borderRadius:8,color:T.sub,fontSize:13,padding:'8px 11px',cursor:'pointer',minHeight:44,WebkitTapHighlightColor:'transparent'}},'-10s'),
      !isDone&&React.createElement('button',{onClick:()=>setPaused(p=>!p),style:{background:'rgba(30,41,59,0.8)',border:'1px solid '+T.border2,borderRadius:8,color:T.sub,fontSize:13,padding:'8px 12px',cursor:'pointer',minHeight:44,WebkitTapHighlightColor:'transparent'}},paused?'PLAY':'PAUSE'),
      React.createElement('button',{onClick:onDone,style:{background:'rgba(30,41,59,0.8)',border:'1px solid '+T.border2,borderRadius:8,color:T.muted,fontSize:13,padding:'8px 12px',cursor:'pointer',minHeight:44,WebkitTapHighlightColor:'transparent'}},'Skip')
    )
  );
}

function VolumeChart({logs,accent,exId}){
  if(!logs||logs.length<2)return React.createElement('div',{style:{fontSize:11,color:T.dim,fontFamily:T.mono,padding:'4px 0'}},'No history yet');
  const pts=logs.slice(-12);const vals=pts.map(l=>l.e1rm||0);
  const maxV=Math.max(...vals)||1,minV=Math.min(...vals);
  const W=200,H=44,pad=6;
  const cx=i=>pad+(i/(pts.length-1||1))*(W-pad*2);
  const cy=v=>H-pad-((v-minV)/(maxV-minV||1))*(H-pad*2);
  const pathD=pts.map((l,i)=>(i===0?'M':'L')+cx(i).toFixed(1)+','+cy(vals[i]).toFixed(1)).join(' ');
  const lastE1rm=vals[vals.length-1];
  const gradId='vg'+exId.replace(/[^a-z0-9]/gi,'');
  return React.createElement('div',{style:{display:'flex',alignItems:'center',gap:12,padding:'4px 0 10px'}},
    React.createElement('svg',{width:W,height:H,style:{overflow:'visible',flexShrink:0}},
      React.createElement('defs',null,React.createElement('linearGradient',{id:gradId,x1:'0',y1:'0',x2:'1',y2:'0'},React.createElement('stop',{offset:'0%',stopColor:accent,stopOpacity:0.5}),React.createElement('stop',{offset:'100%',stopColor:'#14b8a6',stopOpacity:1}))),
      React.createElement('path',{d:pathD,fill:'none',stroke:'url(#'+gradId+')',strokeWidth:2.5,strokeLinecap:'round',strokeLinejoin:'round'}),
      React.createElement('circle',{cx:cx(pts.length-1),cy:cy(vals[vals.length-1]),r:4,fill:'#14b8a6'})
    ),
    React.createElement('div',null,
      React.createElement('div',{style:{fontSize:14,fontWeight:700,color:T.sub,fontFamily:T.mono}},lastE1rm+'lb e1RM'),
      React.createElement('div',{style:{fontSize:10,color:T.dim,marginTop:2}},pts.length+' sessions')
    )
  );
}

function E1rmModal({exName,logs,accent,onClose}){
  if(!logs||logs.length===0)return null;
  const pts=logs.filter(l=>l.e1rm>0).slice(-30);
  if(pts.length<2)return null;
  const vals=pts.map(l=>l.e1rm);
  const maxV=Math.max(...vals),minV=Math.min(...vals);
  const W=320,H=120,pad=12;
  const cx=i=>pad+(i/(pts.length-1||1))*(W-pad*2);
  const cy=v=>H-pad-((v-minV)/(maxV-minV||1))*(H-pad*2);
  const pathD=pts.map((l,i)=>(i===0?'M':'L')+cx(i).toFixed(1)+','+cy(vals[i]).toFixed(1)).join(' ');
  const gradId='e1rm'+exName.replace(/[^a-z0-9]/gi,'');
  const best=Math.max(...vals),latest=vals[vals.length-1];
  const trend=vals.length>=3?((vals[vals.length-1]-vals[vals.length-3])/vals[vals.length-3]*100).toFixed(1):null;
  return React.createElement('div',{style:{position:'fixed',inset:0,zIndex:400,background:'rgba(0,0,0,0.95)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}},
    React.createElement('div',{style:{background:T.bg2,borderRadius:16,padding:24,border:'1px solid '+T.border,width:'100%',maxWidth:400}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',marginBottom:16}},
        React.createElement('div',{style:{flex:1,fontSize:16,fontWeight:700,color:T.text}},exName),
        React.createElement('button',{onClick:onClose,style:{width:36,height:36,borderRadius:8,border:'1px solid '+T.border2,background:'transparent',color:T.muted,fontSize:18,cursor:'pointer'}},'X')
      ),
      React.createElement('div',{style:{display:'flex',gap:10,marginBottom:16}},
        React.createElement('div',{style:{flex:1,textAlign:'center',padding:'10px',background:T.bg3,borderRadius:10}},React.createElement('div',{style:{fontSize:20,fontWeight:800,color:'#fbbf24',fontFamily:T.mono}},best+'lb'),React.createElement('div',{style:{fontSize:10,color:T.dim,marginTop:2}},'Best e1RM')),
        React.createElement('div',{style:{flex:1,textAlign:'center',padding:'10px',background:T.bg3,borderRadius:10}},React.createElement('div',{style:{fontSize:20,fontWeight:800,color:T.sub,fontFamily:T.mono}},latest+'lb'),React.createElement('div',{style:{fontSize:10,color:T.dim,marginTop:2}},'Latest')),
        trend!==null&&React.createElement('div',{style:{flex:1,textAlign:'center',padding:'10px',background:T.bg3,borderRadius:10}},React.createElement('div',{style:{fontSize:20,fontWeight:800,color:parseFloat(trend)>=0?'#34d399':'#f87171',fontFamily:T.mono}},(parseFloat(trend)>=0?'+':'')+trend+'%'),React.createElement('div',{style:{fontSize:10,color:T.dim,marginTop:2}},'3-session'))
      ),
      React.createElement('svg',{width:'100%',viewBox:'0 0 '+W+' '+H,style:{overflow:'visible'}},
        React.createElement('defs',null,React.createElement('linearGradient',{id:gradId,x1:'0',y1:'0',x2:'1',y2:'0'},React.createElement('stop',{offset:'0%',stopColor:accent,stopOpacity:0.6}),React.createElement('stop',{offset:'100%',stopColor:'#14b8a6',stopOpacity:1}))),
        React.createElement('path',{d:pathD,fill:'none',stroke:'url(#'+gradId+')',strokeWidth:3,strokeLinecap:'round',strokeLinejoin:'round',filter:'drop-shadow(0 0 4px '+accent+'60)'}),
        pts.map((_,i)=>i===pts.length-1?React.createElement('circle',{key:i,cx:cx(i),cy:cy(vals[i]),r:5,fill:'#14b8a6'}):null)
      ),
      React.createElement('div',{style:{display:'flex',justifyContent:'space-between',fontSize:10,color:T.dim,marginTop:6,fontFamily:T.mono}},
        React.createElement('div',null,pts[0]?new Date(pts[0].date).toLocaleDateString('en-US',{month:'short',day:'numeric'}):null),
        React.createElement('div',null,pts.length+' sessions'),
        React.createElement('div',null,pts[pts.length-1]?new Date(pts[pts.length-1].date).toLocaleDateString('en-US',{month:'short',day:'numeric'}):null)
      )
    )
  );
}

function ExerciseBlock({ex,accent,allLogs,setAllLogs,restDefaults,onSetLogged,onPR}){
  const prevLogs=allLogs[ex.id]||[];
  const bestE1rm=getBestE1rm(prevLogs);
  const lastSession=prevLogs.slice(-ex.sets);
  const hasHistory=lastSession.length>0;
  const[setData,setSetData]=useState(()=>Array.from({length:ex.sets},()=>({weight:'',reps:'',done:false,isPR:false,type:'normal'})));
  const[showChart,setShowChart]=useState(false);
  const[showE1rm,setShowE1rm]=useState(false);
  const completedCount=setData.filter(s=>s.done).length;
  const overloadHint=React.useMemo(()=>{
    if(!lastSession||lastSession.length<ex.sets)return null;
    const allCompleted=lastSession.every(s=>s.reps>=parseInt(ex.reps)||isNaN(parseInt(ex.reps)));
    if(!allCompleted)return null;
    const lastW=lastSession[0]?.weight;if(!lastW)return null;
    return {weight:lastW+2.5,msg:'Try '+(lastW+2.5)+'lb today (was '+lastW+'lb)'};
  },[lastSession]);
  function updateSet(i,field,val){setSetData(d=>d.map((s,idx)=>idx===i?{...s,[field]:val}:s));}
  function repeatLast(){if(!hasHistory)return;setSetData(d=>d.map((s,i)=>{if(s.done)return s;const prev=lastSession[i]||lastSession[lastSession.length-1];return {...s,weight:String(prev.weight),reps:String(prev.reps)};}));}
  function logSet(i){
    const s=setData[i];const w=parseFloat(s.weight),r=parseInt(s.reps);if(!w||!r)return;
    const est=e1rm(w,r);const isPR=est>bestE1rm&&bestE1rm>0;
    const entry={date:new Date().toISOString(),weight:w,reps:r,e1rm:est,type:setData[i].type||'normal',exName:ex.name};
    // Always read the freshest logs from allLogs (not the potentially stale prevLogs closure)
    const currentLogs=allLogs[ex.id]||[];
    const next=[...currentLogs,entry];
    saveLS('ppl-'+ex.id,next);pushExerciseLogs(ex.id,next);
    if(setAllLogs)setAllLogs(prev=>({...prev,[ex.id]:next}));
    setSetData(d=>d.map((sd,idx)=>idx===i?{...sd,done:true,isPR}:sd));
    if(isPR&&onPR)onPR(ex.name,est);
    if(onSetLogged)onSetLogged(ex.id,ex.name);
  }
  return React.createElement('div',{style:{marginBottom:2,background:T.bg2}},
    showE1rm&&React.createElement(E1rmModal,{exName:ex.name,logs:prevLogs,accent,onClose:()=>setShowE1rm(false)}),
    React.createElement('div',{style:{padding:'14px 16px 4px',display:'flex',alignItems:'center',gap:10}},
      React.createElement('div',{style:{width:3,height:20,borderRadius:2,background:accent,flexShrink:0}}),
      React.createElement('div',{style:{flex:1}},
        React.createElement('div',{style:{fontSize:16,fontWeight:700,color:T.text}},ex.name),
        React.createElement('div',{style:{fontSize:12,color:T.muted,marginTop:2}},ex.sets+' sets  '+ex.reps+' reps'),
        overloadHint&&React.createElement('div',{style:{fontSize:11,color:'#34d399',marginTop:3,fontWeight:600}},'↑ '+overloadHint.msg)
      ),
      completedCount===ex.sets
        ?React.createElement('div',{style:{fontSize:11,color:T.green,fontWeight:700,padding:'3px 8px',borderRadius:6,background:'rgba(20,184,166,0.15)',border:'1px solid rgba(20,184,166,0.3)'}},'Done')
        :React.createElement('div',{style:{display:'flex',gap:6}},
          hasHistory&&React.createElement('button',{onClick:repeatLast,style:{padding:'5px 10px',borderRadius:7,border:'1px solid '+T.border2,background:'rgba(124,58,237,0.15)',color:'#a78bfa',fontSize:11,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},'↺ Last'),
          prevLogs.length>=2&&React.createElement('button',{onClick:()=>setShowChart(s=>!s),style:{padding:'5px 10px',borderRadius:7,border:'1px solid '+T.border2,background:showChart?'rgba(20,184,166,0.15)':'rgba(255,255,255,0.04)',color:showChart?T.green:T.dim,fontSize:14,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},'📈'),
          prevLogs.filter(l=>l.e1rm>0).length>=2&&React.createElement('button',{onClick:()=>setShowE1rm(true),style:{padding:'5px 10px',borderRadius:7,border:'1px solid '+T.border2,background:'rgba(251,191,36,0.1)',color:'#fbbf24',fontSize:11,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},'1RM')
        )
    ),
    showChart&&React.createElement('div',{style:{padding:'0 16px 4px 16px'}},React.createElement(VolumeChart,{logs:prevLogs,accent:accent,exId:ex.id})),
    React.createElement('div',{style:{padding:'4px 16px 14px'}},
      React.createElement('div',{style:{display:'flex',gap:4,marginBottom:8,paddingLeft:13}},
        React.createElement('div',{style:{width:28,fontSize:10,color:T.dim,fontWeight:600,fontFamily:T.mono}},'SET'),
        React.createElement('div',{style:{flex:1,fontSize:10,color:T.dim,fontWeight:600,fontFamily:T.mono,textAlign:'center'}},'PREV'),
        React.createElement('div',{style:{width:72,fontSize:10,color:T.dim,fontWeight:600,fontFamily:T.mono,textAlign:'center'}},'LB'),
        React.createElement('div',{style:{width:60,fontSize:10,color:T.dim,fontWeight:600,fontFamily:T.mono,textAlign:'center'}},'REPS'),
        React.createElement('div',{style:{width:48}}),
      ),
      setData.map((s,i)=>{
        const prev=lastSession[i]||null;
        return React.createElement('div',{key:i,style:{display:'flex',gap:4,alignItems:'center',marginBottom:6,opacity:s.done?0.45:1}},
          React.createElement('div',{style:{width:28,fontFamily:T.mono,fontSize:13,color:s.done?T.green:T.muted,fontWeight:700,textAlign:'right',paddingRight:4,flexShrink:0}},i+1),
          React.createElement('div',{style:{flex:1,fontSize:12,color:T.dim,fontFamily:T.mono,textAlign:'center',padding:'0 4px'}},prev?(prev.weight+'x'+prev.reps):'  '),
          React.createElement('input',{type:'number',inputMode:'decimal',placeholder:prev?String(prev.weight):'lb',value:s.weight,onChange:e=>updateSet(i,'weight',e.target.value),disabled:s.done,style:{width:72,padding:'10px 8px',background:s.done?'transparent':T.bg3,border:'1px solid '+(s.done?'transparent':T.border2),borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono,textAlign:'center',minHeight:46}}),
          React.createElement('input',{type:'number',inputMode:'numeric',placeholder:prev?String(prev.reps):'reps',value:s.reps,onChange:e=>updateSet(i,'reps',e.target.value),disabled:s.done,style:{width:60,padding:'10px 6px',background:s.done?'transparent':T.bg3,border:'1px solid '+(s.done?'transparent':T.border2),borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono,textAlign:'center',minHeight:46}}),
          React.createElement('div',{style:{width:48,display:'flex',alignItems:'center',justifyContent:'center'}},
            s.done&&s.isPR?React.createElement('div',{style:{fontSize:18,lineHeight:1}},'🏆'):
            React.createElement('button',{onClick:()=>logSet(i),disabled:s.done||!s.weight||!s.reps,style:{width:44,height:46,borderRadius:10,border:'none',background:s.done?'rgba(20,184,166,0.1)':'linear-gradient(135deg,rgba(124,58,237,0.6),rgba(20,184,166,0.4))',color:s.done?'#5eead4':'#c4b5fd',fontSize:20,cursor:s.done?'default':'pointer',WebkitTapHighlightColor:'transparent'}},s.done?'✓':'→')
          )
        );
      })
    )
  );
}

function WorkoutSummary({workout,duration,prs,setsLogged,volumeLogged,onClose}){
  const mins=Math.floor(duration/60),secs=duration%60;
  const timeStr=(mins>0?mins+'m ':'')+secs+'s';
  const[note,setNote]=useState('');
  function saveAndClose(){if(note.trim()){saveLS('workout_note_'+Date.now(),{date:new Date().toISOString(),workout:workout.label,note:note.trim()});}onClose();}
  return React.createElement('div',{style:{position:'fixed',inset:0,zIndex:500,background:T.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24,fontFamily:T.sans,overflowY:'auto'}},
    React.createElement('div',{style:{fontSize:48,marginBottom:16}},'🏆'),
    React.createElement('div',{style:{fontSize:26,fontWeight:800,color:T.text,marginBottom:4,letterSpacing:'-0.02em'}},'Workout Done!'),
    React.createElement('div',{style:{fontSize:15,color:T.muted,marginBottom:32}},workout.label),
    React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,width:'100%',maxWidth:360,marginBottom:24}},
      React.createElement('div',{style:{background:T.bg2,borderRadius:14,padding:'18px 16px',border:'1px solid '+T.border,textAlign:'center'}},React.createElement('div',{style:{fontSize:26,fontWeight:800,color:T.text,fontFamily:T.mono}},timeStr),React.createElement('div',{style:{fontSize:11,color:T.muted,marginTop:4,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em'}},'Duration')),
      React.createElement('div',{style:{background:T.bg2,borderRadius:14,padding:'18px 16px',border:'1px solid '+T.border,textAlign:'center'}},React.createElement('div',{style:{fontSize:26,fontWeight:800,color:T.text,fontFamily:T.mono}},setsLogged),React.createElement('div',{style:{fontSize:11,color:T.muted,marginTop:4,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em'}},'Sets')),
      React.createElement('div',{style:{background:T.bg2,borderRadius:14,padding:'18px 16px',border:'1px solid '+T.border,textAlign:'center'}},React.createElement('div',{style:{fontSize:26,fontWeight:800,color:T.text,fontFamily:T.mono}},fmtVol(volumeLogged)+' lb'),React.createElement('div',{style:{fontSize:11,color:T.muted,marginTop:4,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em'}},'Volume')),
      React.createElement('div',{style:{background:T.bg2,borderRadius:14,padding:'18px 16px',border:'1px solid '+T.border,textAlign:'center'}},React.createElement('div',{style:{fontSize:26,fontWeight:800,color:prs.length>0?'#fbbf24':T.text,fontFamily:T.mono}},prs.length),React.createElement('div',{style:{fontSize:11,color:T.muted,marginTop:4,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em'}},'PRs'))
    ),
    prs.length>0&&React.createElement('div',{style:{width:'100%',maxWidth:360,marginBottom:24,padding:'14px 16px',background:'rgba(251,191,36,0.08)',borderRadius:12,border:'1px solid rgba(251,191,36,0.25)'}},
      React.createElement('div',{style:{fontSize:12,color:'#fbbf24',fontWeight:700,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em'}},'🏆 New PRs'),
      prs.map((pr,i)=>React.createElement('div',{key:i,style:{fontSize:14,color:T.sub,marginBottom:3}},pr))
    ),
    React.createElement('textarea',{placeholder:'Workout notes... (optional)',value:note,onChange:e=>setNote(e.target.value),style:{width:'100%',maxWidth:360,padding:'12px 14px',background:T.bg2,border:'1px solid '+T.border2,borderRadius:12,color:T.text,fontSize:14,fontFamily:T.sans,resize:'none',minHeight:80,marginBottom:16,lineHeight:1.5}}),
    React.createElement('button',{onClick:saveAndClose,style:{width:'100%',maxWidth:360,padding:18,borderRadius:14,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:17,cursor:'pointer',minHeight:60,WebkitTapHighlightColor:'transparent',boxShadow:'0 8px 28px rgba(124,58,237,0.4)'}},'Save & Finish')
  );
}

function parseStrongCSV(text){
  const lines=text.trim().split(/\r?\n/);if(!lines.length)return null;
  const header=lines[0].replace(/^\uFEFF/,'').split(',').map(h=>h.trim().replace(/^"|"$/g,''));
  const col=h=>header.indexOf(h);
  const iDate=col('Date'),iWorkout=col('Workout Name'),iExercise=col('Exercise Name'),iSetOrder=col('Set Order'),iWeight=col('Weight'),iReps=col('Reps'),iNotes=col('Notes'),iSeconds=col('Seconds');
  if(iDate<0||iWorkout<0||iExercise<0)return null;
  const logs={};const routineMap={};
  function toId(name){return name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
  function parseLine(line){const fields=[];let cur='',inQ=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){inQ=!inQ;}else if(c===','&&!inQ){fields.push(cur.trim());cur='';}else{cur+=c;}}fields.push(cur.trim());return fields;}
  function gymFromName(name){const n=name.toLowerCase();if(n.includes('gold')||n.includes('gold\u2019s'))return 'golds';if(n.startsWith('af ')||n.startsWith('at ')||n.startsWith('atc ')||n.includes('anytime'))return 'anytime';if(n.startsWith('pf ')||n.includes('(pf)')||n.includes('planet fitness'))return 'pf';if(n.startsWith('rrb ')||n.includes('(rrb)'))return 'rrb';if(n.startsWith('home '))return 'home';if(n.includes('hotel')||n.includes('sheraton')||n.includes('doubletree')||n.startsWith('msp ')||n.startsWith('cambria ')||n.startsWith('niagara '))return 'hotel';if(n.startsWith('rahway '))return 'rahway';return 'general';}
  function typeFromName(name){const n=name.toLowerCase();if(n.includes('push')||n.includes('chest')||(n.includes('shoulder')&&!n.includes('pull')))return 'push';if(n.includes('pull')||n.includes('back')||n.includes('bis')||n.includes('bicep'))return 'pull';if(n.includes('leg')||n.includes('lower body')||n.includes('squat')||n.includes('glute'))return 'legs';if(n.includes('upper body'))return 'upper';if(n.includes('full body')||n.includes('fullbody')||n.includes('whole body')||n.includes('functional')||n.includes('mentzer'))return 'full';if(n.includes('ab')||n.includes('core'))return 'core';return 'other';}
  for(let i=1;i<lines.length;i++){
    const f=parseLine(lines[i]);if(f.length<4)continue;
    const dateStr=f[iDate]||'',workoutName=f[iWorkout]||'',exerciseName=f[iExercise]||'';if(!exerciseName)continue;
    const weight=parseFloat(f[iWeight])||0,reps=parseInt(f[iReps])||0,notes=iNotes>=0?f[iNotes]||'':'';
    const exId=toId(exerciseName);
    const secs_val=parseFloat(f[iSeconds])||0;
    // Skip Strong's rest timer rows (weight=0, reps=0, seconds>0)
    const isRestTimerRow=weight===0&&reps===0&&secs_val>0;
    if(isRestTimerRow)continue;
    const effectiveReps=reps>0?reps:0;
    if(effectiveReps>0||weight>0){
      if(!logs[exId])logs[exId]=[];
      logs[exId].push({date:new Date(dateStr.replace(' ','T')).toISOString(),weight,reps:effectiveReps||1,e1rm:weight>0?e1rm(weight,effectiveReps||1):0,notes,workoutName:workoutName});
    }
    if(workoutName){if(!routineMap[workoutName])routineMap[workoutName]={};if(!routineMap[workoutName][exId]){routineMap[workoutName][exId]={name:exerciseName,sets:0};}const setNum=parseInt(f[iSetOrder])||1;if(setNum>routineMap[workoutName][exId].sets)routineMap[workoutName][exId].sets=setNum;}
  }
  const importedWorkouts={};
  Object.entries(routineMap).forEach(([name,exMap])=>{
    const key='strong_'+toId(name);const gym=gymFromName(name);const wtype=typeFromName(name);
    importedWorkouts[key]={label:name,tag:wtype.charAt(0).toUpperCase()+wtype.slice(1),category:['push','pull','legs'].includes(wtype)?wtype:'pull',gym,wtype,note:'Imported from Strong',exercises:Object.entries(exMap).map(([id,ex])=>({id,name:ex.name,sets:Math.max(ex.sets,1),reps:'--'}))};
  });
  const totalSets=Object.values(logs).reduce((s,a)=>s+a.length,0);
  const totalExercises=Object.keys(logs).length;
  const totalWorkouts=Object.keys(routineMap).length;
  return{logs,workouts:importedWorkouts,stats:{totalSets,totalExercises,totalWorkouts}};
}

function ScheduleEditor({schedule,workouts,onSave,onCancel}){
  const[draft,setDraft]=useState(schedule);
  return React.createElement('div',{style:{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.93)',backdropFilter:'blur(8px)',overflowY:'auto',padding:'20px 16px'}},
    React.createElement('div',{style:{maxWidth:600,margin:'0 auto',background:T.bg2,borderRadius:16,padding:24,border:'1px solid '+T.border}},
      React.createElement('div',{style:{fontSize:18,fontWeight:700,color:T.text,marginBottom:20}},'Edit Schedule'),
      draft.map((item,i)=>React.createElement('div',{key:i,style:{marginBottom:12,padding:14,background:T.bg3,borderRadius:12}},
        React.createElement('div',{style:{fontSize:12,color:T.sub,marginBottom:8,fontWeight:600}},item.day),
        React.createElement('select',{value:item.workoutKey||'',onChange:e=>setDraft(d=>{const n=[...d];n[i]={...n[i],workoutKey:e.target.value||null};return n;}),style:{width:'100%',padding:'11px 12px',background:T.bg,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:44}},
          React.createElement('option',{value:''},'Rest'),
          Object.entries(workouts).map(([k,w])=>React.createElement('option',{key:k,value:k},w.label))
        )
      )),
      React.createElement('div',{style:{display:'flex',gap:10,marginTop:20}},
        React.createElement('button',{onClick:onCancel,style:{flex:1,padding:13,borderRadius:10,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:14,cursor:'pointer',minHeight:48}},'Cancel'),
        React.createElement('button',{onClick:()=>onSave(draft),style:{flex:2,padding:13,borderRadius:10,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,cursor:'pointer',minHeight:48,boxShadow:'0 8px 24px rgba(124,58,237,0.3)'}},'Save')
      )
    )
  );
}

function SettingsModal({defaults,onSave,onCancel}){
  const[draft,setDraft]=useState(JSON.parse(JSON.stringify(defaults||{})));
  const[tab,setTab]=useState('default');
  const exIds=['bench_press','deadlift','squat_a','incline_press_b','lat_pulldown_a','pullup_b','seated_row_a','rdl_a','rdl_b','incline_db_press','arnold_press','lateral_raise_pa','lateral_raise_pb','cable_pushdown_a','weighted_dips','cable_fly_b','flat_db_press_b','cable_crossover_b','db_row_a','face_pull_a','face_pull_b','cable_curl_b','incline_curl_a','leg_ext_a','leg_ext_b','standing_calf_a','seated_curl_b','bss_a','lying_curl_a','seated_calf_b','lat_pulldown_pf','seated_row_pf','face_pull_pf','rear_delt_pf','hammer_curl_pf'];
  return React.createElement('div',{style:{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.93)',backdropFilter:'blur(8px)',overflowY:'auto',padding:'20px 16px'}},
    React.createElement('div',{style:{maxWidth:600,margin:'0 auto',background:T.bg2,borderRadius:16,padding:24,border:'1px solid '+T.border}},
      React.createElement('div',{style:{fontSize:18,fontWeight:700,color:T.text,marginBottom:16}},'Rest Times'),
      React.createElement('div',{style:{marginBottom:20,padding:'14px',background:T.bg3,borderRadius:10}},
        React.createElement('div',{style:{fontSize:12,color:T.sub,fontWeight:600,marginBottom:10}},'Timer Sound'),
        React.createElement('div',{style:{display:'flex',gap:8}},
          [['chime','Bell'],['beep','Beep'],['silent','Silent']].map(([val,label])=>
            React.createElement('button',{key:val,onClick:()=>setDraft(d=>({...d,sound:val})),style:{flex:1,padding:'8px',borderRadius:8,border:'1px solid '+(draft.sound===val||(!draft.sound&&val==='chime')?'#7c3aed':'transparent'),background:draft.sound===val||(!draft.sound&&val==='chime')?'rgba(124,58,237,0.2)':'rgba(255,255,255,0.04)',color:draft.sound===val||(!draft.sound&&val==='chime')?'#a78bfa':T.muted,fontSize:13,cursor:'pointer',fontWeight:draft.sound===val||(!draft.sound&&val==='chime')?700:400}},label)
          )
        )
      ),
      React.createElement('div',{style:{display:'flex',gap:8,marginBottom:20}},
        ['default','custom'].map(t=>React.createElement('button',{key:t,onClick:()=>setTab(t),style:{flex:1,padding:10,borderRadius:8,border:'none',background:tab===t?'#7c3aed':'rgba(124,58,237,0.15)',color:tab===t?'#fff':T.sub,fontSize:13,cursor:'pointer',fontWeight:600,minHeight:40}},t==='default'?'Default':'Per-Exercise'))
      ),
      tab==='default'&&React.createElement('div',null,
        React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Default rest (seconds)'),
        React.createElement('input',{type:'number',value:draft._default,onChange:e=>setDraft(d=>({...d,_default:e.target.value===''?'':parseInt(e.target.value)})),style:{width:'100%',padding:12,background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono,marginBottom:16,minHeight:48}})
      ),
      tab==='custom'&&React.createElement('div',{style:{maxHeight:320,overflowY:'auto'}},
        exIds.map(id=>React.createElement('div',{key:id,style:{marginBottom:8,padding:'10px 12px',background:T.bg3,borderRadius:8,display:'flex',alignItems:'center',gap:12}},
          React.createElement('div',{style:{flex:1,fontSize:13,color:T.sub}},id.replace(/_/g,' ')),
          React.createElement('input',{type:'number',value:draft[id]!==undefined?draft[id]:120,onChange:e=>setDraft(d=>({...d,[id]:e.target.value===''?'':parseInt(e.target.value)})),style:{width:64,padding:'8px 10px',background:T.bg,border:'1px solid '+T.border2,borderRadius:6,color:T.text,fontSize:13,fontFamily:T.mono,minHeight:40}})
        ))
      ),
      React.createElement('div',{style:{display:'flex',gap:10,marginTop:20}},
        React.createElement('button',{onClick:onCancel,style:{flex:1,padding:13,borderRadius:10,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:14,cursor:'pointer',minHeight:48}},'Cancel'),
        React.createElement('button',{onClick:()=>onSave(draft),style:{flex:2,padding:13,borderRadius:10,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,cursor:'pointer',minHeight:48,boxShadow:'0 8px 24px rgba(124,58,237,0.3)'}},'Save')
      )
    )
  );
}

function SessionEditor({session,workouts,onUpdateLog,onDeleteSet,onAddExercise,onRename,onClose}){
  const[editKey,setEditKey]=useState(null);
  const[editW,setEditW]=useState('');const[editR,setEditR]=useState('');
  const[editingName,setEditingName]=useState(false);
  const[nameVal,setNameVal]=useState(session.workoutLabel);
  const[openEx,setOpenEx]=useState(new Set());
  const[addingEx,setAddingEx]=useState(false);const[selExId,setSelExId]=useState('');
  const[customExName,setCustomExName]=useState('');const[newSets,setNewSets]=useState([{weight:'',reps:''}]);
  const exLib={};Object.values(workouts).forEach(w=>{(w.exercises||[]).forEach(e=>{exLib[e.id]=e.name;});});
  const isCustom=selExId==='__custom__';
  const exGroups={};session.sets.forEach(s=>{if(!exGroups[s.exId])exGroups[s.exId]={name:s.exName,sets:[]};exGroups[s.exId].sets.push(s);});
  function startEdit(key,w,r){setEditKey(key);setEditW(String(w));setEditR(String(r));}
  function saveEdit(exId,s){const w=parseFloat(editW),r=parseInt(editR);if(w&&r)onUpdateLog(exId,s,{weight:w,reps:r,e1rm:e1rm(w,r)});setEditKey(null);}
  function saveNewExercise(){
    if(!selExId)return;
    const exName=isCustom?(customExName.trim()||'Custom Exercise'):exLib[selExId]||selExId.replace(/_/g,' ');
    const exId=isCustom?('custom_'+exName.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')):selExId;
    const validSets=newSets.filter(s=>parseFloat(s.weight)&&parseInt(s.reps));
    if(!validSets.length)return;
    onAddExercise(exId,exName,validSets,session.date,isCustom);
    setAddingEx(false);setSelExId('');setCustomExName('');setNewSets([{weight:'',reps:''}]);
  }
  return React.createElement('div',{style:{position:'fixed',inset:0,zIndex:300,background:'rgba(0,0,0,0.95)',backdropFilter:'blur(8px)',overflowY:'auto',paddingBottom:80}},
    React.createElement('div',{style:{position:'sticky',top:0,zIndex:10,background:T.bg,borderBottom:'1px solid '+T.border,padding:'calc(env(safe-area-inset-top) + 14px) 16px 14px',display:'flex',alignItems:'center',gap:12}},
      React.createElement('button',{onClick:()=>{setEditKey(null);setEditingName(false);setOpenEx(new Set());onClose();},style:{width:44,height:44,borderRadius:10,border:'1px solid '+T.border2,background:'rgba(255,255,255,0.04)',color:T.sub,fontSize:22,cursor:'pointer',WebkitTapHighlightColor:'transparent',lineHeight:1,flexShrink:0}},'<'),
      React.createElement('div',{style:{flex:1}},
        editingName
          ?React.createElement('div',{style:{display:'flex',gap:8,alignItems:'center'}},
            React.createElement('input',{type:'text',value:nameVal,onChange:e=>setNameVal(e.target.value),autoFocus:true,style:{flex:1,padding:'6px 10px',background:T.bg3,border:'1px solid #7c3aed',borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono}}),
            React.createElement('button',{onClick:()=>{onRename&&onRename(session,nameVal.trim()||session.workoutLabel);setEditingName(false);},style:{padding:'6px 10px',borderRadius:7,border:'none',background:'#7c3aed',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}},'Save'),
            React.createElement('button',{onClick:()=>{setNameVal(session.workoutLabel);setEditingName(false);},style:{padding:'6px 8px',borderRadius:7,border:'1px solid '+T.border2,background:'transparent',color:T.muted,fontSize:13,cursor:'pointer'}},'X')
          )
          :React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8}},
            React.createElement('div',{style:{fontSize:17,fontWeight:700,color:T.text}},session.workoutLabel),
            React.createElement('button',{onClick:()=>setEditingName(true),style:{padding:'3px 8px',borderRadius:6,border:'1px solid '+T.border2,background:'transparent',color:T.dim,fontSize:11,cursor:'pointer'}},'Rename')
          ),
        React.createElement('div',{style:{fontSize:12,color:T.muted}},fmtDate(session.date)+' · '+session.sets.length+' sets')
      )
    ),
    React.createElement('div',{style:{padding:'16px'}},
      Object.entries(exGroups).map(([exId,group])=>{
        const isOpen=openEx.has(exId);
        return React.createElement('div',{key:exId,style:{marginBottom:10,background:T.bg2,borderRadius:12,border:'1px solid '+T.border,overflow:'hidden'}},
          React.createElement('div',{onClick:()=>setOpenEx(prev=>{const n=new Set(prev);n.has(exId)?n.delete(exId):n.add(exId);return n;}),style:{padding:'12px 16px',display:'flex',alignItems:'center',gap:10,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},
            React.createElement('div',{style:{flex:1}},
              React.createElement('div',{style:{fontSize:14,fontWeight:700,color:T.text}},group.name),
              React.createElement('div',{style:{fontSize:11,color:T.dim,marginTop:2}},group.sets.length+' sets')
            ),
            React.createElement('div',{style:{fontSize:15,color:T.dim}},isOpen?'⌃':'⌄')
          ),
          isOpen&&React.createElement('div',{style:{padding:'4px 16px 12px',borderTop:'1px solid '+T.border}},
            group.sets.map((s,setI)=>{
              const eKey=exId+'|'+setI;const isEd=editKey===eKey;
              return React.createElement('div',{key:setI,style:{display:'flex',gap:8,alignItems:'center',marginBottom:8,padding:'8px 10px',background:T.bg3,borderRadius:8,marginTop:8}},
                React.createElement('div',{style:{fontFamily:T.mono,fontSize:12,color:T.dim,width:18,flexShrink:0}},setI+1),
                isEd?React.createElement(React.Fragment,null,
                  React.createElement('input',{type:'number',inputMode:'decimal',value:editW,onChange:e=>setEditW(e.target.value),style:{width:62,padding:'6px 8px',background:T.bg,border:'1px solid '+T.border2,borderRadius:6,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:40}}),
                  React.createElement('span',{style:{color:T.dim,fontSize:12}},'lb'),
                  React.createElement('input',{type:'number',inputMode:'numeric',value:editR,onChange:e=>setEditR(e.target.value),style:{width:50,padding:'6px 8px',background:T.bg,border:'1px solid '+T.border2,borderRadius:6,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:40}}),
                  React.createElement('span',{style:{color:T.dim,fontSize:12}},'reps'),
                  React.createElement('button',{onClick:()=>saveEdit(exId,s),style:{marginLeft:'auto',background:'rgba(20,184,166,0.2)',border:'none',color:'#5eead4',borderRadius:6,padding:'5px 10px',fontSize:12,cursor:'pointer',minHeight:36}},'Save'),
                  React.createElement('button',{onClick:()=>setEditKey(null),style:{background:'rgba(100,116,139,0.2)',border:'none',color:T.dim,borderRadius:6,padding:'5px 10px',fontSize:12,cursor:'pointer',minHeight:36}},'X')
                ):React.createElement(React.Fragment,null,
                  React.createElement('div',{style:{fontFamily:T.mono,fontSize:14,color:T.text,fontWeight:600}},s.weight+'lb'),
                  React.createElement('div',{style:{fontFamily:T.mono,fontSize:14,color:T.sub,marginLeft:4}},'x'+s.reps),
                  s.e1rm>0&&React.createElement('div',{style:{fontSize:11,color:T.dim,marginLeft:6}},'e1RM '+s.e1rm),
                  React.createElement('div',{style:{marginLeft:'auto',display:'flex',gap:6}},
                    React.createElement('button',{onClick:()=>startEdit(eKey,s.weight,s.reps),style:{background:'rgba(124,58,237,0.15)',border:'none',color:'#a78bfa',borderRadius:6,padding:'5px 10px',fontSize:12,cursor:'pointer',minHeight:36,WebkitTapHighlightColor:'transparent'}},'Edit'),
                    React.createElement('button',{onClick:()=>{if(window.confirm('Delete set?'))onDeleteSet(exId,s);},style:{background:'rgba(239,68,68,0.1)',border:'none',color:'#f87171',borderRadius:6,padding:'5px 10px',fontSize:12,cursor:'pointer',minHeight:36,WebkitTapHighlightColor:'transparent'}},'Del')
                  )
                )
              );
            })
          )
        );
      }),
      !addingEx?React.createElement('button',{onClick:()=>setAddingEx(true),style:{width:'100%',padding:14,borderRadius:12,border:'1px dashed '+T.border2,background:'transparent',color:T.muted,fontSize:14,cursor:'pointer',WebkitTapHighlightColor:'transparent',marginTop:4}},'+ Add Exercise')
      :React.createElement('div',{style:{background:T.bg2,borderRadius:12,border:'1px solid '+T.border2,padding:'16px',marginTop:4}},
        React.createElement('div',{style:{fontSize:14,fontWeight:700,color:T.text,marginBottom:12}},'Add Exercise'),
        React.createElement('select',{value:selExId,onChange:e=>{setSelExId(e.target.value);setCustomExName('');},style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:selExId?T.text:T.dim,fontSize:14,fontFamily:T.mono,minHeight:46,marginBottom:isCustom?8:14}},
          React.createElement('option',{value:''},'-- Pick exercise --'),
          React.createElement('option',{value:'__custom__'},'+ Custom / free text...'),
          React.createElement('option',{disabled:true,value:''},'──────────────'),
          Object.entries(exLib).map(([id,name])=>React.createElement('option',{key:id,value:id},name))
        ),
        isCustom&&React.createElement('input',{type:'text',placeholder:'Exercise name...',value:customExName,onChange:e=>setCustomExName(e.target.value),style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:46,marginBottom:14}}),
        newSets.map((s,i)=>React.createElement('div',{key:i,style:{display:'flex',gap:8,alignItems:'center',marginBottom:8}},
          React.createElement('div',{style:{fontFamily:T.mono,fontSize:12,color:T.dim,width:18,flexShrink:0}},i+1),
          React.createElement('input',{type:'number',inputMode:'decimal',placeholder:'lb',value:s.weight,onChange:e=>setNewSets(ss=>ss.map((x,idx)=>idx===i?{...x,weight:e.target.value}:x)),style:{width:70,padding:'8px 10px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:44}}),
          React.createElement('input',{type:'number',inputMode:'numeric',placeholder:'reps',value:s.reps,onChange:e=>setNewSets(ss=>ss.map((x,idx)=>idx===i?{...x,reps:e.target.value}:x)),style:{width:60,padding:'8px 10px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:44}}),
          newSets.length>1&&React.createElement('button',{onClick:()=>setNewSets(ss=>ss.filter((_,idx)=>idx!==i)),style:{background:'rgba(239,68,68,0.1)',border:'none',color:'#f87171',borderRadius:6,padding:'5px 10px',fontSize:13,cursor:'pointer',minHeight:36}},'X')
        )),
        React.createElement('button',{onClick:()=>setNewSets(ss=>[...ss,{weight:'',reps:''}]),style:{width:'100%',padding:8,borderRadius:8,border:'1px dashed '+T.border2,background:'transparent',color:T.muted,fontSize:13,cursor:'pointer',marginBottom:14,WebkitTapHighlightColor:'transparent'}},'+ Set'),
        React.createElement('div',{style:{display:'flex',gap:10}},
          React.createElement('button',{onClick:()=>{setAddingEx(false);setSelExId('');setCustomExName('');setNewSets([{weight:'',reps:''}]);},style:{flex:1,padding:12,borderRadius:10,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:14,cursor:'pointer',minHeight:46}},'Cancel'),
          React.createElement('button',{onClick:saveNewExercise,disabled:!selExId||(isCustom&&!customExName.trim())||!newSets.some(s=>s.weight&&s.reps),style:{flex:2,padding:12,borderRadius:10,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',minHeight:46,boxShadow:'0 6px 20px rgba(124,58,237,0.3)'}},'Save Exercise')
        )
      )
    )
  );
}

function HistoryView({allLogs,workouts,onUpdateLog,onDeleteSet,onDeleteSession,onAddExercise,onSaveAsRoutine}){
  const[sessions,setSessions]=useState([]);
  const[editingSession,setEditingSession]=useState(null);
  const[savingAsRoutine,setSavingAsRoutine]=useState(null);
  const[routineName,setRoutineName]=useState('');
  const[expandedSessions,setExpandedSessions]=useState(new Set());

  useEffect(()=>{setSessions(buildSessions(allLogs,workouts));},[allLogs,workouts]);

  function toggleSession(id){setExpandedSessions(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});}

  // Group sessions by month
  function getMonthKey(iso){const d=new Date(iso);return d.toLocaleDateString('en-US',{month:'long',year:'numeric'});}

  // Get best set per exercise in a session
  function getBestSets(session){
    const byEx={};
    session.sets.forEach(s=>{
      if(!byEx[s.exId])byEx[s.exId]={name:s.exName,best:null};
      const cur=byEx[s.exId];
      if(!cur.best||(s.weight>0&&s.weight>cur.best.weight)||(s.weight===cur.best.weight&&s.reps>cur.best.reps)){
        cur.best={weight:s.weight,reps:s.reps,e1rm:s.e1rm||0};
      }
    });
    return Object.values(byEx);
  }

  if(editingSession!==null&&sessions[editingSession]){
    return React.createElement(SessionEditor,{
      session:sessions[editingSession],workouts,onUpdateLog,onDeleteSet,onAddExercise,
      onRename:(session,newName)=>{saveLS('session_label_'+session.id,newName);},
      onClose:()=>setEditingSession(null)
    });
  }

  if(savingAsRoutine)return React.createElement('div',{style:{position:'fixed',inset:0,zIndex:400,background:'rgba(0,0,0,0.95)',backdropFilter:'blur(8px)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24}},
    React.createElement('div',{style:{width:'100%',maxWidth:400,background:T.bg2,borderRadius:16,padding:24,border:'1px solid '+T.border}},
      React.createElement('div',{style:{fontSize:17,fontWeight:700,color:T.text,marginBottom:4}},'Save as Routine'),
      React.createElement('div',{style:{fontSize:12,color:T.dim,marginBottom:16}},savingAsRoutine.sets.length+' exercises from '+fmtDate(savingAsRoutine.date)),
      React.createElement('input',{type:'text',value:routineName,onChange:e=>setRoutineName(e.target.value),autoFocus:true,placeholder:savingAsRoutine.workoutLabel,style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono,marginBottom:20,minHeight:46}}),
      React.createElement('div',{style:{display:'flex',gap:10}},
        React.createElement('button',{onClick:()=>{setSavingAsRoutine(null);setRoutineName('');},style:{flex:1,padding:12,borderRadius:10,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:14,cursor:'pointer'}},'Cancel'),
        React.createElement('button',{onClick:()=>{
          const name=routineName.trim()||savingAsRoutine.workoutLabel;
          const exGroups={};
          savingAsRoutine.sets.forEach(s=>{if(!exGroups[s.exId])exGroups[s.exId]={id:s.exId,name:s.exName,sets:0,reps:'--'};exGroups[s.exId].sets=Math.max(exGroups[s.exId].sets,1);});
          onSaveAsRoutine&&onSaveAsRoutine({label:name,exercises:Object.values(exGroups),tag:'From History',category:'pull',gym:'general',wtype:'other',note:'Saved from workout history on '+fmtDate(savingAsRoutine.date)});
          setSavingAsRoutine(null);setRoutineName('');
        },style:{flex:2,padding:12,borderRadius:10,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',boxShadow:'0 6px 20px rgba(124,58,237,0.3)'}},'Save Routine')
      )
    )
  );

  if(sessions.length===0)return React.createElement('div',{style:{padding:'60px 20px',textAlign:'center'}},
    React.createElement('div',{style:{fontSize:40,marginBottom:16}},'📋'),
    React.createElement('div',{style:{fontSize:18,fontWeight:700,color:T.sub,marginBottom:8}},'No history yet'),
    React.createElement('div',{style:{fontSize:14,color:T.muted}},'Complete a workout to see it here')
  );

  // Group by month
  const byMonth=[];
  let curMonth=null;
  sessions.forEach((session,si)=>{
    const mk=getMonthKey(session.date);
    if(mk!==curMonth){byMonth.push({month:mk,sessions:[]});curMonth=mk;}
    byMonth[byMonth.length-1].sessions.push({session,si});
  });

  return React.createElement('div',{style:{paddingBottom:80}},
    // Header
    React.createElement('div',{style:{padding:'16px 16px 8px',display:'flex',alignItems:'center',justifyContent:'space-between'}},
      React.createElement('div',{style:{fontSize:22,fontWeight:800,color:T.text,letterSpacing:'-0.02em'}},'History'),
      React.createElement('div',{style:{fontSize:12,color:T.dim}},sessions.length+' workouts')
    ),
    // Month groups
    byMonth.map(({month,sessions:monthSessions})=>
      React.createElement('div',{key:month},
        // Month header
        React.createElement('div',{style:{padding:'8px 16px 6px',fontSize:11,fontWeight:700,color:T.dim,textTransform:'uppercase',letterSpacing:'0.12em'}},month),
        monthSessions.map(({session,si})=>{
          const isExpanded=expandedSessions.has(session.id);
          const bestSets=getBestSets(session);
          const durMs=session.duration||0;
          const durStr=durMs>0?(Math.floor(durMs/3600000)>0?Math.floor(durMs/3600000)+'h ':'')+(Math.floor((durMs%3600000)/60000)>0?Math.floor((durMs%3600000)/60000)+'m':'<1m'):'';
          const dateStr=new Date(session.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
          const catColor=CAT[session.sets[0]?.category]||'#7c3aed';

          return React.createElement('div',{key:session.id,style:{margin:'0 12px 10px',background:T.bg2,borderRadius:14,border:'1px solid '+T.border,overflow:'hidden'}},
            // Session card header — tap to expand
            React.createElement('div',{onClick:()=>toggleSession(session.id),style:{padding:'14px 16px',cursor:'pointer',WebkitTapHighlightColor:'transparent'}},
              React.createElement('div',{style:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:6}},
                React.createElement('div',null,
                  React.createElement('div',{style:{fontSize:16,fontWeight:700,color:T.text,marginBottom:2}},session.workoutLabel),
                  React.createElement('div',{style:{fontSize:12,color:T.muted}},dateStr)
                ),
                React.createElement('div',{style:{display:'flex',gap:6,alignItems:'center'}},
                  React.createElement('button',{onClick:e=>{e.stopPropagation();setEditingSession(si);},style:{padding:'5px 10px',borderRadius:7,border:'1px solid '+T.border2,background:'rgba(124,58,237,0.1)',color:'#a78bfa',fontSize:11,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},'Edit'),
                  React.createElement('button',{onClick:e=>{e.stopPropagation();setSavingAsRoutine(session);setRoutineName(session.workoutLabel);},style:{padding:'5px 10px',borderRadius:7,border:'1px solid rgba(20,184,166,0.3)',background:'rgba(20,184,166,0.08)',color:'#5eead4',fontSize:11,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},'+Routine'),
                  React.createElement('button',{onClick:e=>{e.stopPropagation();onDeleteSession(session);},style:{padding:'5px 8px',borderRadius:7,border:'none',background:'rgba(239,68,68,0.1)',color:'#f87171',fontSize:11,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},'Del')
                )
              ),
              // Stats row
              React.createElement('div',{style:{display:'flex',gap:16,marginBottom:isExpanded?10:0}},
                durStr&&React.createElement('div',{style:{display:'flex',alignItems:'center',gap:4}},
                  React.createElement('div',{style:{fontSize:12,color:T.dim}},'⏱'),
                  React.createElement('div',{style:{fontSize:12,color:T.muted}},durStr)
                ),
                React.createElement('div',{style:{display:'flex',alignItems:'center',gap:4}},
                  React.createElement('div',{style:{fontSize:12,color:T.dim}},'⚖️'),
                  React.createElement('div',{style:{fontSize:12,color:T.muted}},fmtVol(session.volume)+'lb')
                ),
                React.createElement('div',{style:{display:'flex',alignItems:'center',gap:4}},
                  React.createElement('div',{style:{fontSize:12,color:T.dim}},'🏆'),
                  React.createElement('div',{style:{fontSize:12,color:T.muted}},session.sets.filter(s=>s.isPR).length+' PRs')
                )
              ),
              // Exercise list preview (collapsed) or full (expanded)
              !isExpanded&&React.createElement('div',null,
                React.createElement('div',{style:{display:'flex',marginBottom:4}},
                  React.createElement('div',{style:{fontSize:11,color:T.dim,fontWeight:600,width:80,flexShrink:0}},'Exercise'),
                  React.createElement('div',{style:{fontSize:11,color:T.dim,fontWeight:600}})
                ),
                bestSets.slice(0,5).map((ex,i)=>React.createElement('div',{key:i,style:{display:'flex',alignItems:'baseline',gap:8,paddingBottom:3}},
                  React.createElement('div',{style:{fontSize:13,color:T.sub,flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},
                    (session.sets.filter(s=>s.exId===ex.name.toLowerCase().replace(/[^a-z0-9]+/g,'_')).length||
                     session.sets.filter(s=>s.exName===ex.name).length||0)+' × '+ex.name
                  ),
                  ex.best&&React.createElement('div',{style:{fontSize:13,color:T.muted,whiteSpace:'nowrap'}},
                    ex.best.weight>0?(ex.best.weight+'lb × '+ex.best.reps):(ex.best.reps+' reps')
                  )
                )),
                bestSets.length>5&&React.createElement('div',{style:{fontSize:11,color:T.dim,marginTop:2}},'+ '+(bestSets.length-5)+' more exercises')
              ),
              // Expanded: full exercise list
              isExpanded&&React.createElement('div',null,
                React.createElement('div',{style:{display:'flex',borderBottom:'1px solid '+T.border,paddingBottom:6,marginBottom:6}},
                  React.createElement('div',{style:{fontSize:11,color:T.dim,fontWeight:700,flex:1,textTransform:'uppercase',letterSpacing:'0.08em'}},'Exercise'),
                  React.createElement('div',{style:{fontSize:11,color:T.dim,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}})
                ),
                bestSets.map((ex,i)=>{
                  const setCount=session.sets.filter(s=>s.exName===ex.name).length;
                  return React.createElement('div',{key:i,style:{display:'flex',alignItems:'baseline',gap:8,paddingBottom:5}},
                    React.createElement('div',{style:{fontSize:14,color:T.sub,flex:1}},setCount+' × '+ex.name),
                    ex.best&&React.createElement('div',{style:{fontSize:14,color:T.text,fontWeight:500,whiteSpace:'nowrap'}},
                      ex.best.weight>0?(ex.best.weight+'lb × '+ex.best.reps):(ex.best.reps+' reps')
                    )
                  );
                })
              )
            )
          );
        })
      )
    )
  );
}
function RoutineEditor({workout,workoutKey,allLogs,onSave,onClose}){
  const[draft,setDraft]=useState(JSON.parse(JSON.stringify(workout)));
  const[addingEx,setAddingEx]=useState(false);
  const[newExId,setNewExId]=useState('');
  const[newExName,setNewExName]=useState('');
  const[newExSets,setNewExSets]=useState('3');
  const[newExReps,setNewExReps]=useState('8-12');
  const isCustom=newExId==='__custom__';

  // Build exercise library from allLogs keys + draft exercises
  const exLib={};
  // Build from all workout exercises first (proper names)
  Object.values(workouts).forEach(w=>{(w.exercises||[]).forEach(e=>{if(!exLib[e.id])exLib[e.id]=e.name;});});
  draft.exercises.forEach(e=>{exLib[e.id]=e.name;});
  // Add any logged exercises not in workouts — title case the id
  Object.keys(allLogs).forEach(id=>{
    if(!exLib[id]){
      exLib[id]=id.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase());
    }
  });

  function moveEx(i,dir){
    const exs=[...draft.exercises];
    const j=i+dir;
    if(j<0||j>=exs.length)return;
    [exs[i],exs[j]]=[exs[j],exs[i]];
    setDraft(d=>({...d,exercises:exs}));
  }
  function removeEx(i){setDraft(d=>({...d,exercises:d.exercises.filter((_,idx)=>idx!==i)}));}
  function addExercise(){
    const id=isCustom?('custom_'+newExName.toLowerCase().replace(/[^a-z0-9]+/g,'_')):newExId;
    const name=isCustom?newExName:(exLib[newExId]||newExId);
    if(!id||!name)return;
    setDraft(d=>({...d,exercises:[...d.exercises,{id,name,sets:parseInt(newExSets)||3,reps:newExReps}]}));
    setAddingEx(false);setNewExId('');setNewExName('');setNewExSets('3');setNewExReps('8-12');
  }

  return React.createElement('div',{style:{position:'fixed',inset:0,zIndex:300,background:'rgba(0,0,0,0.95)',backdropFilter:'blur(8px)',overflowY:'auto',paddingBottom:80}},
    React.createElement('div',{style:{position:'sticky',top:0,zIndex:10,background:T.bg,borderBottom:'1px solid '+T.border,padding:'14px 16px',display:'flex',alignItems:'center',gap:12}},
      React.createElement('button',{onClick:onClose,style:{width:44,height:44,borderRadius:10,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:22,cursor:'pointer',lineHeight:1,flexShrink:0}},'<'),
      React.createElement('div',{style:{flex:1,fontSize:17,fontWeight:700,color:T.text}},'Edit Routine'),
      React.createElement('button',{onClick:()=>onSave(workoutKey,draft),style:{padding:'9px 16px',borderRadius:10,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',minHeight:42}},'Save')
    ),
    React.createElement('div',{style:{padding:'16px'}},
      // Name + note
      React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Name'),
      React.createElement('input',{type:'text',value:draft.label,onChange:e=>setDraft(d=>({...d,label:e.target.value})),style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono,marginBottom:12,minHeight:46}}),
      React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Note'),
      React.createElement('input',{type:'text',value:draft.note||'',onChange:e=>setDraft(d=>({...d,note:e.target.value})),style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,marginBottom:16,minHeight:46}}),
      // Category
      React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Category'),
      React.createElement('div',{style:{display:'flex',gap:8,marginBottom:20}},
        ['push','pull','legs','pf'].map(cat=>React.createElement('button',{key:cat,onClick:()=>setDraft(d=>({...d,category:cat})),style:{flex:1,padding:'8px 4px',borderRadius:8,border:'1px solid '+(draft.category===cat?(CAT[cat]||T.border2):T.border2),background:draft.category===cat?(CAT[cat]||'#7c3aed')+'20':'rgba(255,255,255,0.03)',color:draft.category===cat?(CAT[cat]||'#a78bfa'):T.muted,fontSize:12,fontWeight:draft.category===cat?700:400,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},cat.charAt(0).toUpperCase()+cat.slice(1)))
      ),
      // Exercises
      React.createElement('div',{style:{fontSize:14,fontWeight:700,color:T.text,marginBottom:10}},
        'Exercises ('+draft.exercises.length+')'
      ),
      draft.exercises.map((ex,i)=>React.createElement('div',{key:i,style:{display:'flex',gap:8,alignItems:'center',marginBottom:8,padding:'10px 12px',background:T.bg2,borderRadius:10,border:'1px solid '+T.border}},
        React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:4,flexShrink:0}},
          React.createElement('button',{onClick:()=>moveEx(i,-1),disabled:i===0,style:{width:28,height:22,borderRadius:4,border:'none',background:'rgba(148,163,184,0.1)',color:T.muted,fontSize:12,cursor:'pointer',lineHeight:1,opacity:i===0?0.3:1}},'↑'),
          React.createElement('button',{onClick:()=>moveEx(i,1),disabled:i===draft.exercises.length-1,style:{width:28,height:22,borderRadius:4,border:'none',background:'rgba(148,163,184,0.1)',color:T.muted,fontSize:12,cursor:'pointer',lineHeight:1,opacity:i===draft.exercises.length-1?0.3:1}},'↓')
        ),
        React.createElement('div',{style:{flex:1,minWidth:0}},
          React.createElement('div',{style:{fontSize:13,fontWeight:600,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},ex.name)
        ),
        React.createElement('input',{type:'number',value:ex.sets,onChange:e=>setDraft(d=>({...d,exercises:d.exercises.map((x,idx)=>idx===i?{...x,sets:parseInt(e.target.value)||1}:x)})),style:{width:40,padding:'5px 6px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:6,color:T.text,fontSize:12,fontFamily:T.mono,textAlign:'center'}}),
        React.createElement('span',{style:{fontSize:10,color:T.dim}},'x'),
        React.createElement('input',{type:'text',value:ex.reps,onChange:e=>setDraft(d=>({...d,exercises:d.exercises.map((x,idx)=>idx===i?{...x,reps:e.target.value}:x)})),style:{width:52,padding:'5px 6px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:6,color:T.text,fontSize:12,fontFamily:T.mono,textAlign:'center'}}),
        React.createElement('button',{onClick:()=>removeEx(i),style:{background:'rgba(239,68,68,0.1)',border:'none',color:'#f87171',borderRadius:6,padding:'5px 8px',fontSize:12,cursor:'pointer',WebkitTapHighlightColor:'transparent',flexShrink:0}},'✕')
      )),
      // Add exercise
      !addingEx?React.createElement('button',{onClick:()=>setAddingEx(true),style:{width:'100%',padding:12,borderRadius:10,border:'1px dashed '+T.border2,background:'transparent',color:T.muted,fontSize:14,cursor:'pointer',WebkitTapHighlightColor:'transparent',marginTop:4}},'+ Add Exercise')
      :React.createElement('div',{style:{background:T.bg2,borderRadius:10,border:'1px solid '+T.border2,padding:14,marginTop:4}},
        React.createElement('select',{value:newExId,onChange:e=>{setNewExId(e.target.value);setNewExName('');},style:{width:'100%',padding:'10px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:newExId?T.text:T.dim,fontSize:14,fontFamily:T.mono,minHeight:44,marginBottom:8}},
          React.createElement('option',{value:''},'-- Pick exercise --'),
          React.createElement('option',{value:'__custom__'},'+ Custom / free text...'),
          React.createElement('option',{disabled:true,value:''},'──────────────'),
          Object.entries(exLib).sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>React.createElement('option',{key:id,value:id},name))
        ),
        isCustom&&React.createElement('input',{type:'text',placeholder:'Exercise name...',value:newExName,onChange:e=>setNewExName(e.target.value),style:{width:'100%',padding:'10px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:44,marginBottom:8}}),
        React.createElement('div',{style:{display:'flex',gap:8,marginBottom:10}},
          React.createElement('div',{style:{flex:1}},
            React.createElement('label',{style:{fontSize:11,color:T.dim,display:'block',marginBottom:4}},'Sets'),
            React.createElement('input',{type:'number',value:newExSets,onChange:e=>setNewExSets(e.target.value),style:{width:'100%',padding:'8px 10px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:42}})
          ),
          React.createElement('div',{style:{flex:1}},
            React.createElement('label',{style:{fontSize:11,color:T.dim,display:'block',marginBottom:4}},'Reps'),
            React.createElement('input',{type:'text',value:newExReps,onChange:e=>setNewExReps(e.target.value),style:{width:'100%',padding:'8px 10px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:42}})
          )
        ),
        React.createElement('div',{style:{display:'flex',gap:8}},
          React.createElement('button',{onClick:()=>{setAddingEx(false);setNewExId('');setNewExName('');},style:{flex:1,padding:10,borderRadius:8,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:13,cursor:'pointer'}},'Cancel'),
          React.createElement('button',{onClick:addExercise,disabled:!newExId||(isCustom&&!newExName.trim()),style:{flex:2,padding:10,borderRadius:8,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}},'Add')
        )
      )
    )
  );
}

function fmtRelativeDate(dateStr){
  if(!dateStr)return null;
  const diff=Date.now()-new Date(dateStr).getTime();
  const days=Math.floor(diff/86400000);
  if(days<0)return null;
  if(days===0)return'Today';
  if(days===1)return'Yesterday';
  if(days<7)return days+' days ago';
  if(days<30){const w=Math.floor(days/7);return w+' week'+(w>1?'s':'')+' ago';}
  const m=Math.floor(days/30);return m+' month'+(m>1?'s':'')+' ago';
}
function getLastUsed(routine,allLogs){
  let maxDate=null;
  (routine.exercises||[]).forEach(ex=>{
    const logs=allLogs[ex.id]||[];
    logs.forEach(l=>{if(!maxDate||new Date(l.date)>new Date(maxDate))maxDate=l.date;});
  });
  return maxDate;
}

function RoutinesTab({workouts,onStartWorkout,onReorder,onArchive,onSaveRoutine,allLogs}){
  const[search,setSearch]=useState('');
  const[editingRoutine,setEditingRoutine]=useState(null);
  const[archiving,setArchiving]=useState(false);
  const[selected,setSelected]=useState(new Set());const[filterType,setFilterType]=useState('all');
  const[expandedGym,setExpandedGym]=useState(null);const[reordering,setReordering]=useState(false);
  const[routineOrder,setRoutineOrder]=useState(()=>loadLS('fitlog_routine_order',{}));
  const[actionSheet,setActionSheet]=useState(null); // routine key for quick actions
  const dragRef=useRef(null);
  const grouped={};Object.entries(workouts).forEach(([key,w])=>{if(w.archived)return;const gym=w.gym||'general';if(!grouped[gym])grouped[gym]=[];grouped[gym].push({key,...w});});
  const GYM_ORDER=['pm','anthropic','rrb','golds','anytime','pf','general','home','hotel','rahway'];
  const gyms=Object.keys(grouped).sort((a,b)=>{const ai=GYM_ORDER.indexOf(a),bi=GYM_ORDER.indexOf(b);return(ai<0?99:ai)-(bi<0?99:bi);});
  function sortedList(gym,list){const order=routineOrder[gym]||[];return [...list].sort((a,b)=>{const ai=order.indexOf(a.key),bi=order.indexOf(b.key);if(ai<0&&bi<0)return a.label.localeCompare(b.label);if(ai<0)return 1;if(bi<0)return -1;return ai-bi;});}
  const filtered=(list)=>list.filter(w=>{
    const matchSearch=!search||w.label.toLowerCase().includes(search.toLowerCase());
    let matchFilter=true;
    if(filterType==='all')matchFilter=true;
    else if(filterType.startsWith('gym_'))matchFilter=(w.gym||'general')===filterType.slice(4);
    else matchFilter=w.wtype===filterType||(filterType==='push'&&w.category==='push'&&!w.wtype)||(filterType==='pull'&&w.category==='pull'&&!w.wtype)||(filterType==='legs'&&w.category==='legs'&&!w.wtype);
    return matchSearch&&matchFilter;
  });
  function handleDragStart(gym,idx){dragRef.current={gym,idx};}
  function handleDragOver(e,gym,idx){
    e.preventDefault();if(!dragRef.current||dragRef.current.gym!==gym||dragRef.current.idx===idx)return;
    const list=sortedList(gym,filtered(grouped[gym]||[]));const keys=list.map(w=>w.key);
    const moved=keys.splice(dragRef.current.idx,1)[0];keys.splice(idx,0,moved);
    const newOrder={...routineOrder,[gym]:keys};saveLS('fitlog_routine_order',newOrder);setRoutineOrder(newOrder);onReorder(newOrder);dragRef.current={gym,idx};
  }
  function handleDragEnd(){dragRef.current=null;}
  const chips=[
    {id:'all',label:'All',color:T.sub,bg:'rgba(255,255,255,0.08)'},{id:'push',label:'Push',color:TYPE_COLORS.push,bg:TYPE_COLORS.push+'20'},{id:'pull',label:'Pull',color:TYPE_COLORS.pull,bg:TYPE_COLORS.pull+'20'},{id:'legs',label:'Legs',color:TYPE_COLORS.legs,bg:TYPE_COLORS.legs+'20'},
    {id:'gym_pm',label:'Power Matrix',color:'#e8a020',bg:'rgba(232,160,32,0.15)'},{id:'gym_anthropic',label:'Anthropic',color:'#d97706',bg:'rgba(217,119,6,0.15)'},{id:'gym_rrb',label:'RRB',color:'#a78bfa',bg:'rgba(167,139,250,0.15)'},{id:'gym_pf',label:'PF',color:CAT.pf,bg:CAT.pf+'20'},{id:'gym_golds',label:"Gold's",color:'#fbbf24',bg:'rgba(251,191,36,0.15)'},{id:'gym_anytime',label:'AF',color:'#34d399',bg:'rgba(52,211,153,0.15)'},
    {id:'upper',label:'Upper',color:TYPE_COLORS.upper,bg:TYPE_COLORS.upper+'20'},{id:'full',label:'Full Body',color:TYPE_COLORS.full,bg:TYPE_COLORS.full+'20'},{id:'core',label:'Core',color:TYPE_COLORS.core,bg:TYPE_COLORS.core+'20'},{id:'other',label:'Other',color:TYPE_COLORS.other,bg:TYPE_COLORS.other+'20'},
  ];
  if(editingRoutine)return React.createElement(RoutineEditor,{
    workout:workouts[editingRoutine],workoutKey:editingRoutine,allLogs,
    onSave:(key,draft)=>{onSaveRoutine(key,draft);setEditingRoutine(null);},
    onClose:()=>setEditingRoutine(null)
  });

  const actionSheetRoutine=actionSheet?workouts[actionSheet]:null;

  return React.createElement('div',{style:{paddingBottom:80}},
    React.createElement('div',{style:{padding:'16px 16px 8px',position:'sticky',top:0,zIndex:5,background:T.bg,borderBottom:'1px solid '+T.border}},
      React.createElement('div',{style:{fontSize:22,fontWeight:800,color:T.text,letterSpacing:'-0.02em',marginBottom:10}},'Routines'),
      React.createElement('div',{style:{display:'flex',gap:8,marginBottom:10}},
        React.createElement('input',{type:'text',placeholder:'Search routines...',value:search,onChange:e=>setSearch(e.target.value),style:{flex:1,padding:'10px 14px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:10,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:44}}),
        !archiving&&React.createElement('button',{onClick:()=>{setReordering(r=>!r);setArchiving(false);setSelected(new Set());},style:{padding:'10px 12px',borderRadius:10,border:'1px solid '+(reordering?'#a78bfa':T.border2),background:reordering?'rgba(167,139,250,0.15)':'rgba(255,255,255,0.04)',color:reordering?'#a78bfa':T.muted,fontSize:13,cursor:'pointer',WebkitTapHighlightColor:'transparent',minHeight:44,flexShrink:0,fontWeight:reordering?700:400}},reordering?'Done':'Reorder'),
        !reordering&&!archiving&&React.createElement('button',{onClick:()=>{setArchiving(true);setReordering(false);setSelected(new Set());},style:{padding:'10px 12px',borderRadius:10,border:'1px solid rgba(239,68,68,0.4)',background:'rgba(239,68,68,0.08)',color:'#f87171',fontSize:13,cursor:'pointer',WebkitTapHighlightColor:'transparent',minHeight:44,flexShrink:0}},'Archive'),
        archiving&&React.createElement(React.Fragment,null,
          React.createElement('button',{
            onClick:()=>{selected.forEach(key=>onArchive(key));setArchiving(false);setSelected(new Set());},
            disabled:selected.size===0,
            style:{padding:'10px 14px',borderRadius:10,border:'none',background:selected.size>0?'rgba(239,68,68,0.8)':'rgba(239,68,68,0.2)',color:'#fff',fontSize:13,fontWeight:700,cursor:selected.size>0?'pointer':'default',WebkitTapHighlightColor:'transparent',minHeight:44,flexShrink:0}
          },selected.size>0?'Archive ('+selected.size+')':'Archive'),
          React.createElement('button',{onClick:()=>{setArchiving(false);setSelected(new Set());},style:{padding:'10px 12px',borderRadius:10,border:'1px solid '+T.border2,background:'rgba(255,255,255,0.04)',color:T.muted,fontSize:13,cursor:'pointer',WebkitTapHighlightColor:'transparent',minHeight:44,flexShrink:0}},'Cancel')
        )
      ),
      React.createElement('div',{style:{display:'flex',gap:6,overflowX:'auto',scrollbarWidth:'none',paddingBottom:4}},
        chips.map(({id,label,color,bg})=>React.createElement('button',{key:id,onClick:()=>setFilterType(filterType===id?'all':id),style:{flexShrink:0,padding:'5px 12px',borderRadius:8,border:'1px solid '+(filterType===id?color+'80':'transparent'),background:filterType===id?bg:'transparent',color:filterType===id?color:T.dim,fontSize:12,fontWeight:filterType===id?700:400,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},label))
      )
    ),
    React.createElement('div',{style:{padding:'8px 16px'}},
      gyms.map(gym=>{
        const rawList=filtered(grouped[gym]||[]);if(!rawList.length)return null;
        const list=sortedList(gym,rawList);const isOpen=expandedGym===null||expandedGym===gym;const gymLabel=GYM_LABELS[gym]||gym;
        return React.createElement('div',{key:gym,style:{marginBottom:16}},
          React.createElement('div',{onClick:()=>setExpandedGym(isOpen&&expandedGym===gym?null:gym),style:{display:'flex',alignItems:'center',gap:8,padding:'8px 2px',cursor:'pointer',WebkitTapHighlightColor:'transparent'}},
            React.createElement('div',{style:{fontSize:12,fontWeight:700,color:T.sub,flex:1,textTransform:'uppercase',letterSpacing:'0.08em'}},'📁 '+gymLabel),
            React.createElement('div',{style:{fontSize:11,color:T.dim}},list.length),
            React.createElement('div',{style:{fontSize:13,color:T.dim}},isOpen&&expandedGym===gym?'⌃':'⌄')
          ),
          !(isOpen||expandedGym!==gym)?null:
          // ── REORDER MODE: draggable single-column list ──────────────────────
          reordering?React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6}},
            list.map((w,idx)=>{
              const tc=TYPE_COLORS[w.wtype]||CAT[w.category]||'#64748b';
              return React.createElement('div',{key:w.key,draggable:true,onDragStart:()=>handleDragStart(gym,idx),onDragOver:(e)=>handleDragOver(e,gym,idx),onDragEnd:handleDragEnd,style:{background:T.bg2,borderRadius:10,border:'1px solid '+T.border,padding:'12px 14px',display:'flex',alignItems:'center',gap:10,cursor:'grab',userSelect:'none'}},
                React.createElement('div',{style:{fontSize:18,color:T.dim,flexShrink:0}},'☰'),
                React.createElement('div',{style:{width:3,borderRadius:2,alignSelf:'stretch',background:tc,flexShrink:0}}),
                React.createElement('div',{style:{flex:1,minWidth:0}},React.createElement('div',{style:{fontSize:14,fontWeight:600,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},w.label)),
              );
            })
          ):
          // ── GRID MODE: 2-column card grid ────────────────────────────────────
          React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}},
            list.map(w=>{
              const tc=TYPE_COLORS[w.wtype]||CAT[w.category]||'#64748b';
              const exNames=(w.exercises||[]).map(e=>e.name).join(', ');
              const lastUsed=fmtRelativeDate(getLastUsed(w,allLogs));
              const isSelected=selected.has(w.key);
              return React.createElement('div',{
                key:w.key,
                onClick:()=>{if(archiving){setSelected(s=>{const n=new Set(s);n.has(w.key)?n.delete(w.key):n.add(w.key);return n;});}else{onStartWorkout(w.key);}},
                style:{position:'relative',background:T.bg2,borderRadius:12,border:'1px solid '+(isSelected?'#f87171':T.border),padding:'12px 12px 10px',cursor:'pointer',WebkitTapHighlightColor:'transparent',minHeight:118,display:'flex',flexDirection:'column'}
              },
                React.createElement('div',{style:{width:3,height:16,borderRadius:2,background:tc,marginBottom:6}}),
                React.createElement('div',{style:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:4}},
                  React.createElement('div',{style:{fontSize:14,fontWeight:700,color:T.text,lineHeight:1.25,flex:1}},w.label),
                  archiving
                    ?React.createElement('div',{style:{width:22,height:22,borderRadius:6,border:'2px solid '+(isSelected?'#f87171':T.border2),background:isSelected?'rgba(239,68,68,0.2)':'transparent',color:'#f87171',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}},isSelected?'✓':'')
                    :React.createElement('button',{onClick:e=>{e.stopPropagation();setActionSheet(w.key);},style:{width:24,height:24,borderRadius:6,border:'none',background:'rgba(255,255,255,0.06)',color:T.dim,fontSize:14,cursor:'pointer',flexShrink:0,WebkitTapHighlightColor:'transparent',lineHeight:1}},'⋯')
                ),
                React.createElement('div',{style:{fontSize:11,color:T.dim,marginTop:4,lineHeight:1.4,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',flex:1}},exNames),
                React.createElement('div',{style:{display:'flex',alignItems:'center',gap:4,marginTop:8}},
                  lastUsed&&React.createElement('div',{style:{fontSize:10,color:T.dim,fontStyle:'italic'}},'⏱ '+lastUsed),
                  !lastUsed&&React.createElement('div',{style:{fontSize:10,color:tc,fontWeight:700}},TYPE_LABELS[w.wtype]||w.tag||'')
                )
              );
            })
          )
        );
      })
    ),
    // Quick actions bottom sheet
    actionSheetRoutine&&React.createElement('div',{onClick:()=>setActionSheet(null),style:{position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)',display:'flex',flexDirection:'column',justifyContent:'flex-end'}},
      React.createElement('div',{onClick:e=>e.stopPropagation(),style:{background:T.bg2,borderRadius:'20px 20px 0 0',padding:'8px 16px 40px'}},
        React.createElement('div',{style:{width:40,height:4,borderRadius:2,background:T.border2,margin:'8px auto 20px'}}),
        React.createElement('div',{style:{fontSize:14,fontWeight:700,color:T.text,marginBottom:16,textAlign:'center'}},actionSheetRoutine.label),
        React.createElement('button',{onClick:()=>{onStartWorkout(actionSheet);setActionSheet(null);},style:{width:'100%',padding:'14px 16px',marginBottom:8,borderRadius:12,border:'none',background:GRAD.button,color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent',textAlign:'left'}},'▶  Start Workout'),
        React.createElement('button',{onClick:()=>{setEditingRoutine(actionSheet);setActionSheet(null);},style:{width:'100%',padding:'14px 16px',marginBottom:8,borderRadius:12,border:'none',background:'rgba(124,58,237,0.15)',color:'#a78bfa',fontSize:15,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent',textAlign:'left'}},'Edit Routine'),
        React.createElement('button',{onClick:()=>{if(window.confirm('Archive '+actionSheetRoutine.label+'?')){onArchive(actionSheet);}setActionSheet(null);},style:{width:'100%',padding:'14px 16px',borderRadius:12,border:'none',background:'rgba(239,68,68,0.1)',color:'#f87171',fontSize:15,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent',textAlign:'left'}},'Archive Routine')
      )
    )
  );
}


function ProgramBuilder({workouts,onClose}){
  const[programs,setPrograms]=useState(()=>loadLS('fitlog_programs',[]));
  const[creating,setCreating]=useState(false);
  const[draft,setDraft]=useState({name:'',weeks:4,daysPerWeek:3,exercises:[]});
  const[selEx,setSelEx]=useState('');
  const exLib={};Object.values(workouts).forEach(w=>{(w.exercises||[]).forEach(e=>{exLib[e.id]=e.name;});});
  function saveProgram(){if(!draft.name.trim())return;const prog={...draft,id:'prog_'+Date.now(),created:new Date().toISOString()};const updated=[...programs,prog];setPrograms(updated);saveLS('fitlog_programs',updated);setCreating(false);setDraft({name:'',weeks:4,daysPerWeek:3,exercises:[]});}
  function deleteProgram(id){const updated=programs.filter(p=>p.id!==id);setPrograms(updated);saveLS('fitlog_programs',updated);}
  return React.createElement('div',{style:{position:'fixed',inset:0,zIndex:400,background:'rgba(0,0,0,0.95)',backdropFilter:'blur(8px)',overflowY:'auto',paddingBottom:80}},
    React.createElement('div',{style:{position:'sticky',top:0,zIndex:10,background:T.bg,borderBottom:'1px solid '+T.border,padding:'14px 16px',display:'flex',alignItems:'center',gap:12}},
      React.createElement('button',{onClick:onClose,style:{width:44,height:44,borderRadius:10,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:22,cursor:'pointer',lineHeight:1}},'<'),
      React.createElement('div',{style:{flex:1,fontSize:17,fontWeight:700,color:T.text}},'Programs'),
      React.createElement('button',{onClick:()=>setCreating(true),style:{padding:'8px 14px',borderRadius:9,border:'none',background:GRAD.button,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}},'+ New')
    ),
    React.createElement('div',{style:{padding:'16px'}},
      creating&&React.createElement('div',{style:{background:T.bg2,borderRadius:12,border:'1px solid '+T.border2,padding:16,marginBottom:16}},
        React.createElement('div',{style:{fontSize:15,fontWeight:700,color:T.text,marginBottom:12}},'New Program'),
        React.createElement('input',{type:'text',placeholder:'Program name...',value:draft.name,onChange:e=>setDraft(d=>({...d,name:e.target.value})),style:{width:'100%',padding:'10px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:44,marginBottom:10}}),
        React.createElement('div',{style:{display:'flex',gap:10,marginBottom:10}},
          React.createElement('div',{style:{flex:1}},React.createElement('label',{style:{fontSize:11,color:T.muted,display:'block',marginBottom:4}},'Weeks'),React.createElement('input',{type:'number',value:draft.weeks,onChange:e=>setDraft(d=>({...d,weeks:parseInt(e.target.value)||4})),style:{width:'100%',padding:'8px 10px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:40}})),
          React.createElement('div',{style:{flex:1}},React.createElement('label',{style:{fontSize:11,color:T.muted,display:'block',marginBottom:4}},'Days/Week'),React.createElement('input',{type:'number',value:draft.daysPerWeek,onChange:e=>setDraft(d=>({...d,daysPerWeek:parseInt(e.target.value)||3})),style:{width:'100%',padding:'8px 10px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:40}}))
        ),
        React.createElement('div',{style:{fontSize:11,color:T.muted,marginBottom:6}},'Exercises ('+draft.exercises.length+')'),
        React.createElement('select',{value:selEx,onChange:e=>{if(!e.target.value)return;setDraft(d=>({...d,exercises:[...d.exercises,{id:e.target.value,name:exLib[e.target.value],targetSets:3,targetReps:'8-12',progressionLb:5}]}));setSelEx('');},style:{width:'100%',padding:'10px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:44,marginBottom:8}},
          React.createElement('option',{value:''},'+ Add exercise...'),
          Object.entries(exLib).map(([id,name])=>React.createElement('option',{key:id,value:id},name))
        ),
        draft.exercises.map((ex,i)=>React.createElement('div',{key:i,style:{display:'flex',gap:8,alignItems:'center',marginBottom:6,padding:'8px 10px',background:T.bg3,borderRadius:8}},
          React.createElement('div',{style:{flex:1,fontSize:12,color:T.sub}},ex.name),
          React.createElement('input',{type:'text',value:ex.targetReps,onChange:e=>setDraft(d=>({...d,exercises:d.exercises.map((x,idx)=>idx===i?{...x,targetReps:e.target.value}:x)})),placeholder:'reps',style:{width:50,padding:'4px 6px',background:T.bg,border:'1px solid '+T.border2,borderRadius:5,color:T.text,fontSize:12,fontFamily:T.mono}}),
          React.createElement('input',{type:'number',value:ex.progressionLb,onChange:e=>setDraft(d=>({...d,exercises:d.exercises.map((x,idx)=>idx===i?{...x,progressionLb:parseFloat(e.target.value)||0}:x)})),placeholder:'+lb',style:{width:44,padding:'4px 6px',background:T.bg,border:'1px solid '+T.border2,borderRadius:5,color:'#34d399',fontSize:12,fontFamily:T.mono}}),
          React.createElement('button',{onClick:()=>setDraft(d=>({...d,exercises:d.exercises.filter((_,idx)=>idx!==i)})),style:{background:'rgba(239,68,68,0.1)',border:'none',color:'#f87171',borderRadius:5,padding:'3px 7px',fontSize:11,cursor:'pointer'}},'X')
        )),
        React.createElement('div',{style:{display:'flex',gap:10,marginTop:12}},
          React.createElement('button',{onClick:()=>setCreating(false),style:{flex:1,padding:11,borderRadius:9,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:13,cursor:'pointer'}},'Cancel'),
          React.createElement('button',{onClick:saveProgram,disabled:!draft.name.trim()||!draft.exercises.length,style:{flex:2,padding:11,borderRadius:9,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}},'Save Program')
        )
      ),
      programs.length===0&&!creating
        ?React.createElement('div',{style:{padding:'40px 20px',textAlign:'center',color:T.muted,fontSize:14}},'No programs yet. Create one to plan your training blocks.')
        :programs.map(prog=>React.createElement('div',{key:prog.id,style:{background:T.bg2,borderRadius:12,border:'1px solid '+T.border,padding:'14px 16px',marginBottom:10}},
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,marginBottom:8}},
            React.createElement('div',{style:{flex:1}},React.createElement('div',{style:{fontSize:15,fontWeight:700,color:T.text}},prog.name),React.createElement('div',{style:{fontSize:11,color:T.dim,marginTop:2}},prog.weeks+' weeks · '+prog.daysPerWeek+' days/week · '+prog.exercises.length+' exercises')),
            React.createElement('button',{onClick:()=>deleteProgram(prog.id),style:{background:'rgba(239,68,68,0.1)',border:'none',color:'#f87171',borderRadius:6,padding:'5px 9px',fontSize:12,cursor:'pointer'}},'Delete')
          ),
          React.createElement('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},
            prog.exercises.map((ex,i)=>React.createElement('div',{key:i,style:{fontSize:11,color:T.sub,padding:'3px 8px',background:T.bg3,borderRadius:6}},ex.name+' +'+ex.progressionLb+'lb/wk'))
          )
        ))
    )
  );
}

function ExerciseDatabase({workouts,restDefaults,onSaveRestDefaults,onSaveExercise,onCreateExercise,allLogs}){
  const[search,setSearch]=useState('');
  const[editingEx,setEditingEx]=useState(null); // {workoutKey, exIdx, ex}
  const[editDraft,setEditDraft]=useState(null);
  const[bodyPartFilter,setBodyPartFilter]=useState('all');
  const[equipFilter,setEquipFilter]=useState('all');
  const customBodyPart=loadLS('fitlog_custom_bodypart',{});
  const scrollRef=useRef(null);
  const[creatingNew,setCreatingNew]=useState(false);
  const[newDraft,setNewDraft]=useState({name:'',sets:3,reps:'8-12',restSec:120,bodyPart:'Other',equipment:'Other'});

  // Body part inference from exercise name
  function inferBodyPart(name){
    const n=name.toLowerCase();
    if(/bench|chest|fly|pec|dip/.test(n))return'Chest';
    if(/squat|leg press|lunge|quad/.test(n))return'Legs';
    if(/curl|bicep/.test(n)&&!/leg curl|hamstring/.test(n))return'Biceps';
    if(/tricep|pushdown|skullcrusher|overhead ext/.test(n))return'Triceps';
    if(/row|pulldown|pull-?up|lat |deadlift/.test(n))return'Back';
    if(/shoulder|lateral raise|arnold|delt|shrug|face pull/.test(n))return'Shoulders';
    if(/calf/.test(n))return'Calves';
    if(/ab |crunch|plank|russian twist|v up|side bend/.test(n))return'Core';
    if(/glute|hip thrust|kickback/.test(n))return'Glutes';
    if(/hamstring|leg curl|romanian/.test(n))return'Hamstrings';
    return'Other';
  }
  function inferEquipment(name){
    const n=name.toLowerCase();
    if(/\(barbell\)|barbell|deadlift|squat \(bb|bench press$/.test(n)&&!/dumbbell|db |smith|hack/.test(n))return'Barbell';
    if(/\(dumbbell\)|dumbbell|\(db\)|db /.test(n))return'Dumbbell';
    if(/\(smith\)|smith machine/.test(n))return'Smith Machine';
    if(/\(cable\)|cable|pushdown|pulldown|crossover/.test(n))return'Cable';
    if(/\(machine\)|machine|hack squat|leg press|leg ext|leg curl|pec deck|chest press \(m/.test(n))return'Machine';
    if(/pull-?up$|push-?up|dip$|plank|crunch|russian twist|v up|air ?bike|mountain climber/.test(n))return'Bodyweight';
    if(/band/.test(n))return'Band';
    if(/kettlebell|\(kb\)/.test(n))return'Kettlebell';
    return'Other';
  }

  // Build deduplicated exercise list with their workout context
  const customEquip=loadLS('fitlog_custom_equipment',{});
  const allExercises=[];
  const seen=new Set();
  Object.entries(workouts).forEach(([wKey,w])=>{
    (w.exercises||[]).forEach((ex,exIdx)=>{
      if(!seen.has(ex.id)){
        seen.add(ex.id);
        allExercises.push({...ex,workoutKey:wKey,workoutLabel:w.label,exIdx,category:w.category,bodyPart:customBodyPart[ex.id]||inferBodyPart(ex.name),equipment:customEquip[ex.id]||inferEquipment(ex.name)});
      }
    });
  });
  allExercises.sort((a,b)=>a.name.localeCompare(b.name));

  const bodyParts=['all',...new Set(allExercises.map(e=>e.bodyPart))].sort((a,b)=>a==='all'?-1:b==='all'?1:a.localeCompare(b));
  const equipTypes=['all',...new Set(allExercises.map(e=>e.equipment))].sort((a,b)=>a==='all'?-1:b==='all'?1:a.localeCompare(b));

  const filtered=allExercises.filter(ex=>{
    const matchSearch=!search||ex.name.toLowerCase().includes(search.toLowerCase());
    const matchBP=bodyPartFilter==='all'||ex.bodyPart===bodyPartFilter;
    const matchEquip=equipFilter==='all'||ex.equipment===equipFilter;
    return matchSearch&&matchBP&&matchEquip;
  });

  // Group by first letter for jump list
  const byLetter={};
  filtered.forEach(ex=>{
    const letter=ex.name[0].toUpperCase();
    if(!byLetter[letter])byLetter[letter]=[];
    byLetter[letter].push(ex);
  });
  const letters=Object.keys(byLetter).sort();
  const allLetters='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  function getBestSet(exId){
    const logs=allLogs[exId]||[];
    if(!logs.length)return null;
    let best=logs[0];
    logs.forEach(l=>{if((l.e1rm||0)>(best.e1rm||0)||(l.e1rm===best.e1rm&&l.weight>best.weight))best=l;});
    return best;
  }

  function jumpToLetter(letter){
    const el=document.getElementById('exletter-'+letter);
    if(el&&scrollRef.current)el.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function openEdit(ex){
    setEditingEx(ex);
    setEditDraft({name:ex.name,sets:ex.sets,reps:ex.reps,restSec:restDefaults[ex.id]||restDefaults._default||120,bodyPart:ex.bodyPart,equipment:ex.equipment});
  }
  function saveEdit(){
    if(!editDraft||!editingEx)return;
    // Save exercise edits to workout
    onSaveExercise(editingEx.workoutKey,editingEx.exIdx,{name:editDraft.name,sets:parseInt(editDraft.sets)||editingEx.sets,reps:editDraft.reps});
    // Save rest timer
    onSaveRestDefaults({...restDefaults,[editingEx.id]:parseInt(editDraft.restSec)||120});
    // Save body part / equipment overrides
    const bp=loadLS('fitlog_custom_bodypart',{});bp[editingEx.id]=editDraft.bodyPart;saveLS('fitlog_custom_bodypart',bp);
    const eq=loadLS('fitlog_custom_equipment',{});eq[editingEx.id]=editDraft.equipment;saveLS('fitlog_custom_equipment',eq);
    setEditingEx(null);setEditDraft(null);
  }

  const accent='#7c3aed';

  if(creatingNew)return React.createElement('div',{style:{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.93)',backdropFilter:'blur(8px)',overflowY:'auto',padding:'20px 16px'}},
    React.createElement('div',{style:{maxWidth:600,margin:'0 auto',background:T.bg2,borderRadius:16,padding:24,border:'1px solid '+T.border}},
      React.createElement('div',{style:{fontSize:18,fontWeight:700,color:T.text,marginBottom:20}},'New Exercise'),
      React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Name'),
      React.createElement('input',{type:'text',value:newDraft.name,onChange:e=>setNewDraft(d=>({...d,name:e.target.value})),autoFocus:true,placeholder:'e.g. Cable Crossover',style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono,marginBottom:14,minHeight:46}}),
      React.createElement('div',{style:{display:'flex',gap:10,marginBottom:14}},
        React.createElement('div',{style:{flex:1}},
          React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Sets'),
          React.createElement('input',{type:'number',value:newDraft.sets,onChange:e=>setNewDraft(d=>({...d,sets:e.target.value})),style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono,minHeight:46}})
        ),
        React.createElement('div',{style:{flex:1}},
          React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Reps'),
          React.createElement('input',{type:'text',value:newDraft.reps,onChange:e=>setNewDraft(d=>({...d,reps:e.target.value})),style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono,minHeight:46}})
        )
      ),
      React.createElement('div',{style:{display:'flex',gap:10,marginBottom:14}},
        React.createElement('div',{style:{flex:1}},
          React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Body Part'),
          React.createElement('select',{value:newDraft.bodyPart,onChange:e=>setNewDraft(d=>({...d,bodyPart:e.target.value})),style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:46}},
            ['Chest','Back','Shoulders','Biceps','Triceps','Legs','Hamstrings','Glutes','Calves','Core','Other'].map(bp=>React.createElement('option',{key:bp,value:bp},bp))
          )
        ),
        React.createElement('div',{style:{flex:1}},
          React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Equipment'),
          React.createElement('select',{value:newDraft.equipment,onChange:e=>setNewDraft(d=>({...d,equipment:e.target.value})),style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:46}},
            ['Barbell','Dumbbell','Machine','Cable','Smith Machine','Bodyweight','Kettlebell','Band','Other'].map(eq=>React.createElement('option',{key:eq,value:eq},eq))
          )
        )
      ),
      React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Rest Timer (seconds)'),
      React.createElement('div',{style:{display:'flex',gap:8,marginBottom:14,alignItems:'center'}},
        React.createElement('input',{type:'number',value:newDraft.restSec,onChange:e=>setNewDraft(d=>({...d,restSec:e.target.value})),style:{width:100,padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono,minHeight:46}}),
        React.createElement('div',{style:{fontSize:12,color:T.dim}},Math.floor((newDraft.restSec||0)/60)+'m '+(newDraft.restSec||0)%60+'s')
      ),
      React.createElement('div',{style:{fontSize:12,color:T.dim,marginBottom:20,lineHeight:1.5}},'This adds a standalone exercise to your library. You can add it to any routine afterward from the Routine Editor.'),
      React.createElement('div',{style:{display:'flex',gap:10}},
        React.createElement('button',{onClick:()=>{setCreatingNew(false);setNewDraft({name:'',sets:3,reps:'8-12',restSec:120});},style:{flex:1,padding:13,borderRadius:10,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:14,cursor:'pointer',minHeight:48}},'Cancel'),
        React.createElement('button',{
          disabled:!newDraft.name.trim(),
          onClick:()=>{
            const id='custom_'+newDraft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
            onCreateExercise&&onCreateExercise({id,name:newDraft.name.trim(),sets:parseInt(newDraft.sets)||3,reps:newDraft.reps||'8-12'});
            onSaveRestDefaults({...restDefaults,[id]:parseInt(newDraft.restSec)||120});
            const bp=loadLS('fitlog_custom_bodypart',{});bp[id]=newDraft.bodyPart;saveLS('fitlog_custom_bodypart',bp);
            const eq=loadLS('fitlog_custom_equipment',{});eq[id]=newDraft.equipment;saveLS('fitlog_custom_equipment',eq);
            setCreatingNew(false);setNewDraft({name:'',sets:3,reps:'8-12',restSec:120,bodyPart:'Other',equipment:'Other'});
          },
          style:{flex:2,padding:13,borderRadius:10,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,cursor:'pointer',minHeight:48,boxShadow:'0 8px 24px rgba(124,58,237,0.3)'}
        },'Create Exercise')
      )
    )
  );

  if(editingEx&&editDraft)return React.createElement('div',{style:{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.93)',backdropFilter:'blur(8px)',overflowY:'auto',padding:'20px 16px'}},
    React.createElement('div',{style:{maxWidth:600,margin:'0 auto',background:T.bg2,borderRadius:16,padding:24,border:'1px solid '+T.border}},
      React.createElement('div',{style:{fontSize:18,fontWeight:700,color:T.text,marginBottom:4}},'Edit Exercise'),
      React.createElement('div',{style:{fontSize:12,color:T.dim,marginBottom:20}},editingEx.workoutLabel),
      React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Name'),
      React.createElement('input',{type:'text',value:editDraft.name,onChange:e=>setEditDraft(d=>({...d,name:e.target.value})),style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono,marginBottom:14,minHeight:46}}),
      React.createElement('div',{style:{display:'flex',gap:10,marginBottom:14}},
        React.createElement('div',{style:{flex:1}},
          React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Sets'),
          React.createElement('input',{type:'number',value:editDraft.sets,onChange:e=>setEditDraft(d=>({...d,sets:e.target.value})),style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono,minHeight:46}})
        ),
        React.createElement('div',{style:{flex:1}},
          React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Reps'),
          React.createElement('input',{type:'text',value:editDraft.reps,onChange:e=>setEditDraft(d=>({...d,reps:e.target.value})),style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono,minHeight:46}})
        )
      ),
      React.createElement('div',{style:{display:'flex',gap:10,marginBottom:14}},
        React.createElement('div',{style:{flex:1}},
          React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Body Part'),
          React.createElement('select',{value:editDraft.bodyPart,onChange:e=>setEditDraft(d=>({...d,bodyPart:e.target.value})),style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:46}},
            ['Chest','Back','Shoulders','Biceps','Triceps','Legs','Hamstrings','Glutes','Calves','Core','Other'].map(bp=>React.createElement('option',{key:bp,value:bp},bp))
          )
        ),
        React.createElement('div',{style:{flex:1}},
          React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Equipment'),
          React.createElement('select',{value:editDraft.equipment,onChange:e=>setEditDraft(d=>({...d,equipment:e.target.value})),style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:46}},
            ['Barbell','Dumbbell','Machine','Cable','Smith Machine','Bodyweight','Kettlebell','Band','Other'].map(eq=>React.createElement('option',{key:eq,value:eq},eq))
          )
        )
      ),
      React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Rest Timer (seconds)'),
      React.createElement('div',{style:{display:'flex',gap:8,marginBottom:20,alignItems:'center'}},
        React.createElement('input',{type:'number',value:editDraft.restSec,onChange:e=>setEditDraft(d=>({...d,restSec:e.target.value})),style:{width:100,padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono,minHeight:46}}),
        React.createElement('div',{style:{fontSize:12,color:T.dim}},'seconds  ('+Math.floor(editDraft.restSec/60)+'m '+editDraft.restSec%60+'s)')
      ),
      React.createElement('div',{style:{display:'flex',gap:8}},
        [30,60,90,120,180,240].map(s=>React.createElement('button',{key:s,onClick:()=>setEditDraft(d=>({...d,restSec:s})),style:{flex:1,padding:'7px 4px',borderRadius:8,border:'1px solid '+(parseInt(editDraft.restSec)===s?accent:T.border2),background:parseInt(editDraft.restSec)===s?'rgba(124,58,237,0.2)':'rgba(255,255,255,0.03)',color:parseInt(editDraft.restSec)===s?'#a78bfa':T.muted,fontSize:11,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},s<60?s+'s':Math.floor(s/60)+'m'+(s%60?s%60+'s':'')))
      ),
      React.createElement('div',{style:{display:'flex',gap:10,marginTop:20}},
        React.createElement('button',{onClick:()=>{setEditingEx(null);setEditDraft(null);},style:{flex:1,padding:13,borderRadius:10,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:14,cursor:'pointer',minHeight:48}},'Cancel'),
        React.createElement('button',{onClick:saveEdit,style:{flex:2,padding:13,borderRadius:10,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,cursor:'pointer',minHeight:48,boxShadow:'0 8px 24px rgba(124,58,237,0.3)'}},'Save')
      )
    )
  );

  return React.createElement('div',{style:{paddingBottom:80,position:'relative'}},
    React.createElement('div',{style:{padding:'16px 16px 8px',position:'sticky',top:0,zIndex:5,background:T.bg,borderBottom:'1px solid '+T.border}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}},
        React.createElement('div',{style:{fontSize:22,fontWeight:800,color:T.text,letterSpacing:'-0.02em'}},'Exercises'),
        React.createElement('button',{onClick:()=>setCreatingNew(true),style:{padding:'8px 14px',borderRadius:10,border:'none',background:GRAD.button,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},'+ New')
      ),
      React.createElement('input',{type:'text',placeholder:'Search exercises...',value:search,onChange:e=>setSearch(e.target.value),style:{width:'100%',padding:'10px 14px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:10,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:44,marginBottom:10}}),
      React.createElement('div',{style:{display:'flex',gap:6,overflowX:'auto',scrollbarWidth:'none',paddingBottom:6}},
        bodyParts.map(bp=>React.createElement('button',{key:bp,onClick:()=>setBodyPartFilter(bp),style:{flexShrink:0,padding:'5px 12px',borderRadius:8,border:'1px solid '+(bodyPartFilter===bp?'#7c3aed80':'transparent'),background:bodyPartFilter===bp?'rgba(124,58,237,0.2)':'rgba(255,255,255,0.04)',color:bodyPartFilter===bp?'#a78bfa':T.dim,fontSize:12,fontWeight:bodyPartFilter===bp?700:400,cursor:'pointer',WebkitTapHighlightColor:'transparent',textTransform:'capitalize'}},bp==='all'?'Any Body Part':bp))
      ),
      React.createElement('div',{style:{display:'flex',gap:6,overflowX:'auto',scrollbarWidth:'none',paddingBottom:2}},
        equipTypes.map(eq=>React.createElement('button',{key:eq,onClick:()=>setEquipFilter(eq),style:{flexShrink:0,padding:'5px 12px',borderRadius:8,border:'1px solid '+(equipFilter===eq?'#14b8a680':'transparent'),background:equipFilter===eq?'rgba(20,184,166,0.15)':'rgba(255,255,255,0.04)',color:equipFilter===eq?'#5eead4':T.dim,fontSize:12,fontWeight:equipFilter===eq?700:400,cursor:'pointer',WebkitTapHighlightColor:'transparent',textTransform:'capitalize'}},eq==='all'?'Any Equipment':eq))
      )
    ),
    React.createElement('div',{ref:scrollRef,style:{padding:'8px 44px 8px 16px'}},
      React.createElement('div',{style:{fontSize:11,color:T.dim,marginBottom:8,fontFamily:T.mono}},filtered.length+' exercises'),
      letters.map(letter=>React.createElement('div',{key:letter,id:'exletter-'+letter},
        React.createElement('div',{style:{fontSize:13,fontWeight:800,color:T.dim,padding:'10px 0 4px'}},letter),
        byLetter[letter].map(ex=>{
          const restSec=restDefaults[ex.id]||restDefaults._default||120;
          const restLabel=Math.floor(restSec/60)+'m'+(restSec%60?restSec%60+'s':'');
          const tc=CAT[ex.category]||'#64748b';
          const best=getBestSet(ex.id);
          return React.createElement('div',{key:ex.id,style:{display:'flex',alignItems:'center',gap:12,padding:'13px 14px',marginBottom:6,background:T.bg2,borderRadius:10,border:'1px solid '+T.border}},
            React.createElement('div',{style:{width:3,borderRadius:2,alignSelf:'stretch',background:tc,flexShrink:0}}),
            React.createElement('div',{style:{flex:1,minWidth:0}},
              React.createElement('div',{style:{fontSize:14,fontWeight:600,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},ex.name),
              React.createElement('div',{style:{fontSize:10,color:T.dim,marginTop:1}},ex.bodyPart+' · '+ex.equipment)
            ),
            best&&React.createElement('div',{style:{fontSize:12,color:T.sub,fontFamily:T.mono,textAlign:'right',flexShrink:0}},
              best.weight>0?(best.weight+'lb \u00d7 '+best.reps):(best.reps+' reps')
            ),
            React.createElement('button',{onClick:()=>openEdit(ex),style:{padding:'7px 12px',borderRadius:8,border:'1px solid '+T.border2,background:'rgba(124,58,237,0.1)',color:'#a78bfa',fontSize:12,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent',minHeight:36,flexShrink:0}},'Edit')
          );
        })
      ))
    ),
    // A-Z jump list sidebar
    React.createElement('div',{style:{position:'fixed',right:4,top:'50%',transform:'translateY(-50%)',display:'flex',flexDirection:'column',alignItems:'center',zIndex:20}},
      allLetters.map(l=>React.createElement('div',{
        key:l,
        onClick:()=>letters.includes(l)&&jumpToLetter(l),
        style:{fontSize:9,fontWeight:700,color:letters.includes(l)?'#a78bfa':T.border2,padding:'1px 4px',cursor:letters.includes(l)?'pointer':'default',WebkitTapHighlightColor:'transparent'}
      },l))
    )
  );
}

function ActiveExBlock({ex,allLogs,setAllLogs,workout,restDefaults,handleSetLogged,handlePR,setSetsLogged,setVolumeLogged,restLabel,onMenu}){
  const prevLogs=allLogs[ex.id]||[];
  const bestE1rm=getBestE1rm(prevLogs);
  const lastSession=prevLogs.slice(-ex.sets);
  const[setData,setSetData]=useState(()=>Array.from({length:ex.sets},()=>({weight:'',reps:'',done:false,isPR:false})));
  const[editingSet,setEditingSet]=useState(null);
  const completedCount=setData.filter(s=>s.done).length;
  const pct=ex.sets>0?Math.round((completedCount/ex.sets)*100):0;
  const accent2=CAT[workout.category]||'#06b6d4';
  function updateSet(i,field,val){setSetData(d=>d.map((s,idx)=>idx===i?{...s,[field]:val}:s));}
  function logSet(i){
    const s=setData[i];const w=parseFloat(s.weight),r=parseInt(s.reps);if(!w||!r)return;
    const est=e1rm(w,r);const isPR=est>bestE1rm&&bestE1rm>0;
    const entry={date:new Date().toISOString(),weight:w,reps:r,e1rm:est};
    const next=[...(allLogs[ex.id]||[]),entry];
    saveLS('ppl-'+ex.id,next);pushExerciseLogs(ex.id,next);
    setSetData(d=>d.map((sd,idx)=>idx===i?{...sd,done:true,isPR}:sd));
    if(isPR)handlePR(ex.name,est);
    handleSetLogged(ex.id,ex.name);
    setSetsLogged(s=>s+1);setVolumeLogged(v=>v+(w*r||0));
  }
  function addSet(){
    const prev=lastSession[lastSession.length-1]||null;
    setSetData(d=>[...d,{weight:prev?String(prev.weight):'',reps:prev?String(prev.reps):'',done:false,isPR:false}]);
  }
  return React.createElement('div',{style:{marginBottom:2,background:T.bg2}},
    React.createElement('div',{style:{padding:'14px 16px 8px',display:'flex',alignItems:'center',gap:10}},
      React.createElement('div',{style:{flex:1}},
        React.createElement('div',{style:{fontSize:16,fontWeight:700,color:accent2}},ex.name),
        React.createElement('div',{style:{fontSize:12,color:T.muted,marginTop:2}},ex.sets+' sets  '+ex.reps+' reps')
      ),
      React.createElement('div',{style:{display:'flex',gap:8,alignItems:'center'}},
        React.createElement('div',{style:{fontSize:12,fontWeight:700,color:pct===100?T.green:T.muted,padding:'3px 8px',borderRadius:6,background:pct===100?'rgba(20,184,166,0.15)':'rgba(148,163,184,0.1)',border:'1px solid '+(pct===100?'rgba(20,184,166,0.3)':T.border)}},pct+'%'),
        React.createElement('button',{onClick:()=>onMenu&&onMenu(ex),style:{width:32,height:32,borderRadius:8,border:'1px solid '+T.border2,background:'rgba(255,255,255,0.04)',color:T.muted,fontSize:16,cursor:'pointer',WebkitTapHighlightColor:'transparent',lineHeight:1}},'...')
      )
    ),
    React.createElement('div',{style:{padding:'0 16px 4px'}},
      React.createElement('div',{style:{display:'flex',gap:4,marginBottom:4,paddingLeft:30}},
        React.createElement('div',{style:{width:28,fontSize:10,color:T.dim,fontWeight:600,fontFamily:T.mono}},'SET'),
        React.createElement('div',{style:{flex:1,fontSize:10,color:T.dim,fontWeight:600,fontFamily:T.mono,textAlign:'center'}},'PREVIOUS'),
        React.createElement('div',{style:{width:72,fontSize:10,color:T.dim,fontWeight:600,fontFamily:T.mono,textAlign:'center'}},'LBS'),
        React.createElement('div',{style:{width:60,fontSize:10,color:T.dim,fontWeight:600,fontFamily:T.mono,textAlign:'center'}},'REPS'),
        React.createElement('div',{style:{width:44,fontSize:10,color:T.dim,fontWeight:600,fontFamily:T.mono,textAlign:'center'}},'✓')
      ),
      setData.map((s,i)=>{
        const prev=lastSession[i]||null;
        return React.createElement(React.Fragment,{key:i},
          React.createElement('div',{style:{display:'flex',gap:4,alignItems:'center',marginBottom:0,opacity:s.done?0.45:1,paddingLeft:2}},
            React.createElement('div',{
  onClick:()=>{if(!s.done)setSetData(d=>d.map((sd,idx)=>idx===i?{...sd,type:sd.type==='normal'?'warmup':sd.type==='warmup'?'failure':'normal'}:sd));},
  title:'Tap to change: Normal → Warm-up → Failure',
  style:{width:26,height:26,borderRadius:8,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',cursor:s.done?'default':'pointer',WebkitTapHighlightColor:'transparent',
    background:s.type==='warmup'?'rgba(251,191,36,0.2)':s.type==='failure'?'rgba(239,68,68,0.2)':s.done?'rgba(20,184,166,0.2)':'rgba(148,163,184,0.1)',
    border:'1px solid '+(s.type==='warmup'?'rgba(251,191,36,0.4)':s.type==='failure'?'rgba(239,68,68,0.4)':'transparent'),
    fontFamily:T.mono,fontSize:s.type==='warmup'||s.type==='failure'?10:12,
    color:s.type==='warmup'?'#fbbf24':s.type==='failure'?'#f87171':s.done?T.green:T.muted,fontWeight:700}
},s.type==='warmup'?'W':s.type==='failure'?'F':i+1),
            React.createElement('div',{style:{flex:1,fontSize:12,color:T.dim,fontFamily:T.mono,textAlign:'center',padding:'0 4px'}},prev?(prev.weight+' lb × '+prev.reps):'  '),
            React.createElement('input',{type:'number',inputMode:'decimal',placeholder:prev?String(prev.weight):'lb',value:s.weight,onChange:e=>updateSet(i,'weight',e.target.value),disabled:s.done&&editingSet!==i,style:{width:72,padding:'9px 8px',background:s.done&&editingSet!==i?'transparent':T.bg3,border:'1px solid '+(s.done&&editingSet!==i?'transparent':editingSet===i?'#7c3aed':T.border2),borderRadius:8,color:s.done&&editingSet!==i?'#5eead4':T.text,fontSize:15,fontFamily:T.mono,textAlign:'center',minHeight:44}}),
            React.createElement('input',{type:'number',inputMode:'numeric',placeholder:prev?String(prev.reps):'reps',value:s.reps,onChange:e=>updateSet(i,'reps',e.target.value),disabled:s.done&&editingSet!==i,style:{width:60,padding:'9px 6px',background:s.done&&editingSet!==i?'transparent':T.bg3,border:'1px solid '+(s.done&&editingSet!==i?'transparent':editingSet===i?'#7c3aed':T.border2),borderRadius:8,color:s.done&&editingSet!==i?'#5eead4':T.text,fontSize:15,fontFamily:T.mono,textAlign:'center',minHeight:44}}),
            React.createElement('div',{style:{width:44,display:'flex',alignItems:'center',justifyContent:'center'}},
              s.done&&s.isPR?React.createElement('div',{style:{fontSize:16}},'🏆'):
              React.createElement('button',{onClick:()=>()=>s.done?setEditingSet(editingSet===i?null:i):logSet(i),disabled:!s.done&&(!s.weight||!s.reps),style:{width:40,height:44,borderRadius:8,border:'none',background:s.done?(editingSet===i?'rgba(124,58,237,0.4)':'rgba(20,184,166,0.12)'):'rgba(124,58,237,0.4)',color:s.done?'#5eead4':'#c4b5fd',fontSize:18,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},s.done?'✓':'→')
            )
          ),
          i<setData.length-1&&React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,padding:'3px 0',marginLeft:2}},
            React.createElement('div',{style:{flex:1,height:'1px',background:T.border}}),
            React.createElement('div',{style:{fontSize:11,color:'#3b82f6',fontWeight:600,fontFamily:T.mono}},restLabel),
            React.createElement('div',{style:{flex:1,height:'1px',background:T.border}})
          )
        );
      }),
      React.createElement('button',{onClick:addSet,style:{width:'100%',marginTop:8,padding:'10px',borderRadius:10,border:'none',background:'rgba(30,41,59,0.8)',color:'#3b82f6',fontSize:13,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent',minHeight:42}},
        '+ Add Set ('+restLabel+')'
      )
    )
  );
}


function ExerciseMenu({ex,exIdx,restDefaults,workouts,onAddSet,onRemoveSet,onDelete,onSwap,onSetRest,onClose}){
  const[mode,setMode]=useState('menu'); // menu | swap | rest
  const[swapSearch,setSwapSearch]=useState('');
  const[restVal,setRestVal]=useState(String(restDefaults[ex.id]||restDefaults._default||120));

  const exLib={};
  Object.values(workouts).forEach(w=>{(w.exercises||[]).forEach(e=>{if(!exLib[e.id])exLib[e.id]=e;});});
  const swapList=Object.values(exLib).filter(e=>e.id!==ex.id&&(!swapSearch||e.name.toLowerCase().includes(swapSearch.toLowerCase()))).sort((a,b)=>a.name.localeCompare(b.name));

  const curRest=restDefaults[ex.id]||restDefaults._default||120;

  if(mode==='swap')return React.createElement('div',{style:{position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,0.95)',backdropFilter:'blur(8px)',display:'flex',flexDirection:'column'}},
    React.createElement('div',{style:{padding:'14px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid '+T.border}},
      React.createElement('button',{onClick:()=>setMode('menu'),style:{width:40,height:40,borderRadius:8,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:20,cursor:'pointer'}},'<'),
      React.createElement('div',{style:{fontSize:16,fontWeight:700,color:T.text}},'Swap: '+ex.name)
    ),
    React.createElement('div',{style:{padding:'12px 16px'}},
      React.createElement('input',{type:'text',placeholder:'Search exercises...',value:swapSearch,onChange:e=>setSwapSearch(e.target.value),autoFocus:true,style:{width:'100%',padding:'10px 14px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:10,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:44}})
    ),
    React.createElement('div',{style:{flex:1,overflowY:'auto',padding:'0 16px 80px'}},
      swapList.map(e=>React.createElement('div',{key:e.id,onClick:()=>{onSwap(exIdx,e);onClose();},style:{padding:'13px 14px',marginBottom:6,background:T.bg2,borderRadius:10,border:'1px solid '+T.border,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},
        React.createElement('div',{style:{fontSize:14,fontWeight:600,color:T.text}},e.name)
      ))
    )
  );

  if(mode==='rest')return React.createElement('div',{style:{position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,0.95)',backdropFilter:'blur(8px)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24}},
    React.createElement('div',{style:{width:'100%',maxWidth:360,background:T.bg2,borderRadius:16,padding:24,border:'1px solid '+T.border}},
      React.createElement('div',{style:{fontSize:16,fontWeight:700,color:T.text,marginBottom:4}},'Rest Timer'),
      React.createElement('div',{style:{fontSize:12,color:T.dim,marginBottom:16}},ex.name),
      React.createElement('div',{style:{fontSize:13,color:T.sub,marginBottom:8}},'Current: '+Math.floor(curRest/60)+'m'+(curRest%60?curRest%60+'s':'')),
      React.createElement('div',{style:{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}},
        [30,45,60,90,120,150,180,240,300].map(s=>React.createElement('button',{key:s,onClick:()=>setRestVal(String(s)),style:{padding:'8px 12px',borderRadius:8,border:'1px solid '+(parseInt(restVal)===s?'#7c3aed':T.border2),background:parseInt(restVal)===s?'rgba(124,58,237,0.2)':'rgba(255,255,255,0.03)',color:parseInt(restVal)===s?'#a78bfa':T.muted,fontSize:12,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},s<60?s+'s':Math.floor(s/60)+'m'+(s%60?s%60+'s':'')))
      ),
      React.createElement('input',{type:'number',value:restVal,onChange:e=>setRestVal(e.target.value),style:{width:'100%',padding:'10px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono,minHeight:46,marginBottom:16}}),
      React.createElement('div',{style:{display:'flex',gap:10}},
        React.createElement('button',{onClick:()=>setMode('menu'),style:{flex:1,padding:12,borderRadius:10,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:14,cursor:'pointer'}},'Cancel'),
        React.createElement('button',{onClick:()=>{onSetRest(ex.id,parseInt(restVal)||120);onClose();},style:{flex:2,padding:12,borderRadius:10,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer'}},'Save')
      )
    )
  );

  // Main menu
  return React.createElement('div',{style:{position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)',display:'flex',flexDirection:'column',justifyContent:'flex-end'},onClick:onClose},
    React.createElement('div',{style:{background:T.bg2,borderRadius:'20px 20px 0 0',padding:'8px 16px 40px'},onClick:e=>e.stopPropagation()},
      React.createElement('div',{style:{width:40,height:4,borderRadius:2,background:T.border2,margin:'8px auto 20px'}}),
      React.createElement('div',{style:{fontSize:14,fontWeight:700,color:T.text,marginBottom:16,textAlign:'center'}},ex.name),
      [
        ['+1 Set',()=>{onAddSet(exIdx);onClose();},'rgba(124,58,237,0.15)','#a78bfa'],
        [ex.sets>1?'-1 Set ('+ex.sets+' now)':'-1 Set (min 1)','ex.sets>1',()=>{onRemoveSet(exIdx);onClose();},'rgba(148,163,184,0.1)',T.sub],
        ['Change Rest ('+Math.floor(curRest/60)+'m'+(curRest%60?curRest%60+'s':'')+')',()=>setMode('rest'),'rgba(20,184,166,0.1)','#5eead4'],
        ['Swap Exercise',()=>setMode('swap'),'rgba(251,191,36,0.1)','#fbbf24'],
        ['Remove Exercise',()=>{onDelete(exIdx);onClose();},'rgba(239,68,68,0.1)','#f87171'],
      ].map(([label,action,bg,color],i)=>{
        if(label.startsWith('-1 Set')&&ex.sets<=1)return React.createElement('div',{key:i,style:{padding:'14px 16px',marginBottom:8,borderRadius:12,background:'rgba(148,163,184,0.05)',color:T.dim,fontSize:15,opacity:0.4}},label);
        return React.createElement('button',{key:i,onClick:typeof action==='function'?action:undefined,style:{width:'100%',padding:'14px 16px',marginBottom:8,borderRadius:12,border:'none',background:bg,color,fontSize:15,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent',textAlign:'left'}},label);
      })
    )
  );
}

function PPLTracker(){
  const[workouts,setWorkoutsRaw]=useState(()=>{
    const stored=loadLS('fitlog_workouts',null);
    // Always merge defaults into whatever is stored (or use defaults if nothing stored)
    const merged={...(stored||{})};
    Object.entries(DEFAULT_WORKOUTS).forEach(([k,w])=>{merged[k]=w;});
    // Save merged result back to localStorage immediately
    saveLS('fitlog_workouts',merged);
    return merged;
  });
  const[schedule,setScheduleRaw]=useState(()=>{const s=loadLS('fitlog_schedule',null);return Array.isArray(s)&&s.length>0?s:DEFAULT_SCHEDULE;});
  const[restDefaults,setRestDefaultsRaw]=useState(loadRestDefaults);
  const[allLogs,setAllLogs]=useState({});
  const[wKey,setWKey]=useState(()=>{
    const s=loadLS('fitlog_schedule',null);
    const sched=Array.isArray(s)&&s.length>0?s:DEFAULT_SCHEDULE;
    const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const today=days[new Date().getDay()];
    const todayItem=sched.find(x=>x.day===today);
    return(todayItem&&todayItem.workoutKey)||'pm_push';
  });
  const[tab,setTab]=useState('workout');
  const[activeWorkout,setActiveWorkout]=useState(false);
  const[activeTimer,setActiveTimer]=useState(null);
  const[editingSchedule,setEditingSchedule]=useState(false);
  const[editingSettings,setEditingSettings]=useState(false);
  const[summary,setSummary]=useState(null);
  const[elapsedSec,setElapsedSec]=useState(0);
  const[prs,setPrs]=useState([]);
  const[setsLogged,setSetsLogged]=useState(0);
  const[volumeLogged,setVolumeLogged]=useState(0);
  const[importResult,setImportResult]=useState(null);
  const[pendingImport,setPendingImport]=useState(null); // {parsed, stats}
  const[showPrograms,setShowPrograms]=useState(false);
  const[midWorkoutAddEx,setMidWorkoutAddEx]=useState(false);
  const[saveAsNewRoutine,setSaveAsNewRoutine]=useState(false);
  const[newRoutineName,setNewRoutineName]=useState('');
  const[activeExercises,setActiveExercises]=useState(null); // null = use workout.exercises
  const[exMenu,setExMenu]=useState(null); // {exIdx, ex}
  const[headerMenu,setHeaderMenu]=useState(false);
  const[swapTarget,setSwapTarget]=useState(null); // exIdx being swapped

  function getActiveExercises(){return activeExercises||workout.exercises;}
  function addSetToEx(exIdx){setActiveExercises(prev=>{const exs=[...(prev||workout.exercises)];exs[exIdx]={...exs[exIdx],sets:exs[exIdx].sets+1};return exs;});}
  function removeSetFromEx(exIdx){setActiveExercises(prev=>{const exs=[...(prev||workout.exercises)];if(exs[exIdx].sets<=1)return exs;exs[exIdx]={...exs[exIdx],sets:exs[exIdx].sets-1};return exs;});}
  function deleteEx(exIdx){setActiveExercises(prev=>{const exs=[...(prev||workout.exercises)];exs.splice(exIdx,1);return exs;});}
  function swapEx(exIdx,newEx){setActiveExercises(prev=>{const exs=[...(prev||workout.exercises)];exs[exIdx]={...newEx,sets:exs[exIdx].sets,reps:exs[exIdx].reps};return exs;});setSwapTarget(null);}
  function setExRestTimer(exId,secs){setRestDefaults(d=>({...d,[exId]:secs}));}
  const[midSelExId,setMidSelExId]=useState('');
  const[midCustomName,setMidCustomName]=useState('');
  const[midSets,setMidSets]=useState([{weight:'',reps:''}]);
  const[workoutsLoaded,setWorkoutsLoaded]=useState(false);
  const wakeLock=useWakeLock();
  const importRef=useRef(null);
  const elapsedWorkerRef=useRef(null);
  const workoutStartTimeRef=useRef(null);
  const visHandlerRef=useRef(null);
  const currentSessionId=useRef(null);

  function setWorkouts(w){setWorkoutsRaw(w);saveLS('fitlog_workouts',w);saveServerWorkouts(w);}
  function setSchedule(w){setScheduleRaw(w);saveLS('fitlog_schedule',w);}
  function setRestDefaults(d){setRestDefaultsRaw(d);saveLS('fitlog_rest_defaults',d);}
  function handleReorder(newOrder){saveLS('fitlog_routine_order',newOrder);}
  function handleArchive(key){setWorkouts({...workouts,[key]:{...workouts[key],archived:true}});}
  function handleUnarchive(key){setWorkouts({...workouts,[key]:{...workouts[key],archived:false}});}

  useEffect(()=>{
    fetchAllLogs().then(data=>setAllLogs(data)).catch(()=>{});
    fetchServerWorkouts().then(data=>{
      const base=data&&Object.keys(data).length>0?data:{};
      // Always inject ALL default workouts
      const merged={...base};
      Object.entries(DEFAULT_WORKOUTS).forEach(([k,w])=>{merged[k]=w;});
      setWorkoutsRaw(merged);
      saveLS('fitlog_workouts',merged);
      // Always save back to server (creates record if empty, updates if stale)
      saveServerWorkouts(merged);
      setWorkoutsLoaded(true);
    }).catch(()=>setWorkoutsLoaded(true));
  },[]);

  function startWorkout(){
    setElapsedSec(0);setPrs([]);setSetsLogged(0);setVolumeLogged(0);setActiveTimer(null);setActiveExercises(null);
    currentSessionId.current='session_'+Date.now();
    workoutStartTimeRef.current=Date.now();
    setActiveWorkout(true);initPush();
    function elapsedTick(){
      if(!workoutStartTimeRef.current)return;
      setElapsedSec(Math.floor((Date.now()-workoutStartTimeRef.current)/1000));
      elapsedWorkerRef.current=setTimeout(elapsedTick,1000);
    }
    elapsedTick();
    function onVis(){
      if(!document.hidden&&workoutStartTimeRef.current){
        clearTimeout(elapsedWorkerRef.current);
        elapsedTick();
      }
    }
    document.addEventListener('visibilitychange',onVis);
    visHandlerRef.current=onVis;
  }
  function stopElapsedTimer(){
    clearTimeout(elapsedWorkerRef.current);
    elapsedWorkerRef.current=null;
    workoutStartTimeRef.current=null;
    if(visHandlerRef.current){document.removeEventListener('visibilitychange',visHandlerRef.current);visHandlerRef.current=null;}
  }
  function finishWorkout(){stopElapsedTimer();setActiveTimer(null);setActiveWorkout(false);setSummary({workout:workouts[wKey],duration:elapsedSec,prs,setsLogged,volumeLogged});}
  function handleSetLogged(exId,exName){
    const secs=getRestDuration(exId,restDefaults);
    setActiveTimer({exerciseId:exId,exerciseName:exName,seconds:secs});
    schedulePushTimer(secs,exName);
  }
  function handlePR(exName,est){setPrs(p=>[...p,exName+' — '+est+'lb e1RM']);}
  function handleUpdateLog(exId,oldEntry,newValues){const logs=[...(allLogs[exId]||[])];const idx=logs.findIndex(l=>l.date===oldEntry.date&&l.weight===oldEntry.weight&&l.reps===oldEntry.reps);if(idx<0)return;logs[idx]={...logs[idx],...newValues};const updated={...allLogs,[exId]:logs};setAllLogs(updated);saveLS('ppl-'+exId,logs);pushExerciseLogs(exId,logs);}
  function handleDeleteSet(exId,entry){const logs=(allLogs[exId]||[]).filter(l=>!(l.date===entry.date&&l.weight===entry.weight&&l.reps===entry.reps));const updated={...allLogs,[exId]:logs};setAllLogs(updated);saveLS('ppl-'+exId,logs);pushExerciseLogs(exId,logs);}
  function handleDeleteSession(session){const updated={...allLogs};session.sets.forEach(s=>{if(!updated[s.exId])return;updated[s.exId]=updated[s.exId].filter(l=>!(l.date===s.date&&l.weight===s.weight&&l.reps===s.reps));saveLS('ppl-'+s.exId,updated[s.exId]);pushExerciseLogs(s.exId,updated[s.exId]);});setAllLogs({...updated});}
  function handleAddExercise(exId,exName,sets,sessionDate,isCustomEx){
    const existing=allLogs[exId]||[];
    const newEntries=sets.map((s,i)=>({date:new Date(new Date(sessionDate).getTime()+i*1000).toISOString(),weight:parseFloat(s.weight),reps:parseInt(s.reps),e1rm:e1rm(parseFloat(s.weight),parseInt(s.reps)),exName}));
    const merged=[...existing,...newEntries].sort((a,b)=>new Date(a.date)-new Date(b.date));
    const updated={...allLogs,[exId]:merged};setAllLogs(updated);saveLS('ppl-'+exId,merged);pushExerciseLogs(exId,merged);
    if(isCustomEx){const names=loadLS('fitlog_custom_ex_names',{});names[exId]=exName;saveLS('fitlog_custom_ex_names',names);const existing_w=loadLS('fitlog_workouts',null)||DEFAULT_WORKOUTS;const customW=existing_w['custom_exercises']||{label:'Custom',tag:'Custom',category:'pull',note:'Custom exercises',exercises:[]};if(!customW.exercises.find(e=>e.id===exId)){customW.exercises=[...customW.exercises,{id:exId,name:exName,sets:sets.length,reps:'--'}];setWorkouts({...workouts,custom_exercises:customW});}}
  }
  function handleExportLogs(){const blob=new Blob([JSON.stringify(allLogs,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='fitlog-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(url);}
  function confirmImport(importLogs, importRoutines){
    if(!pendingImport)return;
    const{parsed}=pendingImport;
    if(importLogs){
      const mergedLogs={...allLogs};
      Object.entries(parsed.logs).forEach(([id,entries])=>{
        const existing=mergedLogs[id]||[];
        const seen=new Set(existing.map(l=>l.date+'|'+l.weight+'|'+l.reps));
        const newEntries=entries.filter(l=>!seen.has(l.date+'|'+l.weight+'|'+l.reps));
        mergedLogs[id]=[...existing,...newEntries].sort((a,b)=>new Date(a.date)-new Date(b.date));
      });
      Object.entries(mergedLogs).forEach(([id,entries])=>{saveLS('ppl-'+id,entries);pushExerciseLogs(id,entries);});
      setAllLogs(mergedLogs);
    }
    if(importRoutines){
      const mergedWorkouts={...workouts};
      Object.entries(parsed.workouts).forEach(([key,w])=>{
        if(PROTECTED_KEYS.has(key))return;
        if(!mergedWorkouts[key])mergedWorkouts[key]=w;
      });
      setWorkouts(mergedWorkouts);
    }
    const parts=[];
    if(importLogs)parts.push(parsed.stats.totalSets+' sets of history');
    if(importRoutines)parts.push(pendingImport.newRoutines+' new routines');
    setImportResult({type:'strong',message:'Imported: '+parts.join(' + ')+'.'});
    setPendingImport(null);
  }

  function handleExportCSV(){
    const rows=['Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE'];
    const sessions=buildSessions(allLogs,workouts);
    sessions.slice().reverse().forEach(session=>{const durMs=session.duration||0;const durStr=Math.floor(durMs/60000)+'m';session.sets.forEach((s,i)=>{rows.push([new Date(s.date).toISOString().replace('T',' ').slice(0,19),'"'+session.workoutLabel+'"',durStr,'"'+(s.exName||s.exId)+'"',i+1,s.weight||0,s.reps||0,0,0,'','',''].join(','));});});
    const blob=new Blob([rows.join('\n')],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='fitlog-'+new Date().toISOString().slice(0,10)+'.csv';a.click();URL.revokeObjectURL(url);
  }
  function handleImportFile(e){
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const text=ev.target.result;
      try{const data=JSON.parse(text);if(data.exercises)setWorkouts({...workouts,['custom_'+Date.now()]:data});else setWorkouts({...workouts,...data});setImportResult({type:'json',message:'FitLog routine imported.'});return;}catch{}
      const parsed=parseStrongCSV(text);
      if(!parsed){setImportResult({type:'error',message:'Unrecognised file format.'});return;}
      // Show confirmation dialog instead of importing immediately
      const newRoutines=Object.keys(parsed.workouts).filter(k=>!PROTECTED_KEYS.has(k)&&!workouts[k]).length;
      const newSets=Object.values(parsed.logs).reduce((t,e)=>t+e.length,0);
      setPendingImport({parsed,newRoutines,newSets,newExercises:parsed.stats.totalExercises});
    };
    reader.readAsText(file);e.target.value='';
  }

  const workout=workouts[wKey];
  const accent=CAT[workout?.category]||'#06b6d4';
  const elMins=String(Math.floor(elapsedSec/60)).padStart(2,'0'),elSecs=String(elapsedSec%60).padStart(2,'0');
  const restSecs=activeTimer?activeTimer.seconds:120;
  const restLabel=Math.floor(restSecs/60)+':'+(restSecs%60<10?'0':'')+restSecs%60;

  const TabBar=()=>React.createElement('div',{style:{position:'fixed',bottom:0,left:0,right:0,zIndex:50,background:T.bg4,borderTop:'1px solid '+T.border,display:'flex',height:T.tabH,maxWidth:680,margin:'0 auto'}},
    [['workout','💪','Workout'],['routines','📖','Routines'],['history','📋','History'],['exercises','🏋️','Exercises'],['schedule','📅','Schedule'],['settings','⚙️','Settings']].map(([t,icon,label])=>
      React.createElement('button',{key:t,onClick:()=>setTab(t),style:{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,border:'none',background:'transparent',color:tab===t?accent:T.dim,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},
        React.createElement('div',{style:{fontSize:20,lineHeight:1}},icon),
        React.createElement('div',{style:{fontSize:10,fontWeight:tab===t?700:400}},label)
      )
    )
  );

  if(summary)return React.createElement(WorkoutSummary,{...summary,onClose:()=>setSummary(null)});

  // ── ACTIVE WORKOUT SCREEN ─────────────────────────────────────────────────
  if(activeWorkout){

    
    return React.createElement('div',{style:{minHeight:'100vh',background:T.bg,color:T.text,fontFamily:T.sans,maxWidth:680,margin:'0 auto',paddingBottom:120,WebkitOverflowScrolling:'touch'}},
      React.createElement('div',{style:{position:'static',background:T.bg,borderBottom:'1px solid '+T.border,padding:'calc(env(safe-area-inset-top) + 10px) 16px 10px',display:'flex',alignItems:'center',gap:10}},
        React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:20,background:'rgba(59,130,246,0.2)',border:'1px solid rgba(59,130,246,0.4)',flexShrink:0}},
          React.createElement('div',{style:{fontSize:14}},'⏱'),
          React.createElement('div',{style:{fontFamily:T.mono,fontSize:14,fontWeight:700,color:'#3b82f6'}},activeTimer?(String(Math.floor((activeTimer.seconds||0)/60)).padStart(2,'0')+':'+String((activeTimer.seconds||0)%60).padStart(2,'0')):'0:00')
        ),
        React.createElement('div',{style:{flex:1,textAlign:'center',fontFamily:T.mono,fontSize:16,fontWeight:700,color:T.sub}},elMins+':'+elSecs),
        React.createElement('button',{onClick:()=>setHeaderMenu(m=>!m),style:{width:36,height:36,borderRadius:10,border:'1px solid '+T.border2,background:'rgba(255,255,255,0.04)',color:T.muted,fontSize:16,cursor:'pointer',WebkitTapHighlightColor:'transparent',flexShrink:0,lineHeight:1}},'⋯'),
        React.createElement('button',{onClick:finishWorkout,style:{padding:'9px 18px',borderRadius:20,border:'none',background:'#22c55e',color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',WebkitTapHighlightColor:'transparent',minHeight:40,flexShrink:0}},'✓ Finish')
      ),
      headerMenu&&React.createElement('div',{onClick:()=>setHeaderMenu(false),style:{position:'fixed',inset:0,zIndex:400,background:'rgba(0,0,0,0.5)'}},
        React.createElement('div',{onClick:e=>e.stopPropagation(),style:{position:'absolute',top:'calc(env(safe-area-inset-top) + 56px)',right:16,background:T.bg2,borderRadius:12,border:'1px solid '+T.border,minWidth:180,overflow:'hidden',boxShadow:'0 8px 30px rgba(0,0,0,0.5)'}},
          React.createElement('button',{onClick:()=>{wakeLock.toggle();setHeaderMenu(false);},style:{width:'100%',padding:'12px 16px',border:'none',background:'transparent',color:wakeLock.active?'#5eead4':T.sub,fontSize:14,fontWeight:600,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:8}},(wakeLock.active?'🔒':'🔓')+'  Keep Screen On'),
          React.createElement('button',{onClick:()=>{setSaveAsNewRoutine(true);setHeaderMenu(false);},style:{width:'100%',padding:'12px 16px',border:'none',background:'transparent',color:'#5eead4',fontSize:14,fontWeight:600,cursor:'pointer',textAlign:'left',borderTop:'1px solid '+T.border}},'💾  Save as New Routine')
        )
      ),
      React.createElement('div',{style:{padding:'10px 16px 4px',display:'flex',alignItems:'center',gap:8,background:T.bg}},
        React.createElement('button',{onClick:()=>{stopElapsedTimer();setActiveWorkout(false);},style:{width:36,height:36,borderRadius:8,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:18,cursor:'pointer',WebkitTapHighlightColor:'transparent',lineHeight:1,flexShrink:0}},'<'),
        React.createElement('div',{style:{flex:1,fontSize:15,fontWeight:600,color:T.text}},workout.label),
        React.createElement('div',{style:{fontFamily:T.mono,fontSize:12,color:T.muted}},setsLogged+' sets  '+fmtVol(volumeLogged)+'lb')
      ),
      (()=>{
        const totalSets=getActiveExercises().reduce((t,ex)=>t+ex.sets,0);
        const pct=totalSets>0?Math.min(100,Math.round((setsLogged/totalSets)*100)):0;
        return React.createElement('div',{style:{padding:'0 16px 10px'}},
          React.createElement('div',{style:{height:5,borderRadius:3,background:'rgba(148,163,184,0.12)',overflow:'hidden'}},
            React.createElement('div',{style:{height:'100%',width:pct+'%',background:GRAD.button,borderRadius:3,transition:'width 0.4s ease'}})
          )
        );
      })(),
      React.createElement('div',null,getActiveExercises().map((ex,exIdx)=>React.createElement(ActiveExBlock,{key:wKey+'-'+ex.id+'-'+exIdx,ex,allLogs,setAllLogs,workout,restDefaults,handleSetLogged,handlePR,setSetsLogged,setVolumeLogged,restLabel,onMenu:(ex)=>setExMenu({ex,exIdx})}))),
      exMenu&&React.createElement(ExerciseMenu,{ex:exMenu.ex,exIdx:exMenu.exIdx,restDefaults,workouts,onAddSet:addSetToEx,onRemoveSet:removeSetFromEx,onDelete:deleteEx,onSwap:swapEx,onSetRest:setExRestTimer,onClose:()=>setExMenu(null)}),
      React.createElement('div',{style:{padding:'16px',display:'flex',flexDirection:'column',gap:10}},
        !midWorkoutAddEx?React.createElement('button',{onClick:()=>setMidWorkoutAddEx(true),style:{width:'100%',padding:16,borderRadius:12,border:'none',background:'rgba(59,130,246,0.15)',color:'#3b82f6',fontWeight:700,fontSize:16,cursor:'pointer',minHeight:54,WebkitTapHighlightColor:'transparent'}},'Add Exercises')
        :React.createElement('div',{style:{background:T.bg2,borderRadius:14,border:'1px solid '+T.border2,padding:16}},
          React.createElement('div',{style:{fontSize:15,fontWeight:700,color:T.text,marginBottom:12}},'Add Exercise'),
          React.createElement('select',{value:midSelExId,onChange:e=>{setMidSelExId(e.target.value);setMidCustomName('');},style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:midSelExId?T.text:T.dim,fontSize:14,fontFamily:T.mono,minHeight:46,marginBottom:midSelExId==='__custom__'?8:12}},
            React.createElement('option',{value:''},'-- Pick exercise --'),
            React.createElement('option',{value:'__custom__'},'+ Custom / free text...'),
            React.createElement('option',{disabled:true,value:''},'──────────────'),
            Object.values(workouts).flatMap(w=>w.exercises||[]).filter((e,i,a)=>a.findIndex(x=>x.id===e.id)===i).map(e=>React.createElement('option',{key:e.id,value:e.id},e.name))
          ),
          midSelExId==='__custom__'&&React.createElement('input',{type:'text',placeholder:'Exercise name...',value:midCustomName,onChange:e=>setMidCustomName(e.target.value),style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:46,marginBottom:12}}),
          midSets.map((s,i)=>React.createElement('div',{key:i,style:{display:'flex',gap:8,alignItems:'center',marginBottom:8}},
            React.createElement('div',{style:{fontFamily:T.mono,fontSize:12,color:T.dim,width:18,flexShrink:0}},i+1),
            React.createElement('input',{type:'number',inputMode:'decimal',placeholder:'lb',value:s.weight,onChange:e=>setMidSets(ss=>ss.map((x,idx)=>idx===i?{...x,weight:e.target.value}:x)),style:{width:70,padding:'8px 10px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:44}}),
            React.createElement('input',{type:'number',inputMode:'numeric',placeholder:'reps',value:s.reps,onChange:e=>setMidSets(ss=>ss.map((x,idx)=>idx===i?{...x,reps:e.target.value}:x)),style:{width:60,padding:'8px 10px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,minHeight:44}}),
            midSets.length>1&&React.createElement('button',{onClick:()=>setMidSets(ss=>ss.filter((_,idx)=>idx!==i)),style:{background:'rgba(239,68,68,0.1)',border:'none',color:'#f87171',borderRadius:6,padding:'5px 10px',fontSize:13,cursor:'pointer',minHeight:36}},'X')
          )),
          React.createElement('button',{onClick:()=>setMidSets(ss=>[...ss,{weight:'',reps:''}]),style:{width:'100%',padding:8,borderRadius:8,border:'1px dashed '+T.border2,background:'transparent',color:T.muted,fontSize:13,cursor:'pointer',marginBottom:12,WebkitTapHighlightColor:'transparent'}},'+ Set'),
          React.createElement('div',{style:{display:'flex',gap:10}},
            React.createElement('button',{onClick:()=>{setMidWorkoutAddEx(false);setMidSelExId('');setMidCustomName('');setMidSets([{weight:'',reps:''}]);},style:{flex:1,padding:12,borderRadius:10,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:14,cursor:'pointer',minHeight:46}},'Cancel'),
            React.createElement('button',{
              disabled:!midSelExId||(midSelExId==='__custom__'&&!midCustomName.trim())||!midSets.some(s=>s.weight&&s.reps),
              onClick:()=>{
                const isCustomEx=midSelExId==='__custom__';
                const exName=isCustomEx?midCustomName.trim():(Object.values(workouts).flatMap(w=>w.exercises||[]).find(e=>e.id===midSelExId)||{name:midSelExId}).name;
                const exId=isCustomEx?('custom_'+exName.toLowerCase().replace(/[^a-z0-9]+/g,'_')):midSelExId;
                const validSets=midSets.filter(s=>parseFloat(s.weight)&&parseInt(s.reps));
                const now=new Date();
                const entries=validSets.map((s,i)=>({date:new Date(now.getTime()+i*1000).toISOString(),weight:parseFloat(s.weight),reps:parseInt(s.reps),e1rm:e1rm(parseFloat(s.weight),parseInt(s.reps)),exName}));
                const existing=allLogs[exId]||[];const merged=[...existing,...entries].sort((a,b)=>new Date(a.date)-new Date(b.date));
                const updated={...allLogs,[exId]:merged};setAllLogs(updated);saveLS('ppl-'+exId,merged);pushExerciseLogs(exId,merged);
                setSetsLogged(s=>s+validSets.length);setVolumeLogged(v=>v+validSets.reduce((t,s)=>t+(parseFloat(s.weight)*parseInt(s.reps)||0),0));
                // Add this exercise to the active workout's exercise list so it shows for remaining sets
                setActiveExercises(prev=>{
                  const exs=[...(prev||workout.exercises)];
                  if(!exs.find(e=>e.id===exId)){
                    exs.push({id:exId,name:exName,sets:validSets.length,reps:validSets.length+' logged'});
                  }
                  return exs;
                });
                // Save to the underlying routine permanently
                const routineExs=workouts[wKey].exercises||[];
                if(!routineExs.find(e=>e.id===exId)){
                  const updatedWorkout={...workouts[wKey],exercises:[...routineExs,{id:exId,name:exName,sets:validSets.length||3,reps:'8-12'}]};
                  setWorkouts({...workouts,[wKey]:updatedWorkout});
                }
                if(isCustomEx){
                  const names=loadLS('fitlog_custom_ex_names',{});names[exId]=exName;saveLS('fitlog_custom_ex_names',names);
                }
                setMidWorkoutAddEx(false);setMidSelExId('');setMidCustomName('');setMidSets([{weight:'',reps:''}]);
              },
              style:{flex:2,padding:12,borderRadius:10,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',minHeight:46}
            },'Log Sets')
          )
        ),
        React.createElement('button',{onClick:()=>{if(window.confirm('Cancel workout? Progress will not be saved.')){stopElapsedTimer();setActiveTimer(null);setActiveWorkout(false);}},style:{width:'100%',padding:14,borderRadius:12,border:'none',background:'transparent',color:'#f87171',fontWeight:600,fontSize:15,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},'Cancel Workout'),
      saveAsNewRoutine&&React.createElement('div',{style:{position:'fixed',inset:0,zIndex:600,background:'rgba(0,0,0,0.95)',backdropFilter:'blur(8px)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24}},
        React.createElement('div',{style:{width:'100%',maxWidth:400,background:T.bg2,borderRadius:16,padding:24,border:'1px solid '+T.border}},
          React.createElement('div',{style:{fontSize:17,fontWeight:700,color:T.text,marginBottom:4}},'Save as New Routine'),
          React.createElement('div',{style:{fontSize:12,color:T.dim,marginBottom:16}},getActiveExercises().length+' exercises'),
          React.createElement('label',{style:{fontSize:12,color:T.sub,fontWeight:600,display:'block',marginBottom:6}},'Routine Name'),
          React.createElement('input',{type:'text',value:newRoutineName,onChange:e=>setNewRoutineName(e.target.value),autoFocus:true,placeholder:workout.label+' (modified)',style:{width:'100%',padding:'11px 12px',background:T.bg3,border:'1px solid '+T.border2,borderRadius:8,color:T.text,fontSize:15,fontFamily:T.mono,marginBottom:20,minHeight:46}}),
          React.createElement('div',{style:{display:'flex',gap:10}},
            React.createElement('button',{onClick:()=>{setSaveAsNewRoutine(false);setNewRoutineName('');},style:{flex:1,padding:12,borderRadius:10,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:14,cursor:'pointer',minHeight:46}},'Cancel'),
            React.createElement('button',{onClick:()=>{
              const name=newRoutineName.trim()||(workout.label+' (modified)');
              const key='custom_'+Date.now();
              const newW={
                label:name,tag:'Custom',
                category:workout.category,
                gym:workout.gym||'general',
                wtype:workout.wtype,
                note:'Saved from modified workout on '+new Date().toLocaleDateString(),
                exercises:getActiveExercises().map(ex=>({...ex}))
              };
              setWorkouts({...workouts,[key]:newW});
              setSaveAsNewRoutine(false);setNewRoutineName('');
              finishWorkout();
            },style:{flex:2,padding:12,borderRadius:10,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',minHeight:46,boxShadow:'0 6px 20px rgba(124,58,237,0.3)'}},'Save & Finish')
          )
        )
      )
      ),
      activeTimer&&React.createElement(RestTimer,{key:activeTimer.exerciseId,seconds:activeTimer.seconds,exerciseName:activeTimer.exerciseName,onDone:()=>{setActiveTimer(null);cancelPushTimer();}})
    );
  }

  // ── MAIN VIEW ─────────────────────────────────────────────────────────────
  return React.createElement('div',{style:{minHeight:'100vh',background:T.bg,color:T.text,fontFamily:T.sans,maxWidth:680,margin:'0 auto',paddingBottom:T.tabH}},

    tab==='workout'&&React.createElement(React.Fragment,null,
      React.createElement('div',{style:{position:'sticky',top:0,zIndex:10,backdropFilter:'blur(16px)',borderBottom:'1px solid '+T.border,padding:'0 16px',background:'linear-gradient(180deg,'+T.bg+'f8 0%,'+T.bg+'e0 100%)'}},
        React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:16,paddingBottom:12}},
          React.createElement('div',{style:{fontSize:22,fontWeight:800,background:GRAD.accent,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text',letterSpacing:'-0.03em'}},'FitLog'),
          React.createElement('a',{href:'/logout',style:{width:38,height:38,borderRadius:10,border:'1px solid '+T.border2,background:'rgba(255,255,255,0.03)',color:T.muted,textDecoration:'none',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,WebkitTapHighlightColor:'transparent'}},'\u238b')
        ),
        React.createElement('div',{style:{display:'flex',gap:6,overflowX:'auto',paddingBottom:14,scrollbarWidth:'none'}},
          // Tab strip mirrors the current weekly schedule — unique workout keys, in day order (Sun-Sat), deduped
          (()=>{
            const dayOrder=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            const seen=new Set();const scheduleKeys=[];
            dayOrder.forEach(d=>{
              const item=schedule.find(s=>s.day===d);
              if(item&&item.workoutKey&&workouts[item.workoutKey]&&!seen.has(item.workoutKey)){seen.add(item.workoutKey);scheduleKeys.push(item.workoutKey);}
            });
            return scheduleKeys.map(key=>{
              const w=workouts[key];const a=CAT[w.category];const active=wKey===key;
              return React.createElement('button',{key,onClick:()=>setWKey(key),style:{flexShrink:0,padding:'9px 15px',borderRadius:9,border:'1px solid '+(active?a+'60':T.border2),background:active?'linear-gradient(135deg,'+a+'30,'+a+'10)':'rgba(255,255,255,0.03)',color:active?a:T.sub,fontSize:12,fontWeight:active?700:500,cursor:'pointer',fontFamily:T.sans,minHeight:40,WebkitTapHighlightColor:'transparent'}},w.label);
            });
          })()
        )
      ),
      (()=>{
        const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];const today=days[new Date().getDay()];
        const todayItem=schedule.find(s=>s.day===today);const todayWorkout=todayItem&&todayItem.workoutKey?workouts[todayItem.workoutKey]:null;
        const isTodaySelected=todayWorkout&&todayItem.workoutKey===wKey;
        if(!todayWorkout||isTodaySelected)return null;
        const a=CAT[todayWorkout.category]||'#06b6d4';
        return React.createElement('div',{style:{margin:'14px 16px 0',padding:'16px 18px',background:'linear-gradient(135deg,'+a+'22,'+a+'08)',borderRadius:16,border:'1px solid '+a+'40'}},
          React.createElement('div',{style:{fontSize:10,color:a,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}},'Today \u00b7 '+today),
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:12}},
            React.createElement('div',{style:{flex:1,fontSize:19,fontWeight:800,color:T.text,letterSpacing:'-0.01em'}},todayWorkout.label),
            React.createElement('button',{onClick:()=>{setWKey(todayItem.workoutKey);startWorkout();},style:{padding:'11px 18px',borderRadius:11,border:'none',background:a,color:'#0a0c0f',fontSize:14,fontWeight:800,cursor:'pointer',WebkitTapHighlightColor:'transparent',flexShrink:0,boxShadow:'0 4px 16px '+a+'50'}},'\u25b6 Start')
          )
        );
      })(),
      React.createElement('div',{style:{padding:'16px 16px 0'}},
        React.createElement('div',{style:{padding:'16px 18px',background:'linear-gradient(135deg,'+accent+'18,'+accent+'06)',borderRadius:16,border:'1px solid '+accent+'35',marginBottom:4}},
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}},
            React.createElement('div',null,React.createElement('div',{style:{fontSize:22,fontWeight:700,color:T.text,letterSpacing:'-0.02em'}},workout.label),React.createElement('div',{style:{fontSize:13,color:T.muted,marginTop:4}},workout.note)),
            React.createElement('div',{style:{fontSize:11,color:accent,fontWeight:700,padding:'4px 10px',borderRadius:8,background:accent+'18',border:'1px solid '+accent+'30'}},workout.tag)
          ),
          React.createElement('button',{onClick:startWorkout,style:{width:'100%',padding:16,borderRadius:12,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:17,cursor:'pointer',minHeight:56,WebkitTapHighlightColor:'transparent',boxShadow:'0 8px 28px '+accent+'55',letterSpacing:'-0.01em'}},'\u25b6  Start Workout'),
          ['pm_push','pm_pull','pm_legs'].includes(wKey)&&React.createElement('a',{href:'https://mg42powermatrix.netlify.app',target:'_blank',rel:'noopener noreferrer',style:{display:'block',marginTop:10,padding:'11px 16px',borderRadius:10,border:'1px solid #e8a02060',background:'rgba(232,160,32,0.08)',color:'#e8a020',fontWeight:600,fontSize:13,textAlign:'center',textDecoration:'none',WebkitTapHighlightColor:'transparent'}},'\U0001F4C8 Open Power Matrix \u2197')
        )
      ),
      React.createElement('div',{style:{padding:'4px 0 16px'}},
        workout.exercises.map(ex=>React.createElement(ExerciseBlock,{key:wKey+'-'+ex.id,ex,accent,allLogs,setAllLogs,restDefaults,onSetLogged:handleSetLogged,onPR:handlePR}))
      )
    ),


    tab==='routines'&&React.createElement(RoutinesTab,{workouts,onReorder:handleReorder,onArchive:handleArchive,allLogs,
      onStartWorkout:(key)=>{setWKey(key);setTab('workout');},
      onSaveRoutine:(key,draft)=>{setWorkouts({...workouts,[key]:{...workouts[key],...draft}});}}),
    tab==='history'&&React.createElement(HistoryView,{allLogs,workouts,onUpdateLog:handleUpdateLog,onDeleteSet:handleDeleteSet,onDeleteSession:handleDeleteSession,onAddExercise:handleAddExercise,
      onSaveAsRoutine:(newRoutine)=>{
        const key='hist_'+Date.now();
        setWorkouts({...workouts,[key]:newRoutine});
      }}),
    tab==='exercises'&&React.createElement(ExerciseDatabase,{
      workouts,restDefaults,allLogs,
      onSaveRestDefaults:(d)=>{setRestDefaults(d);},
      onSaveExercise:(wKey,exIdx,updates)=>{
        const updated={...workouts,[wKey]:{...workouts[wKey],exercises:workouts[wKey].exercises.map((ex,i)=>i===exIdx?{...ex,...updates}:ex)}};
        setWorkouts(updated);
      },
      onCreateExercise:(newEx)=>{
        const customW=workouts['custom_exercises']||{label:'Custom Exercises',tag:'Custom',category:'pull',gym:'general',wtype:'other',note:'Standalone exercises not yet added to a routine',exercises:[]};
        if(customW.exercises.find(e=>e.id===newEx.id)){alert('An exercise with that name already exists.');return;}
        const updatedCustomW={...customW,exercises:[...customW.exercises,newEx]};
        setWorkouts({...workouts,custom_exercises:updatedCustomW});
        const names=loadLS('fitlog_custom_ex_names',{});names[newEx.id]=newEx.name;saveLS('fitlog_custom_ex_names',names);
      }
    }),

    tab==='schedule'&&React.createElement('div',{style:{padding:'20px 16px'}},
      React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}},
        React.createElement('div',{style:{fontSize:20,fontWeight:700,color:T.text}},'Weekly Schedule'),
        React.createElement('button',{onClick:()=>setEditingSchedule(true),style:{padding:'10px 16px',borderRadius:10,border:'1px solid '+T.border2,background:'rgba(255,255,255,0.04)',color:T.sub,fontSize:13,cursor:'pointer',minHeight:42}},'Edit')
      ),
      schedule.map((item,i)=>{const w=item.workoutKey?workouts[item.workoutKey]:null;const a=w?CAT[w.category]:T.dim;return React.createElement('div',{key:i,style:{display:'flex',alignItems:'center',gap:14,padding:16,marginBottom:8,background:T.bg2,borderRadius:12,border:'1px solid '+T.border}},
        React.createElement('div',{style:{fontFamily:T.mono,fontSize:13,fontWeight:700,color:a,width:36}},item.day),
        React.createElement('div',{style:{flex:1,fontSize:15,color:w?T.text:T.muted}},w?w.label:'Rest'),
        w&&React.createElement('div',{style:{fontSize:11,color:a,fontWeight:700,padding:'3px 8px',borderRadius:6,background:a+'18'}},w.tag)
      );})
    ),

    tab==='settings'&&React.createElement('div',{style:{padding:'20px 16px'}},
      React.createElement('div',{style:{fontSize:20,fontWeight:700,color:T.text,marginBottom:20}},'Settings'),
      pendingImport&&React.createElement('div',{style:{marginBottom:16,padding:'16px',borderRadius:12,background:'rgba(124,58,237,0.1)',border:'1px solid rgba(124,58,237,0.3)'}},
        React.createElement('div',{style:{fontSize:14,fontWeight:700,color:T.text,marginBottom:4}},'Import from Strong'),
        React.createElement('div',{style:{fontSize:12,color:T.muted,marginBottom:14}},
          pendingImport.newSets.toLocaleString()+' sets  ·  '+pendingImport.newRoutines+' new routines  ·  '+pendingImport.newExercises+' exercises'
        ),
        React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:8}},
          React.createElement('button',{onClick:()=>confirmImport(true,true),style:{padding:'12px',borderRadius:10,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},'Import History + New Routines'),
          React.createElement('button',{onClick:()=>confirmImport(true,false),style:{padding:'12px',borderRadius:10,border:'1px solid rgba(124,58,237,0.4)',background:'rgba(124,58,237,0.1)',color:'#a78bfa',fontWeight:600,fontSize:14,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},'History Only'),
          React.createElement('button',{onClick:()=>confirmImport(false,true),style:{padding:'12px',borderRadius:10,border:'1px solid rgba(124,58,237,0.4)',background:'rgba(124,58,237,0.1)',color:'#a78bfa',fontWeight:600,fontSize:14,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},'New Routines Only'),
          React.createElement('button',{onClick:()=>setPendingImport(null),style:{padding:'10px',borderRadius:10,border:'1px solid '+T.border2,background:'transparent',color:T.muted,fontSize:13,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},'Cancel')
        )
      ),
      importResult&&React.createElement('div',{style:{marginBottom:16,padding:'12px 16px',borderRadius:10,background:importResult.type==='error'?'rgba(239,68,68,0.1)':'rgba(20,184,166,0.1)',border:'1px solid '+(importResult.type==='error'?'rgba(239,68,68,0.3)':'rgba(20,184,166,0.3)'),display:'flex',alignItems:'center',gap:10}},
        React.createElement('div',{style:{fontSize:13,color:importResult.type==='error'?'#f87171':T.green,flex:1}},importResult.message),
        React.createElement('button',{onClick:()=>setImportResult(null),style:{background:'none',border:'none',color:T.dim,cursor:'pointer',fontSize:16,padding:0}},'x')
      ),
      [
        ['Rest Timers','⏱',()=>setEditingSettings(true)],
        ['Programs','📋',()=>setShowPrograms(true)],
        ['Export Logs (JSON)','↑',handleExportLogs],
        ['Export to CSV','↓',handleExportCSV],
        ['Import Strong CSV / JSON','↓',()=>importRef.current?.click()],
      ].map(([label,icon,fn])=>React.createElement('button',{key:label,onClick:fn,style:{width:'100%',display:'flex',alignItems:'center',gap:14,padding:16,marginBottom:10,background:T.bg2,borderRadius:12,border:'1px solid '+T.border,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},
        React.createElement('div',{style:{width:40,height:40,borderRadius:10,background:'rgba(124,58,237,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}},icon),
        React.createElement('div',{style:{flex:1,textAlign:'left'}},
          React.createElement('div',{style:{fontSize:15,color:T.text,fontWeight:500}},label),
          label.includes('Strong')&&React.createElement('div',{style:{fontSize:11,color:T.dim,marginTop:2}},'Imports history + routines from Strong export')
        ),
        React.createElement('div',{style:{fontSize:18,color:T.dim}},'>') 
      )),
      React.createElement('input',{ref:importRef,type:'file',accept:'.csv,.json',onChange:handleImportFile,style:{display:'none'}}),
      React.createElement('div',{style:{marginTop:16,padding:'16px',background:T.bg2,borderRadius:12,border:'1px solid '+T.border}},
        React.createElement('div',{style:{fontSize:14,fontWeight:700,color:T.text,marginBottom:12}},'Consistency'),
        (()=>{
          const allDates=new Set();Object.values(allLogs).forEach(entries=>{entries.forEach(e=>{if(e.date)allDates.add(e.date.slice(0,10));});});
          const sorted=[...allDates].sort();let longestStreak=0,cur=0,streak=0,prev=null;
          const today=new Date().toISOString().slice(0,10);
          sorted.forEach(d=>{if(!prev){cur=1;}else{const diff=(new Date(d)-new Date(prev))/86400000;cur=diff<=1?cur+1:1;}if(cur>longestStreak)longestStreak=cur;prev=d;});
          streak=(prev===today||prev===new Date(Date.now()-86400000).toISOString().slice(0,10))?cur:0;
          return React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}},
            React.createElement('div',{style:{textAlign:'center',padding:'12px 8px',background:T.bg3,borderRadius:10}},React.createElement('div',{style:{fontSize:24,fontWeight:800,color:'#f59e0b',fontFamily:T.mono}},streak),React.createElement('div',{style:{fontSize:10,color:T.dim,marginTop:3,textTransform:'uppercase',letterSpacing:'0.06em'}},'Day Streak')),
            React.createElement('div',{style:{textAlign:'center',padding:'12px 8px',background:T.bg3,borderRadius:10}},React.createElement('div',{style:{fontSize:24,fontWeight:800,color:T.sub,fontFamily:T.mono}},longestStreak),React.createElement('div',{style:{fontSize:10,color:T.dim,marginTop:3,textTransform:'uppercase',letterSpacing:'0.06em'}},'Best Streak')),
            React.createElement('div',{style:{textAlign:'center',padding:'12px 8px',background:T.bg3,borderRadius:10}},React.createElement('div',{style:{fontSize:24,fontWeight:800,color:T.sub,fontFamily:T.mono}},sorted.length),React.createElement('div',{style:{fontSize:10,color:T.dim,marginTop:3,textTransform:'uppercase',letterSpacing:'0.06em'}},'Total Days'))
          );
        })()
      ),
      React.createElement('div',{style:{marginTop:16}},
        React.createElement('div',{style:{fontSize:16,fontWeight:700,color:T.text,marginBottom:12}},'Archived Routines'),
        Object.entries(workouts).filter(([,w])=>w.archived).length===0
          ?React.createElement('div',{style:{fontSize:13,color:T.dim,padding:'14px 16px',background:T.bg2,borderRadius:10,border:'1px solid '+T.border}},'No archived routines')
          :Object.entries(workouts).filter(([,w])=>w.archived).map(([key,w])=>{const tc=TYPE_COLORS[w.wtype]||CAT[w.category]||'#64748b';return React.createElement('div',{key,style:{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',marginBottom:8,background:T.bg2,borderRadius:10,border:'1px solid '+T.border,opacity:0.7}},React.createElement('div',{style:{width:3,borderRadius:2,alignSelf:'stretch',background:tc,flexShrink:0}}),React.createElement('div',{style:{flex:1,fontSize:14,color:T.muted,fontWeight:500}},w.label),React.createElement('button',{onClick:()=>handleUnarchive(key),style:{padding:'6px 12px',borderRadius:8,border:'1px solid rgba(20,184,166,0.4)',background:'rgba(20,184,166,0.1)',color:'#5eead4',fontSize:12,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent',minHeight:36}},'Restore'));}),
      ),
      React.createElement('div',{style:{marginTop:16,padding:'14px 16px',background:T.bg2,borderRadius:12,border:'1px solid '+T.border}},React.createElement('div',{style:{fontSize:12,color:T.dim,marginBottom:4}},'Version'),React.createElement('div',{style:{fontSize:14,color:T.muted}},'FitLog 2.1'))
    ),

    React.createElement(TabBar),
    showPrograms&&React.createElement(ProgramBuilder,{workouts,onClose:()=>setShowPrograms(false)}),
    editingSchedule&&React.createElement(ScheduleEditor,{schedule,workouts,onSave:w=>{setSchedule(w);setEditingSchedule(false);},onCancel:()=>setEditingSchedule(false)}),
    editingSettings&&React.createElement(SettingsModal,{defaults:restDefaults,onSave:d=>{setRestDefaults(d);setEditingSettings(false);},onCancel:()=>setEditingSettings(false)})
  );
}

ReactDOM.render(React.createElement(PPLTracker),document.getElementById('root'));