// Reproducible logic stress probe, NOT a browser FPS or human balance benchmark.
// Fixed max-tier builds; invulnerability and disabled XP keep one combat phase active.
// Run: node scripts/stress-core.cjs [simulated-seconds, default 40, max 180]
'use strict';
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {Game,FUSIONS,EQUIPMENT,MAX_SLOTS,RUN_UPGRADES,exportRunSave,importRunSave}=require('../dist/core.js');
const seconds=Number(process.argv[2]||40);
assert.ok(Number.isFinite(seconds)&&seconds>=1&&seconds<=180,'duration must be 1–180 simulated seconds');
const builds=[
  ['射击追猎',['rate','power','crit','drone','frost','shield','move','heal'],'guidance'],
  ['领域聚怪',['aura','well','frost','lightning','mine','orbit','ghost','move'],'singularity'],
  ['混合压力',['rate','power','crit','lightning','mine','well','drone','shield'],'pressure'],
  ['守护共振',['shield','orbit','heal','ghost','move','frost','drone','crit'],'prism'],
  ['霜蚀领域',['frost','aura','lightning','well','orbit','shield','ghost','move'],'cryo'],
  ['镜界裂变',['beam','nova','power','rate','well','mine','shield','move'],'singularity',3],
  ['折跃合体',['beam','nova','lightning','mine','frost','well','power','move'],'pressure',4],
  ['哨箭黑洞',['arrow','mine','well','power','move','shield','frost','lightning'],'singularity',5],
  ['天穹锯阵',['saw','arrow','nova','power','move','shield','frost','lightning'],'pressure',6],
  ['工坊混合',['saw','rate','power','crit','drone','shield','move','heal'],'guidance',6,{core:{id:'ember',level:3},shell:{id:'plating',level:3},boots:{id:'swift',level:3}}],
  ['花园投掷',['flask','saw','aura','well','power','shield','move','heal'],'collector',7,{core:{id:'rhythm',level:3},shell:{id:'hull',level:3},boots:{id:'collector',level:3}}],
  ['刃羽融合',['saw','arrow','power','rate','move','shield','frost','heal'],'pressure',6,undefined,'bladeWing'],
  ['熔金融合',['flask','aura','power','move','frost','well','shield','heal'],'diffuser',7,undefined,'goldenDomain'],
  ['全装投掷',['flask','saw','power','move','ghost','well','shield','heal'],'pressure',7,Object.fromEntries(EQUIPMENT.map(gear=>[gear.id,{id:gear.id,level:3}]))],
  ['永冻星雨',['meteor','flask','saw','power','move','ghost','shield','heal'],'pressure',8],
  ['虚空天链',['ion','meteor','aura','power','move','ghost','shield','heal'],'diffuser',9],
  ['熔核卫阵',['turret','ion','meteor','power','move','ghost','shield','heal'],'pressure',10,Object.fromEntries(EQUIPMENT.map(gear=>[gear.id,{id:gear.id,level:3}]))],
  ['星火炼狱',['meteor','flask','power','move','ghost','well','shield','heal'],'comet',10,undefined,'starfire'],
  ['天链星阵',['ion','turret','power','crit','move','ghost','shield','heal'],'refractor',10,undefined,'ionCitadel'],
  ['蜂群天火',['rocket','drone','meteor','power','move','ghost','shield','heal'],'warhead',10,undefined,'skyHunter']
];
function seeded(seed){let state=seed>>>0;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};}
function finiteFields(object,fields,label){for(const key of fields)if(object[key]!==undefined)assert.ok(Number.isFinite(object[key]),`${label}.${key} is not finite`);}
function verify(game){
  assert.ok(game.enemies.filter(e=>!e.dead&&e.type==='mender').length<=game.menderCap(),'mender cap exceeded');
  assert.ok(game.rockets.length<=20,'rocket cap exceeded');for(const r of game.rockets){finiteFields(r,['x','y','vx','vy','life','damage','blast','phase','delay'],'rocket');assert.ok(r.trail.length<=8,'rocket trail cap exceeded');}
  finiteFields(game.player,['x','y','hp','maxHp','damage','fireClock','overloadRemaining','shieldClock','blinkClock','chillRemaining','meteorClock'],'player');
  assert.ok(game.hazards.length<=24&&game.meteors.length<=21,'ice or meteor cap exceeded');for(const actor of [...game.hazards,...game.meteors])finiteFields(actor,['x','y','r','age','warning','life','length','damage'],'iceMeteor');assert.ok(game.enemies.filter(e=>!e.dead&&e.type==='glacial').length<=14,'glacial cap exceeded');assert.ok(game.enemies.filter(e=>!e.dead&&e.type==='phaselet').length<=18,'phase hunter cap exceeded');assert.ok(game.enemies.filter(e=>!e.dead&&e.type==='pylon').length<=6,'pylon cap exceeded');finiteFields(game.player,['ionClock','fluxRemaining','turretClock','turretVolley'],'phasePlayer');
  assert.ok(game.player.blinkClock>=0&&game.player.blinkClock<=2,'blink cooldown out of range');
  assert.ok(game.enemies.filter(e=>!e.dead&&e.type==='sentinel').length<=game.sentinelCap(),'sentinel wave cap exceeded');
  for(const enemy of game.enemies)finiteFields(enemy,['x','y','hp','maxHp','speed','slowRemaining','stun'],'enemy');
  for(const bullet of game.bullets)finiteFields(bullet,['x','y','vx','vy','r','life','damage'],'bullet');
  for(const well of game.gravityWells)finiteFields(well,['x','y','r','life','damage','pull'],'well');
  for(const effect of game.effects)finiteFields(effect,['x','y','r','life','total','seed'],'effect');
  assert.ok(game.enemyShots.length<=100,'enemy projectile cap exceeded');for(const shot of game.enemyShots)finiteFields(shot,['x','y','vx','vy','r','life','damage'],'enemyShot');
  if(game.whistle){finiteFields(game.whistle,['x','y','vx','vy','goalX','goalY'],'whistle');assert.ok(game.whistle.trail.length<=16,'whistle trail grew without bound');for(const point of game.whistle.trail)finiteFields(point,['x','y'],'trail');}
  assert.ok(game.saws.length<=18,'saw cap exceeded');for(const saw of game.saws){finiteFields(saw,['x','y','vx','vy','age','life','damage'],'saw');assert.ok(saw.hits instanceof Set);}
  assert.ok(game.enemies.filter(e=>!e.dead&&e.type==='warden').length<=18,'warden cap exceeded');
  assert.ok(game.enemies.filter(e=>!e.dead&&e.elite).length<=game.eliteCap(),'elite cap exceeded');for(const enemy of game.enemies)if(enemy.elite){finiteFields(enemy,['eliteClock'],'elite');if(enemy.eliteIntent)finiteFields(enemy.eliteIntent,['remaining','total','radius'],'eliteIntent');}
  assert.ok(game.flasks.length<=15&&game.acidPools.length<=12&&game.sporeZones.length<=16,'garden actor cap exceeded');for(const list of [game.flasks,game.acidPools,game.sporeZones])for(const actor of list)finiteFields(actor,['x','y','r','life','age','goalX','goalY','damage','warning'],'gardenActor');assert.ok(game.enemies.filter(e=>!e.dead&&e.type==='sporeling').length<=18,'sporeling cap exceeded');
  const before=JSON.stringify(game.stats),report=game.report();
  assert.equal(JSON.stringify(game.stats),before,'report mutated combat accounting');
  finiteFields(report,['totalDamage','bossDamage','damageTaken','blockedDamage'],'report');
  const sum=report.damage.reduce((total,row)=>total+row.damage,0);
  assert.ok(Math.abs(sum-report.totalDamage)<1e-5,'source totals do not add up');
  assert.ok(game.minorCount()<=game.stage().cap,'minor enemies exceed the stage cap');
  assert.equal(game.state,'playing','stress probe unexpectedly left combat');
}
for(let index=0;index<builds.length;index++){
  const [name,skills,catalyst,campaignLevel=1,equipment,fusion]=builds[index],random=seeded(7301+index),game=new Game({width:1100,height:760,random,campaignLevel,equipment});
  assert.equal(skills.length,MAX_SLOTS);
  for(const id of skills)for(let tier=0;tier<4;tier++)game.advanceSkill(id);
  if(campaignLevel===4)for(const id of ['prismEcho','stormfield','glacierWell'])if(game.canFuse(id))game.advanceSkill(id);
  if(campaignLevel===5)game.advanceSkill('blackholeKing');
  if(fusion)game.advanceSkill(fusion);
  if(catalyst)game.equipCatalyst(catalyst);
  game.upgrades=RUN_UPGRADES-1;game.bossesDefeated=[1,2];game.firstBossDefeated=true;
  game.player.invuln=1e6;game.addEnergy=()=>{};
  const kinds=campaignLevel===10?['pylon','swift','tank','splitter','catalyst','charger']:campaignLevel===9?['phaselet','swift','tank','splitter','catalyst','charger']:campaignLevel===8?['glacial','swift','tank','splitter','catalyst','charger']:campaignLevel===7?['sporeling','swift','tank','splitter','catalyst','charger']:campaignLevel===6?['warden','swift','tank','splitter','catalyst','charger']:campaignLevel===5?['sentinel','swift','tank','splitter','catalyst','charger']:['blob','swift','tank','splitter','catalyst','charger'];
  const frames=Math.ceil(seconds*60),begin=performance.now();let peakEnemies=0,peakBullets=0,peakGems=0;
  for(let frame=0;frame<frames;frame++){
    // Maintain a dense field without changing spawn or collision rules in the real game.
    if(frame%60===0){
      const target=Math.min(180,game.stage().cap),missing=Math.max(0,target-game.minorCount());
      for(let n=0;n<missing;n++){
        const angle=random()*Math.PI*2,radius=90+random()*290;
        let kind=kinds[n%kinds.length];if(kind==='sentinel'&&game.enemies.filter(e=>!e.dead&&e.type==='sentinel').length>=game.sentinelCap())kind='blob';
        if(kind==='warden'&&game.enemies.filter(e=>!e.dead&&e.type==='warden').length>=18)kind='blob';
        if(kind==='sporeling'&&game.enemies.filter(e=>!e.dead&&e.type==='sporeling').length>=18)kind='blob';
        if(kind==='glacial'&&game.enemies.filter(e=>!e.dead&&e.type==='glacial').length>=14)kind='blob';
        if(kind==='phaselet'&&game.enemies.filter(e=>!e.dead&&e.type==='phaselet').length>=18)kind='blob';
        if(kind==='pylon'&&game.enemies.filter(e=>!e.dead&&e.type==='pylon').length>=6)kind='blob';
        const enemy=game.createEnemy(kind,game.player.x+Math.cos(angle)*radius,game.player.y+Math.sin(angle)*radius);if(n%10===0)game.promoteElite(enemy,['frenzy','crystal','pulse'][n%3]);
      }
    }
    if(campaignLevel===5&&frame%150===0)game.tryBlink(frame%300===0?1:-1,0);
    const at=frame/60;game.step(1/60,{x:Math.cos(at*.7),y:Math.sin(at*.9)});game.takeEvents();
    peakEnemies=Math.max(peakEnemies,game.minorCount());peakBullets=Math.max(peakBullets,game.bullets.length);peakGems=Math.max(peakGems,game.gems.length);
    if(frame%60===0)verify(game);
    if(frame%300===0){
      const checkpoint=exportRunSave(game,game.campaignLevel);let restored;
      try{restored=importRunSave(checkpoint,{random:seeded(90000+frame)}).game;}catch(error){throw new Error(`${name} frame ${frame}: ${error.message}`,{cause:error});}
      assert.equal(restored.state,'paused','checkpoint must restore paused');assert.deepEqual(restored.player.build,game.player.build);assert.deepEqual(restored.equipment,game.equipment);assert.equal(restored.player.hp,game.player.hp);
      for(const key of ['enemies','bullets','gems','mines','gravityWells','saws','flasks','acidPools','sporeZones','enemyShots','hazards','meteors','rockets'])assert.equal(restored[key].length,game[key].length,`checkpoint lost ${key}`);
      for(const bullet of restored.bullets)assert.ok(bullet.hits instanceof Set,'checkpoint lost bullet hit set');for(const saw of restored.saws)assert.ok(saw.hits instanceof Set,'checkpoint lost saw hit set');
      assert.equal(Boolean(restored.whistle),Boolean(game.whistle),'checkpoint lost whistle');assert.equal(restored.report().totalDamage,game.report().totalDamage,'checkpoint changed effective damage');
    }
  }
  verify(game);
  console.log(JSON.stringify({build:name,catalyst,simulatedSeconds:seconds,logicMs:Math.round(performance.now()-begin),kills:game.kills,effectiveDamage:Math.round(game.report().totalDamage),peakEnemies,peakBullets,peakGems,finite:true}));
}
console.log('PASS: fixed-build core logic only; not actual device FPS, difficulty or human playability.');
