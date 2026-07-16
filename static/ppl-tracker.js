const { useState, useEffect, useRef } = React;

// ── SUPABASE CLIENT ────────────────────────────────────────────────────────────
const SUPABASE_URL='https://rwtgleklptqixhigbrzy.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3dGdsZWtscHRxaXhoaWdicnp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMTgwMzYsImV4cCI6MjA5ODg5NDAzNn0.NseddFUTsvltyw4_UhBLPbVrpD51ZL9YcpMIQQd1WSw';
const supabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

function loadLS(k,fb){try{const s=localStorage.getItem(k);return s?JSON.parse(s):fb;}catch{return fb;}}
function saveLS(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}
function loadRestDefaults(){return loadLS('fitlog_rest_defaults',{bench_press:180,incline_press_b:180,lat_pulldown_a:180,pullup_b:180,seated_row_a:180,squat_a:180,rdl_a:180,rdl_b:180,incline_db_press:90,arnold_press:90,db_chest_fly_a:90,lateral_raise_pa:90,lateral_raise_pb:90,lateral_raise_pf:90,tate_press_a:90,tate_press_b:90,cable_pushdown_a:90,flat_db_press_b:90,cable_crossover_b:90,db_shoulder_press_b:90,overhead_tri_b:90,db_row_a:90,face_pull_a:90,face_pull_b:90,face_pull_pf:90,shrug_a:90,incline_curl_a:90,hammer_curl_a:90,hammer_curl_b:90,hammer_curl_pf:90,chest_row_b:90,straight_arm_b:90,rear_delt_b:90,rear_delt_pf:90,cable_curl_b:90,bicep_curl_pf:90,bss_a:90,leg_ext_a:90,leg_ext_b:90,lying_curl_a:90,standing_calf_a:90,leg_press_b:90,seated_curl_b:90,lunge_b:90,seated_calf_b:90,lat_pulldown_pf:90,seated_row_pf:90,weighted_dips:90,cable_fly_b:90,deadlift:180,_default:120});}
function getRestDuration(id,def){return(def&&def[id])||(def&&def._default)||120;}

