// Deterministic continuation checks. Test-owned RNG is cloned, never game/account state.
// The actual game intentionally uses fresh randomness after loading; this probe holds
// future rolls equal to isolate missing snapshots, replayed hits or changed cooldowns.
'use strict';
const assert=require('node:assert/strict');
const C=require('../dist/core.js');
const seconds=Number(process.argv[2]||12);
assert.ok(Number.isFinite(seconds)&&seconds>=2&&seconds<=60,'duration must be 2–60 simulated seconds');
function seeded(seed){let state=seed>>>0;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};random.state=()=>state>>>0;return random;}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}
function firstDifference(a,b,path='save'){
  if(Object.is(a,b))return null;
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return `${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
  for(const key of new Set([...Object.keys(a),...Object.keys(b)])){const result=firstDifference(a[key],b[key],`${path}.${key}`);if(result)return result;}return null;
}
function portable(game){return game.state==='ended'?{state:game.state,won:game.won,time:game.time,kills:game.kills,player:game.player,report:game.report()}:JSON.parse(C.exportRunSave(game,game.campaignLevel));}
function equal(a,b,label){const difference=firstDifference(canonical(portable(a)),canonical(portable(b)));assert.equal(difference,null,label+(difference?` — ${difference}`:''));}
function choice(game){if(game.state==='upgrade')game.choose(0);else if(game.state==='catalyst')game.chooseCatalyst(0);else if(game.state==='lottery')game.acknowledgeLottery();else if(game.state==='paused')game.resume();}
const cases=[];
for(const level of C.CAMPAIGN_LEVELS){
  const build=C.PRACTICE_BUILDS[(level.id-1)%C.PRACTICE_BUILDS.length];
  cases.push({name:`campaign-${level.id}-progression`,level:level.id,skills:build.skills,tier:1,catalyst:build.catalyst});
  cases.push({name:`campaign-${level.id}-late`,level:level.id,skills:build.skills,tier:4,catalyst:build.catalyst,late:true});
  cases.push({name:`campaign-${level.id}-boss`,level:level.id,skills:build.skills,tier:3,catalyst:build.catalyst,boss:(level.id-1)%3+1});
}
for(const fusion of C.FUSIONS)cases.push({name:`fusion-${fusion.id}`,level:10,skills:[...fusion.requires,...['power','move','ghost','shield','heal','crit'].filter(id=>!fusion.requires.includes(id))].slice(0,C.MAX_SLOTS),tier:4,catalyst:fusion.id==='starfire'?'comet':fusion.id==='ionCitadel'?'relay':'pressure',late:true,fusion:fusion.id});
for(const reward of ['upgrade','catalyst','lottery','paused'])cases.push({name:`state-${reward}`,level:10,skills:C.PRACTICE_BUILDS[4].skills,tier:3,catalyst:'relay',reward});
for(const revival of ['ready','spent'])cases.push({name:`equipment-rebirth-${revival}`,level:10,skills:C.PRACTICE_BUILDS[4].skills,tier:4,catalyst:'refractor',late:true,revival});
cases.push({name:'mender-channel',level:1,skills:['move','shield','heal'],tier:1,catalyst:'collector',mender:true});
let checkpoints=0,frames=0;const states=new Set(),levels=new Set(),weapons=new Set();
for(const [index,scenario]of cases.entries()){
  const random=seeded(87173+index),equipment=scenario.revival?Object.fromEntries(C.EQUIPMENT.map(e=>[e.id,{id:e.id,level:3}])):{},a=new C.Game({campaignLevel:scenario.level,random,equipment});
  for(const id of scenario.skills){for(let tier=0;tier<scenario.tier;tier++)a.advanceSkill(id);weapons.add(id);}
  if(scenario.fusion)a.advanceSkill(scenario.fusion);a.equipCatalyst(scenario.catalyst);
  if(scenario.revival==='spent'){a.player.shieldCharges=0;a.damagePlayer(9999,'bossContact');assert.equal(a.player.revivalUsed,1);assert.equal(a.player.revivalCharges,0);}a.player.invuln=1e6;
  if(scenario.late){a.upgrades=39;a.bossesDefeated=[1,2];a.bossesSpawned=[1,2];a.firstBossSpawned=true;a.firstBossDefeated=true;}
  if(scenario.boss){a.upgrades=C.BOSS_MILESTONES[scenario.boss-1].upgrade;a.spawnBoss(scenario.boss);}
  if(scenario.reward==='upgrade'){a.player.xp=a.nextXp;a.maybeUpgrade();}
  if(scenario.reward==='catalyst'){a.upgrades=6;a.afterUpgrade();}
  if(scenario.reward==='lottery'){a.upgrades=10;a.spawnBoss(1);a.kill(a.boss);}
  if(scenario.reward==='paused')a.pause();
  if(scenario.mender){a.spawnClock=10;a.player.fireClock=10;const healer=a.createEnemy('mender',a.player.x+150,a.player.y);healer.hp=healer.maxHp=10000;healer.menderClock=0;const ally=a.createEnemy('tank',healer.x+60,healer.y);ally.maxHp=10000;ally.hp=5000;a.moveEnemy(healer,.01,[]);assert.ok(healer.menderIntent);}
  let b,rightRandom,elapsed=0,frame=0;
  function checkpoint(){
    if(b)equal(a,b,`${scenario.name} frame ${frame} before checkpoint`);
    if(a.state==='ended')return;
    const state=random.state();rightRandom=seeded(state);const restored=C.importRunSave(C.exportRunSave(a,scenario.level),{random:rightRandom}).game;
    assert.equal(rightRandom.state(),state,'loading consumed future combat RNG');if(a.state==='playing')restored.resume();b=restored;
    equal(a,b,`${scenario.name} frame ${frame} immediately after load`);checkpoints++;states.add(a.state);
  }
  checkpoint();
  while(elapsed<seconds&&a.state!=='ended'){
    if(a.state!=='playing'){checkpoint();choice(a);choice(b);equal(a,b,`${scenario.name} reward frame ${frame}`);}
    if(a.state==='ended')break;
    const dt=[1/60,.033,.05,.1][frame%4],input={x:Math.cos(elapsed*.7),y:Math.sin(elapsed*.9)};
    a.step(dt,input);b.step(dt,input);a.takeEvents();b.takeEvents();
    assert.equal(rightRandom.state(),random.state(),`${scenario.name} frame ${frame}: future RNG diverged`);assert.equal(b.state,a.state,`${scenario.name} frame ${frame}: state diverged`);
    elapsed+=dt;frame++;frames++;
    if(frame%31===0||a.state!=='playing')checkpoint();
  }
  equal(a,b,`${scenario.name} final frame ${frame}`);levels.add(scenario.level);
  console.log(JSON.stringify({case:scenario.name,simulatedSeconds:Number(elapsed.toFixed(2)),frames:frame,state:a.state,continued:true}));
}
assert.equal(levels.size,10);assert.equal(weapons.size,C.SKILLS.filter(s=>!s.fusion).length,'missing base weapon coverage');
assert.deepEqual([...states].sort(),['catalyst','lottery','paused','playing','upgrade'],'missing portable state coverage');
console.log(`PASS: ${cases.length} deterministic continuation cases, ${frames} paired frames, ${checkpoints} checkpoints; saved states ${[...states].sort().join('/')}. Not real-browser/FPS/balance verification.`);