// ── DATA LAYER — talks directly to Supabase, RLS scopes everything to the signed-in user ──
async function fetchAllLogs(){
  try{
    const{data,error}=await supabase.from('fitlog_logs').select('exercise_id,data');
    if(error||!data)return{};
    const result={};
    data.forEach(row=>{try{result[row.exercise_id]=row.data;}catch{}});
    return result;
  }catch{return{};}
}
async function pushExerciseLogs(exerciseId,entries){
  try{
    const{data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    await supabase.from('fitlog_logs').upsert({user_id:user.id,exercise_id:exerciseId,data:entries,updated_at:new Date().toISOString()},{onConflict:'user_id,exercise_id'});
  }catch{}
}
async function fetchServerWorkouts(){
  try{
    const{data,error}=await supabase.from('fitlog_workouts').select('data').maybeSingle();
    if(error||!data)return null;
    return data.data;
  }catch{return null;}
}
async function saveServerWorkouts(workoutsData){
  try{
    const{data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    await supabase.from('fitlog_workouts').upsert({user_id:user.id,data:workoutsData,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  }catch{}
}
async function fetchServerSchedule(){
  try{
    const{data,error}=await supabase.from('fitlog_schedule').select('data').maybeSingle();
    if(error||!data)return null;
    return data.data;
  }catch{return null;}
}
async function saveServerSchedule(scheduleData){
  try{
    const{data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    await supabase.from('fitlog_schedule').upsert({user_id:user.id,data:scheduleData,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  }catch{}
}
async function fetchBodyPartOverrides(){
  try{
    const{data,error}=await supabase.from('fitlog_bodypart_overrides').select('data').maybeSingle();
    if(error||!data)return null;
    return data.data;
  }catch{return null;}
}
async function saveBodyPartOverrides(overrides){
  try{
    const{data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    await supabase.from('fitlog_bodypart_overrides').upsert({user_id:user.id,data:overrides,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  }catch{}
}

async function fetchServerRestDefaults(){
  try{
    const{data,error}=await supabase.from('fitlog_rest_defaults').select('data').maybeSingle();
    if(error||!data)return null;
    return data.data;
  }catch{return null;}
}
async function saveServerRestDefaults(restData){
  try{
    const{data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    await supabase.from('fitlog_rest_defaults').upsert({user_id:user.id,data:restData,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  }catch{}
}
// Auth-aware fetch wrapper for the remaining Flask routes (push notifications only)
async function authedFetch(url,opts={}){
  const{data:{session}}=await supabase.auth.getSession();
  const headers={...(opts.headers||{}),'Authorization':'Bearer '+((session&&session.access_token)||'')};
  return fetch(url,{...opts,headers});
}

function e1rm(w,r){return(!w||!r||r<=0)?0:Math.round(w*(1+r/30));}
function getBestE1rm(logs){return logs&&logs.length?Math.max(...logs.map(l=>l.e1rm||0)):0;}
function fmtVol(v){return v>=1000?(v/1000).toFixed(1)+'k':String(v);}
function fmtDate(iso){const d=new Date(iso);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function fmtDur(ms){const m=Math.round(ms/60000);return m>0?m+'m':'<1m';}



const T={bg:'#0a0c0f',bg2:'#111318',bg3:'#1a1f2e',bg4:'#0f1117',border:'rgba(148,163,184,0.12)',border2:'rgba(148,163,184,0.22)',text:'#f1f5f9',sub:'#cbd5e1',muted:'#94a3b8',dim:'#64748b',green:'#14b8a6',mono:"'Courier New',monospace",sans:"-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',sans-serif",tabH:64};
const GRAD={accent:'linear-gradient(135deg,#7c3aed 0%,#14b8a6 100%)',button:'linear-gradient(135deg,rgba(124,58,237,0.9),rgba(20,184,166,0.9))'};
const CAT={push:'#e8a020',pull:'#4a9eff',legs:'#7ed9a8',pf:'#b06ae8'};
const GYM_LABELS={pm:'Power Matrix',anthropic:'Anthropic',rrb:'RRB',golds:"Gold's Gym",anytime:'Anytime Fitness',pf:'Planet Fitness',home:'Home',hotel:'Hotel',rahway:'Rahway',general:'General'};
const TYPE_LABELS={push:'Push',pull:'Pull',legs:'Legs',upper:'Upper Body',full:'Full Body',core:'Core / Abs',other:'Other'};
const TYPE_COLORS={push:'#e8a020',pull:'#4a9eff',legs:'#7ed9a8',upper:'#a78bfa',full:'#14b8a6',core:'#f472b6',other:'#64748b'};

// Small generic starter set — seeded for every brand-new signup
const GENERIC_STARTER_WORKOUTS={
  push_a:{label:'Push A',tag:'Heavy',category:'push',gym:'general',wtype:'push',note:'Rest 2-3 min compound, 60-90 sec isolation.',exercises:[{id:'bench_press',name:'Barbell Bench Press',sets:4,reps:'6-8'},{id:'incline_db_press',name:'Incline DB Press',sets:3,reps:'10-12'},{id:'arnold_press',name:'Arnold Press',sets:3,reps:'10-12'},{id:'db_chest_fly_a',name:'DB Chest Fly',sets:3,reps:'12-15'},{id:'lateral_raise_pa',name:'Lateral Raise',sets:4,reps:'15-20'},{id:'tate_press_a',name:'Tate Press',sets:3,reps:'12-15'},{id:'cable_pushdown_a',name:'Cable Pushdown',sets:3,reps:'15-20'}]},
  push_b:{label:'Push B',tag:'Volume',category:'push',gym:'general',wtype:'push',note:'Lighter. 60-90 sec rest.',exercises:[{id:'incline_press_b',name:'Incline Barbell Press',sets:4,reps:'10-12'},{id:'weighted_dips',name:'Weighted Dips',sets:3,reps:'8-12'},{id:'flat_db_press_b',name:'Flat DB Press',sets:3,reps:'12-15'},{id:'cable_fly_b',name:'Cable Fly',sets:3,reps:'12-15'},{id:'cable_crossover_b',name:'Cable Crossover',sets:3,reps:'12-15'},{id:'db_shoulder_press_b',name:'DB Shoulder Press',sets:3,reps:'10-12'},{id:'lateral_raise_pb',name:'Lateral Raise',sets:4,reps:'15-20'},{id:'overhead_tri_b',name:'Overhead Tricep',sets:3,reps:'12-15'},{id:'tate_press_b',name:'Tate Press',sets:3,reps:'15-20'}]},
  pull_a:{label:'Pull A',tag:'Heavy',category:'pull',gym:'general',wtype:'pull',note:'Rest 2-3 min compounds.',exercises:[{id:'deadlift',name:'Deadlift (Barbell)',sets:5,reps:'5'},{id:'lat_pulldown_a',name:'Lat Pulldown',sets:4,reps:'6-10'},{id:'seated_row_a',name:'Seated Row',sets:4,reps:'8-10'},{id:'db_row_a',name:'DB Row',sets:3,reps:'10-12'},{id:'face_pull_a',name:'Face Pull',sets:3,reps:'15-20'},{id:'shrug_a',name:'DB Shrug',sets:3,reps:'12-15'},{id:'incline_curl_a',name:'Incline Curl',sets:3,reps:'10-12'},{id:'hammer_curl_a',name:'Hammer Curl',sets:3,reps:'12-15'}]},
  pull_b:{label:'Pull B',tag:'Volume',category:'pull',gym:'general',wtype:'pull',note:'Isolation focus.',exercises:[{id:'pullup_b',name:'Pull-Up',sets:4,reps:'8-12'},{id:'chest_row_b',name:'Chest Row',sets:3,reps:'10-12'},{id:'straight_arm_b',name:'Straight Arm',sets:3,reps:'12-15'},{id:'rear_delt_b',name:'Rear Delt Fly',sets:3,reps:'15-20'},{id:'face_pull_b',name:'Face Pull',sets:3,reps:'15-20'},{id:'cable_curl_b',name:'Cable Curl',sets:3,reps:'12-15'},{id:'hammer_curl_b',name:'Hammer Curl',sets:3,reps:'12-15'}]},
  legs_a:{label:'Legs A',tag:'Quad',category:'legs',gym:'general',wtype:'legs',note:'Rest 2-3 min after squats.',exercises:[{id:'squat_a',name:'Barbell Squat',sets:4,reps:'6-8'},{id:'bss_a',name:'Bulgarian Split Squat',sets:3,reps:'10-12'},{id:'leg_ext_a',name:'Leg Extension',sets:3,reps:'12-15'},{id:'rdl_a',name:'Romanian Deadlift',sets:3,reps:'10-12'},{id:'lying_curl_a',name:'Lying Curl',sets:3,reps:'12-15'},{id:'standing_calf_a',name:'Calf Raise',sets:4,reps:'15-20'}]},
  legs_b:{label:'Legs B',tag:'Hinge',category:'legs',gym:'general',wtype:'legs',note:'Less CNS.',exercises:[{id:'rdl_b',name:'Romanian Deadlift',sets:4,reps:'8-10'},{id:'leg_press_b',name:'Leg Press',sets:4,reps:'10-15'},{id:'seated_curl_b',name:'Seated Curl',sets:3,reps:'10-12'},{id:'lunge_b',name:'Reverse Lunge',sets:3,reps:'12'},{id:'leg_ext_b',name:'Leg Extension',sets:3,reps:'15-20'},{id:'seated_calf_b',name:'Seated Calf',sets:4,reps:'15-20'}]},
};

// Mark's full personal program (Power Matrix, Anthropic, RRB, PF, etc.) —
// used ONLY as seed data during his one-time account migration, never
// auto-injected into other users' accounts.
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



function inferBodyPart(name){
  const n=name.toLowerCase();
  if(/bench|chest|fly|pec|cable cross|cybex|incline press|decline press/.test(n)&&!/row/.test(n))return'Chest';
  if(/row|pulldown|pull.?up|lat |chin.?up|seated row|cable row|t.bar|rack pull/.test(n)&&!/lateral raise/.test(n))return'Back';
  if(/deadlift/.test(n)&&!/romanian|rdl|stiff/.test(n))return'Back';
  if(/shoulder press|military|overhead press|arnold|lateral raise|front raise|delt|face pull|upright row/.test(n))return'Shoulders';
  if(/shrug/.test(n))return'Shoulders';
  if(/(bicep|biceps) curl|hammer curl|incline curl|concentration curl|preacher|waiter curl|overhead curl|cable curl/.test(n))return'Biceps';
  if(/curl/.test(n)&&!/leg curl|nordic|hamstring|wrist/.test(n))return'Biceps';
  if(/tricep|pushdown|pull.?down.*tri|skullcrusher|skull crusher|tate press|dip/.test(n)&&!/lat pulldown|chin/.test(n))return'Triceps';
  if(/squat|leg press|hack squat|lunge|split squat|step.?up|quad|leg ext/.test(n)&&!/nordic|curl/.test(n))return'Quads';
  if(/romanian|rdl|stiff.?leg|leg curl|nordic|hamstring|glute.?ham/.test(n))return'Hamstrings';
  if(/glute|hip thrust|kickback|abduction|fire hydrant/.test(n))return'Glutes';
  if(/calf|calves|calf press|seated calf|standing calf|tibialis/.test(n))return'Calves';
  if(/ab |crunch|plank|russian twist|v.?up|side bend|core|oblique|cable crunch/.test(n))return'Core';
  if(/ghd/.test(n))return'Hamstrings';
  if(/bulgarian/.test(n))return'Quads';
  return'Quads'; // fallback for leg exercises
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
function getBodyPart(exId,exName){
  const custom=loadLS('fitlog_custom_bodypart',{});
  return custom[exId]||inferBodyPart(exName);
}

// Sunday-start week boundaries for a given date
function getWeekRange(date){
  const d=new Date(date);
  const day=d.getDay(); // 0=Sun
  const start=new Date(d);start.setHours(0,0,0,0);start.setDate(d.getDate()-day);
  const end=new Date(start);end.setDate(start.getDate()+7);
  return{start,end};
}

// Compute total sets performed per body part within the week containing `refDate`
function getWeeklyVolume(allLogs,refDate,customBpOverride){
  const{start,end}=getWeekRange(refDate||new Date());
  const byBodyPart={};
  const byExercise={};
  Object.entries(allLogs).forEach(function(kv){
    var exId=kv[0];var entries=kv[1];
    if(!entries||!entries.length)return;
    var exName=null;var weekSets=0;
    entries.forEach(function(e){
      var t=new Date(e.date);
      if(t>=start&&t<end){if(!exName)exName=e.exName||null;weekSets++;}
    });
    if(!weekSets)return;
    var rawName=exName||exId.replace(/_/g,' ');
    var name=rawName.replace(/\b\w/g,function(ch){return ch.toUpperCase();});
    var _custom=customBpOverride||loadLS('fitlog_custom_bodypart',{});
    var bp=_custom[exId]||inferBodyPart(name);
    byBodyPart[bp]=(byBodyPart[bp]||0)+weekSets;
    if(!byExercise[bp])byExercise[bp]=[];
    byExercise[bp].push({exId:exId,name:name,sets:weekSets});
  });
  return{byBodyPart:byBodyPart,byExercise:byExercise};
}

// Weekly volume targets (sets/week) — from Anthropic PPL Hypertrophy Restructure v2
const TARGET_VOLUME={Chest:[20,25],Back:[20,25],Shoulders:[20,25],Biceps:[20,25],Triceps:[20,25],Quads:[20,25],Hamstrings:[20,25],Glutes:[20,25],Calves:[20,25],Core:null};

function WeeklyVolumeCard({allLogs,customBp,setCustomBp}){
  const[collapsed,setCollapsed]=useState(false);
  const[expandedBp,setExpandedBp]=useState(null);
  const[editingEx,setEditingEx]=useState(null);
  // Store body part overrides in React state so changes immediately trigger re-render

  // tick forces re-read of localStorage overrides after saving a body part change
  var _vd=getWeeklyVolume(allLogs,new Date(),customBp);
  var byBodyPart=_vd.byBodyPart;
  var byExercise=_vd.byExercise;
  const bodyPartOrder=['Chest','Back','Shoulders','Biceps','Triceps','Quads','Hamstrings','Glutes','Calves','Core'];
  const entries=bodyPartOrder.filter(function(bp){return byBodyPart[bp]||TARGET_VOLUME[bp];});
  const{start,end}=getWeekRange(new Date());
  const endDisplay=new Date(end.getTime()-1);
  const rangeLabel=start.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' \u2013 '+endDisplay.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const BPOPTS=['Chest','Back','Shoulders','Biceps','Triceps','Quads','Hamstrings','Glutes','Calves','Core'];
  if(!entries.length)return null;

  function statusColor(count,target){
    if(!target)return T.muted;
    var lo=target[0],hi=target[1];
    if(count>=lo&&count<=hi)return'#34d399';
    if(count<lo)return'#fbbf24';
    return'#f87171';
  }
  function saveBp(exId,newBp){
    var next=Object.assign({},customBp);
    next[exId]=newBp;
    saveLS('fitlog_custom_bodypart',next);
    saveBodyPartOverrides(next);
    setCustomBp(next);
    setEditingEx(null);
  }

  if(editingEx){
    return React.createElement('div',{style:{position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'flex-end'},onClick:function(){setEditingEx(null);}},
      React.createElement('div',{onClick:function(e){e.stopPropagation();},style:{width:'100%',background:T.bg2,borderRadius:'16px 16px 0 0',padding:'20px 16px 44px',border:'1px solid '+T.border}},
        React.createElement('div',{style:{fontSize:14,fontWeight:700,color:T.text,marginBottom:2}},editingEx.name),
        React.createElement('div',{style:{fontSize:11,color:T.dim,marginBottom:16}},'Currently: '+editingEx.currentBp),
        React.createElement('div',{style:{display:'flex',flexWrap:'wrap',gap:8}},
          BPOPTS.map(function(bp){
            var active=bp===editingEx.currentBp;
            return React.createElement('button',{key:bp,onClick:function(){saveBp(editingEx.exId,bp);},style:{padding:'8px 14px',borderRadius:8,border:'1px solid '+(active?'rgba(124,58,237,0.5)':T.border2),background:active?'rgba(124,58,237,0.2)':'transparent',color:active?'#a78bfa':T.sub,fontSize:13,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},bp);
          })
        )
      )
    );
  }

  return React.createElement('div',{style:{margin:'0 16px 4px',background:T.bg2,borderRadius:14,border:'1px solid '+T.border,overflow:'hidden'}},
    React.createElement('div',{onClick:function(){setCollapsed(function(v){return !v;});},style:{padding:'12px 16px',display:'flex',alignItems:'center',gap:10,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},
      React.createElement('div',{style:{fontSize:16}},'\uD83D\uDCCA'),
      React.createElement('div',{style:{flex:1}},
        React.createElement('div',{style:{fontSize:13,fontWeight:700,color:T.text}},'Weekly Volume'),
        React.createElement('div',{style:{fontSize:10,color:T.dim,marginTop:1}},rangeLabel)
      ),
      React.createElement('div',{style:{fontSize:13,color:T.dim}},collapsed?'\u2304':'\u2303')
    ),
    !collapsed&&React.createElement('div',{style:{padding:'0 16px 14px'}},
      entries.map(function(bp){
        var count=byBodyPart[bp]||0;
        var target=TARGET_VOLUME[bp];
        var color=statusColor(count,target);
        var pct=target?Math.min(100,Math.round((count/target[1])*100)):0;
        var isExpanded=expandedBp===bp;
        var exercises=(byExercise[bp]||[]).slice().sort(function(a,b){return b.sets-a.sets;});
        return React.createElement('div',{key:bp,style:{marginBottom:8}},
          React.createElement('div',{
            onClick:function(){setExpandedBp(function(prev){return prev===bp?null:bp;});},
            style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3,cursor:exercises.length?'pointer':'default',WebkitTapHighlightColor:'transparent'}
          },
            React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6}},
              React.createElement('div',{style:{fontSize:12,color:T.sub}},bp),
              exercises.length>0&&React.createElement('div',{style:{fontSize:9,color:T.dim}},isExpanded?'\u25b2':'\u25bc')
            ),
            React.createElement('div',{style:{fontSize:12,fontFamily:T.mono,fontWeight:700,color}},count+(target?'/'+target[0]+'-'+target[1]:''))
          ),
          target&&React.createElement('div',{style:{height:4,borderRadius:2,background:'rgba(148,163,184,0.12)',overflow:'hidden',marginBottom:isExpanded&&exercises.length?6:0}},
            React.createElement('div',{style:{height:'100%',width:pct+'%',background:color,borderRadius:2,transition:'width 0.4s ease'}})
          ),
          isExpanded&&exercises.length>0&&React.createElement('div',{style:{background:T.bg3,borderRadius:8,padding:'4px 8px',marginBottom:2}},
            exercises.map(function(ex,i){
              return React.createElement('div',{key:ex.exId,style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 0',borderBottom:i<exercises.length-1?'1px solid '+T.border:'none'}},
                React.createElement('div',{style:{flex:1,minWidth:0,fontSize:12,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',marginRight:8}},ex.name),
                React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,flexShrink:0}},
                  React.createElement('div',{style:{fontSize:11,color:T.dim,fontFamily:T.mono}},ex.sets+' sets'),
                  React.createElement('button',{
                    onClick:function(e){e.stopPropagation();setEditingEx({exId:ex.exId,name:ex.name,currentBp:bp});},
                    style:{fontSize:10,padding:'2px 8px',borderRadius:5,border:'1px solid '+T.border2,background:'transparent',color:T.dim,cursor:'pointer',WebkitTapHighlightColor:'transparent'}
                  },'edit')
                )
              );
            })
          )
        );
      })
    )
  );
}
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
      const storedName=(s.sets.find(x=>x.workoutName)||{}).workoutName;
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
            React.createElement('button',{onClick:()=>{const finalName=nameVal.trim()||session.workoutLabel;onRename&&onRename(session,finalName);setNameVal(finalName);setEditingName(false);},style:{padding:'6px 10px',borderRadius:7,border:'none',background:'#7c3aed',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}},'Save'),
            React.createElement('button',{onClick:()=>{setNameVal(session.workoutLabel);setEditingName(false);},style:{padding:'6px 8px',borderRadius:7,border:'1px solid '+T.border2,background:'transparent',color:T.muted,fontSize:13,cursor:'pointer'}},'X')
          )
          :React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8}},
            React.createElement('div',{style:{fontSize:17,fontWeight:700,color:T.text}},nameVal),
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
      onRename:(session,newName)=>{saveLS('session_label_'+session.id,newName);setSessions(buildSessions(allLogs,workouts));},
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
          const catColor=CAT[(session.sets[0]&&session.sets[0].category)]||'#7c3aed';

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
function RoutineEditor({workout,workoutKey,workouts,allLogs,onSave,onClose}){
  if(!workout){
    // Defensive guard: routine no longer exists (deleted/renamed elsewhere) — bail out instead of crashing
    React.useEffect(()=>{onClose();},[]);
    return null;
  }
  const[draft,setDraft]=useState(()=>JSON.parse(JSON.stringify(workout)));
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
  const[strongFormat,setStrongFormat]=useState(null);
  const[archiving,setArchiving]=useState(false);
  const[selected,setSelected]=useState(new Set());const[filterType,setFilterType]=useState('all');
  const[expandedGym,setExpandedGym]=useState(null);const[reordering,setReordering]=useState(false);
  const[routineOrder,setRoutineOrder]=useState(()=>loadLS('fitlog_routine_order',{}));
  const[actionSheet,setActionSheet]=useState(null); // routine key for quick actions
  const dragRef=useRef(null);
  const grouped={};Object.entries(workouts).forEach(([key,w])=>{if(w.archived)return;const gym=w.gym||'general';if(!grouped[gym])grouped[gym]=[];grouped[gym].push({key,...w});});
  const GYM_ORDER=['pm','anthropic','rrb','golds','anytime','pf','general','home','hotel','rahway'];
  const gyms=Object.keys(grouped).sort((a,b)=>{const ai=GYM_ORDER.indexOf(a),bi=GYM_ORDER.indexOf(b);return(ai<0?99:ai)-(bi<0?99:bi);});
  function sortedList(gym,list){const order=routineOrder[gym]||[];return [...list].sort((a,b)=>{const ai=order.indexOf(a.key),bi=order.indexOf(b.key);if(ai<0&&bi<0)return (a.label||'').localeCompare(b.label||'');if(ai<0)return 1;if(bi<0)return -1;return ai-bi;});}
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
  if(strongFormat){
    var w=workouts[strongFormat];
    if(!w){setStrongFormat(null);return null;}
    var rd=loadLS('fitlog_rest_defaults',{_default:120});
    var sfLines=(w.exercises||[]).map(function(ex){
      var restSec=rd[ex.id]||rd._default||120;
      var mins=Math.floor(restSec/60);var secs=restSec%60;
      var restStr=mins+'m'+(secs?secs+'s':'');
      var nm=ex.name;while(nm.length<32)nm=nm+' ';
      return nm+ex.sets+' sets   '+ex.reps+'   '+restStr;
    });
    var totalSets=(w.exercises||[]).reduce(function(t,ex){return t+ex.sets;},0);
    var nl='\n';var sep='----------------------------------------';var sfText=w.label.toUpperCase()+nl+sep+nl+sfLines.join(nl)+nl+sep+nl+'Total: '+totalSets+' sets';
    function sfCopy(){if(navigator.clipboard){navigator.clipboard.writeText(sfText).then(function(){alert('Copied!');});}else{var ta=document.createElement('textarea');ta.value=sfText;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);alert('Copied!');}}
    function sfDownload(){var blob=new Blob([sfText],{type:'text/plain'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=w.label.replace(/[^a-z0-9]/gi,'_')+'.txt';a.click();URL.revokeObjectURL(url);}
    return React.createElement('div',{style:{position:'fixed',inset:0,zIndex:300,background:'rgba(0,0,0,0.95)',backdropFilter:'blur(8px)',overflowY:'auto',padding:'20px 16px'}},
      React.createElement('div',{style:{maxWidth:600,margin:'0 auto'}},
        React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}},
          React.createElement('div',{style:{fontSize:18,fontWeight:700,color:T.text}},w.label),
          React.createElement('button',{onClick:function(){setStrongFormat(null);},style:{padding:'8px 14px',borderRadius:9,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:13,cursor:'pointer'}},'Close')
        ),
        React.createElement('pre',{style:{background:T.bg2,borderRadius:12,border:'1px solid '+T.border,padding:16,fontSize:12,color:T.text,fontFamily:T.mono,lineHeight:1.9,overflowX:'auto',whiteSpace:'pre-wrap',wordBreak:'break-word',marginBottom:16}},sfText),
        React.createElement('div',{style:{display:'flex',gap:10}},
          React.createElement('button',{onClick:sfCopy,style:{flex:1,padding:13,borderRadius:10,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer'}},'Copy to Clipboard'),
          React.createElement('button',{onClick:sfDownload,style:{padding:13,borderRadius:10,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:14,cursor:'pointer'}},'Download')
        )
      )
    );
  }
  if(editingRoutine)return React.createElement(RoutineEditor,{
    workout:workouts[editingRoutine],workoutKey:editingRoutine,workouts,allLogs,
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
                onClick:()=>{if(archiving){setSelected(s=>{const n=new Set(s);n.has(w.key)?n.delete(w.key):n.add(w.key);return n;});}else{onStartWorkout&&onStartWorkout(w.key);}},
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
        React.createElement('button',{onClick:()=>{onStartWorkout&&onStartWorkout(actionSheet);setActionSheet(null);},style:{width:'100%',padding:'14px 16px',marginBottom:8,borderRadius:12,border:'none',background:GRAD.button,color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent',textAlign:'left'}},'▶  Start Workout'),
        React.createElement('button',{onClick:()=>{setStrongFormat(actionSheet);setActionSheet(null);},style:{width:'100%',padding:'14px 16px',marginBottom:8,borderRadius:12,border:'none',background:'rgba(20,184,166,0.1)',color:'#5eead4',fontSize:15,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent',textAlign:'left'}},'Strong Format'),
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
            ['Chest','Back','Shoulders','Biceps','Triceps','Quads','Hamstrings','Glutes','Calves','Core'].map(bp=>React.createElement('option',{key:bp,value:bp},bp))
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
            ['Chest','Back','Shoulders','Biceps','Triceps','Quads','Hamstrings','Glutes','Calves','Core'].map(bp=>React.createElement('option',{key:bp,value:bp},bp))
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



// ── PROGRESSIVE OVERLOAD ANALYSIS ─────────────────────────────────────────────
function getProgressiveOverload(allLogs, workouts){
  const results = {};
  const {start: thisWeekStart} = getWeekRange(new Date());
  const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(thisWeekStart.getDate()-7);
  const {start: lastWeekEnd} = getWeekRange(new Date(thisWeekStart.getTime()-1));

  // Collect all exercise IDs from all routines
  const exercises = {};
  Object.values(workouts).forEach(w=>{
    (w.exercises||[]).forEach(ex=>{
      if(!exercises[ex.id]) exercises[ex.id] = ex.name;
    });
  });

  Object.entries(allLogs).forEach(([exId, entries])=>{
    if(!entries||!entries.length) return;
    const realEntries = entries.filter(e=>e.weight>0&&e.reps>0);
    if(!realEntries.length) return;

    const thisWeek = realEntries.filter(e=>{const d=new Date(e.date);return d>=thisWeekStart;});
    const lastWeek = realEntries.filter(e=>{const d=new Date(e.date);return d>=lastWeekStart&&d<thisWeekStart;});
    if(!thisWeek.length&&!lastWeek.length) return;

    const bestE1rm = (entries)=>entries.length?Math.max(...entries.map(e=>e.e1rm||0)):0;
    const totalVol = (entries)=>entries.reduce((t,e)=>t+(e.weight*e.reps),0);
    const maxWeight = (entries)=>entries.length?Math.max(...entries.map(e=>e.weight)):0;

    const thisE1rm = bestE1rm(thisWeek);
    const lastE1rm = bestE1rm(lastWeek);
    const thisVol = totalVol(thisWeek);
    const lastVol = totalVol(lastWeek);
    const thisMax = maxWeight(thisWeek);
    const lastMax = maxWeight(lastWeek);

    results[exId] = {
      name: exercises[exId]||exId.replace(/_/g,' '),
      thisWeek:{e1rm:thisE1rm,vol:thisVol,max:thisMax,sets:thisWeek.length},
      lastWeek:{e1rm:lastE1rm,vol:lastVol,max:lastMax,sets:lastWeek.length},
      e1rmDelta: thisE1rm-lastE1rm,
      volDelta: thisVol-lastVol,
      maxDelta: thisMax-lastMax,
      hasData: thisWeek.length>0||lastWeek.length>0,
    };
  });
  return results;
}

function OverloadCard({allLogs,workouts}){
  const[expanded,setExpanded]=useState(false);
  const[filter,setFilter]=useState('all'); // all | up | down | new
  const overload=getProgressiveOverload(allLogs,workouts);
  const entries=Object.values(overload).filter(e=>e.hasData);

  const filtered=entries.filter(e=>{
    if(filter==='up') return e.e1rmDelta>0||e.volDelta>0;
    if(filter==='down') return e.lastWeek.sets>0&&e.thisWeek.sets>0&&e.e1rmDelta<0&&e.volDelta<0;
    if(filter==='new') return e.thisWeek.sets>0&&e.lastWeek.sets===0;
    return e.thisWeek.sets>0;
  }).sort((a,b)=>Math.abs(b.e1rmDelta)-Math.abs(a.e1rmDelta));

  if(!filtered.length&&!expanded) return null;

  return React.createElement('div',{style:{margin:'0 16px 12px',background:T.bg2,borderRadius:14,border:'1px solid '+T.border,overflow:'hidden'}},
    React.createElement('div',{onClick:()=>setExpanded(e=>!e),style:{padding:'12px 16px',display:'flex',alignItems:'center',gap:10,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},
      React.createElement('div',{style:{fontSize:16}},'\uD83D\uDCC8'),
      React.createElement('div',{style:{flex:1}},
        React.createElement('div',{style:{fontSize:13,fontWeight:700,color:T.text}},'Progressive Overload'),
        React.createElement('div',{style:{fontSize:10,color:T.dim,marginTop:1}},'This week vs last week')
      ),
      React.createElement('div',{style:{fontSize:13,color:T.dim}},expanded?'\u2303':'\u2304')
    ),
    expanded&&React.createElement('div',{style:{padding:'0 16px 14px'}},
      React.createElement('div',{style:{display:'flex',gap:6,marginBottom:12}},
        ['all','up','down','new'].map(f=>React.createElement('button',{key:f,onClick:()=>setFilter(f),style:{flex:1,padding:'5px 4px',borderRadius:7,border:'1px solid '+(filter===f?'rgba(124,58,237,0.5)':'transparent'),background:filter===f?'rgba(124,58,237,0.2)':'rgba(255,255,255,0.04)',color:filter===f?'#a78bfa':T.dim,fontSize:11,fontWeight:filter===f?700:400,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},f==='all'?'Active':f==='up'?'\u2191 PR':f==='down'?'\u2193 Drop':'New'))
      ),
      filtered.length===0&&React.createElement('div',{style:{fontSize:13,color:T.dim,textAlign:'center',padding:'12px 0'}},'No data for this filter yet'),
      filtered.slice(0,20).map(e=>{
        const up=e.e1rmDelta>0;const down=e.e1rmDelta<0;const same=e.e1rmDelta===0;
        const color=up?'#34d399':down?'#f87171':'#94a3b8';
        const arrow=up?'\u2191':down?'\u2193':'\u2192';
        return React.createElement('div',{key:e.name,style:{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderTop:'1px solid '+T.border}},
          React.createElement('div',{style:{fontSize:14,color,fontWeight:800,width:16,textAlign:'center',flexShrink:0}},arrow),
          React.createElement('div',{style:{flex:1,minWidth:0}},
            React.createElement('div',{style:{fontSize:13,fontWeight:600,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},e.name),
            React.createElement('div',{style:{fontSize:10,color:T.dim,marginTop:1}},
              e.lastWeek.sets>0?('Last: '+e.lastWeek.max+'lb \u00d7 '+Math.round(e.lastWeek.vol/e.lastWeek.sets/e.lastWeek.max||1)+' avg reps'):'New this week'
            )
          ),
          React.createElement('div',{style:{textAlign:'right',flexShrink:0}},
            e.thisWeek.max>0&&React.createElement('div',{style:{fontSize:13,fontWeight:700,color,fontFamily:T.mono}},
              (up&&e.e1rmDelta>0?'+':'')+e.e1rmDelta+' e1RM'
            ),
            React.createElement('div',{style:{fontSize:10,color:T.dim,marginTop:1}},e.thisWeek.sets+' sets')
          )
        );
      })
    )
  );
}

// ── DASHBOARD TAB ──────────────────────────────────────────────────────────────
function DashboardTab({allLogs,workouts,schedule,restDefaults,customBp,setCustomBp}){
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today=days[new Date().getDay()];
  const todayItem=schedule.find(s=>s.day===today);
  const todayWorkout=todayItem&&todayItem.workoutKey?workouts[todayItem.workoutKey]:null;

  // Recent PRs from this week
  const{start:weekStart}=getWeekRange(new Date());
  const recentPRs=[];
  Object.entries(allLogs).forEach(([exId,entries])=>{
    if(!entries||!entries.length) return;
    const allE1rms=entries.map(e=>e.e1rm||0);
    const maxE1rm=Math.max(...allE1rms);
    const thisWeek=entries.filter(e=>new Date(e.date)>=weekStart&&(e.e1rm||0)===maxE1rm&&maxE1rm>0);
    if(thisWeek.length) recentPRs.push({exId,name:entries[0].exName||exId.replace(/_/g,' '),e1rm:maxE1rm,date:thisWeek[0].date});
  });
  recentPRs.sort((a,b)=>new Date(b.date)-new Date(a.date));

  return React.createElement('div',{style:{paddingBottom:80}},
    // Today's workout reference card
    todayWorkout&&React.createElement('div',{style:{margin:'16px 16px 12px',padding:'16px 18px',background:'linear-gradient(135deg,'+(CAT[todayWorkout.category]||'#06b6d4')+'22,'+(CAT[todayWorkout.category]||'#06b6d4')+'08)',borderRadius:16,border:'1px solid '+(CAT[todayWorkout.category]||'#06b6d4')+'40'}},
      React.createElement('div',{style:{fontSize:10,color:CAT[todayWorkout.category]||'#06b6d4',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}},'Today \u00b7 '+today),
      React.createElement('div',{style:{fontSize:20,fontWeight:800,color:T.text,marginBottom:12}},todayWorkout.label),
      React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:4}},
        (todayWorkout.exercises||[]).map((ex,i)=>React.createElement('div',{key:i,style:{display:'flex',justifyContent:'space-between',fontSize:13,color:T.sub}},
          React.createElement('div',null,ex.name),
          React.createElement('div',{style:{fontFamily:T.mono,color:T.dim}},ex.sets+'×'+ex.reps)
        ))
      ),
      React.createElement('div',{style:{marginTop:12,fontSize:11,color:T.dim}},'Log in Strong, then import via Settings \u2192 Import CSV')
    ),

    // Weekly volume
    React.createElement(WeeklyVolumeCard,{allLogs,customBp,setCustomBp}),

    // Progressive overload
    React.createElement(OverloadCard,{allLogs,workouts}),

    // PRs this week
    recentPRs.length>0&&React.createElement('div',{style:{margin:'0 16px 12px',background:T.bg2,borderRadius:14,border:'1px solid '+T.border,padding:'12px 16px'}},
      React.createElement('div',{style:{fontSize:13,fontWeight:700,color:T.text,marginBottom:10}},'\uD83C\uDFC6 PRs This Week'),
      recentPRs.slice(0,5).map((pr,i)=>React.createElement('div',{key:i,style:{display:'flex',justifyContent:'space-between',padding:'6px 0',borderTop:i>0?'1px solid '+T.border:'none'}},
        React.createElement('div',{style:{fontSize:13,color:T.sub}},pr.name),
        React.createElement('div',{style:{fontSize:13,fontWeight:700,color:'#fbbf24',fontFamily:T.mono}},pr.e1rm+' e1RM')
      ))
    )
  );
}



function parseFitLogRoutineCSV(text){
  const lines=text.trim().split(/\r?\n/);
  if(!lines.length)return null;
  function parseLine(line){const fields=[];let cur='',inQ=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){inQ=!inQ;}else if(ch===','&&!inQ){fields.push(cur.trim());cur='';}else{cur+=ch;}}fields.push(cur.trim());return fields;}
  const header=parseLine(lines[0]).map(h=>h.toLowerCase());
  const iRoutine=header.indexOf('routine'),iExId=header.indexOf('exercise_id'),iExName=header.indexOf('exercise_name'),iSets=header.indexOf('sets'),iReps=header.indexOf('reps'),iNote=header.indexOf('note');
  if(iRoutine<0||iExId<0||iExName<0||iSets<0||iReps<0)return null;

  function inferType(name){
    const n=name.toLowerCase();
    if(/push|chest|shoulder|tricep/.test(n)&&!/pull/.test(n))return'push';
    if(/pull|back|row|lat |curl|bicep|deadlift|shrug|face pull/.test(n))return'pull';
    if(/leg|squat|calf|quad|hamstring|glute/.test(n))return'legs';
    return'other';
  }

  const routines={};
  for(let i=1;i<lines.length;i++){
    const f=parseLine(lines[i]);
    if(f.length<5)continue;
    const routineName=(f[iRoutine]||'').trim();if(!routineName)continue;
    const exId=(f[iExId]||'').trim(),exName=(f[iExName]||'').trim();
    if(!exId||!exName)continue;
    const sets=parseInt(f[iSets])||3;
    const repsRaw=(f[iReps]||'').trim();
    const isRamp=/^ramp$/i.test(repsRaw);
    const reps=isRamp?'8/8/3/1/1/1/5':(repsRaw||'8-12');
    const note=iNote>=0?(f[iNote]||'').trim():'';
    if(!routines[routineName])routines[routineName]={note:'',exercises:[],wtype:inferType(routineName)};
    if(note)routines[routineName].note=note;
    routines[routineName].exercises.push({id:exId,name:exName,sets,reps});
  }
  return Object.keys(routines).length?routines:null;
}

function PPLTracker(){
  const[workouts,setWorkoutsRaw]=useState(()=>loadLS('fitlog_workouts',null)||GENERIC_STARTER_WORKOUTS);
  const[workoutsLoaded,setWorkoutsLoaded]=useState(false);
  const[schedule,setScheduleRaw]=useState(()=>{const s=loadLS('fitlog_schedule',null);return Array.isArray(s)&&s.length>0?s:DEFAULT_SCHEDULE;});
  const[restDefaults,setRestDefaultsRaw]=useState(loadRestDefaults);
  const[allLogs,setAllLogs]=useState({});
  const[customBp,setCustomBp]=useState(function(){return loadLS('fitlog_custom_bodypart',{});});
  const[tab,setTab]=useState('dashboard');
  const[editingSchedule,setEditingSchedule]=useState(false);
  const[editingSettings,setEditingSettings]=useState(false);
  const[importResult,setImportResult]=useState(null);
  const[pendingImport,setPendingImport]=useState(null);
  const[pendingRoutineImport,setPendingRoutineImport]=useState(null);
  const importRef=useRef(null);

  useEffect(()=>{
    fetchAllLogs().then(data=>setAllLogs(data)).catch(()=>{});
    fetchServerWorkouts().then(data=>{
      if(data&&Object.keys(data).length>0){
        setWorkoutsRaw(data);saveLS('fitlog_workouts',data);
      } else {
        setWorkoutsRaw(GENERIC_STARTER_WORKOUTS);saveLS('fitlog_workouts',GENERIC_STARTER_WORKOUTS);
        saveServerWorkouts(GENERIC_STARTER_WORKOUTS);
      }
      setWorkoutsLoaded(true);
    }).catch(()=>setWorkoutsLoaded(true));

    fetchServerSchedule().then(data=>{
      if(data&&Array.isArray(data)&&data.length>0){
        setScheduleRaw(data);saveLS('fitlog_schedule',data);
        const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const today=days[new Date().getDay()];
        const todayItem=data.find(x=>x.day===today);
      }else{saveServerSchedule(DEFAULT_SCHEDULE);}
    }).catch(()=>{});

    fetchServerRestDefaults().then(data=>{
      if(data&&Object.keys(data).length>0){
        setRestDefaultsRaw(data);saveLS('fitlog_rest_defaults',data);
      }else{saveServerRestDefaults(restDefaults);}
    }).catch(()=>{});

    fetchBodyPartOverrides().then(function(data){
      var local=loadLS('fitlog_custom_bodypart',{});
      var hasLocal=Object.keys(local).length>0;
      var hasRemote=data&&Object.keys(data).length>0;
      if(hasRemote){
        var merged=Object.assign({},local,data);
        saveLS('fitlog_custom_bodypart',merged);
        setCustomBp(merged);
        if(Object.keys(merged).length>Object.keys(data).length){
          saveBodyPartOverrides(merged); // push any local-only ones up
        }
      } else if(hasLocal){
        saveBodyPartOverrides(local); // first time — migrate local to Supabase
      }
    }).catch(function(){});
  },[]);

  function setWorkouts(w){setWorkoutsRaw(w);saveLS('fitlog_workouts',w);saveServerWorkouts(w);}
  function setSchedule(w){setScheduleRaw(w);saveLS('fitlog_schedule',w);saveServerSchedule(w);}
  function setRestDefaults(d){setRestDefaultsRaw(d);saveLS('fitlog_rest_defaults',d);saveServerRestDefaults(d);}
  function handleReorder(newOrder){saveLS('fitlog_routine_order',newOrder);}
  function handleArchive(key){saveLS('fitlog_archived_'+key,true);}
  function handleUnarchive(key){localStorage.removeItem('fitlog_archived_'+key);}

  function handleUpdateLog(exId,logIdx,updates){
    const logs={...allLogs};const arr=[...(logs[exId]||[])];
    arr[logIdx]={...arr[logIdx],...updates};logs[exId]=arr;
    setAllLogs(logs);pushExerciseLogs(exId,arr);
  }
  function handleDeleteSet(exId,logIdx){
    const logs={...allLogs};const arr=[...(logs[exId]||[])];
    arr.splice(logIdx,1);logs[exId]=arr;
    setAllLogs(logs);pushExerciseLogs(exId,arr);
  }
  function handleDeleteSession(sessionId){
    const newLogs={};
    Object.entries(allLogs).forEach(([exId,entries])=>{
      const filtered=entries.filter(e=>!(e.date&&e.date.startsWith(sessionId)));
      newLogs[exId]=filtered;
      pushExerciseLogs(exId,filtered);
    });
    setAllLogs(newLogs);
  }
  function handleAddExercise(wKey,ex){
    const updated={...workouts,[wKey]:{...workouts[wKey],exercises:[...(workouts[wKey].exercises||[]),ex]}};
    setWorkouts(updated);
  }
  function handleExportLogs(){
    const blob=new Blob([JSON.stringify(allLogs,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=url;a.download='fitlog_export_'+Date.now()+'.json';a.click();URL.revokeObjectURL(url);
  }
  function handleExportCSV(){
    const rows=['Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes'];
    Object.entries(allLogs).forEach(([exId,entries])=>{
      (entries||[]).forEach((e,i)=>{rows.push([e.date||'',e.workoutName||'',e.exName||exId,i+1,e.weight||0,e.reps||0,'','',e.notes||''].join(','));});
    });
    const blob=new Blob([rows.join('\n')],{type:'text/csv'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=url;a.download='fitlog_strong_'+Date.now()+'.csv';a.click();URL.revokeObjectURL(url);
  }
  function confirmImport(importLogs,importRoutines){
    if(!pendingImport)return;
    const{parsed}=pendingImport;
    if(importLogs){
      const mergedLogs={...allLogs};
      Object.entries(parsed.logs).forEach(([exId,entries])=>{
        const existing=mergedLogs[exId]||[];
        const existingKeys=new Set(existing.map(e=>e.date+'_'+e.weight+'_'+e.reps));
        const newEntries=entries.filter(e=>!existingKeys.has(e.date+'_'+e.weight+'_'+e.reps));
        mergedLogs[exId]=[...existing,...newEntries].sort((a,b)=>new Date(a.date)-new Date(b.date));
      });
      setAllLogs(mergedLogs);
      Object.entries(mergedLogs).forEach(([exId,entries])=>pushExerciseLogs(exId,entries));
    }
    if(importRoutines){
      const mergedWorkouts={...workouts};
      Object.entries(parsed.workouts).forEach(([k,w])=>{if(!mergedWorkouts[k]&&!PROTECTED_KEYS.has(k))mergedWorkouts[k]=w;});
      setWorkouts(mergedWorkouts);
    }
    setImportResult({type:'strong',message:'Import complete.'});
    setPendingImport(null);
  }
  function confirmRoutineImport(){
    if(!pendingRoutineImport)return;
    const updated={...workouts};let created=0,updatedCount=0;
    pendingRoutineImport.preview.forEach(r=>{
      if(r.existingKey){
        if(PROTECTED_KEYS.has(r.existingKey))return;
        updated[r.existingKey]={...updated[r.existingKey],note:r.note||updated[r.existingKey].note,exercises:r.exercises};
        updatedCount++;
      }else{
        const key='custom_'+r.label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')+'_'+Date.now();
        updated[key]={label:r.label,tag:'Custom',category:r.wtype==='other'?'pull':r.wtype,gym:'anthropic',wtype:r.wtype,note:r.note||'',exercises:r.exercises};
        created++;
      }
    });
    setWorkouts(updated);
    setImportResult({type:'strong',message:'Imported '+created+' new, updated '+updatedCount+' routines.'});
    setPendingRoutineImport(null);
  }
  function handleImportFile(e){
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const text=ev.target.result;
      try{const data=JSON.parse(text);if(data.exercises)setWorkouts({...workouts,['custom_'+Date.now()]:data});else setWorkouts({...workouts,...data});setImportResult({type:'json',message:'FitLog routine imported.'});return;}catch{}
      const fitlogRoutines=parseFitLogRoutineCSV(text);
      if(fitlogRoutines){
        const preview=Object.entries(fitlogRoutines).map(([label,r])=>{
          const existingKey=Object.entries(workouts).find(([k,w])=>w.label.toLowerCase()===label.toLowerCase());
          return{label,note:r.note,wtype:r.wtype,exercises:r.exercises,existingKey,willUpdate:!!existingKey};
        });
        setPendingRoutineImport({preview});return;
      }
      const parsed=parseStrongCSV(text);
      if(!parsed){setImportResult({type:'error',message:'Unrecognised file format.'});return;}
      const newRoutines=Object.keys(parsed.workouts).filter(k=>!PROTECTED_KEYS.has(k)&&!workouts[k]).length;
      const newSets=Object.values(parsed.logs).reduce((t,e)=>t+e.length,0);
      setPendingImport({parsed,newRoutines,newSets,newExercises:parsed.stats.totalExercises});
    };
    reader.readAsText(file);e.target.value='';
  }

  if(editingSchedule)return React.createElement(ScheduleEditor,{schedule,workouts,onSave:(s)=>{setSchedule(s);setEditingSchedule(false);},onCancel:()=>setEditingSchedule(false)});
  if(editingSettings)return React.createElement(SettingsModal,{restDefaults,schedule,workouts,allLogs,onSave:(d)=>{setRestDefaults(d);setEditingSettings(false);},onCancel:()=>setEditingSettings(false)});

  const accent='#7c3aed';

  const TabBar=()=>React.createElement('div',{style:{position:'fixed',bottom:0,left:0,right:0,zIndex:100,background:T.bg,borderTop:'1px solid '+T.border,display:'flex',paddingBottom:'env(safe-area-inset-bottom)'}},
    [
      {id:'dashboard',label:'Dashboard',icon:'\uD83C\uDFCB'},
      {id:'history',label:'History',icon:'\uD83D\uDCCB'},
      {id:'routines',label:'Routines',icon:'\uD83D\uDCC5'},
      {id:'exercises',label:'Exercises',icon:'\uD83D\uDCAA'},
      {id:'settings',label:'Settings',icon:'\u2699\uFE0F'},
    ].map(({id,label,icon})=>React.createElement('button',{key:id,onClick:()=>setTab(id),style:{flex:1,padding:'10px 4px 8px',border:'none',background:'none',color:tab===id?accent:T.dim,fontSize:10,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,WebkitTapHighlightColor:'transparent',fontFamily:T.sans}},
      React.createElement('div',{style:{fontSize:20}},icon),
      React.createElement('div',{style:{fontWeight:tab===id?700:400}},label)
    ))
  );

  return React.createElement('div',{style:{background:T.bg,minHeight:'100vh',fontFamily:T.sans,color:T.text}},
    // Header
    React.createElement('div',{style:{position:'sticky',top:0,zIndex:10,backdropFilter:'blur(16px)',borderBottom:'1px solid '+T.border,padding:'0 16px',background:'linear-gradient(180deg,'+T.bg+'f8 0%,'+T.bg+'e0 100%)'}},
      React.createElement('div',{style:{position:'relative',display:'flex',alignItems:'center',justifyContent:'center',paddingTop:18,paddingBottom:14}},
        React.createElement('div',{style:{fontSize:30,fontFamily:"'Anton',sans-serif",transform:'skewX(-8deg)',background:GRAD.accent,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text',letterSpacing:'0.01em',textTransform:'uppercase'}},'FitLog'),
        React.createElement('button',{onClick:()=>supabase.auth.signOut(),style:{position:'absolute',right:0,width:38,height:38,borderRadius:10,border:'1px solid '+T.border2,background:'rgba(255,255,255,0.03)',color:T.muted,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,WebkitTapHighlightColor:'transparent'}},'\u238b')
      )
    ),

    // Tab content
    tab==='dashboard'&&React.createElement(DashboardTab,{allLogs,workouts,schedule,restDefaults,customBp,setCustomBp}),

    tab==='history'&&React.createElement(HistoryView,{
      allLogs,workouts,
      onUpdateLog:handleUpdateLog,
      onDeleteSet:handleDeleteSet,
      onDeleteSession:handleDeleteSession,
      onAddExercise:handleAddExercise,
      onSaveRoutine:(key,draft)=>{setWorkouts({...workouts,[key]:draft});},
    }),

    tab==='routines'&&React.createElement(RoutinesTab,{
      workouts,allLogs,
      onStartWorkout:null,
      onSaveRoutine:(key,draft)=>{setWorkouts({...workouts,[key]:draft});},
      onReorder:handleReorder,
      onArchive:handleArchive,
    }),

    tab==='exercises'&&React.createElement(ExerciseDatabase,{
      workouts,restDefaults,allLogs,
      onSaveRestDefaults:(d)=>{setRestDefaults(d);},
      onSaveExercise:(wKey,exIdx,updates)=>{
        const updated={...workouts,[wKey]:{...workouts[wKey],exercises:workouts[wKey].exercises.map((ex,i)=>i===exIdx?{...ex,...updates}:ex)}};
        setWorkouts(updated);
      },
      onCreateExercise:(newEx)=>{
        const customW=workouts['custom_exercises']||{label:'Custom Exercises',tag:'Custom',category:'pull',gym:'general',wtype:'other',note:'',exercises:[]};
        if(customW.exercises.find(e=>e.id===newEx.id)){alert('An exercise with that name already exists.');return;}
        setWorkouts({...workouts,custom_exercises:{...customW,exercises:[...customW.exercises,newEx]}});
      }
    }),

    tab==='settings'&&React.createElement('div',{style:{padding:'16px 16px 100px'}},
      React.createElement('div',{style:{fontSize:20,fontWeight:700,color:T.text,marginBottom:16}},'Settings'),

      // Import section
      React.createElement('div',{style:{background:T.bg2,borderRadius:12,padding:16,marginBottom:12,border:'1px solid '+T.border}},
        React.createElement('div',{style:{fontSize:14,fontWeight:700,color:T.text,marginBottom:4}},'Import from Strong'),
        React.createElement('div',{style:{fontSize:12,color:T.dim,marginBottom:12}},'Export a CSV from the Strong app and import it here to sync your workout history.'),
        pendingRoutineImport&&React.createElement('div',{style:{marginBottom:12,padding:14,borderRadius:10,background:'rgba(20,184,166,0.1)',border:'1px solid rgba(20,184,166,0.3)'}},
          React.createElement('div',{style:{fontSize:13,fontWeight:700,color:T.text,marginBottom:4}},'Import Routine CSV'),
          React.createElement('div',{style:{fontSize:11,color:T.muted,marginBottom:10}},pendingRoutineImport.preview.length+' routines detected'),
          pendingRoutineImport.preview.map((r,i)=>React.createElement('div',{key:i,style:{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',marginBottom:4,background:T.bg3,borderRadius:7}},
            React.createElement('div',{style:{flex:1,fontSize:12,color:T.text,fontWeight:600}},r.label),
            React.createElement('div',{style:{fontSize:10,color:T.dim}},r.exercises.length+' ex'),
            React.createElement('div',{style:{fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,color:r.willUpdate?'#fbbf24':'#5eead4',background:r.willUpdate?'rgba(251,191,36,0.15)':'rgba(20,184,166,0.15)'}},r.willUpdate?'UPDATE':'NEW')
          )),
          React.createElement('div',{style:{display:'flex',gap:8,marginTop:10}},
            React.createElement('button',{onClick:()=>setPendingRoutineImport(null),style:{flex:1,padding:10,borderRadius:8,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:13,cursor:'pointer'}},'Cancel'),
            React.createElement('button',{onClick:confirmRoutineImport,style:{flex:2,padding:10,borderRadius:8,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}},'Import Routines')
          )
        ),
        pendingImport&&React.createElement('div',{style:{marginBottom:12,padding:14,borderRadius:10,background:'rgba(124,58,237,0.1)',border:'1px solid rgba(124,58,237,0.3)'}},
          React.createElement('div',{style:{fontSize:13,fontWeight:700,color:T.text,marginBottom:8}},'Ready to import'),
          React.createElement('div',{style:{fontSize:12,color:T.muted,marginBottom:4}},pendingImport.newExercises+' exercises \u00b7 '+pendingImport.newSets+' sets'),
          React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6}},
            React.createElement('button',{onClick:()=>confirmImport(true,true),style:{width:'100%',padding:10,borderRadius:8,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}},'Import History + New Routines'),
            React.createElement('button',{onClick:()=>confirmImport(true,false),style:{width:'100%',padding:10,borderRadius:8,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:13,cursor:'pointer'}},'History Only'),
            React.createElement('button',{onClick:()=>setPendingImport(null),style:{width:'100%',padding:10,borderRadius:8,border:'1px solid '+T.border2,background:'transparent',color:T.dim,fontSize:12,cursor:'pointer'}},'Cancel')
          )
        ),
        importResult&&React.createElement('div',{style:{marginBottom:10,padding:'10px 12px',borderRadius:8,background:importResult.type==='error'?'rgba(239,68,68,0.1)':'rgba(52,211,153,0.1)',border:'1px solid '+(importResult.type==='error'?'rgba(239,68,68,0.3)':'rgba(52,211,153,0.3)'),fontSize:12,color:importResult.type==='error'?'#f87171':'#34d399'}},importResult.message),
        React.createElement('input',{type:'file',accept:'.csv,.json',ref:importRef,onChange:handleImportFile,style:{display:'none'}}),
        React.createElement('button',{onClick:()=>importRef.current&&importRef.current.click(),style:{width:'100%',padding:12,borderRadius:10,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',minHeight:46}},'Import CSV / JSON')
      ),

      // Export section
      React.createElement('div',{style:{background:T.bg2,borderRadius:12,padding:16,marginBottom:12,border:'1px solid '+T.border}},
        React.createElement('div',{style:{fontSize:14,fontWeight:700,color:T.text,marginBottom:12}},'Export'),
        React.createElement('div',{style:{display:'flex',gap:8}},
          React.createElement('button',{onClick:handleExportCSV,style:{flex:1,padding:11,borderRadius:9,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:13,cursor:'pointer'}},'Strong CSV'),
          React.createElement('button',{onClick:handleExportLogs,style:{flex:1,padding:11,borderRadius:9,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:13,cursor:'pointer'}},'JSON Backup')
        )
      ),

      // Schedule
      React.createElement('div',{style:{background:T.bg2,borderRadius:12,padding:16,marginBottom:12,border:'1px solid '+T.border}},
        React.createElement('div',{style:{fontSize:14,fontWeight:700,color:T.text,marginBottom:12}},'Weekly Schedule'),
        React.createElement('button',{onClick:()=>setEditingSchedule(true),style:{width:'100%',padding:11,borderRadius:9,border:'1px solid '+T.border2,background:'transparent',color:T.sub,fontSize:13,cursor:'pointer'}},'Edit Schedule')
      ),

      // Account
      React.createElement('div',{style:{background:T.bg2,borderRadius:12,padding:16,border:'1px solid '+T.border}},
        React.createElement('div',{style:{fontSize:14,fontWeight:700,color:T.text,marginBottom:12}},'Account'),
        React.createElement('button',{onClick:()=>supabase.auth.signOut(),style:{width:'100%',padding:11,borderRadius:9,border:'1px solid rgba(239,68,68,0.3)',background:'rgba(239,68,68,0.1)',color:'#f87171',fontSize:13,fontWeight:600,cursor:'pointer'}},'Sign Out')
      )
    ),

    React.createElement(TabBar)
  );
}



function AuthScreen({onAuthed}){
  const[mode,setMode]=useState('login'); // login | signup
  const[email,setEmail]=useState('');
  const[password,setPassword]=useState('');
  const[error,setError]=useState('');
  const[loading,setLoading]=useState(false);

  async function handleSubmit(e){
    e.preventDefault();
    setError('');setLoading(true);
    try{
      if(mode==='signup'){
        const{data,error:err}=await supabase.auth.signUp({email,password});
        if(err)throw err;
        if(data.session)onAuthed();
        else setError('Check your email to confirm your account, then log in.');
      } else {
        const{error:err}=await supabase.auth.signInWithPassword({email,password});
        if(err)throw err;
        onAuthed();
      }
    }catch(err){
      setError(err.message||'Something went wrong.');
    }finally{
      setLoading(false);
    }
  }

  return React.createElement('div',{style:{minHeight:'100vh',background:T.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24,fontFamily:T.sans}},
    React.createElement('div',{style:{width:'100%',maxWidth:360}},
      React.createElement('div',{style:{textAlign:'center',marginBottom:32}},
        React.createElement('div',{style:{fontSize:42,fontFamily:"'Anton',sans-serif",transform:'skewX(-8deg)',background:GRAD.accent,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text',letterSpacing:'0.01em',textTransform:'uppercase'}},'FitLog'),
        React.createElement('div',{style:{fontSize:13,color:T.muted,marginTop:6}},mode==='login'?'Welcome back':'Create your account')
      ),
      React.createElement('form',{onSubmit:handleSubmit},
        React.createElement('input',{type:'email',placeholder:'Email',value:email,onChange:e=>setEmail(e.target.value),autoCapitalize:'off',autoCorrect:'off',required:true,style:{width:'100%',padding:'13px 14px',background:T.bg2,border:'1px solid '+T.border2,borderRadius:10,color:T.text,fontSize:15,fontFamily:T.sans,marginBottom:10,minHeight:48}}),
        React.createElement('input',{type:'password',placeholder:'Password',value:password,onChange:e=>setPassword(e.target.value),required:true,minLength:6,style:{width:'100%',padding:'13px 14px',background:T.bg2,border:'1px solid '+T.border2,borderRadius:10,color:T.text,fontSize:15,fontFamily:T.sans,marginBottom:16,minHeight:48}}),
        error&&React.createElement('div',{style:{fontSize:13,color:'#f87171',marginBottom:14,padding:'10px 12px',background:'rgba(239,68,68,0.1)',borderRadius:8,lineHeight:1.4}},error),
        React.createElement('button',{type:'submit',disabled:loading,style:{width:'100%',padding:15,borderRadius:12,border:'none',background:GRAD.button,color:'#fff',fontWeight:700,fontSize:16,cursor:loading?'default':'pointer',minHeight:52,opacity:loading?0.6:1,WebkitTapHighlightColor:'transparent'}},loading?'...':(mode==='login'?'Log In':'Sign Up'))
      ),
      React.createElement('div',{style:{textAlign:'center',marginTop:20}},
        React.createElement('button',{onClick:()=>{setMode(m=>m==='login'?'signup':'login');setError('');},style:{background:'none',border:'none',color:T.muted,fontSize:13,cursor:'pointer',WebkitTapHighlightColor:'transparent'}},
          mode==='login'?"Don't have an account? Sign up":'Already have an account? Log in'
        )
      )
    )
  );
}

function AppRoot(){
  const[session,setSession]=useState(undefined); // undefined = loading, null = logged out, object = logged in
  const hadSessionRef=useRef(false);

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{
      setSession(data.session);
      if(data.session)hadSessionRef.current=true;
    });

    const{data:listener}=supabase.auth.onAuthStateChange((event,newSession)=>{
      if(newSession){
        hadSessionRef.current=true;
        setSession(newSession);
        return;
      }
      // newSession is null — could be a real sign-out, or a transient background
      // token-refresh hiccup (e.g. brief network blip). If we previously had a
      // valid session, don't nuke the whole app (and any in-progress workout)
      // on the first failure — try once more before believing it.
      if(hadSessionRef.current){
        supabase.auth.refreshSession().then(({data,error})=>{
          if(data.session){
            setSession(data.session);
          } else {
            hadSessionRef.current=false;
            setSession(null);
          }
        }).catch(()=>{
          hadSessionRef.current=false;
          setSession(null);
        });
      } else {
        setSession(null);
      }
    });
    return()=>listener.subscription.unsubscribe();
  },[]);

  if(session===undefined){
    return React.createElement('div',{style:{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}},
      React.createElement('div',{style:{fontSize:14,color:T.muted}},'Loading...')
    );
  }
  if(!session){
    return React.createElement(AuthScreen,{onAuthed:()=>{}});
  }
  return React.createElement(PPLTracker,{key:session.user.id});
}

ReactDOM.render(React.createElement(AppRoot),document.getElementById('root'));