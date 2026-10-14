const assert=require('node:assert/strict');
const {Game,SKILLS,SYNERGIES,CATALYSTS,BY_CATALYST,STAGES,MAX_SLOTS,DAMAGE_SOURCES,RUN_UPGRADES,BOSS_MILESTONES,CAMPAIGN_LEVELS,RUN_HISTORY_LIMIT,PLAYER_DAMAGE_NAMES,createRunRecord,sanitizeRunHistory,appendRunHistory,summarizeRunHistory,PRACTICE_BUILDS,createPracticeGame}=require('../dist/core.js');
let passed=0;
function test(name,fn){fn();passed++;console.log(`PASS ${name}`);}
function quiet(random=()=>.99){const g=new Game({random});g.spawnClock=1e9;g.player.fireClock=1e9;return g;}
function own(g,id,level){while(g.level(id)<level)g.advanceSkill(id);}
function chooseAny(g){if(g.state==='upgrade')g.choose(0);if(g.state==='catalyst')g.keepCatalyst();}
function frames(g,seconds){for(let t=0;t<seconds;t+=.05){g.step(.05);g.takeEvents();}}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);

test('All base skills have three levels and a single breakthrough; slots cap at eight',()=>{
  assert.equal(SKILLS.length,32);assert.equal(MAX_SLOTS,8);const g=quiet();
  for(const s of SKILLS){assert.equal(s.descriptions.length,4);assert.ok(s.breakthrough);}
  for(const s of SKILLS.slice(0,MAX_SLOTS))own(g,s.id,4);
  assert.equal(g.owned.length,MAX_SLOTS);assert.deepEqual(g.candidates(),['stormfield']);
  assert.throws(()=>g.advanceSkill(SKILLS[MAX_SLOTS].id),/槽/);assert.throws(()=>g.advanceSkill('rate'),/突破/);
});
test('Attributes replace prior tiers, never compound the cumulative table values',()=>{
  const g=quiet();own(g,'rate',4);near(g.player.fireRate,.62*.32);
  own(g,'power',4);near(g.player.damage,18*3.2);assert.equal(g.player.pierce,2);assert.equal(g.player.bounce,true);
  own(g,'move',4);near(g.player.speed,235*1.8);near(g.player.magnet,160);
  own(g,'crit',4);near(g.player.crit,.66);near(g.player.critDamage,3.5);
});
test('Multi-shot tier probabilities use mutually exclusive two/three-shot bands',()=>{
  const g=quiet();own(g,'rate',3);g.createEnemy('tank',650,300);
  for(const [roll,count] of [[.1,3],[.25,2],[.7,1]]){g.random=()=>roll;g.bullets=[];g.shoot();assert.equal(g.bullets.length,count);}
  own(g,'rate',4);g.bullets=[];g.shoot();assert.equal(g.bullets.length,3);g.ringShot();assert.equal(g.bullets.length,19);
});
test('Power tier pierces the expected target count and bounced bullets cannot double-hit',()=>{
  const g=quiet();own(g,'power',2);g.player.crit=0;
  const e1=g.createEnemy('tank',520,320),e2=g.createEnemy('tank',545,320),e3=g.createEnemy('tank',570,320);
  g.fireBullet(0);g.updateBullets(.2);assert.ok(e1.hp<e1.maxHp);assert.ok(e2.hp<e2.maxHp);assert.equal(e3.hp,e3.maxHp);assert.equal(g.bullets.length,0);
  const h=quiet();own(h,'power',4);h.fireBullet(0);h.bullets[0].x=955;h.updateBullets(.05);assert.ok(h.bullets[0].vx<0);assert.ok(h.bullets[0].x<=955);
});
test('Continuous aura deals linear distance damage and zero outside',()=>{
  const g=quiet();own(g,'aura',1);const p=g.player;
  const center=g.createEnemy('tank',p.x,p.y),half=g.createEnemy('tank',p.x+62.5,p.y),edge=g.createEnemy('tank',p.x+125,p.y),outside=g.createEnemy('tank',p.x+126,p.y);
  g.updateAura(.1);near(center.maxHp-center.hp,1.4);near(half.maxHp-half.hp,.875);near(edge.maxHp-edge.hp,.35);assert.equal(outside.hp,outside.maxHp);
});
test('Ghost extends invulnerability during overlap and ends after separation',()=>{
  const g=quiet();own(g,'ghost',1);g.player.ghostClock=0;g.createEnemy('tank',g.player.x,g.player.y);
  g.updateGhost(.1);assert.equal(g.player.ghostActive,true);g.updateGhost(3);assert.equal(g.player.ghostActive,true);
  g.enemies=[];g.updateGhost(.1);assert.equal(g.player.ghostActive,false);
  own(g,'ghost',4);g.player.ghostClock=0;const before=g.player.x;g.step(.1,{x:1,y:0});near(g.player.x-before,47);assert.equal(g.player.hp,100);
});
test('Lightning selects distinct visible targets with tier-specific count and interval',()=>{
  const g=quiet();own(g,'lightning',4);for(let i=0;i<4;i++)g.createEnemy('tank',100+i*150,200);
  g.createEnemy('tank',-100,200);g.lightning();assert.equal(g.effects.filter(e=>e.kind==='lightning').length,4);
  assert.equal(g.enemies.filter(e=>e.hp<e.maxHp).length,4);assert.equal(g.player.lightningClock,3);
});
test('Mines have a trigger, damage, black-hole attraction, and a persistence cap',()=>{
  const g=quiet();own(g,'mine',1);g.layMine();const m=g.mines[0],e=g.createEnemy('tank',m.x+17,m.y);m.armed=0;
  g.updateMines(.05);near(e.maxHp-e.hp,72);assert.equal(g.mines.length,0);
  g.enemies=[];own(g,'mine',4);g.layMine();const mine=g.mines[0];mine.armed=0;const pulled=g.createEnemy('tank',mine.x+150,mine.y),x=pulled.x;
  g.updateMines(.1);assert.ok(pulled.x<x);for(let i=0;i<20;i++)g.layMine();assert.equal(g.mines.length,12);
});
test('Nine skill synergies unlock automatically without occupying extra slots',()=>{
  assert.equal(SYNERGIES.length,9);
  const g=quiet();for(const id of ['aura','lightning','mine','orbit','ghost','move'])own(g,id,1);
  assert.deepEqual(g.synergies.map(s=>s.id),['conductive','resonance','phase']);assert.equal(g.owned.length,6);
  assert.equal(g.takeEvents().filter(e=>e.type==='synergy').length,3);
  const shooting=quiet();for(const id of ['rate','power','crit'])own(shooting,id,1);
  assert.deepEqual(shooting.synergies.map(s=>s.id),['rail','overload']);assert.equal(shooting.owned.length,3);
  assert.equal(shooting.takeEvents().filter(e=>e.type==='synergy').length,2);
});
test('Conductive corrosion chains lightning only to nearby enemies inside the aura',()=>{
  const g=quiet(()=>.99);own(g,'aura',1);own(g,'lightning',1);const p=g.player;
  const target=g.createEnemy('tank',p.x,p.y),near=g.createEnemy('tank',p.x+95,p.y),edge=g.createEnemy('tank',p.x-95,p.y),outside=g.createEnemy('tank',p.x,p.y+200);
  g.lightning();assert.ok(target.hp<target.maxHp);assert.ok(near.hp<near.maxHp);assert.ok(edge.hp<edge.maxHp);assert.equal(outside.hp,outside.maxHp);
  assert.equal(g.effects.filter(e=>e.kind==='chain').length,2);
});
test('Orbit resonance detonates an armed mine with amplified radius',()=>{
  const g=quiet();own(g,'mine',1);own(g,'orbit',1);g.layMine();const m=g.mines[0];m.x=g.player.x+52;m.armed=0;
  g.updateOrbits();assert.equal(g.mines.length,0);const effect=g.effects.find(e=>e.kind==='mine');near(effect.r,70*1.35);
});
test('Phase piercing hurts a crossed enemy only once per ghost activation',()=>{
  const g=quiet();own(g,'ghost',1);own(g,'move',1);const p=g.player,e=g.createEnemy('tank',p.x+35,p.y);p.ghostClock=0;
  g.step(.1,{x:1});assert.ok(e.hp<e.maxHp);const hp=e.hp;g.step(.1,{x:-1});assert.equal(e.hp,hp);
  const other=g.createEnemy('tank',p.x,p.y);g.step(.1);assert.equal(other.hp,other.maxHp);
});
test('Repair restores health on acquisition and each ten subsequent kills',()=>{
  const g=quiet();g.player.hp=30;own(g,'heal',1);assert.equal(g.player.hp,65);assert.equal(g.player.maxHp,110);
  for(let i=0;i<9;i++)g.kill(g.createEnemy('child',20,20));assert.equal(g.player.hp,65);
  g.kill(g.createEnemy('child',20,20));assert.equal(g.player.hp,66);
  own(g,'heal',4);assert.equal(g.player.hp,200);assert.equal(g.player.maxHp,200);
});
test('Lottery award is total 0/1/3, never counts as normal progression',()=>{
  for(const [roll,count] of [[.2,0],[.6,1],[.9,3]]){const g=quiet(()=>roll);own(g,'aura',1);g.upgrades=10;g.openLottery(1);assert.equal(g.lottery.count,count);assert.equal(g.lottery.results.length,count);assert.equal(g.upgrades,10);assert.equal(g.level('aura'),1+count);}
});
test('Lottery remainder converts to additive basic damage after last breakthrough',()=>{
  const g=quiet(()=>.99);for(const id of ['rate','power','ghost','orbit','move','frost','shield'])own(g,id,4);own(g,'heal',3);
  g.upgrades=10;g.firstBossDefeated=true;g.openLottery(1);assert.equal(g.level('heal'),4);near(g.player.attackBonus,.3);assert.equal(g.lottery.results.filter(r=>r.id==='attack').length,2);
  g.acknowledgeLottery();g.addEnergy(g.nextXp);g.maybeUpgrade();assert.deepEqual(g.options,['attack']);g.choose(0);near(g.player.attackBonus,.45);assert.equal(g.upgrades,11);
});
test('Full forty-upgrade journey preserves overflow and gates all three bosses before final victory',()=>{
  const g=quiet(()=>.2);g.addEnergy(100000);assert.equal(RUN_UPGRADES,40);
  assert.deepEqual(BOSS_MILESTONES.map(b=>[b.stage,b.upgrade,b.warning]),[[1,10,10],[2,20,20],[3,40,30]]);
  assert.deepEqual(BOSS_MILESTONES.map(b=>b.name),['异常聚合体','裂变主宰','终末炼金核']);
  for(let stage=1;stage<=3;stage++){
    for(let n=(stage-1)*10+1;n<=BOSS_MILESTONES[stage-1].upgrade;n++){
      if(g.state==='playing')g.maybeUpgrade();assert.equal(g.state,'upgrade');chooseAny(g);assert.equal(g.upgrades,n);
      assert.equal(g.snapshot().level,n);assert.equal(g.snapshot().wave,BOSS_MILESTONES.some(m=>m.upgrade===n)?n:Math.min(40,n+1));assert.equal(g.lotteryHistory.length,stage-1);
    }
    assert.equal(g.bossDue.stage,stage);near(g.bossDue.at-g.time,stage*10);assert.equal(g.upgradeLocked,true);assert.equal(g.maybeUpgrade(),false);
    const xp=g.player.xp;g.addEnergy(10);assert.equal(g.player.xp,xp+10);assert.equal(g.upgrades,BOSS_MILESTONES[stage-1].upgrade);
    g.time=g.bossDue.at-.1;g.step(.1);assert.equal(g.boss.bossStage,stage);assert.equal(g.boss.hp,[0,1200,4000,8500][stage]);assert.equal(g.state,'playing');
    assert.equal(g.maybeUpgrade(),false);const gems=g.gems.length;g.kill(g.boss);assert.equal(g.gems.length-gems,[0,30,45,0][stage]);
    assert.equal(g.isBossDefeated(stage),true);assert.equal(g.state,'lottery');assert.equal(g.lottery.bossStage,stage);assert.equal(g.upgrades,BOSS_MILESTONES[stage-1].upgrade);assert.equal(g.snapshot().wave,BOSS_MILESTONES[stage-1].upgrade);
    g.acknowledgeLottery();assert.equal(g.state,stage===3?'ended':'upgrade');assert.equal(g.won,stage===3);assert.equal(g.snapshot().wave,stage===3?40:stage*10+1);
  }
  assert.equal(g.upgrades,40);assert.equal(g.snapshot().level,40);assert.equal(g.snapshot().wave,40);assert.equal(g.maybeUpgrade(),false);
  near(g.player.xp,100030-1880);assert.deepEqual(g.lotteryHistory.map(l=>l.bossStage),[1,2,3]);assert.deepEqual(g.catalystMilestones,[6,14,24]);
});
test('Boss lottery immediately pauses combat even when the boss dies during a frame',()=>{
  const g=quiet(()=>.2);g.upgrades=10;g.spawnBoss(1);const boss=g.boss,p=g.player;
  boss.x=p.x+45;boss.y=p.y;boss.hp=1;g.createEnemy('blob',p.x,p.y+20);g.fireBullet(0);
  const hp=p.hp;g.step(.1);assert.equal(g.state,'lottery');assert.equal(p.hp,hp);
  const frozen=JSON.stringify(g);g.step(.1);assert.equal(JSON.stringify(g),frozen);
});
test('Time alone cannot win and paused/upgrade/lottery freeze every gameplay timer',()=>{
  const g=quiet();g.time=700;g.step(.05);assert.equal(g.state,'playing');
  g.items.push({type:'magnet',x:10,y:10,r:6,life:30});g.bossDue={stage:1,at:730};own(g,'mine',1);
  for(const state of ['paused','upgrade','catalyst','lottery']){g.state=state;const snapshot=JSON.stringify(g);g.step(.1,{x:1});assert.equal(JSON.stringify(g),snapshot);}
});
test('Bomb kills visible small enemies, never affects boss or splits or chains drops',()=>{
  const g=quiet(()=>0);const e=g.createEnemy('splitter',400,300),outside=g.createEnemy('blob',-10,100);
  g.spawnBoss(1);const boss=g.boss,hp=boss.hp,x=boss.x;
  g.useItem({type:'bomb',x:400,y:300,dead:false});assert.equal(e.dead,true);assert.equal(outside.dead,false);
  assert.equal(boss.hp,hp);assert.equal(boss.x,x);assert.equal(g.enemies.filter(e=>e.type==='child').length,0);assert.equal(g.items.length,0);assert.equal(g.gems.length,1);
});
test('Drops preserve bomb/magnet rates and add a separate 2% pill interval with one item per kill',()=>{
  for(const [type,roll,expected] of [['blob',.005,'bomb'],['blob',.015,'magnet'],['blob',.02,'pill'],['blob',.03999,'pill'],['blob',.04,null],['tank',.015,'bomb'],['tank',.035,'magnet'],['tank',.04,'pill'],['tank',.06,null],['boss',.019,'pill'],['child',.02,null]]){
    const g=quiet(()=>roll);g.dropItem({type,x:100,y:100});assert.equal(g.items[0]?.type||null,expected);
  }
  const g=quiet(()=>0);for(let i=0;i<20;i++)g.dropItem({type:'blob',x:1,y:1});assert.equal(g.items.length,6);
});
test('Magnet absorbs only preexisting visible energy and pauses with an upgrade',()=>{
  const g=quiet();g.player.xp=7;g.gems=[{x:g.player.x,y:g.player.y,r:4,value:1,vx:0,vy:0,dead:false},{x:900,y:600,r:4,value:1,vx:0,vy:0,dead:false},{x:-10,y:100,r:4,value:1,vx:0,vy:0,dead:false}];
  g.useItem({type:'magnet',x:100,y:100,dead:false});assert.equal(g.gems[1].magnetized,true);assert.equal(g.gems[2].magnetized,undefined);
  const newGem={x:800,y:500,r:4,value:1,vx:0,vy:0,dead:false};g.gems.push(newGem);g.updateGems(.05);assert.equal(g.state,'upgrade');assert.equal(newGem.magnetized,undefined);
  const before=JSON.stringify(g.gems);g.step(.1);assert.equal(JSON.stringify(g.gems),before);g.choose(0);assert.equal(g.state,'playing');
  g.updateGems(.1);assert.ok(g.gems.some(e=>e===newGem));
});
test('Stage multipliers and enemy cap include split children',()=>{
  const g=quiet();g.upgrades=15;g.firstBossDefeated=true;const e=g.createEnemy('tank',100,100);near(e.hp,145*1.85);near(e.speed,31*1.15);
  const splitter=g.createEnemy('splitter',100,100);while(g.minorCount()<STAGES[4].cap)g.createEnemy('blob',200,200);
  g.kill(splitter);assert.equal(g.minorCount(),STAGES[4].cap);g.spawnEnemy();assert.equal(g.minorCount(),STAGES[4].cap);
});
test('Opening density stays unchanged while all three acts and boss fights have bounded spawn density',()=>{
  assert.deepEqual(STAGES.slice(0,3).map(s=>[s.interval,s.cap]),[[.75,60],[.55,70],[.9,25]]);
  assert.deepEqual(STAGES.slice(3).map(s=>[s.interval,s.cap]),[[.32,110],[.18,160],[.32,100],[.16,180],[.14,195],[.26,130]]);
  const g=quiet();g.upgrades=14;g.firstBossDefeated=true;assert.equal(g.stage(),STAGES[3]);
  g.upgrades=15;assert.equal(g.stage(),STAGES[4]);g.spawnBoss(2);assert.equal(g.stage(),STAGES[5]);g.kill(g.boss);g.acknowledgeLottery();
  g.upgrades=20;assert.equal(g.stage(),STAGES[6]);g.upgrades=25;assert.equal(g.stage(),STAGES[7]);g.spawnBoss(3);assert.equal(g.stage(),STAGES[8]);assert.ok(STAGES.every(s=>s.cap<=200));
});
test('Late waves gain support and charging enemies while early waves do not',()=>{
  for(const stage of STAGES.slice(0,3))assert.deepEqual(stage.weights.slice(4),[0,0]);
  assert.ok(STAGES[3].weights[4]>0);assert.ok(STAGES[4].weights[5]>0);
  const g=quiet();g.upgrades=15;g.firstBossDefeated=true;g.player.x=600;g.player.y=300;
  g.createEnemy('catalyst',300,300);const boosted=g.createEnemy('blob',300,310);g.step(.1);
  const h=quiet();h.upgrades=15;h.firstBossDefeated=true;h.player.x=600;h.player.y=300;const plain=h.createEnemy('blob',300,310);h.step(.1);
  assert.ok(boosted.x>plain.x);
  const charger=g.createEnemy('charger',100,300);charger.chargeClock=0;g.step(.05);assert.ok(charger.chargeWindup>0);
  for(let i=0;i<16;i++)g.step(.05);const x=charger.x;g.step(.05);assert.ok(charger.x>x);
});
test('First two boss patterns retain cone, dash and summons',()=>{
  const g=quiet();const p=g.player;g.spawnBoss(1);const first=g.boss;first.x=p.x-160;first.y=p.y;first.attackClock=0;
  g.step(.05);assert.equal(first.intent.kind,'cone');frames(g,1.1);assert.equal(p.hp,78);
  const h=quiet();h.player.invuln=1e9;h.spawnBoss(2);const final=h.boss;final.x=h.player.x-200;final.y=h.player.y;final.attackClock=0;
  h.step(.05);assert.equal(final.intent.kind,'dash');frames(h,1.05);const x=final.x;h.step(.05);assert.ok(final.x>x);
  final.dashRemaining=0;final.attackClock=0;final.attackIndex=1;h.step(.05);assert.equal(final.intent.kind,'summon');frames(h,1);assert.equal(h.minorCount(),3);
});
test('Invalid choices reject before touching experience or skill state',()=>{
  const g=quiet();g.addEnergy(8);g.maybeUpgrade();const before=JSON.stringify(g.snapshot());
  for(const index of [-1,3,1.2,undefined])assert.throws(()=>g.choose(index));assert.equal(JSON.stringify(g.snapshot()),before);
});
test('Catalyst milestones fire once at six, fourteen and twenty-four, preserving overflow and normal upgrade count',()=>{
  const g=quiet();own(g,'mine',1);g.upgrades=5;g.addEnergy(g.nextXp+77);g.maybeUpgrade();g.choose(0);
  assert.equal(g.state,'catalyst');assert.equal(g.upgrades,6);assert.equal(g.player.xp,77);
  assert.ok(g.catalystOptions.length<=3);assert.ok(g.catalystOptions.length>0);const choices=[...g.catalystOptions];
  for(const id of choices){const c=BY_CATALYST[id];assert.ok(!c.skill||g.level(c.skill)>0);}
  const selected=choices[0];g.chooseCatalyst(0);assert.equal(g.catalyst,selected);assert.equal(g.upgrades,6);assert.equal(g.player.xp,77);assert.equal(g.state,'upgrade');
  g.player.xp=0;g.upgrades=13;g.firstBossDefeated=true;g.state='playing';g.addEnergy(g.nextXp);g.maybeUpgrade();g.choose(0);
  assert.equal(g.state,'catalyst');assert.ok(!g.catalystOptions.includes(selected));g.keepCatalyst();assert.equal(g.catalyst,selected);assert.equal(g.state,'playing');
  g.afterUpgrade();assert.equal(g.state,'playing');assert.deepEqual(g.catalystMilestones,[6,14]);
  g.bossesDefeated.push(2);g.upgrades=23;g.addEnergy(g.nextXp+9);g.maybeUpgrade();g.choose(0);assert.equal(g.state,'catalyst');assert.equal(g.upgrades,24);assert.equal(g.player.xp,9);
  assert.ok(!g.catalystOptions.includes(selected));g.keepCatalyst();assert.equal(g.catalyst,selected);assert.equal(g.state,'playing');g.afterUpgrade();assert.equal(g.state,'playing');assert.deepEqual(g.catalystMilestones,[6,14,24]);
});
test('Catalysts provide generic fallbacks, reject invalid choices before mutation, and do not use skill slots',()=>{
  assert.equal(CATALYSTS.length,15);const g=quiet();g.upgrades=6;g.afterUpgrade();assert.equal(g.catalystOptions.length,3);
  assert.ok(g.catalystOptions.every(id=>!BY_CATALYST[id].skill));const before=JSON.stringify(g);
  for(const index of [-1,3,.5,undefined])assert.throws(()=>g.chooseCatalyst(index));assert.equal(JSON.stringify(g),before);
  assert.throws(()=>g.equipCatalyst('fuse'));assert.equal(JSON.stringify(g),before);
  g.chooseCatalyst(0);assert.equal(g.owned.length,0);assert.ok(g.snapshot().catalyst);
  assert.throws(()=>g.keepCatalyst());assert.throws(()=>g.chooseCatalyst(0));
});
test('Catalyst replacement removes old modifiers and repeated recomputation never stacks bonuses',()=>{
  const g=quiet();own(g,'aura',2);own(g,'lightning',2);own(g,'mine',2);own(g,'orbit',2);
  g.equipCatalyst('diffuser');near(g.player.auraRadius,210);near(g.player.auraDamage,19.8);g.recompute();near(g.player.auraRadius,210);
  g.equipCatalyst('conductor');near(g.player.auraRadius,150);near(g.player.auraDamage,22);assert.equal(g.player.lightningTargets,3);near(g.player.lightningInterval,6);
  g.equipCatalyst('fuse');assert.equal(g.player.lightningTargets,2);near(g.player.lightningInterval,5);g.layMine();const mine=g.mines[0];near(mine.blast,142.5);near(mine.armed,.9);
  g.equipCatalyst('bearing');near(g.player.mineBlast,95);near(g.player.mineArmTime,.3);near(g.player.orbitRadius,56*1.3);near(g.player.orbitDamageMultiplier,.9);
  assert.equal(mine.blast,142.5);assert.equal(mine.armTime,.9);assert.equal(g.owned.length,4);
  g.equipCatalyst('pressure');near(g.player.orbitRadius,56);near(g.player.damage,18*1.3);near(g.player.fireRate,.62*1.15);g.recompute();near(g.player.damage,18*1.3);
  g.equipCatalyst('collector');near(g.player.damage,18);near(g.player.fireRate,.62);near(g.player.magnet,132);near(g.player.speed,235*.93);
});
test('Lightweight catalyst clamps health without free healing when removed or upgraded',()=>{
  const g=quiet();g.equipCatalyst('kinetic');assert.equal(g.player.maxHp,85);assert.equal(g.player.hp,85);near(g.player.speed,282);
  g.equipCatalyst('pressure');assert.equal(g.player.maxHp,100);assert.equal(g.player.hp,85);
  g.equipCatalyst('kinetic');own(g,'heal',4);assert.equal(g.player.maxHp,170);assert.equal(g.player.hp,170);
});
test('New lightning hits a whole cluster and stun freezes small enemies, never bosses',()=>{
  const g=quiet();own(g,'lightning',1);const p=g.player;
  const weak=g.createEnemy('blob',p.x+100,p.y),tank=g.createEnemy('tank',p.x+140,p.y);
  g.lightning();assert.equal(weak.dead,true);near(tank.maxHp-tank.hp,54);near(tank.stun,.25);
  const x=tank.x;g.moveEnemy(tank,.1,[]);assert.equal(tank.x,x);near(tank.stun,.15);
  g.enemies=[];g.spawnBoss(1);g.boss.x=p.x+120;g.boss.y=p.y;const hp=g.boss.hp;g.lightning();near(hp-g.boss.hp,54);assert.equal(g.boss.stun,undefined);
});
test('New mines kill groups at range and delayed fuse does not detonate before arming',()=>{
  const g=quiet();own(g,'mine',1);g.equipCatalyst('fuse');g.layMine();const m=g.mines[0];
  const trigger=g.createEnemy('blob',m.x+35,m.y),outer=g.createEnemy('blob',m.x+100,m.y),outside=g.createEnemy('blob',m.x+125,m.y);
  g.updateMines(.5);assert.equal(trigger.dead,false);assert.equal(g.mines.length,1);
  g.updateMines(.41);assert.equal(trigger.dead,true);assert.equal(outer.dead,true);assert.equal(outside.dead,false);assert.equal(g.mines.length,0);
});
test('Acquiring lightning and mine gives prompt first activation without skipping their cooldowns',()=>{
  const g=quiet();own(g,'lightning',1);own(g,'mine',1);near(g.player.lightningClock,1.2);near(g.player.mineClock,.8);
  g.layMine();near(g.player.mineClock,6);g.createEnemy('tank',700,300);g.lightning();near(g.player.lightningClock,6);
});
test('Lightning and mine boss kills freeze the remainder of a frame before player damage',()=>{
  for(const skill of ['lightning','mine']){
    const g=quiet(()=>.2);own(g,skill,1);g.upgrades=10;g.spawnBoss(1);g.boss.x=g.player.x+35;g.boss.y=g.player.y;g.boss.hp=1;
    g.createEnemy('tank',g.player.x,g.player.y);if(skill==='lightning')g.player.lightningClock=0;else{g.layMine();g.mines[0].armed=0;}
    const hp=g.player.hp;g.step(.1);assert.equal(g.state,'lottery');assert.equal(g.player.hp,hp);const before=JSON.stringify(g);g.step(.1);assert.equal(JSON.stringify(g),before);
  }
});
test('Upgrade rerolls are limited to two per run and never spend experience or progress',()=>{
  const g=quiet();assert.equal(g.rerollsRemaining,2);g.addEnergy(50);g.maybeUpgrade();
  const before={xp:g.player.xp,upgrades:g.upgrades,build:JSON.stringify(g.player.build)};
  const first=[...g.options];g.reroll();assert.equal(g.rerollsRemaining,1);assert.equal(g.state,'upgrade');
  assert.ok(g.options.some(id=>!first.includes(id)));g.reroll();assert.equal(g.rerollsRemaining,0);
  assert.equal(g.player.xp,before.xp);assert.equal(g.upgrades,before.upgrades);assert.equal(JSON.stringify(g.player.build),before.build);
  const frozen=JSON.stringify(g);assert.throws(()=>g.reroll());assert.equal(JSON.stringify(g),frozen);
  assert.equal(new Game().rerollsRemaining,2);
});
test('Rerolls reject outside regular upgrades and no alternatives do not consume attempts',()=>{
  for(const state of ['playing','paused','catalyst','lottery','ended']){
    const g=quiet();g.state=state;const before=JSON.stringify(g);assert.throws(()=>g.reroll());assert.equal(JSON.stringify(g),before);
  }
  const g=quiet();for(const id of ['rate','power','move','crit','orbit','aura','heal','shield'])own(g,id,4);g.addEnergy(8);g.maybeUpgrade();
  assert.deepEqual(g.options,['attack']);const count=g.rerollsRemaining;assert.throws(()=>g.reroll());assert.equal(g.rerollsRemaining,count);assert.deepEqual(g.options,['attack']);assert.equal(g.state,'upgrade');
});
test('Reroll replaces a card even with only one alternate candidate and preserves an owned upgrade choice',()=>{
  const g=quiet();for(const s of SKILLS.slice(0,8))own(g,s.id,1);for(const s of SKILLS.slice(0,4))own(g,s.id,4);
  g.addEnergy(8);g.maybeUpgrade();assert.equal(g.candidates().length,4);const original=[...g.options];assert.equal(original.length,3);
  g.reroll();assert.ok(g.options.some(id=>!original.includes(id)));assert.ok(g.options.every(id=>g.level(id)>0));
  const h=quiet();own(h,'rate',1);h.addEnergy(8);h.maybeUpgrade();assert.ok(h.options.includes('rate'));h.reroll();assert.ok(h.options.includes('rate'));
});
test('Skill previews distinguish missing, newly activated and already active recipes',()=>{
  const g=quiet();const find=(id,synergy)=>g.skillPreview(id).find(s=>s.id===synergy);
  assert.equal(find('rate','rail').status,'missing');assert.deepEqual(find('rate','rail').missing,['高压注入']);
  assert.equal(find('rate','overload').status,'missing');assert.deepEqual(find('rate','overload').missing,['不稳定晶格']);
  own(g,'power',1);assert.equal(find('rate','rail').status,'activate');assert.deepEqual(find('rate','rail').missing,[]);
  own(g,'rate',1);assert.equal(find('rate','rail').status,'active');assert.equal(find('power','rail').status,'active');
  assert.equal(find('frost','icebite').status,'missing');assert.deepEqual(find('frost','icebite').missing,['腐蚀领域']);assert.deepEqual(g.skillPreview('attack'),[]);
});
test('Four added skill tables replace tiers without changing the original shooting values',()=>{
  const expected={
    frost:{frostInterval:[6,5,4,3],frostRadius:[160,185,215,250],frostDamageMultiplier:[1,1.2,1.5,2]},
    drone:{droneInterval:[2.2,1.8,1.4,1],droneShots:[1,2,2,3],droneDamageMultiplier:[.8,1,1.2,1.5]},
    well:{wellInterval:[8,7,6,5],wellRadius:[120,145,170,210],wellDuration:[3,3.5,4,4],wellDamageMultiplier:[.3,.45,.6,.9],wellPull:[90,110,135,165]},
    shield:{shieldMaxCharges:[1,1,2,3],shieldInterval:[18,14,12,8]}
  };
  for(const [id,table] of Object.entries(expected)){
    const g=quiet();for(let level=1;level<=4;level++){own(g,id,level);for(const [field,values] of Object.entries(table))near(g.player[field],values[level-1]);g.recompute();for(const [field,values] of Object.entries(table))near(g.player[field],values[level-1]);}
  }
  const g=quiet();own(g,'rate',4);near(g.player.fireRate,.62*.32);own(g,'power',4);near(g.player.damage,18*3.2);
});
test('Added offensive skills activate promptly and all added timers freeze outside combat',()=>{
  const g=quiet();frames(g,10);for(const id of ['frost','drone','well','shield'])own(g,id,1);
  for(const field of ['frostClock','droneClock','wellClock'])near(g.player[field],1.5);
  assert.equal(g.player.shieldCharges,1);g.spawnWell();
  for(const state of ['paused','upgrade','catalyst','lottery','ended']){g.state=state;const before=JSON.stringify(g);g.step(.1);assert.equal(JSON.stringify(g),before);}
});
test('Frost pulses damage within their radius, slow enemies and bosses differently, and freeze only breakthrough small enemies',()=>{
  const g=quiet();own(g,'frost',1);const p=g.player,enemy=g.createEnemy('tank',p.x+100,p.y),outside=g.createEnemy('tank',p.x+181,p.y);
  g.spawnBoss(1);g.boss.x=p.x-100;g.boss.y=p.y;const boss=g.boss;g.frostPulse();near(enemy.maxHp-enemy.hp,18);assert.equal(outside.hp,outside.maxHp);
  near(enemy.slowFactor,.6);near(boss.slowFactor,.8);near(enemy.slowRemaining,2.5);assert.equal(enemy.stun,undefined);assert.equal(boss.stun,undefined);
  const ex=enemy.x,bx=boss.x;g.moveEnemy(enemy,.1,[]);g.moveEnemy(boss,.1,[]);near(ex-enemy.x,31*.6*.1);near(boss.x-bx,28*.8*.1);
  own(g,'frost',4);g.frostPulse();near(enemy.stun,.7);assert.equal(boss.stun,undefined);const frozenX=enemy.x;g.moveEnemy(enemy,.1,[]);assert.equal(enemy.x,frozenX);near(p.frostClock,3);
});
test('Drones fire the tier count, prioritize visible bosses, home to targets and cannot crit without seeker',()=>{
  const g=quiet(()=>0);own(g,'drone',4);own(g,'rate',1);g.player.crit=1;const p=g.player;
  const small=g.createEnemy('tank',p.x+40,p.y),outside=g.createEnemy('tank',-10,p.y);g.spawnBoss(1);g.boss.x=p.x+140;g.boss.y=p.y;
  g.fireDrones();assert.equal(g.bullets.length,3);assert.equal(g.bullets[0].targetId,g.boss.id);assert.ok(!g.bullets.some(b=>b.targetId===outside.id));
  for(const bullet of g.bullets){assert.equal(bullet.source,'drone');assert.equal(bullet.kind,'drone');near(Math.hypot(bullet.vx,bullet.vy),440);near(bullet.damage,27);assert.equal(bullet.pierce,0);}
  g.enemies=[g.boss];const hp=g.boss.hp;for(let i=0;i<6;i++)g.updateBullets(.1);near(hp-g.boss.hp,81);near(g.report().damage.find(row=>row.id==='drone').bossDamage,81);near(p.overloadRemaining,0);
  const h=quiet(()=>0);own(h,'drone',1);h.player.crit=1;const target=h.createEnemy('tank',h.player.x+160,h.player.y);h.fireDrones();const b=h.bullets[0];target.y+=70;h.updateBullets(.05);assert.ok(b.vy>0);
  for(let i=0;i<10;i++)h.updateBullets(.05);near(target.maxHp-target.hp,18*.8);assert.ok(h.takeEvents().filter(event=>event.type==='damage').every(event=>event.critical===false));
  assert.equal(small.dead,false);
});
test('Drone retargeting ignores offscreen enemies and retries without targets instead of resetting a full cooldown',()=>{
  const g=quiet();own(g,'drone',1);g.fireDrones();near(g.player.droneClock,.25);assert.equal(g.bullets.length,0);
  const old=g.createEnemy('tank',650,300),newTarget=g.createEnemy('tank',620,420),offscreen=g.createEnemy('tank',-10,300);g.fireDrones();const bullet=g.bullets[0];old.dead=true;g.updateBullets(.05);assert.equal(bullet.targetId,newTarget.id);assert.notEqual(bullet.targetId,offscreen.id);
});
test('Gravity wells pull bosses at quarter strength, tick damage, retain spawn stats and cap persistence at three',()=>{
  const g=quiet();own(g,'well',1);const center=g.createEnemy('tank',300,300),pulled=g.createEnemy('tank',380,300);g.spawnBoss(1);g.boss.x=380;g.boss.y=300;g.spawnWell();
  const well=g.gravityWells[0];near(well.r,120);near(well.total,3);near(well.damage,18*.3);near(well.pull,90);const x=pulled.x,bx=g.boss.x,hp=center.hp;
  g.updateWells(.1);near(x-pulled.x,9);near(bx-g.boss.x,2.25);near(hp-center.hp,.54);near(g.report().damage.find(row=>row.id==='well').bossDamage,.54);
  own(g,'power',4);near(well.damage,5.4);for(let i=0;i<5;i++)g.spawnWell();assert.equal(g.gravityWells.length,3);
  const h=quiet();own(h,'well',1);h.spawnWell();assert.equal(h.gravityWells.length,0);near(h.player.wellClock,.25);
  const target=h.createEnemy('tank',600,300);h.spawnWell();for(let i=0;i<31;i++)h.updateWells(.1);assert.equal(h.gravityWells.length,0);near(target.maxHp-target.hp,18*.3*3);
});
test('Shield regenerates one spent charge after its interval and does not bank regen while full',()=>{
  const g=quiet();own(g,'shield',1);g.updateShield(500);g.damagePlayer(12,'blob');assert.equal(g.player.shieldCharges,0);
  g.updateShield(17.9);assert.equal(g.player.shieldCharges,0);g.updateShield(.11);assert.equal(g.player.shieldCharges,1);near(g.player.shieldClock,18);
  const before=JSON.stringify(g);for(const amount of [NaN,Infinity,0,-2])assert.equal(g.damagePlayer(amount,'blob'),false);assert.equal(JSON.stringify(g),before);
});
test('Rail recipe adds one giant shot every sixth aimed volley, not per multishot bullet or ring shot',()=>{
  const g=quiet();own(g,'rate',4);own(g,'power',1);g.createEnemy('tank',700,320);
  for(let i=0;i<5;i++)g.shoot();assert.equal(g.bullets.filter(b=>b.source==='rail').length,0);g.ringShot();assert.equal(g.bullets.filter(b=>b.source==='rail').length,0);g.shoot();
  const rails=g.bullets.filter(b=>b.source==='rail');assert.equal(rails.length,1);const rail=rails[0];near(rail.damage,g.player.damage*2.5);near(rail.vx,740);assert.equal(rail.r,9);assert.equal(rail.pierce,7);assert.equal(rail.bounce,false);assert.equal(g.player.railRounds,0);
  const h=quiet(()=>0);own(h,'rate',1);own(h,'power',1);own(h,'crit',4);const p=h.player;for(let i=0;i<9;i++)h.createEnemy('tank',p.x+35+i*35,p.y);h.fireRail(0);h.updateBullets(.5);
  const damaged=h.enemies.filter(e=>e.hp<e.maxHp);assert.equal(damaged.length,8);for(const e of damaged)near(e.maxHp-e.hp,p.damage*2.5);assert.equal(h.bullets.length,0);near(p.overloadRemaining,0);
});
test('Overload requires four effective basic critical hits in two seconds and obeys active/cooldown windows',()=>{
  const g=quiet();own(g,'rate',1);own(g,'crit',1);const e=g.createEnemy('tank',700,300);e.hp=e.maxHp=10000;const p=g.player;
  g.time=0;g.hurt(e,1,{source:'bullet',critical:true});g.time=2.1;for(let i=0;i<3;i++)g.hurt(e,1,{source:'bullet',critical:true});near(p.overloadRemaining,0);
  g.hurt(e,1,{source:'drone',critical:true});g.hurt(e,1,{source:'rail',critical:true});g.hurt(e,0,{source:'bullet',critical:true});near(p.overloadRemaining,0);
  g.time=2.2;g.hurt(e,1,{source:'bullet',critical:true});near(p.overloadRemaining,2.5);near(p.overloadCooldown,6);g.shoot();near(p.fireClock,p.fireRate*.7);
  const baseDamage=p.damage;g.recompute();near(p.damage,baseDamage);frames(g,2.6);near(p.overloadRemaining,0);assert.ok(p.overloadCooldown>3);g.shoot();near(p.fireClock,p.fireRate);
  for(let i=0;i<4;i++)g.hurt(e,1,{source:'bullet',critical:true});near(p.overloadRemaining,0);frames(g,3.5);near(p.overloadCooldown,0);for(let i=0;i<4;i++)g.hurt(e,1,{source:'bullet',critical:true});near(p.overloadRemaining,2.5);
});
test('New frost, well and drone boss kills halt the frame before any later contact damage',()=>{
  for(const skill of ['frost','well','drone']){
    const g=quiet(()=>.2);own(g,skill,1);g.upgrades=10;g.spawnBoss(1);g.boss.x=g.player.x+35;g.boss.y=g.player.y;g.boss.hp=.01;g.createEnemy('tank',g.player.x,g.player.y);
    if(skill==='frost')g.player.frostClock=0;else if(skill==='well'){g.spawnWell();g.gravityWells[0].x=g.boss.x;g.gravityWells[0].y=g.boss.y;}else{g.fireDrones();g.enemies=g.enemies.filter(e=>e.type==='boss');g.createEnemy('tank',g.player.x-20,g.player.y);}
    const hp=g.player.hp;g.step(.1);assert.equal(g.state,'lottery');assert.equal(g.player.hp,hp);const before=JSON.stringify(g);g.step(.1);assert.equal(JSON.stringify(g),before);
  }
});
test('Effective damage is capped by remaining health and reports attribute all damage sources',()=>{
  const g=quiet();assert.ok(DAMAGE_SOURCES);const e=g.createEnemy('tank',100,100);
  g.hurt(e,100,{source:'frost'});g.hurt(e,999,{source:'rail'});g.hurt(e,999,{source:'mine'});
  const report=g.report();near(report.totalDamage,145);near(report.bossDamage,0);
  near(report.damage.find(row=>row.id==='frost').damage,100);near(report.damage.find(row=>row.id==='rail').damage,45);
  assert.ok(!report.damage.find(row=>row.id==='mine')?.damage);near(report.damage.reduce((sum,row)=>sum+row.share,0),1);
});
test('Every implemented damage path records its own source rather than inflating basic attack damage',()=>{
  const actions={
    bullet:g=>{g.fireBullet(0);g.updateBullets(.1);},rail:g=>{g.fireRail(0);g.updateBullets(.1);},
    lightning:g=>{own(g,'lightning',1);g.lightning();},mine:g=>{own(g,'mine',1);g.layMine();g.mines[0].armed=0;g.updateMines(.1);},
    orbit:g=>{own(g,'orbit',1);g.enemies[0].x=g.player.x+52;g.updateOrbits();},aura:g=>{own(g,'aura',1);g.updateAura(.1);},
    phase:g=>{own(g,'ghost',1);own(g,'move',1);g.player.ghostActive=true;g.player.ghostEpoch=1;g.phaseTrace(g.player.x,g.player.y,g.player.x+70,g.player.y);},
    frost:g=>{own(g,'frost',1);g.frostPulse();},drone:g=>{own(g,'drone',1);g.fireDrones();g.updateBullets(.1);},
    saw:g=>{own(g,'saw',1);g.fireSaws();g.updateSaws(.1);},
    rocket:g=>{own(g,'rocket',1);g.fireRockets();g.updateRockets(.1);},
    flask:g=>{own(g,'flask',1);g.throwFlasks();g.updateFlasks(.6);},meteor:g=>{own(g,'meteor',1);g.dropMeteors();g.updateMeteors(.65);},ion:g=>{own(g,'ion',1);g.castIon();},turret:g=>{own(g,'turret',1);g.fireTurrets();},
    well:g=>{own(g,'well',1);g.spawnWell();g.updateWells(.1);},beam:g=>{own(g,'beam',1);g.fireBeam();},arrow:g=>{own(g,'arrow',1);g.fireArrows();g.updateBullets(.1);},nova:g=>{own(g,'nova',1);const e=g.createEnemy('blob',g.player.x+36,g.player.y);g.kill(e);},bomb:g=>g.useItem({type:'bomb',x:g.player.x,y:g.player.y})
  };
  assert.deepEqual(Object.keys(actions).sort(),Object.keys(DAMAGE_SOURCES).sort());
  for(const [source,action] of Object.entries(actions)){const g=quiet();g.player.crit=0;g.createEnemy('tank',g.player.x+35,g.player.y);action(g);const rows=g.report().damage;assert.equal(rows.length,1,source);assert.equal(rows[0].id,source);assert.ok(rows[0].damage>0);}
});
test('Damage accounting ignores invalid amounts and does not record dead targets twice',()=>{
  const g=quiet(),e=g.createEnemy('tank',100,100);const before=JSON.stringify(g);
  for(const amount of [NaN,Infinity,-1,0])g.hurt(e,amount,{source:'lightning'});assert.equal(JSON.stringify(g),before);
  g.hurt(e,999,{source:'lightning'});const total=g.report().totalDamage;g.hurt(e,99,{source:'lightning'});near(g.report().totalDamage,total);
});
test('Bomb damage is attributed to its pickup while preserving no-split and no-drop rules',()=>{
  const g=quiet(()=>0);const a=g.createEnemy('splitter',100,100),b=g.createEnemy('blob',200,100);g.hurt(a,20,{source:'bullet'});
  g.useItem({type:'bomb',x:100,y:100});const report=g.report();near(report.totalDamage,72+42);near(report.damage.find(row=>row.id==='bomb').damage,52+42);
  assert.equal(a.dead,true);assert.equal(b.dead,true);assert.equal(g.items.length,0);assert.equal(g.enemies.filter(e=>e.type==='child').length,0);
});
test('Boss damage and fight duration are separate subsets and reports are deep-copy read-only snapshots',()=>{
  const g=quiet(()=>.2);g.time=10;g.spawnBoss(1);g.time=12;g.hurt(g.boss,100,{source:'drone'});
  const active=g.report();assert.equal(active.bosses.length,1);assert.equal(active.bosses[0].stage,1);near(active.bosses[0].duration,2);assert.equal(active.bosses[0].killed,false);
  g.pause();g.step(.1);near(g.report().bosses[0].duration,2);g.resume();g.time=15;g.hurt(g.boss,10000,{source:'rail'});
  const complete=g.report();near(complete.totalDamage,1200);near(complete.bossDamage,1200);near(complete.damage.find(row=>row.id==='drone').bossDamage,100);
  near(complete.bosses[0].duration,5);assert.equal(complete.bosses[0].killed,true);
  complete.damage[0].damage=-100;complete.bosses[0].duration=-100;complete.bosses.push({stage:9});near(g.report().totalDamage,1200);near(g.report().bosses[0].duration,5);assert.equal(g.report().bosses.length,1);
});
test('Reading reports never prunes or otherwise mutates the underlying recent-hit and battle state',()=>{
  const g=quiet();g.time=0;g.damagePlayer(12,'blob');g.player.invuln=0;g.time=10;const before=JSON.stringify(g);
  for(let i=0;i<3;i++){g.report();g.snapshot();}assert.equal(JSON.stringify(g),before);assert.equal(g.stats.recent.length,1);
});
test('Visual effect seeds are deterministic and do not advance gameplay randomness',()=>{
  let calls=0;const g=quiet(()=>{calls++;return .5;});const before=calls;
  const first=g.addEffect('frost',10,10,20,'#fff'),second=g.addEffect('mine',10,10,20,'#fff');assert.equal(calls,before);assert.ok(Number.isFinite(first.seed));assert.notEqual(first.seed,second.seed);
});
test('Shield consumes one charge per valid hit without bypassing invulnerability or recharging free on upgrade',()=>{
  const g=quiet();own(g,'shield',1);const p=g.player;p.invuln=1;
  assert.equal(g.damagePlayer(12,'blob'),false);assert.equal(p.shieldCharges,1);near(g.report().blockedDamage,0);
  p.invuln=0;p.ghostActive=true;assert.equal(g.damagePlayer(12,'blob'),false);assert.equal(p.shieldCharges,1);
  p.ghostActive=false;g.damagePlayer(12,'blob');assert.equal(p.hp,100);assert.equal(p.shieldCharges,0);near(g.report().blockedDamage,12);assert.ok(p.invuln>0);
  g.damagePlayer(19,'tank');near(g.report().blockedDamage,12);assert.equal(p.hp,100);
  own(g,'shield',2);assert.equal(p.shieldCharges,0);own(g,'shield',3);assert.equal(p.shieldCharges,1);
  own(g,'shield',4);assert.equal(p.shieldCharges,2);g.updateShield(100);assert.ok(p.shieldCharges<=3);
});
test('Player damage records only actual loss and recent lethal damage excludes hits older than five seconds',()=>{
  const g=quiet();assert.equal(g.report().death,null);g.time=1;g.damagePlayer(10,'blob');g.player.invuln=0;
  g.time=7;g.damagePlayer(19,'tank');g.player.invuln=0;g.time=8;g.damagePlayer(999,'bossCone');
  const report=g.report();assert.equal(g.state,'ended');near(report.damageTaken,100);assert.equal(report.death.source,'bossCone');near(report.death.amount,71);
  assert.ok(report.death.name);assert.deepEqual(report.death.recent.map(row=>row.source),['tank','bossCone']);assert.deepEqual(report.death.recent.map(row=>row.amount),[19,71]);
  report.death.recent[0].amount=999;assert.equal(g.report().death.recent[0].amount,19);
});
test('Run level starts at zero and wave progress is driven by XP upgrades, never elapsed time',()=>{
  const g=quiet();assert.equal(g.snapshot().level,0);assert.equal(g.snapshot().wave,1);g.time=100000;g.step(.1);
  assert.equal(g.upgrades,0);assert.equal(g.snapshot().wave,1);assert.equal(g.won,false);assert.equal(g.boss,null);assert.equal(g.bossDue,null);
  g.addEnergy(8);g.maybeUpgrade();g.choose(0);assert.equal(g.snapshot().level,1);assert.equal(g.snapshot().wave,2);
  const h=quiet();h.upgrades=40;h.bossesDefeated=[1,2];h.firstBossDefeated=true;h.afterUpgrade();assert.equal(h.state,'playing');assert.equal(h.won,false);h.time=100000;h.step(.1);
  assert.equal(h.boss.bossStage,3);assert.equal(h.state,'playing');assert.equal(h.won,false);assert.equal(h.maybeUpgrade(),false);
});
test('All three boss warning countdowns freeze during pause, upgrades, catalysts and lotteries',()=>{
  for(let stage=1;stage<=3;stage++){
    const g=quiet();g.upgrades=BOSS_MILESTONES[stage-1].upgrade;g.bossesDefeated=Array.from({length:stage-1},(_,i)=>i+1);g.firstBossDefeated=stage>1;
    own(g,'mine',1);own(g,'frost',1);own(g,'drone',1);own(g,'well',1);own(g,'shield',1);g.items.push({type:'magnet',x:0,y:0,life:30,r:6});g.afterUpgrade();
    assert.equal(g.bossDue.stage,stage);near(g.snapshot().bossDue.seconds,stage*10);g.step(.1);near(g.snapshot().bossDue.seconds,stage*10-.1);
    for(const state of ['paused','upgrade','catalyst','lottery']){g.state=state;const frozen=JSON.stringify(g);g.step(.1,{x:1});assert.equal(JSON.stringify(g),frozen);}
    g.state='playing';g.time=g.bossDue.at-.11;g.step(.1);assert.equal(g.boss,null);g.step(.02);assert.equal(g.boss.bossStage,stage);
    const before=JSON.stringify(g);g.spawnBoss(stage);assert.equal(JSON.stringify(g),before);
  }
});
test('Split children and boss summons respect each of the nine stage minor-enemy caps',()=>{
  assert.equal(STAGES.length,9);
  const scenarios=[{upgrades:0},{upgrades:5},{boss:1,upgrades:10},{upgrades:10,defeated:[1]},{upgrades:15,defeated:[1]},
    {boss:2,upgrades:20,defeated:[1]},{upgrades:20,defeated:[1,2]},{upgrades:25,defeated:[1,2]},{boss:3,upgrades:40,defeated:[1,2]}];
  for(let index=0;index<scenarios.length;index++){
    const config=scenarios[index],g=quiet();g.upgrades=config.upgrades;g.bossesDefeated=config.defeated||[];g.firstBossDefeated=g.bossesDefeated.includes(1);if(config.boss)g.spawnBoss(config.boss);
    assert.equal(g.stage(),STAGES[index]);const splitter=g.createEnemy('splitter',100,100);while(g.minorCount()<g.stage().cap)g.createEnemy('blob',200,200);
    g.kill(splitter);assert.equal(g.minorCount(),g.stage().cap);g.spawnEnemy();assert.equal(g.minorCount(),g.stage().cap);
    if(g.boss&&config.boss>=2){g.boss.intent={kind:'summon',angle:0,remaining:0};g.updateBossAttack(.1);assert.equal(g.minorCount(),g.stage().cap+(config.boss===2?3:0));}
  }
});
test('Third boss cycles all four telegraphed attacks and enrages below half health without healing',()=>{
  const g=quiet();g.spawnBoss(3);const boss=g.boss;assert.equal(boss.maxHp,8500);assert.equal(boss.name,'终末炼金核');assert.equal(boss.r,64);
  const patterns=[];for(let index=0;index<4;index++){boss.attackIndex=index;boss.attackClock=0;boss.intent=null;boss.dashRemaining=0;g.updateBossAttack(.01);patterns.push(boss.intent.kind);}
  assert.deepEqual(new Set(patterns),new Set(['cone','dash','summon','shockwave']));
  boss.hp=boss.maxHp*.49;boss.intent=null;boss.attackClock=0;g.updateBossAttack(.01);assert.equal(boss.enraged,true);assert.equal(g.snapshot().boss.enraged,true);near(boss.hp,8500*.49);
});
test('Third boss shockwave telegraphs for 1.2 seconds and uses the exact inner safe and outer danger boundaries',()=>{
  for(const [radius,hit] of [[0,false],[119,false],[120,false],[120.0001,true],[121,true],[260,true],[260.0001,false]]){
    const g=quiet();g.spawnBoss(3);const boss=g.boss;boss.x=g.player.x-radius;boss.y=g.player.y;boss.attackIndex=2;boss.attackClock=0;
    // Find the real cycle position, rather than requiring a particular rotation order.
    for(let index=0;index<4;index++){boss.attackIndex=index;boss.intent=null;boss.attackClock=0;g.updateBossAttack(.01);if(boss.intent.kind==='shockwave')break;}
    assert.equal(boss.intent.kind,'shockwave');near(boss.intent.remaining,1.2);assert.equal(boss.intent.innerRadius,120);assert.equal(boss.intent.radius,260);
    g.updateBossAttack(1.19);assert.equal(g.player.hp,100);assert.ok(boss.intent);g.updateBossAttack(.011);assert.equal(boss.intent,null);assert.equal(g.player.hp,hit?76:100);
    const effect=g.effects.find(e=>e.kind==='bossShockwave');assert.ok(effect);assert.equal(effect.innerRadius,120);assert.equal(effect.r,260);near(effect.total,.65);
  }
});
test('Shockwave respects ghost and hit invulnerability, consumes one shield layer and reports a lethal source',()=>{
  const prepare=()=>{const g=quiet();g.spawnBoss(3);g.boss.x=g.player.x-150;g.boss.y=g.player.y;g.boss.intent={kind:'shockwave',remaining:0,total:1.2,innerRadius:120,radius:260,angle:0};return g;};
  for(const protection of ['ghost','invuln','shield']){
    const g=prepare();if(protection==='ghost')g.player.ghostActive=true;else if(protection==='invuln')g.player.invuln=1;else own(g,'shield',1);
    g.updateBossAttack(.1);assert.equal(g.player.hp,100);assert.equal(g.report().damageTaken,0);assert.equal(g.report().blockedDamage,protection==='shield'?24:0);
    if(protection==='shield')assert.equal(g.player.shieldCharges,0);
  }
  const g=prepare();g.player.hp=10;g.updateBossAttack(.1);assert.equal(g.state,'ended');assert.equal(g.report().death.source,'bossShockwave');assert.equal(g.report().death.amount,10);assert.ok(g.report().death.name.includes('环'));
});
test('Third boss death always opens a frozen final lottery before victory and halts the killing frame',()=>{
  for(const skill of ['bullet','lightning','mine','frost','well','drone']){
    const g=quiet(()=>.2);if(skill!=='bullet')own(g,skill,1);g.upgrades=40;g.bossesDefeated=[1,2];g.firstBossDefeated=true;g.spawnBoss(3);
    const boss=g.boss;boss.x=g.player.x+35;boss.y=g.player.y;boss.hp=.001;g.createEnemy('tank',g.player.x,g.player.y-28);
    if(skill==='bullet')g.fireBullet(0);else if(skill==='lightning')g.player.lightningClock=0;else if(skill==='mine'){g.layMine();g.mines[0].armed=0;}else if(skill==='frost')g.player.frostClock=0;else if(skill==='well')g.spawnWell();else g.fireDrones();
    const hp=g.player.hp;g.step(.1);assert.equal(g.state,'lottery',skill);assert.equal(g.lottery.bossStage,3);assert.equal(g.won,false);assert.equal(g.player.hp,hp);assert.equal(g.upgrades,40);
    const before=JSON.stringify(g);g.step(.1);assert.equal(JSON.stringify(g),before);g.acknowledgeLottery();assert.equal(g.state,'ended');assert.equal(g.won,true);assert.equal(g.snapshot().level,40);
  }
});
test('Three-boss reports keep independent combat times and health states and remain deep-copy reads',()=>{
  const g=quiet(()=>.2);const hp=[1200,4000,8500];
  for(let stage=1;stage<=3;stage++){
    g.state='playing';g.time=stage*10;g.spawnBoss(stage);g.time+=stage;g.hurt(g.boss,hp[stage-1]+100,{source:'rail'});
    const before=JSON.stringify(g);const report=g.report();assert.equal(JSON.stringify(g),before);assert.equal(report.bosses.length,stage);assert.equal(report.bosses[stage-1].duration,stage);assert.equal(report.bosses[stage-1].hp,0);assert.equal(report.bosses[stage-1].maxHp,hp[stage-1]);
    g.acknowledgeLottery();
  }
  const report=g.report();near(report.bossDamage,13700);assert.deepEqual(report.bosses.map(b=>b.name),BOSS_MILESTONES.map(b=>b.name));assert.deepEqual(report.bosses.map(b=>b.killed),[true,true,true]);
  report.bosses[2].hp=123;report.bosses[2].name='changed';assert.equal(g.report().bosses[2].hp,0);assert.equal(g.report().bosses[2].name,'终末炼金核');
});
test('Four added catalysts require their skill, apply one tradeoff and cleanly replace the previous item',()=>{
  const g=quiet();for(const id of ['cryo','guidance','singularity','prism'])assert.throws(()=>g.equipCatalyst(id));
  for(const id of ['frost','drone','well','shield'])own(g,id,2);
  g.equipCatalyst('cryo');near(g.player.frostRadius,185*1.25);near(g.player.frostInterval,5*1.15);g.recompute();near(g.player.frostRadius,185*1.25);
  g.equipCatalyst('guidance');near(g.player.frostRadius,185);near(g.player.frostInterval,5);assert.equal(g.player.droneShots,3);near(g.player.droneDamageMultiplier,.8);g.recompute();assert.equal(g.player.droneShots,3);
  g.equipCatalyst('singularity');assert.equal(g.player.droneShots,2);near(g.player.droneDamageMultiplier,1);near(g.player.wellRadius,145*.9);near(g.player.wellPull,110*1.4);g.recompute();near(g.player.wellPull,154);
  const charges=g.player.shieldCharges;g.equipCatalyst('prism');near(g.player.wellRadius,145);near(g.player.wellPull,110);assert.equal(g.player.shieldMaxCharges,2);near(g.player.shieldInterval,14*1.3);assert.equal(g.player.shieldCharges,charges);
  g.recompute();assert.equal(g.player.shieldMaxCharges,2);near(g.player.shieldInterval,18.2);g.equipCatalyst('pressure');assert.equal(g.player.shieldMaxCharges,1);near(g.player.shieldInterval,14);assert.equal(g.owned.length,4);
});
test('Added catalyst switching clamps all four cooldowns but never restarts an almost-ready activation',()=>{
  const g=quiet();for(const id of ['frost','drone','well','shield'])own(g,id,4);
  for(const [catalyst,field,interval] of [['cryo','frost',3*1.15],['guidance','drone',1],['singularity','well',5],['prism','shield',8*1.3]]){
    g.player[field+'Clock']=100;g.equipCatalyst(catalyst);near(g.player[field+'Clock'],interval);g.player[field+'Clock']=.2;g.equipCatalyst('pressure');near(g.player[field+'Clock'],.2);
  }
});
test('Guidance and singularity preserve existing projectile and gravity-well snapshots when replaced',()=>{
  const g=quiet();own(g,'drone',2);own(g,'well',2);g.createEnemy('tank',700,300);g.fireDrones();g.spawnWell();const initialBullets=[...g.bullets],initialWell=g.gravityWells[0];
  g.equipCatalyst('guidance');g.fireDrones();assert.equal(g.bullets.length,5);for(const bullet of initialBullets)near(bullet.damage,18);for(const bullet of g.bullets.slice(2))near(bullet.damage,14.4);
  g.equipCatalyst('singularity');g.spawnWell();const modifiedWell=g.gravityWells[1];near(initialWell.r,145);near(initialWell.pull,110);near(modifiedWell.r,130.5);near(modifiedWell.pull,154);near(initialWell.damage,modifiedWell.damage);
  g.equipCatalyst('pressure');near(modifiedWell.r,130.5);near(modifiedWell.pull,154);for(const bullet of initialBullets)near(bullet.damage,18);assert.equal(g.player.droneShots,2);near(g.player.wellRadius,145);
});
test('Prism does not grant free charges, clamps on removal and shield tiers add only the derived capacity difference',()=>{
  const g=quiet();own(g,'shield',1);g.damagePlayer(12,'blob');assert.equal(g.player.shieldCharges,0);g.equipCatalyst('prism');assert.equal(g.player.shieldCharges,0);assert.equal(g.player.shieldMaxCharges,2);
  own(g,'shield',2);assert.equal(g.player.shieldCharges,0);own(g,'shield',3);assert.equal(g.player.shieldCharges,1);own(g,'shield',4);assert.equal(g.player.shieldCharges,2);assert.equal(g.player.shieldMaxCharges,4);
  g.recompute();g.recompute();assert.equal(g.player.shieldCharges,2);g.updateShield(100);g.updateShield(100);assert.equal(g.player.shieldCharges,4);g.equipCatalyst('pressure');assert.equal(g.player.shieldCharges,3);assert.equal(g.player.shieldMaxCharges,3);
  g.equipCatalyst('prism');assert.equal(g.player.shieldCharges,3);assert.equal(g.player.shieldMaxCharges,4);near(g.player.shieldInterval,10.4);
});
test('Added synergy previews and activation events use the four real recipes without extra skill slots',()=>{
  const g=quiet();for(const id of ['frost','well','drone','shield'])own(g,id,1);const recipes=[['aura','icebite'],['lightning','gravityStorm'],['crit','seeker'],['orbit','guardian']];
  for(const [skillId,synergyId] of recipes){const preview=g.skillPreview(skillId).find(s=>s.id===synergyId);assert.ok(preview);assert.equal(preview.status,'activate');assert.deepEqual(preview.missing,[]);own(g,skillId,1);assert.equal(g.skillPreview(skillId).find(s=>s.id===synergyId).status,'active');}
  assert.equal(g.owned.length,8);const events=g.takeEvents();for(const [,id] of recipes)assert.equal(events.filter(event=>event.type==='synergy'&&event.id===id).length,1);
});
test('Icebite boosts only aura hits against currently slowed enemies, including bosses, exactly once',()=>{
  const g=quiet();own(g,'aura',1);const p=g.player,e=g.createEnemy('tank',p.x,p.y);e.slowRemaining=2.5;g.updateAura(.1);near(e.maxHp-e.hp,1.4);
  own(g,'frost',1);const hp=e.hp;g.updateAura(.1);near(hp-e.hp,1.4*1.3);e.slowRemaining=0;const hp2=e.hp;g.updateAura(.1);near(hp2-e.hp,1.4);
  g.spawnBoss(1);g.boss.x=p.x;g.boss.y=p.y;g.boss.slowRemaining=2.5;const bossHp=g.boss.hp;g.updateAura(.1);near(bossHp-g.boss.hp,1.4*1.3);near(g.report().damage.find(row=>row.id==='aura').bossDamage,1.4*1.3);
  const h=quiet();own(h,'aura',1);own(h,'frost',1);const weak=h.createEnemy('child',h.player.x,h.player.y);weak.hp=1;weak.slowRemaining=2.5;h.updateAura(.1);near(h.report().totalDamage,1);assert.equal(h.report().damage.length,1);assert.equal(h.report().damage[0].id,'aura');
});
test('Gravity storm boosts primary lightning and conductive chains in live wells once even when fields overlap',()=>{
  const g=quiet();for(const id of ['well','lightning','aura'])own(g,id,1);const p=g.player,target=g.createEnemy('tank',p.x,p.y),a=g.createEnemy('tank',p.x+95,p.y),b=g.createEnemy('tank',p.x-95,p.y);
  g.spawnWell();g.spawnWell();g.lightning();near(target.maxHp-target.hp,54*1.25);near(a.maxHp-a.hp,18*1.25*1.25);near(b.maxHp-b.hp,18*1.25*1.25);
  near(g.report().totalDamage,54*1.25+2*18*1.25*1.25);assert.equal(g.report().damage.length,1);assert.equal(g.report().damage[0].id,'lightning');
  for(const well of g.gravityWells)well.life=0;const hp=target.hp;g.lightning();near(hp-target.hp,54);
  const h=quiet();own(h,'lightning',1);const e=h.createEnemy('tank',h.player.x+100,h.player.y);h.gravityWells.push({x:e.x,y:e.y,r:120,life:3});h.lightning();near(e.maxHp-e.hp,54);
});
test('Gravity-well body-overlap boundaries and boss lightning bonus use living wells only',()=>{
  const g=quiet();own(g,'well',1);own(g,'lightning',1);const p=g.player,e=g.createEnemy('tank',p.x+140,p.y);g.gravityWells.push({x:p.x,y:p.y,r:120,life:3});assert.equal(g.inGravityWell(e),true);e.x+=.0001;assert.equal(g.inGravityWell(e),false);
  g.spawnBoss(1);g.boss.x=p.x+164;g.boss.y=p.y;assert.equal(g.inGravityWell(g.boss),true);g.enemies=[g.boss];const hp=g.boss.hp;g.lightning();near(hp-g.boss.hp,54*1.25);near(g.report().bossDamage,54*1.25);
  g.gravityWells[0].life=0;assert.equal(g.inGravityWell(g.boss),false);
});
test('Seeker permits drone critical hits using current crit values without counting toward basic-fire overload',()=>{
  const g=quiet(()=>0);own(g,'drone',1);own(g,'crit',4);own(g,'rate',1);const p=g.player,e=g.createEnemy('tank',p.x+70,p.y);e.hp=e.maxHp=10000;
  for(let i=0;i<4;i++){g.fireDrones();g.updateBullets(.1);}near(e.maxHp-e.hp,4*18*.8*3.5);near(g.report().damage.find(row=>row.id==='drone').damage,4*18*.8*3.5);near(p.overloadRemaining,0);assert.deepEqual(p.criticalHits,[]);
  assert.equal(g.takeEvents().filter(event=>event.type==='damage'&&event.source==='drone'&&event.critical).length,4);g.fireBullet(0);g.updateBullets(.1);assert.equal(p.criticalHits.length,1);near(p.overloadRemaining,0);
  const h=quiet(()=>.99);own(h,'drone',1);own(h,'crit',4);const target=h.createEnemy('tank',h.player.x+70,h.player.y);h.fireDrones();h.updateBullets(.1);near(target.maxHp-target.hp,18*.8);
  h.random=()=>0;target.hp=1;const before=h.report().totalDamage;h.fireDrones();h.updateBullets(.1);near(h.report().totalDamage-before,1);assert.equal(h.report().damage.length,1);assert.equal(h.report().damage[0].id,'drone');
});
test('Guardian boosts orbit damage only while a charge remains, returns to baseline on break and applies to bosses',()=>{
  const g=quiet();own(g,'orbit',1);const p=g.player,e=g.createEnemy('tank',p.x+p.orbitRadius,p.y),place=target=>{target.x=p.x+Math.cos(g.time*p.orbitSpeed)*p.orbitRadius;target.y=p.y+Math.sin(g.time*p.orbitSpeed)*p.orbitRadius;};g.updateOrbits();near(e.maxHp-e.hp,13.4);
  own(g,'shield',1);g.time=.3;place(e);const hp=e.hp;g.updateOrbits();near(hp-e.hp,13.4*1.2);g.damagePlayer(12,'blob');assert.equal(p.shieldCharges,0);g.time=.6;place(e);const hp2=e.hp;g.updateOrbits();near(hp2-e.hp,13.4);
  g.updateShield(18);assert.equal(p.shieldCharges,1);g.equipCatalyst('bearing');g.time=.9;place(e);const hp3=e.hp;g.updateOrbits();near(hp3-e.hp,13.4*.9*1.2);
  g.spawnBoss(1);const bossHp=g.boss.hp;g.time=1.2;place(g.boss);g.updateOrbits();near(bossHp-g.boss.hp,13.4*.9*1.2);near(g.report().damage.find(row=>row.id==='orbit').bossDamage,13.4*.9*1.2);
});
test('Expanded recipe and catalyst pools retain eligible choices and reinforcement guarantees across seeded rerolls',()=>{
  const seen=new Set();for(let seed=1;seed<=120;seed++){
    let state=seed;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};const g=quiet(random);
    for(const id of ['frost','drone','well','shield'])own(g,id,1);g.openCatalyst();assert.equal(g.catalystOptions.length,3);assert.ok(g.catalystOptions.every(id=>!BY_CATALYST[id].skill||g.level(BY_CATALYST[id].skill)>0));
    for(const id of g.catalystOptions)if(BY_CATALYST[id].skill)seen.add(id);g.keepCatalyst();g.addEnergy(8);g.maybeUpgrade();
    for(let rerolls=0;rerolls<3;rerolls++){assert.equal(g.options.length,3);assert.equal(new Set(g.options).size,3);assert.ok(g.options.every(id=>g.candidates().includes(id)));assert.ok(g.options.some(id=>g.level(id)>0));if(rerolls<2)g.reroll();}
  }
  assert.deepEqual([...seen].sort(),['cryo','guidance','prism','singularity']);
});
function historyRecord(index=1,changes={}){
  return {id:`run-1700000000000-${index}`,at:1700000000000+index,version:'v10',won:false,level:3,wave:4,time:30,kills:2,totalDamage:20,bossDamage:10,damageTaken:12,blockedDamage:19,
    skills:[{id:'rate',level:1},{id:'power',level:2}],catalyst:'pressure',synergies:['rail'],damage:[{id:'bullet',damage:20,bossDamage:10}],bosses:[{stage:1,hp:1000,maxHp:1200,duration:4,killed:false}],deathSource:'blob',...changes};
}
const historyEnvelope=records=>({schema:1,records});

test('History creation reads ended games without changing state, report, events or default gameplay RNG',()=>{
  const oldRandom=Math.random;let calls=0;Math.random=()=>{calls++;return .99;};
  try{
    const g=new Game();own(g,'rate',1);own(g,'power',2);g.equipCatalyst('pressure');g.spawnBoss(1);g.time=4;g.hurt(g.boss,100,{source:'bullet'});g.damagePlayer(999,'bossCone');
    const before=JSON.stringify(g),report=JSON.stringify(g.report()),randomBefore=calls;
    const record=createRunRecord(g,{at:1700000000000,version:'v10'});assert.ok(record);assert.equal(record.level,0);assert.equal(record.wave,1);assert.equal(record.deathSource,'bossCone');
    assert.equal(JSON.stringify(g),before);assert.equal(JSON.stringify(g.report()),report);assert.equal(calls,randomBefore);assert.equal(record.bosses.length,1);
    const again=createRunRecord(g,{at:1700000000001,version:'v10'});assert.equal(again.id,record.id);assert.notEqual(again,record);assert.equal(JSON.stringify(g),before);assert.equal(calls,randomBefore);
    record.skills[0].level=4;record.damage[0].damage=99999;record.bosses[0].hp=0;record.synergies.push('icebite');assert.equal(JSON.stringify(g),before);assert.equal(JSON.stringify(g.report()),report);
    assert.ok(!('name' in again.damage[0]));assert.ok(!('report' in again));assert.ok(!('share' in again.damage[0]));
  }finally{Math.random=oldRandom;}
});
test('History creation rejects unfinished, nonformal and invalid metadata without inventing a record',()=>{
  const g=quiet();for(const state of ['menu','playing','paused','upgrade','catalyst','lottery']){g.state=state;assert.equal(createRunRecord(g,{at:1700000000000,version:'v10'}),null);}
  g.state='playing';g.finish(false);for(const mode of ['qa','practice','sandbox','formal',null]){g.mode=mode;assert.equal(createRunRecord(g,{at:1700000000000,version:'v10'}),null);}
  g.mode='normal';assert.ok(createRunRecord(g,{at:0,version:'v10'}));delete g.mode;
  for(const metadata of [{},{at:-1,version:'v10'},{at:NaN,version:'v10'},{at:Infinity,version:'v10'},{at:1.1,version:'v10'},{at:253402300800000,version:'v10'},{at:0,version:'<svg onload=alert(1)>'},{at:0,version:'v12345'}])assert.equal(createRunRecord(g,metadata),null);
  assert.equal(createRunRecord(null,{at:0,version:'v10'}),null);
});
test('History envelopes reject damaged schema and bounded oversized inputs safely',()=>{
  const empty=historyEnvelope([]);for(const raw of [null,undefined,{},[],1,'{',JSON.stringify({schema:2,records:[]}),{schema:1,records:{}},{schema:'1',records:[]},' '.repeat(131073),historyEnvelope(Array.from({length:41},(_,i)=>historyRecord(i)))])assert.deepEqual(sanitizeRunHistory(raw),empty);
  const hostile={get schema(){throw new Error('untrusted getter');}};assert.deepEqual(sanitizeRunHistory(hostile),empty);
  const input=historyEnvelope([historyRecord()]);assert.deepEqual(sanitizeRunHistory(JSON.stringify(input)),input);assert.equal(sanitizeRunHistory(historyEnvelope(Array.from({length:40},(_,i)=>historyRecord(i)))).records.length,10);
});
test('History record IDs and all referenced metadata are whitelisted rather than rendered as untrusted strings',()=>{
  const accepted=historyRecord(99);const edits=[];
  for(const id of ['unknown','__proto__','constructor','toString','<img src=x onerror=alert(1)>'])edits.push({skills:[{id,level:1}]},{catalyst:id},{synergies:[id]},{damage:[{id,damage:1,bossDamage:0}]},{deathSource:id});
  edits.push({id:'<script>alert(1)</script>'},{id:'run-'+ '9'.repeat(100)+'-1'},{version:'v10"><svg/onload=alert(1)>'},{bosses:[{stage:4,hp:1,maxHp:1,duration:0,killed:false}]});
  for(const change of edits)assert.deepEqual(sanitizeRunHistory(historyEnvelope([historyRecord(1,change),accepted])).records,[accepted]);
  const extra=historyRecord(1,{name:'<script>bad</script>',report:'<svg/onload=bad>',skills:[{id:'rate',level:1,name:'bad'}]});const cleaned=sanitizeRunHistory(historyEnvelope([extra])).records[0];
  assert.ok(!('name' in cleaned));assert.ok(!('report' in cleaned));assert.deepEqual(cleaned.skills,[{id:'rate',level:1}]);assert.ok(Object.hasOwn(PLAYER_DAMAGE_NAMES,cleaned.deathSource));
});
test('History rejects nonfinite, negative, out-of-range and inconsistent numeric fields per record',()=>{
  const valid=historyRecord(2),invalid=[];
  for(const field of ['time','totalDamage','bossDamage','damageTaken','blockedDamage','at','kills','level','wave'])for(const value of [-1,NaN,Infinity,'1'])invalid.push({[field]:value});
  invalid.push({level:41},{wave:0},{wave:41},{level:.5},{kills:.5},{kills:Number.MAX_SAFE_INTEGER+1},{won:'false'},{bossDamage:21},
    {skills:[{id:'rate',level:0}]},{skills:[{id:'rate',level:5}]},{damage:[{id:'bullet',damage:1,bossDamage:2}]},{damage:[{id:'bullet',damage:NaN,bossDamage:0}]},
    {bosses:[{stage:1,hp:2,maxHp:1,duration:0,killed:false}]},{bosses:[{stage:1,hp:0,maxHp:0,duration:0,killed:true}]},{bosses:[{stage:1,hp:1,maxHp:1,duration:-1,killed:false}]},{bosses:[{stage:1,hp:1,maxHp:1,duration:0,killed:'false'}]});
  for(const change of invalid)assert.deepEqual(sanitizeRunHistory(historyEnvelope([historyRecord(1,change),valid])).records,[valid]);
  assert.equal(sanitizeRunHistory(historyEnvelope([historyRecord(1,{level:0,wave:1,time:0,kills:0,totalDamage:0,bossDamage:0,damageTaken:0,blockedDamage:0,damage:[],bosses:[],deathSource:null,catalyst:null})])).records.length,1);
});
test('History bounds nested collections and rejects repeated skill, source, synergy and boss identifiers',()=>{
  const invalid=[{skills:Array.from({length:9},()=>({id:'rate',level:1}))},{synergies:Array(10).fill('rail')},{damage:Array.from({length:12},()=>({id:'bullet',damage:1,bossDamage:0}))},{bosses:Array.from({length:4},()=>({stage:1,hp:0,maxHp:1,duration:1,killed:true}))},
    {skills:[{id:'rate',level:1},{id:'rate',level:2}]},{synergies:['rail','rail']},{damage:[{id:'bullet',damage:1,bossDamage:0},{id:'bullet',damage:1,bossDamage:0}]},{bosses:[{stage:1,hp:0,maxHp:1,duration:1,killed:true},{stage:1,hp:0,maxHp:1,duration:1,killed:true}]},
    {skills:null},{synergies:'rail'},{damage:{}},{bosses:null}];
  for(const changes of invalid)assert.deepEqual(sanitizeRunHistory(historyEnvelope([historyRecord(1,changes)])).records,[]);
});
test('History retains ten newest unique records and appending a duplicate never overwrites an archived result',()=>{
  assert.equal(RUN_HISTORY_LIMIT,10);const input=Array.from({length:14},(_,i)=>historyRecord(i+1));const records=sanitizeRunHistory(historyEnvelope([...input].reverse())).records;
  assert.deepEqual(records.map(record=>record.at),input.slice(4).reverse().map(record=>record.at));assert.equal(new Set(records.map(record=>record.id)).size,10);
  const newest=historyRecord(20);const appended=appendRunHistory(records,newest);assert.equal(appended.length,10);assert.equal(appended[0].id,newest.id);
  assert.deepEqual(appendRunHistory(appended,{...newest,won:true,time:1}),appended);assert.deepEqual(appendRunHistory(appended,{...newest,id:'invalid'}),appended);
  const tieA=historyRecord(21,{at:100}),tieB=historyRecord(22,{at:100});assert.deepEqual(sanitizeRunHistory(historyEnvelope([tieA,tieB,tieA])).records,[tieA,tieB]);
});
test('History normalize and append return independent deep copies without mutating either argument',()=>{
  const a=historyRecord(1),b=historyRecord(2),raw=historyEnvelope([a]);const before=JSON.stringify(raw),recordBefore=JSON.stringify(b);const cleaned=sanitizeRunHistory(raw),appended=appendRunHistory(raw.records,b);
  cleaned.records[0].skills[0].level=4;cleaned.records[0].synergies.push('overload');cleaned.records[0].damage[0].damage=999;cleaned.records[0].bosses[0].hp=0;
  appended[0].skills[0].level=4;appended[0].damage[0].damage=123;appended[0].bosses[0].duration=999;appended[1].skills[1].level=4;assert.equal(JSON.stringify(raw),before);assert.equal(JSON.stringify(b),recordBefore);
  a.skills[0].level=3;b.bosses[0].hp=1;assert.equal(cleaned.records[0].skills[0].level,4);assert.equal(appended[0].bosses[0].hp,1000);
  const immutable=historyRecord(3);for(const key of ['skills','damage','bosses']){immutable[key].forEach(Object.freeze);Object.freeze(immutable[key]);}Object.freeze(immutable.synergies);Object.freeze(immutable);assert.equal(appendRunHistory(Object.freeze([immutable]),historyRecord(4)).length,2);
});
test('Completed run records preserve actual three-boss results and do not fabricate encounters',()=>{
  const g=quiet();g.upgrades=40;for(const stage of [1,2,3]){g.state='playing';g.spawnBoss(stage);g.time+=stage;g.hurt(g.boss,g.boss.hp+10,{source:'rail'});g.acknowledgeLottery();}
  const record=createRunRecord(g,{at:1700000000100,version:'v10'});assert.ok(record.won);assert.equal(record.level,40);assert.equal(record.wave,40);assert.deepEqual(record.bosses.map(row=>row.stage),[1,2,3]);assert.deepEqual(record.bosses.map(row=>row.duration),[1,2,3]);assert.ok(record.bosses.every(row=>row.hp===0&&row.killed));near(record.bossDamage,13700);
  const early=quiet();early.finish(false);const earlyRecord=createRunRecord(early,{at:1700000000101,version:'v10'});assert.deepEqual(earlyRecord.bosses,[]);assert.equal(earlyRecord.deathSource,null);
});
test('History summary describes only the retained ten records and fastest time is drawn exclusively from wins',()=>{
  const input=Array.from({length:12},(_,i)=>historyRecord(i+1,{won:i>=10,time:i===11?60:i===10?90:1,level:i===0?30:i===11?20:3,wave:i===11?21:4,totalDamage:i===0?1e6:20+i,bossDamage:0}));
  const before=JSON.stringify(input),summary=summarizeRunHistory(input);assert.deepEqual(summary,{count:10,wins:2,highestCompletedWave:20,fastestWin:60,highestDamage:31});assert.equal(JSON.stringify(input),before);
  assert.deepEqual(summarizeRunHistory([historyRecord(1,{time:1}),historyRecord(2,{time:100})]),{count:2,wins:0,highestCompletedWave:3,fastestWin:null,highestDamage:20});
  assert.deepEqual(summarizeRunHistory([]),{count:0,wins:0,highestCompletedWave:0,fastestWin:null,highestDamage:0});
});
function quietPractice(stage=1,buildId='hunter'){
  const g=createPracticeGame({stage,buildId,random:()=>.37});
  for(const id of ['fire','ring','lightning','mine','frost','drone','well'])g.player[id+'Clock']=1e9;
  return g;
}
test('Twelve practice combinations have eight valid fixed skills, compatible catalysts and fresh full health and shield',()=>{
  assert.equal(PRACTICE_BUILDS.length,6);
  for(let stage=1;stage<=3;stage++)for(const build of PRACTICE_BUILDS){
    let calls=0;const g=createPracticeGame({stage,buildId:build.id,random:()=>{calls++;return .37;}});
    assert.equal(calls,0);assert.equal(g.mode,'practice');assert.equal(g.practice,true);assert.deepEqual(g.practiceConfig,{stage,buildId:build.id,tier:stage+1});
    assert.equal(new Set(g.owned).size,8);assert.deepEqual(g.owned,build.skills);assert.ok(g.owned.every(id=>g.level(id)===stage+1));assert.equal(g.catalyst,build.catalyst);
    near(g.player.hp,g.player.maxHp);assert.equal(g.player.shieldCharges,g.player.shieldMaxCharges);assert.equal(g.player.invuln,0);assert.equal(g.upgrades,BOSS_MILESTONES[stage-1].upgrade);assert.equal(g.wave,BOSS_MILESTONES[stage-1].upgrade);assert.equal(g.rerollsRemaining,0);
    assert.deepEqual(g.bossesDefeated,[]);assert.deepEqual(g.bossesSpawned,[]);assert.equal(g.report().bosses.length,0);
    assert.equal(g.bossDue.stage,stage);assert.equal(g.bossDue.at,3);assert.equal(g.bossDue.warning,3);assert.equal(g.stage(),STAGES[{1:2,2:5,3:8}[stage]]);
    const config=g.snapshot().practiceConfig;config.stage=99;assert.equal(g.practiceConfig.stage,stage);
  }
});
test('Invalid practice configuration is rejected before gameplay randomness or any normal run changes',()=>{
  let calls=0;const random=()=>{calls++;return .5;},normal=quiet(random),before=JSON.stringify(normal);
  for(const options of [{stage:0},{stage:4},{stage:1.5},{stage:'1'},{buildId:'constructor'},{buildId:'__proto__'},{width:NaN},{height:-1},{random:0}])assert.throws(()=>createPracticeGame({random,...options}),/配置无效/);
  assert.equal(calls,0);assert.equal(JSON.stringify(normal),before);assert.equal(normal.mode,'normal');assert.equal(normal.practice,false);
});
test('Practice has a frozen three-second preparation and no regular spawning, XP upgrades or milestone rewards',()=>{
  const g=quietPractice();g.addEnergy(99999);assert.equal(g.player.xp,0);assert.equal(g.maybeUpgrade(),false);assert.equal(g.upgradeLocked,true);
  for(const state of ['paused','upgrade','catalyst','lottery']){g.state=state;const before=JSON.stringify(g);g.step(.1);assert.equal(JSON.stringify(g),before);}
  g.state='playing';for(let i=0;i<29;i++)g.step(.1);near(g.time,2.9);assert.equal(g.boss,null);assert.equal(g.minorCount(),0);
  g.step(.1);assert.equal(g.boss.bossStage,1);assert.equal(g.boss.hp,1200);assert.equal(g.boss.maxHp,1200);assert.equal(g.bossDue,null);
  g.player.invuln=999;for(let i=0;i<50;i++)g.step(.1);assert.equal(g.minorCount(),0);assert.equal(g.state,'playing');assert.equal(g.player.xp,0);assert.deepEqual(g.catalystMilestones,[]);assert.deepEqual(g.lotteryHistory,[]);
});
test('Practice preserves real boss summons, stage scaling and final shockwave damage without energy or item drops',()=>{
  for(const stage of [2,3]){
    const g=quietPractice(stage,'control'),b=g.spawnBoss(stage);b.x=g.player.x+150;b.y=g.player.y;b.attackIndex=stage===2?1:2;b.attackClock=0;
    g.updateBossAttack(.01);assert.equal(b.intent.kind,'summon');b.intent.remaining=0;g.updateBossAttack(.01);assert.equal(g.minorCount(),stage===2?3:5);
    for(const e of g.enemies.filter(e=>e.type!=='boss')){near(e.maxHp,({swift:25,charger:78})[e.type]*g.stage().hp);g.kill(e);}
    assert.equal(g.gems.length,0);assert.equal(g.items.length,0);assert.equal(g.player.xp,0);
    if(stage===3){b.attackClock=0;g.updateBossAttack(.01);assert.equal(b.intent.kind,'shockwave');b.intent.remaining=0;g.player.invuln=0;const hp=g.player.hp;g.updateBossAttack(.01);near(g.player.hp,hp-24);near(g.report().damageTaken,24);}
  }
});
test('Practice boss death ends the killing frame directly, never opens a lottery or reports a full campaign win',()=>{
  const g=quietPractice(3,'control'),b=g.spawnBoss(3),hp=g.player.hp;b.x=g.player.x+100;b.y=g.player.y;
  g.createEnemy('blob',g.player.x,g.player.y);g.bullets.push({x:b.x,y:b.y,prevX:b.x,prevY:b.y,vx:0,vy:0,r:5,life:1,damage:999999,pierce:0,hits:new Set(),source:'bullet',kind:'bullet'});
  g.step(.01);assert.equal(g.state,'ended');assert.equal(g.won,true);assert.equal(g.player.hp,hp);assert.equal(g.lottery,null);assert.deepEqual(g.lotteryHistory,[]);assert.deepEqual(g.bossesDefeated,[3]);assert.equal(g.wave,40);
  assert.equal(g.report().bosses.length,1);assert.equal(g.report().bosses[0].killed,true);assert.equal(createRunRecord(g,{at:1700000000000,version:'v11'}),null);
  const before=JSON.stringify(g);g.step(.1);assert.equal(JSON.stringify(g),before);assert.equal(g.gems.length,0);
});
test('Failed practice stays nonformal and creating a new practice or normal run cannot leak old combat state',()=>{
  const g=quietPractice(2,'control');g.spawnBoss(2);g.damagePlayer(9999,'bossContact');assert.equal(g.state,'ended');assert.equal(g.won,false);assert.equal(g.report().death.source,'bossContact');assert.equal(createRunRecord(g,{at:1700000000000,version:'v11'}),null);
  const next=quietPractice(2,'control');assert.equal(next.time,0);assert.equal(next.state,'playing');assert.equal(next.boss,null);assert.equal(next.kills,0);assert.equal(next.report().totalDamage,0);assert.notEqual(next.player.build,g.player.build);
  const normal=new Game();assert.equal(normal.upgrades,0);assert.equal(normal.mode,'normal');assert.equal(normal.practiceConfig,null);assert.equal(normal.rerollsRemaining,2);normal.addEnergy(8);assert.equal(normal.maybeUpgrade(),true);
});
test('Each campaign level starts fresh with forty upgrades and distinct boss identities',()=>{
  assert.deepEqual(CAMPAIGN_LEVELS.map(level=>level.id),[1,2,3,4,5,6,7,8,9,10]);assert.throws(()=>new Game({campaignLevel:99}),/关卡/);
  const first=new Game({random:()=>.2}),second=new Game({campaignLevel:2,random:()=>.2});assert.equal(first.wave,1);assert.equal(second.wave,1);assert.equal(second.upgrades,0);assert.equal(second.player.hp,100);
  assert.equal(second.bossMilestone(1).warning,10);assert.equal(second.bossMilestone(2).warning,20);assert.equal(second.bossMilestone(3).warning,30);assert.notEqual(first.bossMilestone(1).name,second.bossMilestone(1).name);
  const firstBlob=first.createEnemy('blob',100,100),secondBlob=second.createEnemy('blob',100,100);assert.ok(secondBlob.hp>firstBlob.hp);assert.ok(secondBlob.speed>firstBlob.speed);assert.ok(second.stage().weights[1]>first.stage().weights[1]);
  second.upgrades=10;second.afterUpgrade();assert.equal(second.bossDue.name,'熔蚀聚合体');second.spawnBoss(1);assert.equal(second.boss.name,'熔蚀聚合体');assert.equal(second.boss.hp,1500);
});
test('Second campaign level keeps its own forty-wave progression and archives its identity',()=>{
  const g=new Game({campaignLevel:2,random:()=>.2});g.spawnClock=1e9;g.player.fireClock=1e9;g.addEnergy(100000);
  for(let stage=1;stage<=3;stage++){
    for(let n=(stage-1)*10+1;n<=BOSS_MILESTONES[stage-1].upgrade;n++){if(g.state==='playing')g.maybeUpgrade();assert.equal(g.state,'upgrade');chooseAny(g);assert.equal(g.upgrades,n);}
    assert.equal(g.bossDue.stage,stage);assert.equal(g.bossDue.warning,stage*10);g.spawnBoss(stage);assert.equal(g.boss.hp,Math.round([0,1200,4000,8500][stage]*1.25));g.kill(g.boss);assert.equal(g.state,'lottery');g.acknowledgeLottery();assert.equal(g.state,stage===3?'ended':'upgrade');
  }
  assert.equal(g.won,true);const record=createRunRecord(g,{at:1700000000999,version:'v12'});assert.equal(record.campaignLevel,2);assert.equal(sanitizeRunHistory(historyEnvelope([record])).records[0].campaignLevel,2);
  assert.deepEqual(sanitizeRunHistory(historyEnvelope([historyRecord(1,{campaignLevel:99})])).records,[]);assert.equal(sanitizeRunHistory(historyEnvelope([historyRecord()])).records[0].campaignLevel,undefined);
});
test('Second level eruptions announce a fixed circle, freeze with pause and can be dodged',()=>{
  const g=new Game({campaignLevel:2,random:()=>.99});g.upgrades=5;g.spawnClock=1e9;g.player.fireClock=1e9;g.arenaClock=.01;g.step(.02);const mark={...g.arenaIntent};assert.equal(mark.radius,95);assert.equal(mark.total,1.5);assert.ok(g.takeEvents().some(e=>e.type==='arenaWindup'));
  g.pause();const frozen=JSON.stringify(g.arenaIntent),time=g.time;g.step(.1,{x:1});assert.equal(JSON.stringify(g.arenaIntent),frozen);assert.equal(g.time,time);g.resume();g.player.x=mark.x+96;g.player.invuln=0;g.updateArena(1.5);assert.equal(g.player.hp,100);assert.equal(g.arenaIntent,null);
  g.arenaClock=.01;g.updateArena(.02);g.player.x=g.arenaIntent.x+95;g.player.invuln=0;g.updateArena(1.5);assert.equal(g.player.hp,82);assert.equal(g.stats.death,null);
  const first=new Game();first.upgrades=5;first.arenaClock=0;first.step(.1);assert.equal(first.arenaIntent,null);
});
test('Boss phase mechanics use telegraphed cross, twin dash and core pulse with exact safe areas',()=>{
  const g=quiet();g.spawnBoss(1);let b=g.boss;b.x=300;b.y=300;b.hp=b.maxHp*.49;b.attackClock=0;b.attackIndex=1;g.player.x=400;g.player.y=400;g.updateBossAttack(.01);assert.equal(b.intent.kind,'cross');assert.equal(b.intent.total,1.25);g.player.y=300;g.updateBossAttack(1.25);assert.equal(g.player.hp,100);
  g.player.x=400;g.player.y=300;g.player.invuln=0;b.intent={kind:'cross',angle:0,remaining:.01};g.updateBossAttack(.02);assert.equal(g.player.hp,80);
  const h=quiet();h.spawnBoss(2);b=h.boss;b.hp=b.maxHp*.49;b.attackClock=0;h.updateBossAttack(.01);assert.equal(b.intent.kind,'dash');h.updateBossAttack(.9);assert.equal(b.dashQueued,true);h.updateBossAttack(.72);assert.equal(b.intent.kind,'dash');assert.equal(b.intent.total,.7);h.updateBossAttack(.7);assert.equal(b.dashQueued,false);
  const k=quiet();k.spawnBoss(3);b=k.boss;b.hp=b.maxHp*.49;b.attackIndex=4;b.attackClock=0;b.x=300;b.y=300;k.player.x=451;k.player.y=300;k.updateBossAttack(.01);assert.equal(b.intent.kind,'corePulse');k.updateBossAttack(1.2);assert.equal(k.player.hp,100);k.player.x=450;k.player.invuln=0;b.intent={kind:'corePulse',angle:0,remaining:.01};k.updateBossAttack(.02);assert.equal(k.player.hp,76);
});
test('Portable saves restore bosses, piercing hit sets and frozen choices without consuming RNG',()=>{
  const {exportRunSave,importRunSave}=require('../dist/core.js');let calls=0;const random=()=>{calls++;return .2;};
  for(const state of ['playing','paused','upgrade','catalyst','lottery']){const g=new Game({random,campaignLevel:3});own(g,'beam',3);g.spawnBoss(1);g.boss.intent={kind:'cross',angle:1,remaining:.7,total:1.25,radius:240};g.fireBullet(0);g.bullets[0].hits.add(g.boss.id);g.state=state;if(state==='lottery')g.lottery={bossStage:1,count:0,results:[]};g.options=['beam'];g.catalystOptions=['fuse'];const before=calls,text=exportRunSave(g,3),{game:h,unlocked}=importRunSave(text,{random});assert.equal(calls,before);assert.equal(unlocked,3);assert.equal(h.state,state==='playing'?'paused':state);assert.equal(h.boss,h.enemies.find(e=>e.type==='boss'));assert.equal(h.boss.intent.remaining,.7);assert.ok(h.bullets[0].hits instanceof Set);assert.ok(h.bullets[0].hits.has(h.boss.id));assert.equal(h.boss.orbitHit,-Infinity);assert.equal(h.level('beam'),3);h.state='playing';h.step(.01);}
});
test('Invalid portable saves reject unknown skills, prototype keys, oversized files and missing state',()=>{
  const {exportRunSave,importRunSave}=require('../dist/core.js');const g=quiet(),text=exportRunSave(g);for(const mutate of [d=>d.data.player.build.injected=1,d=>delete d.data.enemies,d=>d.data.player.hp=-1,d=>d.data.campaignLevel=99,d=>d.data.player.x=null]){const raw=JSON.parse(text);mutate(raw);assert.throws(()=>importRunSave(JSON.stringify(raw)));}assert.throws(()=>importRunSave('{"__proto__":{}}'));assert.throws(()=>importRunSave(' '.repeat(2000001)));assert.equal(g.state,'playing');
});
test('Mirror level alternates locked lines, gives diagonal space after LV20 and freezes while paused',()=>{
  const g=new Game({campaignLevel:3});g.upgrades=5;g.arenaClock=0;g.updateArena(.01);assert.equal(g.arenaIntent.axis,'vertical');const x=g.player.x;g.player.x=x+43;g.updateArena(1.8);assert.equal(g.player.hp,100);g.upgrades=20;g.arenaClock=0;g.updateArena(.01);assert.equal(g.arenaIntent.axis,'cross');g.pause();g.step(.1);assert.equal(g.arenaIntent.remaining,1.8);g.resume();g.player.invuln=0;g.updateArena(1.8);assert.equal(g.player.hp,80);assert.equal(g.stage().weights[2],.3);
});
test('Beam pierces aligned enemies and nova excludes bomb kills and its own chain kills',()=>{
  const g=quiet();own(g,'beam',1);const p=g.player,a=g.createEnemy('tank',p.x+60,p.y),b=g.createEnemy('tank',p.x+100,p.y),c=g.createEnemy('tank',p.x+100,p.y+100);g.fireBeam();assert.ok(a.hp<a.maxHp&&b.hp<b.maxHp);assert.equal(c.hp,c.maxHp);
  const h=quiet();own(h,'nova',4);const e=h.createEnemy('blob',h.player.x,h.player.y),victim=h.createEnemy('blob',h.player.x+1,h.player.y);h.kill(e,{bomb:true});assert.equal(victim.hp,victim.maxHp);victim.hp=10;h.novaBursts=0;const trigger=h.createEnemy('blob',h.player.x,h.player.y);h.kill(trigger);assert.equal(victim.dead,true);assert.equal(h.novaBursts,1);
});
test('Actual reward saves and mixed persistent battlefield objects resume correctly',()=>{
  const {exportRunSave,importRunSave}=require('../dist/core.js');const g=quiet(()=>.2);for(const id of ['mine','well','drone','shield','ghost'])own(g,id,1);g.createEnemy('tank',g.player.x+80,g.player.y);g.layMine();g.spawnWell();g.fireDrones();g.kill(g.createEnemy('blob',100,100));g.items.push({type:'magnet',x:200,y:200,r:6,life:10,id:++g.seq,dead:false});g.spawnBoss(1);g.kill(g.boss);assert.equal(g.state,'lottery');const h=importRunSave(exportRunSave(g)).game;assert.equal(h.state,'lottery');assert.equal(h.mines.length,1);assert.equal(h.gravityWells.length,1);assert.ok(h.gems.length);h.acknowledgeLottery();h.player.invuln=100;assert.doesNotThrow(()=>h.step(.04));
});
test('Third campaign completes its own forty upgrades and three reward gates',()=>{
  const g=new Game({campaignLevel:3,random:()=>.2});g.addEnergy(100000);g.maybeUpgrade();for(let stage=1;stage<=3;stage++){for(let i=0;i<(stage===3?20:10);i++){assert.equal(g.state,'upgrade');g.choose(0);if(g.state==='catalyst')g.keepCatalyst();}assert.equal(g.upgrades,BOSS_MILESTONES[stage-1].upgrade);assert.equal(g.bossDue.warning,stage*10);g.spawnBoss(stage);assert.match(g.boss.name,/镜|双生|棱/);g.kill(g.boss);assert.equal(g.state,'lottery');g.acknowledgeLottery();}assert.equal(g.won,true);assert.equal(g.upgrades,40);
});
test('Loaded reward and recent-hit labels come from trusted metadata, never from file markup',()=>{
  const {exportRunSave,importRunSave}=require('../dist/core.js');const g=quiet();g.stats.recent=[{source:'arenaMirror',name:'<img onerror=evil()>',amount:20,at:0}];g.state='lottery';g.lottery={bossStage:1,count:1,results:[{id:'beam',name:'<script>evil()</script>',level:1}]};const h=importRunSave(exportRunSave(g)).game;assert.equal(h.stats.recent[0].name,PLAYER_DAMAGE_NAMES.arenaMirror);assert.equal(h.lottery.results[0].name,SKILLS.find(s=>s.id==='beam').name);
});
test('Attracted energy stays locked on after leaving pickup range and catches maximum movement speed',()=>{
  const g=quiet();own(g,'move',4);g.addEnergy=()=>{};const p=g.player,gem={x:p.x-p.magnet+1,y:p.y,r:4,value:1,vx:0,vy:0,dead:false};g.gems=[gem];g.updateGems(.01);assert.equal(gem.attracted,true);p.x+=p.magnet*2;const d=()=>Math.hypot(p.x-gem.x,p.y-gem.y),before=d();g.updateGems(.04);assert.ok(d()<before);for(let i=0;i<300&&!gem.dead;i++){p.x+=p.speed*.04;g.updateGems(.04);}assert.equal(gem.dead,true);
  const idle={x:p.x+p.magnet+1,y:p.y,r:4,value:1,vx:0,vy:0,dead:false};g.gems=[idle];const x=idle.x;g.updateGems(.04);assert.equal(idle.x,x);assert.equal(idle.attracted,undefined);
});
test('Pills heal 20, cap at max health, cannot heal twice and survive save/load',()=>{
  const g=quiet(),{exportRunSave,importRunSave}=require('../dist/core.js');g.player.hp=50;const pill={type:'pill',x:g.player.x,y:g.player.y,r:6,life:30,id:1,dead:false};g.items.push(pill);const h=importRunSave(exportRunSave(g)).game;assert.equal(h.items[0].type,'pill');g.useItem(pill);assert.equal(g.player.hp,70);g.useItem(pill);assert.equal(g.player.hp,70);g.player.hp=95;g.useItem({...pill,dead:false});assert.equal(g.player.hp,100);assert.equal(g.gems.length,0);
});
test('All fusion recipes require separate breakthroughs, free one slot and preserve abilities and synergies',()=>{
  const {FUSIONS,exportRunSave,importRunSave}=require('../dist/core.js');for(const f of FUSIONS){const g=quiet();assert.ok(!g.candidates().includes(f.id));assert.throws(()=>g.advanceSkill(f.id));for(const id of f.requires)own(g,id,4);for(const id of ['power','rate','crit','orbit','aura','shield'])if(g.owned.length<8&&!g.level(id))own(g,id,1);const count=g.owned.length,synergies=g.synergies.map(s=>s.id),before={...g.player};assert.equal(g.upgradeOptions()[0],f.id);g.addEnergy(8);g.maybeUpgrade();assert.equal(g.options[0],f.id);g.choose(0);assert.equal(g.upgrades,1);assert.equal(g.owned.length,count-1);assert.equal(g.player.build[f.id],4);for(const id of f.requires){assert.equal(g.level(id),4);assert.equal(g.player.build[id],undefined);assert.ok(!g.candidates().includes(id));assert.throws(()=>g.advanceSkill(id));}assert.deepEqual(g.synergies.map(s=>s.id),synergies);if(f.id==='prismEcho'){near(g.player.beamMultiplier,before.beamMultiplier*.85);near(g.player.novaMultiplier,before.novaMultiplier*.85);}const h=importRunSave(exportRunSave(g)).game;assert.equal(h.level(f.requires[0]),4);assert.equal(h.owned.length,g.owned.length);assert.ok(!g.candidates().includes(f.id));assert.throws(()=>g.advanceSkill(f.id));}
});
test('Fusion cannot be granted by boss lottery and invalid queued fusion does not spend XP',()=>{
  const g=quiet(()=>.9);own(g,'beam',4);own(g,'nova',4);g.openLottery(1);assert.equal(g.player.build.prismEcho,undefined);assert.equal(g.lottery.results.length,3);assert.ok(g.lottery.results.every(r=>r.id==='attack'));const h=quiet();h.state='upgrade';h.options=['prismEcho'];h.player.xp=8;assert.throws(()=>h.choose(0));assert.equal(h.player.xp,8);assert.equal(h.upgrades,0);
});
test('Portals teleport once, preserve enemies, pause cooldown and require leaving the exit before reuse',()=>{
  const {exportRunSave,importRunSave}=require('../dist/core.js'),g=new Game({campaignLevel:4});const [a,b]=g.portals,e=g.createEnemy('tank',300,300);g.player.x=a.x;g.player.y=a.y;g.updatePortals(.01);assert.equal(g.player.x,b.x);assert.equal(g.portalCooldown,3);assert.ok(g.player.invuln>=.8);assert.equal(e.x,300);g.updatePortals(3);assert.equal(g.player.x,b.x);g.pause();g.portalCooldown=2;g.step(.1);assert.equal(g.portalCooldown,2);const h=importRunSave(exportRunSave(g,4)).game;assert.equal(h.portalCooldown,2);assert.equal(h.portalBlocked,true);g.player.x=b.x+80;g.updatePortals(2);g.player.x=b.x;g.updatePortals(.01);assert.equal(g.player.x,a.x);
});
test('Fourth campaign has forty upgrades, three timed boss gates and legacy saves remain readable',()=>{
  const {exportRunSave,importRunSave}=require('../dist/core.js'),g=new Game({campaignLevel:4,random:()=>.2});g.addEnergy(100000);g.maybeUpgrade();for(let stage=1;stage<=3;stage++){for(let i=0;i<(stage===3?20:10);i++){g.choose(0);if(g.state==='catalyst')g.keepCatalyst();}assert.equal(g.bossDue.warning,stage*10);g.spawnBoss(stage);g.kill(g.boss);g.acknowledgeLottery();}assert.equal(g.won,true);assert.equal(g.upgrades,40);const raw=JSON.parse(exportRunSave(quiet()));delete raw.data.portals;delete raw.data.portalCooldown;delete raw.data.portalBlocked;assert.equal(importRunSave(JSON.stringify(raw)).game.portals.length,0);
});
test('Lucky reaction gives 0, 1 and 3 upgrades equal thirds with exact boundaries',()=>{
  for(const [roll,count]of [[0,0],[1/3-Number.EPSILON,0],[1/3,1],[2/3-Number.EPSILON,1],[2/3,3],[1-Number.EPSILON,3]]){const g=quiet(()=>roll);g.openLottery(1);assert.equal(g.lottery.count,count);}
  const counts={0:0,1:0,3:0};for(let i=0;i<900;i++){const g=quiet(()=>(i+.5)/900);g.openLottery(1);counts[g.lottery.count]++;}assert.deepEqual(counts,{0:300,1:300,3:300});
});
test('True blackhole king combines separate breakthroughs, expands control and prevents overlapping fusion recipes',()=>{
  const g=quiet(),{exportRunSave,importRunSave}=require('../dist/core.js');own(g,'well',4);own(g,'mine',4);const before={...g.player};assert.equal(g.upgradeOptions()[0],'blackholeKing');g.advanceSkill('blackholeKing');assert.equal(g.owned.length,1);near(g.player.wellRadius,before.wellRadius*1.1);near(g.player.wellPull,before.wellPull*1.2);near(g.player.wellDuration,before.wellDuration+1);near(g.player.mineDamageMultiplier,before.mineDamageMultiplier*.85);g.layMine();assert.equal(g.mines[0].pullRadius,230);assert.equal(g.mines[0].royal,true);assert.ok(!g.canFuse('stormfield'));const raw=JSON.parse(exportRunSave(g));raw.data.player.build.glacierWell=4;assert.throws(()=>importRunSave(JSON.stringify(raw)),/冲突/);
});
test('Arrow volleys scale by tier, pierce targets, and the breakthrough persists with bounded trail memory',()=>{
  for(const tier of [1,2,3]){const g=quiet();own(g,'arrow',tier);g.createEnemy('tank',g.player.x+50,g.player.y);g.fireArrows();assert.equal(g.bullets.length,[0,2,3,5][tier]);assert.equal(g.bullets[0].pierce,5);g.updateBullets(.1);assert.ok(g.report().damage.find(row=>row.id==='arrow'));}
  const g=quiet();own(g,'arrow',4);g.player.invuln=1000;const e=g.createEnemy('tank',g.player.x+100,g.player.y);e.hp=e.maxHp=100000;e.speed=0;for(let i=0;i<300;i++)g.step(.04);assert.ok(e.hp<e.maxHp);assert.equal(g.bullets.length,0);assert.ok(g.whistle);assert.ok(g.whistle.trail.length<=16);const before=JSON.stringify(g.whistle);g.pause();g.step(.1);assert.equal(JSON.stringify(g.whistle),before);
});
test('Whistle uses swept hits, per-enemy cooldown and halts a lethal boss frame before contact damage',()=>{
  const g=quiet();own(g,'arrow',4);g.spawnBoss(3);g.boss.x=g.player.x+25;g.boss.y=g.player.y;g.boss.hp=1;g.boss.speed=0;g.step(.04);assert.equal(g.state,'lottery');assert.equal(g.player.hp,100);
  const h=quiet();own(h,'arrow',4);const e=h.createEnemy('tank',h.player.x+20,h.player.y);e.hp=e.maxHp=10000;h.updateWhistle(.04);const hp=e.hp;h.updateWhistle(.04);assert.equal(e.hp,hp);assert.ok(h.segmentHit(0,0,100,0,{x:50,y:0,r:10},4));
});
test('Sentinels telegraph a locked angle, shots can be dodged or shielded and projectile count is bounded',()=>{
  const g=new Game({campaignLevel:5}),p=g.player,e=g.createEnemy('sentinel',p.x-200,p.y);e.shotClock=0;g.moveEnemy(e,.01,[]);assert.equal(e.shotIntent.remaining,1);const angle=e.shotIntent.angle;p.y+=100;g.moveEnemy(e,.5,[]);assert.equal(e.shotIntent.angle,angle);g.moveEnemy(e,.5,[]);assert.equal(g.enemyShots.length,1);for(let i=0;i<40;i++)g.updateEnemyShots(.04);assert.equal(p.hp,100);
  own(g,'shield',1);const shot={x:p.x-40,y:p.y,prevX:p.x-40,prevY:p.y,vx:220,vy:0,r:5,life:6,damage:14};g.enemyShots=[shot];g.updateEnemyShots(.2);assert.equal(p.hp,100);assert.equal(p.shieldCharges,0);p.invuln=0;g.enemyShots=[{...shot,life:6,x:p.x-40}];g.updateEnemyShots(.2);assert.equal(p.hp,86);assert.equal(g.stats.recent.at(-1).source,'sentinelBolt');e.shotIntent={angle:0,remaining:0,total:1};g.enemyShots=Array.from({length:100},()=>({...shot}));g.moveEnemy(e,.01,[]);assert.equal(g.enemyShots.length,100);
});
test('Arrow and sentinel state round-trip while pre-arrow saves gain safe default fields',()=>{
  const {exportRunSave,importRunSave}=require('../dist/core.js'),g=new Game({campaignLevel:5});own(g,'arrow',4);g.updateWhistle(.04);const e=g.createEnemy('sentinel',100,100);e.shotIntent={angle:0,remaining:.5,total:1};g.enemyShots.push({x:100,y:100,prevX:99,prevY:100,vx:220,vy:0,r:5,life:6,damage:14});const h=importRunSave(exportRunSave(g,5)).game;assert.equal(h.whistle.trail.length,1);assert.equal(h.enemies[0].shotIntent.remaining,.5);assert.equal(h.enemyShots.length,1);h.resume();assert.doesNotThrow(()=>h.step(.04));
  const raw=JSON.parse(exportRunSave(quiet()));delete raw.data.enemyShots;delete raw.data.whistle;for(const key of ['arrowClock','arrowInterval','arrowShots','arrowDamageMultiplier'])delete raw.data.player[key];delete raw.data.stats.damage.arrow;assert.equal(importRunSave(JSON.stringify(raw)).game.stats.damage.arrow.damage,0);
});
test('Fifth campaign retains forty upgrades and three boss reward gates',()=>{
  const g=new Game({campaignLevel:5,random:()=>.2});g.addEnergy(100000);g.maybeUpgrade();for(let stage=1;stage<=3;stage++){for(let i=0;i<(stage===3?20:10);i++){g.choose(0);if(g.state==='catalyst')g.keepCatalyst();}assert.equal(g.bossDue.warning,stage*10);g.spawnBoss(stage);g.kill(g.boss);g.acknowledgeLottery();}assert.equal(g.won,true);assert.equal(g.upgrades,40);
});
test('Royal blink requires its fusion, uses five body widths, cardinal input and a two-second battle cooldown',()=>{
  const g=quiet(),p=g.player;assert.equal(g.tryBlink(1,0),false);own(g,'well',4);own(g,'mine',4);assert.equal(g.tryBlink(1,0),false);g.advanceSkill('blackholeKing');
  for(const direction of [[0,0],[1,1],[.5,.5],[Infinity,0],[NaN,0]])assert.equal(g.tryBlink(...direction),false);
  const x=p.x,y=p.y;const enemy=g.createEnemy('tank',x+30,y),hp=enemy.hp;
  assert.equal(g.tryBlink(1,0),true);near(p.x,x+150);near(p.y,y);near(p.blinkClock,2);near(p.invuln,.2);assert.equal(enemy.hp,hp,'teleport gap must not deal phase damage');
  assert.equal(g.tryBlink(-1,0),false);assert.equal(g.snapshot().blinkCooldown,2);g.step(.1);near(p.blinkClock,1.9);
  for(const state of ['paused','upgrade','catalyst','lottery','ended','menu']){g.state=state;const before=JSON.stringify(g);assert.equal(g.tryBlink(-1,0),false);g.step(.1);assert.equal(JSON.stringify(g),before);}
  g.state='playing';g.enemies=[];for(let i=0;i<20;i++)g.step(.1);near(p.blinkClock,0);assert.equal(g.tryBlink(-1,0),true);near(p.x,x);
});
test('Royal blink clamps at all arena edges and never spends its cooldown on a blocked move',()=>{
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const g=quiet(),p=g.player;own(g,'well',4);own(g,'mine',4);g.advanceSkill('blackholeKing');
    p.x=dx>0?g.width-p.r-18:dx<0?p.r+18:g.width/2;p.y=dy>0?g.height-p.r-60:dy<0?p.r+66:g.height/2;
    assert.equal(g.tryBlink(dx,dy),true);assert.ok(p.x>=p.r+8&&p.x<=g.width-p.r-8&&p.y>=p.r+56&&p.y<=g.height-p.r-50);p.blinkClock=0;assert.equal(g.tryBlink(dx,dy),false);assert.equal(p.blinkClock,0);
  }
});
test('Blink cooldown survives saves and old final warnings migrate without creating an early final battle',()=>{
  const {exportRunSave,importRunSave}=require('../dist/core.js'),g=quiet();own(g,'well',4);own(g,'mine',4);g.advanceSkill('blackholeKing');g.tryBlink(0,-1);
  const text=exportRunSave(g);assert.equal(JSON.parse(text).runUpgrades,40);const h=importRunSave(text).game;assert.equal(h.player.blinkClock,2);h.step(.1);assert.equal(h.player.blinkClock,2);h.resume();h.step(.1);near(h.player.blinkClock,1.9);
  const legacy=JSON.parse(exportRunSave(quiet()));delete legacy.runUpgrades;delete legacy.data.player.blinkClock;legacy.data.upgrades=30;legacy.data.bossesSpawned=[1,2];legacy.data.bossesDefeated=[1,2];legacy.data.firstBossSpawned=true;legacy.data.firstBossDefeated=true;legacy.data.bossDue={stage:3,at:30,warning:30};
  const restored=importRunSave(JSON.stringify(legacy)).game;assert.equal(restored.upgrades,30);assert.equal(restored.bossDue,null);assert.equal(restored.upgradeLocked,false);assert.equal(restored.player.blinkClock,0);restored.resume();restored.addEnergy(restored.nextXp);restored.maybeUpgrade();chooseAny(restored);assert.equal(restored.upgrades,31);assert.equal(restored.bossDue,null);
  legacy.data.finalBossSpawned=true;assert.throws(()=>importRunSave(JSON.stringify(legacy)),/原版离线包/);
  for(const clock of [-1,2.1]){const bad=JSON.parse(text);bad.data.player.blinkClock=clock;assert.throws(()=>importRunSave(JSON.stringify(bad)),/冷却/);}
});
test('LV30 and LV39 continue normally and LV40 alone starts the final thirty-second warning',()=>{
  const g=quiet();g.firstBossDefeated=true;g.bossesDefeated=[1,2];g.bossesSpawned=[1,2];
  for(const level of [29,30,38,39]){g.upgrades=level;g.state='playing';g.player.xp=g.nextXp;g.maybeUpgrade();chooseAny(g);assert.equal(g.upgrades,level+1);assert.equal(g.won,false);assert.equal(g.bossDue?.stage||null,level===39?3:null);}
  assert.equal(g.bossDue.warning,30);assert.equal(g.upgradeLocked,true);assert.equal(g.wave,40);
});
test('Arrow buff tables improve every tier and whistle obeys its new quarter-second hit window',()=>{
  for(const [tier,interval,shots,multiplier]of [[1,3,2,2.8],[2,2.4,3,3.5],[3,1.8,5,4.5]]){const g=quiet();own(g,'arrow',tier);near(g.player.arrowInterval,interval);assert.equal(g.player.arrowShots,shots);near(g.player.arrowDamageMultiplier,multiplier);g.createEnemy('tank',g.player.x+100,g.player.y);g.fireArrows();for(const arrow of g.bullets){near(Math.hypot(arrow.vx,arrow.vy),900);near(arrow.damage,18*multiplier);assert.equal(arrow.pierce,5);}}
  const g=quiet();own(g,'arrow',4);near(g.player.arrowDamageMultiplier,5);const p=g.player,e=g.createEnemy('tank',p.x+26,p.y);e.hp=e.maxHp=10000;
  const sweep=()=>{g.whistle={x:p.x,y:p.y,r:5,vx:1300,vy:0,goalX:p.x+200,goalY:p.y,goalActive:true,trail:[]};g.updateWhistle(.04);};
  sweep();near(g.whistle.x,p.x+52);near(e.maxHp-e.hp,90);g.time=.249;sweep();near(e.maxHp-e.hp,90);g.time=.25;sweep();near(e.maxHp-e.hp,180);
});
test('Sentinels have sixty base HP and wave-based ten/fifteen living caps including boss fights',()=>{
  const {BASE_ENEMIES}=require('../dist/core.js');assert.equal(BASE_ENEMIES.sentinel.hp,60);
  for(const phase of ['early','wave20','wave21','late','boss2','boss3']){const g=new Game({campaignLevel:5,random:()=>0});if(phase!=='early'){g.upgrades=phase==='wave20'||phase==='wave21'||phase==='boss2'?20:35;g.firstBossDefeated=true;g.bossesDefeated=phase==='wave20'||phase==='boss2'?[1]:[1,2];}if(phase==='boss2')g.spawnBoss(2);if(phase==='boss3'){g.upgrades=40;g.spawnBoss(3);}
    const cap=['early','wave20','boss2'].includes(phase)?10:15;assert.equal(g.sentinelCap(),cap);
    const hp=60*g.stage().hp;for(let i=0;i<25;i++)g.spawnEnemy();const sentinels=g.enemies.filter(e=>e.type==='sentinel'&&!e.dead);assert.equal(sentinels.length,cap);near(sentinels[0].maxHp,hp);assert.ok(g.enemies.some(e=>e.type==='blob'),'normal enemies must still fill available slots');
    sentinels[0].dead=true;g.enemies.push({...sentinels[0],id:++g.seq});g.spawnEnemy();assert.equal(g.enemies.filter(e=>!e.dead&&e.type==='sentinel').length,cap);
    for(let i=0;i<250;i++)g.spawnEnemy();assert.equal(g.enemies.filter(e=>!e.dead&&e.type==='sentinel').length,cap);assert.ok(g.minorCount()<=g.stage().cap);
  }
});
test('Returning saw tiers replace stats, hit once per leg and stay bounded while following a fast player',()=>{
  for(const [level,shots,interval,multiplier]of [[1,2,3.2,2.2],[2,3,2.6,3],[3,4,2,4],[4,6,1.4,5.5]]){const g=quiet();own(g,'saw',level);assert.equal(g.player.sawShots,shots);near(g.player.sawInterval,interval);near(g.player.sawMultiplier,multiplier);g.createEnemy('tank',g.player.x+100,g.player.y);g.fireSaws();assert.equal(g.saws.length,shots);for(const saw of g.saws)near(saw.damage,18*multiplier);}
  const g=quiet();own(g,'saw',1);const e=g.createEnemy('tank',g.player.x+100,g.player.y);e.hp=e.maxHp=10000;g.fireSaws();for(let i=0;i<24;i++)g.updateSaws(.05);near(e.maxHp-e.hp,158.4);assert.equal(g.saws.length,0);near(g.report().damage.find(r=>r.id==='saw').damage,158.4);
  g.fireSaws();g.pause();const before=JSON.stringify(g.saws);g.updateSaws(.1);g.step(.1);assert.equal(JSON.stringify(g.saws),before);g.resume();for(let i=0;i<60;i++){g.player.x+=70;g.updateSaws(.05);}assert.equal(g.saws.length,0);
  for(let i=0;i<100;i++)g.fireSaws();assert.ok(g.saws.length<=18);
});
test('Breakthrough saw pickup bursts once and freezes a lethal boss frame before contact damage',()=>{
  const g=quiet();own(g,'saw',4);g.spawnBoss(1);const b=g.boss,p=g.player;b.x=p.x+60;b.y=p.y;b.hp=1;
  g.saws=[{x:p.x+10,y:p.y,r:8,vx:0,vy:0,age:.6,life:1.9,returning:true,burst:true,damage:60,hits:new Set([b.id])}];g.createEnemy('tank',p.x,p.y);g.step(.04);assert.equal(g.state,'lottery');assert.equal(p.hp,100);assert.ok(g.effects.some(e=>e.kind==='sawPulse'));
});
test('Sixth campaign wind eye warns, heals inside, damages outside and freezes in every reward state',()=>{
  const g=new Game({campaignLevel:6,random:()=>.2});g.upgrades=5;g.arenaClock=0;g.updateArena(.01);const m=g.arenaIntent;assert.equal(m.kind,'storm');near(m.total,2.6);near(m.radius,130);g.player.x=m.x;g.player.y=m.y;g.player.hp=95;g.updateArena(2.6);assert.equal(g.player.hp,100);
  g.arenaClock=0;g.updateArena(.01);g.player.x=23;g.player.y=71;g.player.invuln=0;g.updateArena(2.6);assert.equal(g.player.hp,82);assert.equal(g.stats.recent.at(-1).source,'arenaStorm');
  g.arenaClock=0;g.updateArena(.01);for(const state of ['paused','upgrade','catalyst','lottery']){g.state=state;const before=JSON.stringify(g);g.step(.1);assert.equal(JSON.stringify(g),before);}
});
test('Wardens reduce damage only during guard, never block bombs and respect their bounded spawn slots',()=>{
  const g=new Game({campaignLevel:6,random:()=>0}),e=g.createEnemy('warden',100,100);e.guardClock=0;g.moveEnemy(e,.01,[]);near(e.guardRemaining,1.4);near(g.hurt(e,20,{source:'bullet'}),10);e.guardRemaining=0;near(g.hurt(e,20,{source:'saw'}),20);e.guardRemaining=1;g.useItem({type:'bomb',x:100,y:100,dead:false});assert.equal(e.dead,true);
  for(let i=0;i<60;i++)g.spawnEnemy();assert.equal(g.enemies.filter(e=>!e.dead&&e.type==='warden').length,12);g.upgrades=21;g.firstBossDefeated=true;g.bossesDefeated=[1,2];for(let i=0;i<50;i++)g.spawnEnemy();assert.equal(g.enemies.filter(e=>!e.dead&&e.type==='warden').length,18);
});
test('Storm boss rail lanes and locked cages have readable warning windows and exact safety gaps',()=>{
  const g=new Game({campaignLevel:6}),p=g.player;g.spawnBoss(1);const b=g.boss;b.x=200;b.y=300;p.x=400;p.y=300;b.attackClock=0;g.updateBossAttack(.01);assert.equal(b.intent.kind,'stormLances');near(b.intent.total,1.4);assert.equal(b.intent.lanes,3);p.y=340;g.updateBossAttack(1.4);assert.equal(p.hp,100);
  b.intent={kind:'stormLances',angle:0,remaining:.01,total:1.4,lanes:3};p.y=300;g.updateBossAttack(.02);assert.equal(p.hp,80);
  for(const [d,expected]of [[60,100],[60.01,80],[155,80],[155.01,100]]){p.hp=100;p.invuln=0;p.x=500+d;p.y=300;b.intent={kind:'stormCage',x:500,y:300,angle:0,remaining:.01,total:1.6};g.updateBossAttack(.02);near(p.hp,expected);}
});
test('Sixth campaign retains all forty upgrade gates and its own three boss identities',()=>{
  const g=new Game({campaignLevel:6,random:()=>.2});g.addEnergy(100000);g.maybeUpgrade();for(const m of BOSS_MILESTONES){const start=g.upgrades;for(let n=start;n<m.upgrade;n++){g.choose(0);if(g.state==='catalyst')g.keepCatalyst();}assert.equal(g.bossDue.warning,m.warning);g.spawnBoss(m.stage);assert.equal(g.boss.name,CAMPAIGN_LEVELS[5].bosses[m.stage-1]);g.kill(g.boss);g.acknowledgeLottery();}assert.equal(g.upgrades,40);assert.equal(g.won,true);
});
test('Saw actors, wind eyes, warden guard and storm boss intents round-trip with legacy defaults',()=>{
  const {exportRunSave,importRunSave}=require('../dist/core.js'),g=new Game({campaignLevel:6});own(g,'saw',3);g.createEnemy('warden',600,300);g.fireSaws();g.updateSaws(.2);g.upgrades=10;g.arenaClock=0;g.updateArena(.01);g.spawnBoss(1);g.boss.attackClock=0;g.updateBossAttack(.01);const h=importRunSave(exportRunSave(g,6)).game;assert.equal(h.saws.length,4);assert.ok(h.saws[0].hits instanceof Set);assert.equal(h.arenaIntent.kind,'storm');assert.equal(h.boss.intent.kind,'stormLances');h.resume();assert.doesNotThrow(()=>h.step(.04));
  const raw=JSON.parse(exportRunSave(quiet()));delete raw.data.saws;for(const key of ['sawClock','sawInterval','sawShots','sawMultiplier'])delete raw.data.player[key];delete raw.data.stats.damage.saw;assert.equal(importRunSave(JSON.stringify(raw)).game.saws.length,0);
  for(const mutate of [r=>r.data.saws[0].r=100,r=>r.data.saws[0].hits.savedHits=[1.5],r=>r.data.arenaIntent.radius=999,r=>r.data.enemies.find(e=>e.type==='warden').guardRemaining=99]){const bad=JSON.parse(exportRunSave(g,6));mutate(bad);assert.throws(()=>importRunSave(JSON.stringify(bad)));}
});
test('Workshop has twelve independent items in three categories and immutable fixed-cost upgrades',()=>{
  const C=require('../dist/core.js'),fresh=C.createEquipmentProfile();assert.equal(C.EQUIPMENT.length,12);assert.deepEqual(Object.keys(C.EQUIPMENT_SLOTS),['core','shell','boots']);assert.deepEqual(C.equipmentBonuses(C.equipmentLoadout(fresh)),{damage:0,rate:0,crit:0,health:0,reduction:0,pill:0,speed:0,magnet:0,rerolls:0,cataclysm:0,bossDamage:0,revive:0});
  let profile={...fresh,shards:32};for(const cost of [6,10,16]){const before=JSON.stringify(profile),shards=profile.shards;profile=C.upgradeEquipment(profile,'ember');assert.equal(profile.shards,shards-cost);assert.equal(JSON.stringify(fresh),JSON.stringify(C.createEquipmentProfile()));assert.notEqual(JSON.stringify(profile),before);}assert.equal(profile.levels.ember,3);assert.equal(profile.shards,0);assert.throws(()=>C.upgradeEquipment(profile,'ember'),/最高/);assert.throws(()=>C.upgradeEquipment(profile,'hull'),/不足/);assert.throws(()=>C.upgradeEquipment(profile,'unknown'));
  profile=C.equipEquipment(profile,'ember');assert.deepEqual(profile.equipped,['ember']);assert.throws(()=>C.equipEquipment(profile,'unknown'));assert.throws(()=>C.equipEquipment(profile,'hull'));const loadout=C.equipmentLoadout(profile);loadout.ember.level=1;assert.equal(profile.levels.ember,3);assert.deepEqual(C.equipEquipment(profile,'ember',false).equipped,[]);
});
test('Every workshop tier applies only its stated modifier and recomputation never compounds it',()=>{
  const C=require('../dist/core.js');for(const gear of C.EQUIPMENT)for(let level=1;level<=3;level++){
    const equipment={core:null,shell:null,boots:null,[gear.slot]:{id:gear.id,level}},g=new Game({equipment}),b=C.equipmentBonuses(equipment);for(let n=0;n<3;n++)g.recompute();
    near(g.player.damage,18*(1+b.damage));near(g.player.fireRate,.62/(1+b.rate));near(g.player.crit,.06+b.crit);near(g.player.maxHp,100+b.health);near(g.player.hp,g.player.maxHp);near(g.player.speed,235*(1+b.speed));near(g.player.magnet,80*(1+b.magnet));near(g.player.damageReduction,b.reduction);near(g.player.pillBonus,b.pill);assert.equal(g.rerollsRemaining,2+b.rerolls);assert.equal(g.owned.length,0);assert.equal(g.catalyst,null);
    own(g,'power',4);own(g,'heal',4);g.equipCatalyst('kinetic');near(g.player.damage,18*3.2*(1+b.damage));near(g.player.maxHp,170+b.health);near(g.player.speed,235*1.2*(1+b.speed));
  }
});
test('Plating reduces actual health loss after shields and recovery boosts only capped pill healing',()=>{
  const g=new Game({equipment:{core:null,shell:{id:'plating',level:3},boots:null}});g.damagePlayer(20,'sentinelShot');near(g.player.hp,82);near(g.stats.damageTaken,18);near(g.stats.recent[0].amount,18);own(g,'shield',1);g.player.invuln=0;g.damagePlayer(20,'bossContact');near(g.player.hp,82);near(g.stats.blockedDamage,20);
  const h=new Game({equipment:{core:null,shell:{id:'recovery',level:3},boots:null}});h.player.hp=50;h.useItem({type:'pill',dead:false});near(h.player.hp,80);assert.equal(h.takeEvents().find(e=>e.type==='pill').amount,30);h.player.hp=95;h.useItem({type:'pill',dead:false});near(h.player.hp,100);assert.equal(h.takeEvents().find(e=>e.type==='pill').amount,5);
});
test('Formal boss first victories award once per campaign, survive failure and never farm replays',()=>{
  const C=require('../dist/core.js');let profile=C.createEquipmentProfile();for(let campaignLevel=1;campaignLevel<=CAMPAIGN_LEVELS.length;campaignLevel++){
    const g=new Game({campaignLevel});for(const m of BOSS_MILESTONES){g.upgrades=m.upgrade;g.spawnBoss(m.stage);g.boss.hp=1;g.hurt(g.boss,1);const result=C.claimEquipmentRewards(profile,g);assert.equal(result.gained,[0,10,15,25][m.stage]);profile=result.profile;assert.equal(C.claimEquipmentRewards(profile,g).gained,0);g.acknowledgeLottery();}
    g.finish(false);assert.equal(C.claimEquipmentRewards(profile,g).gained,0);
  }assert.equal(profile.shards,CAMPAIGN_LEVELS.length*50);assert.equal(profile.claimed.length,CAMPAIGN_LEVELS.length*3);
  const g=new Game();g.upgrades=10;g.spawnBoss(1);g.hurt(g.boss,100000);for(const flag of ['formal','practice']){g.formal=flag==='formal'?false:true;g.practice=flag==='practice';assert.equal(C.claimEquipmentRewards(C.createEquipmentProfile(),g).gained,0);}const practice=createPracticeGame();assert.equal(C.claimEquipmentRewards(C.createEquipmentProfile(),practice).gained,0);
});
test('Workshop rejects malformed slots, ranks, balances and duplicate or unknown first-win claims',()=>{
  const C=require('../dist/core.js'),fresh=C.createEquipmentProfile(),copy=()=>JSON.parse(JSON.stringify(fresh));for(const edit of [p=>p.shards=-1,p=>p.shards=Infinity,p=>p.shards=1000001,p=>p.levels.ember=4,p=>delete p.levels.focus,p=>p.levels.unknown=1,p=>p.equipped.push('ember'),p=>p.claimed=['1:1','1:1'],p=>p.claimed=['99:1'],p=>p.claimed=['1:4'],p=>p.schema=3,p=>p.unknown=0]){const p=copy();edit(p);assert.throws(()=>C.validateEquipmentProfile(p));}
  assert.throws(()=>new Game({equipment:{core:{id:'hull',level:1},shell:null,boots:null}}));assert.throws(()=>new Game({equipment:{core:{id:'ember',level:4},shell:null,boots:null}}));const p=C.validateEquipmentProfile(fresh);p.levels.ember=1;p.claimed.push('1:1');assert.equal(fresh.levels.ember,0);assert.equal(fresh.claimed.length,0);
});
test('Run saves lock their original loadout, include optional workshop progress and migrate pre-workshop saves',()=>{
  const C=require('../dist/core.js');let p=C.createEquipmentProfile();p.shards=100;p=C.upgradeEquipment(p,'hull');p=C.equipEquipment(p,'hull');const g=new Game({equipment:C.equipmentLoadout(p)});g.player.hp=105;g.rerollsRemaining=1;const text=C.exportRunSave(g,1,p),r=C.importRunSave(text);assert.deepEqual(r.profile,p);assert.deepEqual(r.game.equipment,g.equipment);near(r.game.player.hp,105);near(r.game.player.maxHp,110);assert.equal(r.game.rerollsRemaining,1);
  const raw=JSON.parse(text);raw.profile.levels.hull=3;const upgradedProfile=C.importRunSave(JSON.stringify(raw));assert.equal(upgradedProfile.profile.levels.hull,3);assert.equal(upgradedProfile.game.equipment.hull.level,1);near(upgradedProfile.game.player.maxHp,110);
  const old=JSON.parse(C.exportRunSave(new Game()));delete old.data.equipment;delete old.data.player.damageReduction;delete old.data.player.pillBonus;const legacy=C.importRunSave(JSON.stringify(old));assert.equal(legacy.profile,null);assert.deepEqual(legacy.game.equipment,{});near(legacy.game.player.hp,100);
  const bad=JSON.parse(text);bad.profile.equipped=['unknown'];assert.throws(()=>C.importRunSave(JSON.stringify(bad)));bad.profile=p;bad.data.equipment.hull.level=9;assert.throws(()=>C.importRunSave(JSON.stringify(bad)));
});

test('Flask tiers lock landing positions, snapshot damage and never collide early along the visual arc',()=>{
  const g=quiet(),e=g.createEnemy('tank',600,320);e.hp=e.maxHp=10000;own(g,'flask',1);g.throwFlasks();near(g.player.flaskInterval,3.8);assert.equal(g.flasks.length,2);near(g.flasks[0].goalX,586);g.updateFlasks(.3);near(e.hp,10000);g.advanceSkill('power');g.updateFlasks(.3);near(e.hp,10000-162);assert.equal(g.flasks.length,0);near(g.report().damage.find(row=>row.id==='flask').damage,162);
  for(const [level,interval,shots,radius,multiplier]of [[2,3,3,105,6],[3,2.4,4,120,7.5],[4,1.8,5,145,10]]){own(g,'flask',level);g.recompute();near(g.player.flaskInterval,interval);near(g.player.flaskMultiplier,multiplier);assert.equal(g.player.flaskShots,shots);assert.equal(g.player.flaskRadius,radius);}
  g.throwFlasks();const goal=g.flasks[0].goalX;e.x=900;g.updateFlasks(.6);assert.equal(g.acidPools.length,5);assert.equal(g.acidPools[0].x,goal);assert.ok(g.flasks.length<=15);for(let i=0;i<12;i++){g.throwFlasks();g.updateFlasks(.6);}assert.equal(g.acidPools.length,12);
});
test('Golden acid damages enemies on bounded ticks, never the player, and expires without lingering objects',()=>{
  const g=quiet(),p=g.player,e=g.createEnemy('tank',p.x,p.y);e.hp=e.maxHp=1000;g.acidPools=[{x:p.x,y:p.y,r:65,life:3,tickClock:.2,damage:20}];g.updateAcidPools(.1);near(e.hp,1000);g.updateAcidPools(.1);near(e.hp,996);near(p.hp,100);for(let i=0;i<40;i++)g.updateAcidPools(.1);assert.equal(g.acidPools.length,0);assert.ok(e.hp>=940);
});
test('Spores have harmless warning time, finite dangerous life, center-based bounds and a sixteen-zone cap',()=>{
  const g=new Game({campaignLevel:7}),p=g.player;g.addSporeZone(p.x,p.y,40,1.2,3);g.updateSporeZones(1.2);near(p.hp,100);g.updateSporeZones(.01);near(p.hp,91);g.updateSporeZones(.1);near(p.hp,91);p.invuln=0;p.x+=40.01;g.updateSporeZones(.2);near(p.hp,91);p.x-=.01;g.updateSporeZones(.2);near(p.hp,82);for(let i=0;i<40;i++)g.addSporeZone(100,100);assert.equal(g.sporeZones.length,16);p.x=800;p.y=500;for(let i=0;i<60;i++)g.updateSporeZones(.1);assert.equal(g.sporeZones.length,0);
});
test('Sporeling deaths create warnings only on-screen in the garden, while bombs cleanse without reseeding',()=>{
  const g=new Game({campaignLevel:7,random:()=>0});g.kill(g.createEnemy('sporeling',200,200));assert.equal(g.sporeZones.length,1);near(g.sporeZones[0].warning,1.2);g.kill(g.createEnemy('sporeling',-500,200));assert.equal(g.sporeZones.length,1);g.createEnemy('sporeling',300,300);g.useItem({type:'bomb',x:200,y:200,dead:false});assert.equal(g.sporeZones.length,0);assert.equal(g.enemies.filter(e=>!e.dead&&e.type==='sporeling').length,0);
  for(let i=0;i<80;i++)g.spawnEnemy();assert.equal(g.enemies.filter(e=>!e.dead&&e.type==='sporeling').length,12);g.upgrades=21;for(let i=0;i<80;i++)g.spawnEnemy();assert.equal(g.enemies.filter(e=>!e.dead&&e.type==='sporeling').length,18);const h=new Game();h.kill(h.createEnemy('sporeling',200,200));assert.equal(h.sporeZones.length,0);
});
test('Garden boss seeds locked circles and root sweeps use exact visual bounds with no instant seed damage',()=>{
  const g=new Game({campaignLevel:7}),p=g.player;g.upgrades=20;g.spawnBoss(2);const b=g.boss;b.x=200;b.y=300;p.x=500;p.y=300;b.attackClock=0;g.updateBossAttack(.01);assert.equal(b.intent.kind,'seedRain');near(b.intent.total,1);p.x=700;g.updateBossAttack(1);assert.equal(g.sporeZones.length,5);near(g.sporeZones[0].x,500);near(p.hp,100);assert.ok(g.sporeZones.every(zone=>zone.warning===1.2));
  for(const [y,expected]of [[324,76],[324.01,100]]){p.x=500;p.y=y;p.hp=100;p.invuln=0;b.intent={kind:'vineSweep',angle:0,remaining:.01,total:1.5,radius:650,x:500,y:300};g.updateBossAttack(.02);near(p.hp,expected);}
});
test('Flasks and acid pools stop a boss-death frame before any further damage or enemy contact',()=>{
  for(const mode of ['flask','acid']){const g=quiet(),p=g.player;g.upgrades=10;g.spawnBoss(1);const b=g.boss;b.x=p.x;b.y=p.y;b.hp=1;g.createEnemy('tank',p.x,p.y);own(g,'flask',4);if(mode==='flask'){g.throwFlasks();for(const f of g.flasks)f.age=f.flight-.01;}else g.acidPools=[{x:p.x,y:p.y,r:65,life:3,tickClock:0,damage:20}];g.step(.04);assert.equal(g.state,'lottery');near(p.hp,100);const frozen=JSON.stringify(g);g.step(.1);assert.equal(JSON.stringify(g),frozen);}
});
test('Seventh campaign keeps forty upgrades, garden hazards freeze in menus and portable state rejects malformed actors',()=>{
  const C=require('../dist/core.js'),g=new Game({campaignLevel:7,random:()=>.2});g.addEnergy(100000);g.maybeUpgrade();for(const m of BOSS_MILESTONES){for(let n=g.upgrades;n<m.upgrade;n++){g.choose(0);if(g.state==='catalyst')g.keepCatalyst();}assert.equal(g.bossDue.warning,m.warning);g.spawnBoss(m.stage);assert.equal(g.boss.name,CAMPAIGN_LEVELS[6].bosses[m.stage-1]);g.kill(g.boss);g.acknowledgeLottery();}assert.equal(g.won,true);assert.equal(g.upgrades,40);
  const h=new Game({campaignLevel:7});own(h,'flask',4);h.createEnemy('sporeling',600,300);h.throwFlasks();h.updateFlasks(.2);h.addSporeZone(300,300);h.acidPools.push({x:400,y:300,r:65,life:2,tickClock:.1,damage:20});h.upgrades=10;h.spawnBoss(1);h.boss.attackClock=0;h.updateBossAttack(.01);const text=C.exportRunSave(h,7),saved=C.importRunSave(text).game;assert.equal(saved.flasks.length,5);assert.equal(saved.acidPools.length,1);assert.equal(saved.sporeZones.length,1);assert.equal(saved.boss.intent.kind,'seedRain');for(const state of ['paused','upgrade','catalyst','lottery']){saved.state=state;const before=JSON.stringify(saved);saved.step(.04);assert.equal(JSON.stringify(saved),before);}
  for(const mutate of [d=>d.sporeZones[0].warning=10,d=>d.acidPools[0].r=1,d=>d.flasks[0].flight=0,d=>d.flasks=Array(16).fill(d.flasks[0]),d=>d.enemies.find(e=>e.type==='boss').intent.radius=1]){const raw=JSON.parse(text);mutate(raw.data);assert.throws(()=>C.importRunSave(JSON.stringify(raw)));}
  const old=JSON.parse(C.exportRunSave(quiet()));for(const key of ['flasks','acidPools','sporeZones'])delete old.data[key];for(const key of ['flaskClock','flaskInterval','flaskShots','flaskRadius','flaskMultiplier'])delete old.data.player[key];delete old.data.stats.damage.flask;const legacy=C.importRunSave(JSON.stringify(old)).game;assert.deepEqual(legacy.flasks,[]);assert.deepEqual(legacy.sporeZones,[]);assert.equal(legacy.stats.damage.flask.damage,0);
});

test('All current campaigns support every fixed practice build and three real boss variants without permanent progression',()=>{
  const C=require('../dist/core.js');let combinations=0;for(const level of CAMPAIGN_LEVELS)for(const stage of [1,2,3])for(const build of PRACTICE_BUILDS){const g=createPracticeGame({campaignLevel:level.id,stage,buildId:build.id,random:()=>.5});assert.equal(g.campaignLevel,level.id);assert.equal(g.bossDue.name,level.bosses[stage-1]);assert.equal(g.bossDue.warning,3);assert.deepEqual(g.equipment,{});assert.equal(g.owned.length,8);g.spawnBoss(stage);assert.equal(g.boss.name,level.bosses[stage-1]);g.boss.attackClock=0;g.updateBossAttack(.01);assert.equal(g.boss.intent.kind,level.id===10?(stage===2?'solarRain':'reactorShield'):level.id===9?(stage===3?'phaseJump':'riftCross'):level.id===8?'iceFan':level.id===7?'seedRain':level.id===6?(stage===3?'stormCage':'stormLances'):stage===2?'dash':'cone');g.kill(g.boss);assert.equal(g.state,'ended');assert.equal(g.won,true);assert.equal(C.claimEquipmentRewards(C.createEquipmentProfile(),g).gained,0);assert.equal(createRunRecord(g,{at:1,version:'v22'}),null);combinations++;}assert.equal(combinations,CAMPAIGN_LEVELS.length*3*PRACTICE_BUILDS.length);assert.throws(()=>createPracticeGame({campaignLevel:99}));
});
test('Formal records snapshot equipment safely while legacy records stay unspecified and corrupt equipment is rejected',()=>{
  const equipment={core:{id:'ember',level:3},shell:{id:'hull',level:2},boots:{id:'swift',level:1}},g=new Game({equipment});g.finish(false);const before=JSON.stringify(g),r=createRunRecord(g,{at:1000,version:'v22'});assert.deepEqual(r.equipment,g.equipment);assert.equal(JSON.stringify(g),before);r.equipment.ember.level=1;assert.equal(g.equipment.ember.level,3);
  const sanitized=sanitizeRunHistory({schema:1,records:[r]}).records;assert.equal(sanitized[0].equipment.ember.level,1);r.equipment.ember.level=2;assert.equal(sanitized[0].equipment.ember.level,1);const legacy={...r};delete legacy.equipment;assert.equal(sanitizeRunHistory({schema:1,records:[legacy]}).records[0].equipment,undefined);
  for(const equipment of [{core:{id:'<img src=x onerror=alert(1)>',level:1},shell:null,boots:null},{core:{id:'ember',level:9},shell:null,boots:null},{core:null,shell:{id:'ember',level:1},boots:null}])assert.equal(sanitizeRunHistory({schema:1,records:[{...r,equipment}]}).records.length,0);
});

test('Elites never appear before wave twenty-one, use an eight-percent eligible roll and cap at four then six',()=>{
  const g=quiet(()=>0);g.upgrades=19;for(let i=0;i<20;i++)g.spawnEnemy();assert.equal(g.enemies.filter(e=>e.elite).length,0);assert.equal(g.eliteCap(),0);assert.equal(g.promoteElite(g.enemies[0],'pulse'),false);
  g.upgrades=20;g.bossesDefeated=[1,2];g.firstBossDefeated=true;for(let i=0;i<20;i++)g.spawnEnemy();assert.equal(g.wave,21);assert.equal(g.enemies.filter(e=>!e.dead&&e.elite).length,4);assert.equal(g.eliteCap(),4);g.enemies.find(e=>e.elite).dead=true;g.spawnEnemy();assert.equal(g.enemies.filter(e=>!e.dead&&e.elite).length,4);g.upgrades=30;for(let i=0;i<20;i++)g.spawnEnemy();assert.equal(g.eliteCap(),6);assert.equal(g.enemies.filter(e=>!e.dead&&e.elite).length,6);
  for(const [roll,expected]of [[.079999,1],[.08,0]]){const h=quiet(()=>roll);h.upgrades=21;h.spawnEnemy();assert.equal(h.enemies.filter(e=>e.elite).length,expected);}
});
test('All elite affixes modify one actor once, preserve normal enemies and add exactly two energy',()=>{
  const C=require('../dist/core.js');for(const [id,affix]of Object.entries(C.ELITE_AFFIXES)){const g=quiet();g.upgrades=21;const e=g.createEnemy('blob',400,300),hp=e.hp,speed=e.speed,energy=e.energy;assert.equal(g.promoteElite(e,id),true);near(e.hp,hp*affix.hp);near(e.maxHp,hp*affix.hp);near(e.speed,speed*affix.speed);assert.equal(e.energy,energy+2);assert.equal(g.promoteElite(e,id),false);g.kill(e);assert.equal(g.gems.length,energy+2);}
  const g=quiet();g.upgrades=21;for(const type of ['sentinel','warden','sporeling','child','charger','splitter','catalyst'])assert.equal(g.promoteElite(g.createEnemy(type,100,100),'frenzy'),false);assert.equal(g.promoteElite(g.createEnemy('blob',100,100),'unknown'),false);const practice=createPracticeGame({stage:3});assert.equal(practice.promoteElite(practice.createEnemy('blob',100,100),'pulse'),false);
});
test('Pulse elites stand still through a one-second warning, respect stun and shields and can be disarmed',()=>{
  const g=quiet();g.upgrades=21;const p=g.player,e=g.createEnemy('blob',p.x+80,p.y);g.promoteElite(e,'pulse');e.eliteClock=0;const x=e.x;g.moveEnemy(e,.01,[]);assert.equal(e.eliteIntent.total,1);near(e.x,x);near(p.hp,100);e.stun=.5;g.moveEnemy(e,.2,[]);near(e.eliteIntent.remaining,1);e.stun=0;g.moveEnemy(e,1,[]);near(p.hp,86);near(e.x,x);near(e.eliteClock,5);assert.equal(e.eliteIntent,null);
  own(g,'shield',1);p.invuln=0;e.eliteIntent={remaining:.01,total:1,radius:85};g.moveEnemy(e,.02,[]);near(p.hp,86);near(g.stats.blockedDamage,14);assert.equal(g.stats.recent[0].source,'elitePulse');e.eliteIntent={remaining:1,total:1,radius:85};g.useItem({type:'bomb',x:p.x,y:p.y,dead:false});assert.equal(e.dead,true);g.step(.04);near(p.hp,86);
});
test('Elite warning state pauses and round-trips while corrupt affixes cannot replace a save',()=>{
  const C=require('../dist/core.js'),g=quiet();g.upgrades=21;g.bossesSpawned=[1,2];g.bossesDefeated=[1,2];g.firstBossSpawned=true;g.firstBossDefeated=true;const e=g.createEnemy('tank',600,300);g.promoteElite(e,'pulse');e.eliteClock=0;g.moveEnemy(e,.01,[]);g.pause();const before=JSON.stringify(g);g.step(.1);assert.equal(JSON.stringify(g),before);const text=C.exportRunSave(g),h=C.importRunSave(text).game;assert.equal(h.enemies[0].elite,'pulse');near(h.enemies[0].eliteIntent.remaining,1);h.resume();assert.doesNotThrow(()=>h.step(.04));
  for(const mutate of [e=>e.elite='unknown',e=>e.eliteClock=-1,e=>e.energy=999,e=>e.eliteIntent.radius=500,e=>e.eliteIntent.remaining=2,e=>e.type='warden']){const raw=JSON.parse(text);mutate(raw.data.enemies[0]);assert.throws(()=>C.importRunSave(JSON.stringify(raw)));}
});

test('Save integrity rejects malformed counters, enemy identities and unsafe warning geometry before returning a game',()=>{
  const C=require('../dist/core.js'),g=new Game({campaignLevel:3});g.upgrades=10;g.spawnBoss(1);g.boss.attackClock=0;g.updateBossAttack(.01);g.createEnemy('tank',600,300);g.arenaClock=0;g.updateArena(.01);const text=C.exportRunSave(g,3),mutations=[d=>d.width='960',d=>d.height=null,d=>d.time=-1,d=>d.seq=.5,d=>d.kills=-1,d=>d.rerollsRemaining=3,d=>d.enemies[1].id=d.enemies[0].id,d=>d.enemies[1].id=d.seq+1,d=>d.enemies[1].dead='false',d=>d.enemies[1].r=1000,d=>d.enemies[1].speed=-1,d=>delete d.enemies[0].intent.angle,d=>d.enemies[0].intent.kind='unknown',d=>d.enemies[0].intent.remaining=100,d=>d.enemies[0].intent.radius=-1,d=>delete d.arenaIntent.x,d=>d.arenaIntent.axis='diagonal',d=>d.arenaIntent.remaining=100];
  for(const mutate of mutations){const raw=JSON.parse(text);mutate(raw.data);assert.throws(()=>C.importRunSave(JSON.stringify(raw)));}const good=C.importRunSave(text).game;assert.equal(good.boss.intent.kind,'cone');assert.equal(good.arenaIntent.kind,'mirror');assert.equal(good.boss.orbitHit,-Infinity);assert.equal(good.state,'paused');
});
test('Serialized negative-infinity sentinels cannot escape their intended hit-clock use into reports or warnings',()=>{
  const C=require('../dist/core.js'),g=new Game();g.upgrades=10;g.spawnBoss(1);g.damagePlayer(10,'contact');const text=C.exportRunSave(g),sentinel=()=>({negativeInfinity:true});for(const mutate of [d=>d.stats.damageTaken=sentinel(),d=>d.stats.blockedDamage=sentinel(),d=>d.stats.recent[0].amount=sentinel(),d=>d.stats.recent[0].at=sentinel(),d=>d.stats.bosses[0].startedAt=sentinel(),d=>d.stats.bosses[0].duration=sentinel(),d=>d.stats.bosses[0].maxHp=sentinel(),d=>d.stats.damageTaken=-1,d=>d.stats.blockedDamage=-1,d=>d.stats.bosses[0].killed='true']){const raw=JSON.parse(text);mutate(raw.data);assert.throws(()=>C.importRunSave(JSON.stringify(raw)));}const good=C.importRunSave(text).game;assert.equal(good.stats.damageTaken,10);assert.equal(good.boss.orbitHit,-Infinity);assert.equal(good.boss.auraLabel,-Infinity);
});

test('Blade wing frees a slot without removing permanent whistle or saw returns and its fused whistle can be saved',()=>{
  const C=require('../dist/core.js'),g=quiet();own(g,'saw',4);own(g,'arrow',4);const e=g.createEnemy('tank',600,320);e.hp=e.maxHp=10000;g.updateWhistle(.01);const whistle=g.whistle;assert.ok(whistle);g.advanceSkill('bladeWing');assert.deepEqual(g.owned,['bladeWing']);assert.equal(g.level('saw'),4);assert.equal(g.level('arrow'),4);near(g.player.sawMultiplier,5.5*.85);near(g.player.arrowDamageMultiplier,5*.85);near(g.player.sawInterval,1.4);g.fireSaws();assert.equal(g.saws.length,6);assert.ok(g.saws.every(s=>s.burst));near(g.saws[0].damage,18*5.5*.85);g.updateWhistle(.01);assert.equal(g.whistle,whistle);const h=C.importRunSave(C.exportRunSave(g)).game;assert.equal(h.player.build.arrow,undefined);assert.equal(h.player.build.bladeWing,4);assert.ok(h.whistle);assert.equal(h.saws.length,6);h.resume();assert.doesNotThrow(()=>h.step(.04));for(let i=0;i<3;i++)h.recompute();near(h.player.arrowDamageMultiplier,5*.85);
});
test('Golden domain preserves both area mechanisms, applies fifteen-percent damage cost and snapshots active projectiles',()=>{
  const C=require('../dist/core.js'),g=quiet();own(g,'flask',4);own(g,'aura',4);const e=g.createEnemy('tank',600,320);e.hp=e.maxHp=10000;g.throwFlasks();near(g.flasks[0].acidDamage,18*1.8);const oldFlasks=g.flasks;g.advanceSkill('goldenDomain');assert.deepEqual(g.owned,['goldenDomain']);near(g.player.flaskMultiplier,10*.85);near(g.player.auraDamage,68*.85);near(g.player.auraRadius,230);near(oldFlasks[0].acidDamage,18*1.8);g.flasks=[];g.throwFlasks();near(g.flasks[0].damage,18*10*.85);near(g.flasks[0].acidDamage,18*1.8*.85);g.updateFlasks(.6);assert.equal(g.acidPools.length,5);assert.ok(g.acidPools.every(p=>Math.abs(p.damage-18*1.8*.85)<1e-7));const h=C.importRunSave(C.exportRunSave(g)).game;assert.equal(h.player.build.aura,undefined);assert.equal(h.level('aura'),4);assert.equal(h.acidPools.length,5);near(h.player.auraDamage,68*.85);h.resume();assert.doesNotThrow(()=>h.step(.04));assert.equal(h.report().damage.filter(row=>row.id==='flask').length,1);
});

test('Every equipped catalyst survives save import while malformed catalyst values remain rejected',()=>{
  const C=require('../dist/core.js');for(const catalyst of C.CATALYSTS){const g=new Game();if(catalyst.skill)own(g,catalyst.skill,1);g.equipCatalyst(catalyst.id);const h=C.importRunSave(C.exportRunSave(g)).game;assert.equal(h.catalyst,catalyst.id);assert.equal(h.state,'paused');near(h.player.damage,g.player.damage);near(h.player.speed,g.player.speed);}
  for(const value of [false,12,{},[],['guidance'], 'unknown']){const raw=JSON.parse(C.exportRunSave(new Game()));raw.data.catalyst=value;assert.throws(()=>C.importRunSave(JSON.stringify(raw)));}
});

test('All nine distinct equipment items equip together, toggle independently and never compound or occupy skill slots',()=>{
  const C=require('../dist/core.js');let p=C.createEquipmentProfile();p.shards=288;for(const gear of C.EQUIPMENT.filter(e=>!e.since)){for(let tier=0;tier<3;tier++)p=C.upgradeEquipment(p,gear.id);p=C.equipEquipment(p,gear.id);p=C.equipEquipment(p,gear.id);}assert.equal(p.shards,0);assert.equal(p.equipped.length,9);
  const g=new Game({equipment:C.equipmentLoadout(p)});for(let n=0;n<6;n++)g.recompute();near(g.player.damage,18*1.12);near(g.player.fireRate,.62/1.1);near(g.player.crit,.12);near(g.player.maxHp,124);near(g.player.hp,124);near(g.player.speed,235*1.08);near(g.player.magnet,112);near(g.player.damageReduction,.1);near(g.player.pillBonus,10);assert.equal(g.rerollsRemaining,5);assert.equal(g.owned.length,0);
  p=C.equipEquipment(p,'rhythm',false);assert.equal(p.equipped.length,8);assert.ok(p.equipped.includes('ember')&&p.equipped.includes('focus'));near(g.player.fireRate,.62/1.1);p.levels.ember=1;assert.equal(g.equipment.ember.level,3);const h=C.importRunSave(C.exportRunSave(g,1,p)).game;assert.deepEqual(h.equipment,g.equipment);assert.equal(h.rerollsRemaining,5);
});
test('Legacy three-slot workshop, run equipment and history migrate without losing owned ranks, selection or fragments',()=>{
  const C=require('../dist/core.js'),old={...C.createEquipmentProfile(),schema:1,equipped:{core:'ember',shell:'hull',boots:'swift'},shards:42,claimed:['6:1','6:2']};old.levels.ember=3;old.levels.rhythm=2;old.levels.hull=1;old.levels.swift=2;const text=JSON.stringify(old),p=C.validateEquipmentProfile(old);assert.equal(JSON.stringify(old),text);assert.equal(p.schema,2);assert.deepEqual(p.equipped,['ember','hull','swift']);assert.equal(p.levels.rhythm,2);assert.equal(p.shards,42);assert.deepEqual(p.claimed,old.claimed);const loadout={core:{id:'ember',level:3},shell:{id:'hull',level:1},boots:{id:'swift',level:2}},g=new Game({equipment:loadout});const raw=JSON.parse(C.exportRunSave(g,6));raw.profile=old;raw.data.equipment=loadout;const restored=C.importGameSave(JSON.stringify(raw));assert.deepEqual(restored.profile,p);assert.deepEqual(restored.game.equipment,C.equipmentLoadout(p));
  for(const mutate of [r=>r.equipped=['ember','ember'],r=>r.equipped=['unknown'],r=>r.equipped=['reserve'],r=>r.equipped=[['ember']],r=>r.equipped={core:'ember'}]){const bad=JSON.parse(JSON.stringify(p));mutate(bad);assert.throws(()=>C.validateEquipmentProfile(bad));}assert.throws(()=>new Game({equipment:{ember:{id:'rhythm',level:1}}}));
});
test('Global progress backs up unlocked final campaign, equipment and real timestamped history without resuming ended fights',()=>{
  const C=require('../dist/core.js'),g=new Game({campaignLevel:6});g.finish(false);const history={schema:1,records:[createRunRecord(g,{at:Date.now(),version:'v27'})]},profile=C.createEquipmentProfile();profile.shards=50;const before=JSON.stringify({profile,history}),text=C.exportProgressSave({unlocked:7,selected:7,profile,history}),r=C.importGameSave(text);assert.equal(r.kind,'progress');assert.equal(r.game,null);assert.equal(r.unlocked,7);assert.equal(r.selected,7);assert.deepEqual(r.profile,profile);assert.deepEqual(r.history,history);assert.equal(JSON.stringify({profile,history}),before);
  for(const mutate of [r=>r.unlocked=99,r=>r.selected=8,r=>r.profile.equipped=['unknown'],r=>r.history.records[0].at=-1,r=>r.history.records.push(r.history.records[0]),r=>r.history.records[0].equipment={unknown:{id:'unknown',level:1}},r=>r.history={schema:2,records:[]},r=>r.extra=1]){const bad=JSON.parse(text);mutate(bad);assert.throws(()=>C.importGameSave(JSON.stringify(bad)));}assert.throws(()=>C.importGameSave('{"format":"neon-progress","__proto__":{}}'));
});
test('Every campaign can save immediately after the second boss and still proceed to the level-forty final battle',()=>{
  const C=require('../dist/core.js');for(const campaignLevel of CAMPAIGN_LEVELS.map(level=>level.id)){const g=new Game({campaignLevel,random:()=>.2});g.addEnergy(100000);g.maybeUpgrade();for(const stage of [1,2]){while(g.upgrades<stage*10)chooseAny(g);g.spawnBoss(stage);g.kill(g.boss);if(stage===1)g.acknowledgeLottery();}
    g.equipCatalyst('pressure');const profile=C.claimEquipmentRewards(C.createEquipmentProfile(),g).profile;const past=new Game();past.finish(false);const history={schema:1,records:[createRunRecord(past,{at:Date.now(),version:'v27'})]},r=C.importGameSave(C.exportRunSave(g,campaignLevel,profile,history));assert.equal(r.kind,'run');assert.equal(r.game.state,'lottery');assert.equal(r.game.upgrades,20);assert.equal(r.game.catalyst,'pressure');assert.equal(r.profile.shards,25);assert.deepEqual(r.history,history);r.game.acknowledgeLottery();const after=C.importGameSave(C.exportRunSave(r.game,campaignLevel,profile,history)).game;while(after.upgrades<40)chooseAny(after);assert.equal(after.bossDue.stage,3);assert.equal(after.bossDue.upgrade,40);after.spawnBoss(3);after.kill(after.boss);after.acknowledgeLottery();assert.equal(after.won,true);
  }
});
test('Buffed throws prefer the boss, stronger recovery pulse hits its exact range and high-speed return catches the player',()=>{
  const g=quiet();own(g,'saw',4);own(g,'flask',4);own(g,'move',4);own(g,'ghost',4);g.spawnBoss(1);g.boss.x=g.player.x+250;g.boss.y=g.player.y;const minor=g.createEnemy('tank',g.player.x,g.player.y-60);minor.hp=minor.maxHp=10000;g.fireSaws();near(g.saws[0].vx,620);g.throwFlasks();near(g.flasks[0].goalX,g.boss.x);near(g.flasks[0].flight,.45);g.updateFlasks(.45);assert.equal(g.acidPools[0].r,90);assert.equal(g.acidPools[0].life,4.5);near(g.acidPools[0].damage,18*1.8);
  g.saws=[];g.boss.hp=1000;const p=g.player;p.ghostActive=true;const saw={x:p.x-350,y:p.y,r:10,vx:0,vy:0,age:.6,life:1.9,returning:true,burst:false,damage:99,pulseRadius:105,pulseMultiplier:1,hits:new Set()};g.saws=[saw];for(let i=0;i<30&&g.saws.length;i++){p.x+=p.speed*2*.016;g.updateSaws(.016);}assert.equal(g.saws.length,0);
  const h=quiet(),q=h.player;own(h,'saw',4);const inside=h.createEnemy('tank',q.x+105+20,q.y),outside=h.createEnemy('tank',q.x+105+20+.01,q.y);inside.hp=outside.hp=1000;h.saws=[{x:q.x,y:q.y,r:10,vx:0,vy:0,age:.6,life:1.9,returning:true,burst:true,damage:99,pulseRadius:105,pulseMultiplier:1,hits:new Set()}];h.updateSaws(.01);near(inside.hp,901);near(outside.hp,1000);assert.ok(h.effects.some(e=>e.kind==='sawPulse'&&e.r===105));
});
test('Legacy thrown snapshots retain old damage, timing and pool size while new throws use buffed tables after loading',()=>{
  const C=require('../dist/core.js'),g=quiet();own(g,'saw',4);own(g,'flask',4);const p=g.player;g.saws=[{x:p.x,y:p.y,r:8,vx:480,vy:0,age:0,life:2.5,returning:false,burst:true,damage:61.2,hits:new Set()}];g.flasks=[{x:p.x,y:p.y,r:7,startX:p.x,startY:p.y,goalX:p.x+100,goalY:p.y,age:0,flight:.6,damage:108,blast:115,acid:true,acidDamage:14.4}];const h=C.importRunSave(C.exportRunSave(g)).game;h.resume();h.updateFlasks(.3);assert.equal(h.flasks.length,1);h.updateFlasks(.3);assert.equal(h.acidPools[0].r,65);assert.equal(h.acidPools[0].life,3);near(h.acidPools[0].damage,14.4);near(h.saws[0].damage,61.2);near(h.player.sawMultiplier,5.5);near(h.player.flaskMultiplier,10);assert.equal(C.importRunSave(C.exportRunSave(h)).game.acidPools[0].r,65);
});

test('Meteor tiers snapshot strong multi-target damage, wait for impact and breakthrough echoes exactly once',()=>{
  const C=require('../dist/core.js');for(const [level,shots,interval,radius,mult]of [[1,2,4.5,80,4],[2,3,3.6,95,5.5],[3,4,2.8,110,7],[4,7,1.8,135,10]]){const g=quiet();own(g,'meteor',level);near(g.player.meteorInterval,interval);assert.equal(g.player.meteorShots,shots);near(g.player.meteorRadius,radius);near(g.player.meteorMultiplier,mult);const e=g.createEnemy('tank',600,300);e.hp=e.maxHp=100000;g.dropMeteors();assert.equal(g.meteors.length,shots);g.updateMeteors(.64);near(e.hp,100000);g.advanceSkill('power');g.updateMeteors(.01);near(e.maxHp-e.hp,shots*18*mult);if(level===4){const h=C.importRunSave(C.exportRunSave(g)).game;h.resume();h.updateMeteors(.25);near(h.enemies[0].maxHp-h.enemies[0].hp,shots*18*mult*1.6);assert.equal(h.meteors.length,0);h.updateMeteors(.1);near(h.enemies[0].maxHp-h.enemies[0].hp,shots*18*mult*1.6);}else assert.equal(g.meteors.length,0);}
  const empty=quiet();own(empty,'meteor',1);empty.dropMeteors();near(empty.player.meteorClock,.25);assert.equal(empty.meteors.length,0);
});
test('Meteor impact stops a boss-death frame before contact and all new timers freeze during reward choices',()=>{
  const g=quiet();own(g,'meteor',4);g.upgrades=10;g.spawnBoss(1);g.boss.x=g.player.x;g.boss.y=g.player.y;g.boss.hp=1;g.dropMeteors();for(const m of g.meteors)m.age=.64;g.createEnemy('tank',g.player.x,g.player.y);g.step(.04);assert.equal(g.state,'lottery');assert.equal(g.player.hp,100);assert.equal(g.meteors[0].phase,1);const before=JSON.stringify(g);g.step(.1);g.updateMeteors(.1);g.updateHazards(.1);assert.equal(JSON.stringify(g),before);
  for(const state of ['paused','upgrade','catalyst','lottery']){const h=new Game({campaignLevel:8});h.state=state;h.player.chillRemaining=2;const snapshot=JSON.stringify(h);h.step(.1);assert.equal(JSON.stringify(h),snapshot);}
});
test('Ice hazards have harmless warning, precise strip and ring bounds, brief chill and bomb cleansing',()=>{
  const g=new Game({campaignLevel:8}),p=g.player;g.addHazard({kind:'ice',shape:'strip',x:p.x,y:p.y,r:24,length:800,angle:0,warning:1.8,life:1.1,damage:12,chill:1.6});const h=g.hazards[0];assert.equal(g.hazardContains(h,{x:p.x+800,y:p.y+24}),true);assert.equal(g.hazardContains(h,{x:p.x,y:p.y+24.01}),false);assert.equal(g.hazardContains(h,{x:p.x+800.01,y:p.y}),false);g.updateHazards(1.8);near(p.hp,100);g.updateHazards(.01);near(p.hp,88);near(p.chillRemaining,1.6);p.invuln=0;own(g,'shield',1);p.chillRemaining=0;h.tickClock=0;g.updateHazards(.01);near(p.hp,88);near(p.chillRemaining,0);
  const ring={x:100,y:100,shape:'ring',inner:100,r:210};assert.equal(g.hazardContains(ring,{x:200,y:100}),false);assert.equal(g.hazardContains(ring,{x:310,y:100}),true);assert.equal(g.hazardContains(ring,{x:310.01,y:100}),false);g.useItem({type:'bomb',dead:false,x:p.x,y:p.y});assert.equal(g.hazards.length,0);
  for(let i=0;i<40;i++)g.addHazard({kind:'ice',shape:'circle',x:100,y:100,r:95,damage:12,life:.45});assert.equal(g.hazards.length,24);g.updateHazards(.5);assert.equal(g.hazards.length,0);
});
test('Glacial enemies cap at ten then fourteen, telegraph their frost burst and stun interrupts the windup clock',()=>{
  const g=new Game({campaignLevel:8,random:()=>0});for(let i=0;i<20;i++)g.spawnEnemy();assert.equal(g.enemies.filter(e=>e.type==='glacial').length,10);g.upgrades=20;g.bossesDefeated=[1,2];for(let i=0;i<10;i++)g.spawnEnemy();assert.equal(g.enemies.filter(e=>e.type==='glacial').length,14);const e=g.enemies.find(e=>e.type==='glacial');e.x=g.player.x+100;e.y=g.player.y;e.frostClock=0;g.moveEnemy(e,.01,[]);near(e.frostIntent.remaining,.9);e.stun=.3;g.moveEnemy(e,.2,[]);near(e.frostIntent.remaining,.9);e.stun=0;g.moveEnemy(e,.9,[]);assert.equal(e.frostIntent,null);assert.equal(g.hazards[0].r,95);assert.equal(g.hazards[0].warning,0);near(e.frostClock,5);
});
test('Eighth campaign has its own complete forty-upgrade journey and locked ice fan and ring boss patterns',()=>{
  const g=new Game({campaignLevel:8,random:()=>.2});g.upgrades=10;g.spawnBoss(1);g.boss.attackClock=0;g.updateBossAttack(.01);assert.equal(g.boss.intent.kind,'iceFan');const x=g.player.x;g.player.x+=150;g.updateBossAttack(.8);assert.equal(g.hazards.length,3);near(g.hazards[1].x,x);assert.ok(g.hazards.every(h=>h.warning===1.2));g.hazards=[];g.boss.intent={kind:'frostWheel',angle:0,remaining:.01,total:.8,radius:210,x:300,y:300};g.updateBossAttack(.02);assert.equal(g.hazards[0].shape,'ring');assert.equal(g.hazards[0].inner,100);
  const full=new Game({campaignLevel:8,random:()=>.2});full.addEnergy(100000);full.maybeUpgrade();for(const stage of [1,2,3]){while(full.upgrades<(stage===3?40:stage*10))chooseAny(full);assert.equal(full.bossDue.warning,stage*10);full.spawnBoss(stage);assert.equal(full.boss.name,CAMPAIGN_LEVELS[7].bosses[stage-1]);full.kill(full.boss);full.acknowledgeLottery();}assert.equal(full.state,'ended');assert.equal(full.won,true);assert.equal(full.upgrades,40);
});
test('Ice actors and meteors round-trip with strict bounds while pre-eighth-level saves gain safe defaults',()=>{
  const C=require('../dist/core.js'),g=new Game({campaignLevel:8});own(g,'meteor',4);g.createEnemy('glacial',600,300);g.enemies[0].frostIntent={remaining:.4,total:.9};g.dropMeteors();g.addHazard({kind:'ice',shape:'strip',x:300,y:300,r:24,length:1200,angle:0,warning:1.8,life:1.1,damage:12,chill:1.6});g.player.chillRemaining=1.5;const text=C.exportRunSave(g,8),h=C.importRunSave(text).game;assert.equal(h.meteors.length,7);near(h.player.chillRemaining,1.5);assert.equal(h.hazards.length,1);near(h.enemies[0].frostIntent.remaining,.4);h.resume();assert.doesNotThrow(()=>h.step(.1));
  for(const mutate of [d=>d.meteors[0].phase=9,d=>d.meteors[0].damage=-1,d=>d.hazards[0].shape='unknown',d=>d.hazards[0].damage=999,d=>d.hazards[0].inner=-1,d=>d.hazards[0].tickClock=2,d=>d.player.chillRemaining=99,d=>d.enemies[0].frostIntent.remaining=1]){const bad=JSON.parse(text);mutate(bad.data);assert.throws(()=>C.importRunSave(JSON.stringify(bad)));}
  const old=JSON.parse(C.exportRunSave(quiet()));delete old.data.hazards;delete old.data.meteors;for(const key of ['meteorClock','meteorInterval','meteorShots','meteorRadius','meteorMultiplier','chillRemaining'])delete old.data.player[key];delete old.data.stats.damage.meteor;const legacy=C.importRunSave(JSON.stringify(old)).game;assert.deepEqual(legacy.hazards,[]);assert.equal(legacy.player.chillRemaining,0);assert.equal(legacy.stats.damage.meteor.damage,0);
});

test('Ion chain tiers visit distinct targets within hop range and breakthrough returns sixty-five-percent damage without RNG',()=>{
  for(const [level,count,interval,range,mult]of [[1,4,3.6,210,3],[2,6,3,260,4],[3,9,2.4,310,5],[4,14,1.6,400,7]]){const g=quiet();own(g,'ion',level);near(g.player.ionInterval,interval);near(g.player.ionRange,range);assert.equal(g.player.ionTargets,count);for(let i=0;i<14;i++){const a=i/14*Math.PI*2,e=g.createEnemy('tank',g.player.x+Math.cos(a)*150,g.player.y+Math.sin(a)*150);e.hp=e.maxHp=10000;}let randomCalls=0;g.random=()=>{randomCalls++;return .5;};g.castIon();assert.equal(randomCalls,0);assert.equal(g.enemies.filter(e=>e.hp<e.maxHp).length,count);near(g.report().totalDamage,count*18*mult*(level===4?1.65:1));assert.equal(g.report().damage[0].id,'ion');near(g.player.ionClock,interval);}
  const sparse=quiet();own(sparse,'ion',1);const nearEnemy=sparse.createEnemy('tank',sparse.player.x+40,sparse.player.y),far=sparse.createEnemy('tank',sparse.player.x+400,sparse.player.y);sparse.castIon();near(nearEnemy.maxHp-nearEnemy.hp,54);near(far.hp,far.maxHp);
});
test('Ion targets the boss first and a lethal hit freezes before return damage or player contact',()=>{
  const g=quiet();own(g,'ion',4);g.upgrades=10;g.spawnBoss(1);g.boss.x=g.player.x+30;g.boss.y=g.player.y;g.boss.hp=1;const boss=g.boss;g.createEnemy('tank',g.player.x,g.player.y);g.player.ionClock=0;g.step(.04);assert.equal(g.state,'lottery');assert.equal(g.player.hp,100);assert.equal(g.effects.find(e=>e.kind==='ionLink').x,boss.x);near(g.player.ionClock,1.6);const before=JSON.stringify(g);g.step(.1);g.castIon();assert.equal(JSON.stringify(g),before);
});
test('Stability anchors refresh a five-second noncompounding base-damage and speed boost and bombs preserve them',()=>{
  const g=new Game({campaignLevel:9}),p=g.player;g.spawnClock=p.fireClock=1e9;g.addHazard({kind:'anchor',shape:'circle',x:p.x,y:p.y,r:70,life:6});g.updateHazards(.01);near(p.fluxRemaining,5);near(p.damage,18*1.35);near(p.speed,235*1.15);assert.equal(g.hazards.length,0);for(let i=0;i<5;i++)g.recompute();near(p.damage,24.3);g.step(.1);g.addHazard({kind:'anchor',shape:'circle',x:p.x,y:p.y,r:70,life:6});g.updateHazards(.01);near(p.fluxRemaining,5);near(p.speed,270.25);g.spawnAnchor();g.addHazard({kind:'rift',shape:'strip',x:p.x,y:p.y,r:18,length:1200,warning:1.6,life:.65,damage:18});g.useItem({type:'bomb',dead:false,x:p.x,y:p.y});assert.equal(g.hazards.length,1);assert.equal(g.hazards[0].kind,'anchor');g.hazards=[];for(let i=0;i<51;i++)g.step(.1);near(p.fluxRemaining,0);near(p.damage,18);near(p.speed,235);
});
test('Phase hunters cap independently and lock teleports before a vulnerable landing pause',()=>{
  const g=new Game({campaignLevel:9,random:()=>0});for(let i=0;i<25;i++)g.spawnEnemy();assert.equal(g.enemies.filter(e=>e.type==='phaselet').length,12);g.upgrades=20;g.bossesDefeated=[1,2];for(let i=0;i<10;i++)g.spawnEnemy();assert.equal(g.enemies.filter(e=>e.type==='phaselet').length,18);const e=g.enemies.find(e=>e.type==='phaselet');e.x=g.player.x+100;e.y=g.player.y;e.phaseClock=0;g.moveEnemy(e,.01,[]);const mark={...e.phaseIntent},start=e.x;g.player.x-=100;e.stun=.3;g.moveEnemy(e,.2,[]);near(e.phaseIntent.remaining,.9);near(e.x,start);e.stun=0;g.moveEnemy(e,.9,[]);near(e.x,mark.x);near(e.y,mark.y);near(e.stun,.65);near(e.phaseClock,4.5);assert.equal(e.phaseIntent,null);
});
test('Ninth campaign alternates delayed rifts and anchors, locks boss jumps and preserves all forty upgrade gates',()=>{
  const g=new Game({campaignLevel:9,random:()=>.2});g.upgrades=5;g.arenaClock=0;g.updateArena(.01);assert.equal(g.hazards.length,3);assert.deepEqual(g.hazards.map(h=>h.kind),['rift','rift','anchor']);near(g.hazards[0].warning,1.6);near(g.hazards[1].warning,2.2);g.updateHazards(1.6);near(g.player.hp,100);g.updateHazards(.01);near(g.player.hp,82);near(g.player.chillRemaining,0);g.hazards=[];g.upgrades=20;g.spawnBoss(2);g.boss.attackIndex=1;g.boss.attackClock=0;g.updateBossAttack(.01);assert.equal(g.boss.intent.kind,'phaseJump');const mark={...g.boss.intent};g.player.x-=100;g.updateBossAttack(.9);near(g.boss.x,mark.x);near(g.boss.y,mark.y);
  const full=new Game({campaignLevel:9,random:()=>.2});full.addEnergy(100000);full.maybeUpgrade();for(const stage of [1,2,3]){while(full.upgrades<(stage===3?40:stage*10))chooseAny(full);assert.equal(full.bossDue.warning,stage*10);full.spawnBoss(stage);assert.equal(full.boss.name,CAMPAIGN_LEVELS[8].bosses[stage-1]);full.kill(full.boss);full.acknowledgeLottery();}assert.equal(full.won,true);assert.equal(full.upgrades,40);
});
test('Phase boost, hunter landing markers and delayed rifts save with strict validation and old saves retain zero boost',()=>{
  const C=require('../dist/core.js'),g=new Game({campaignLevel:9});g.upgrades=5;g.arenaClock=0;g.updateArena(.01);const e=g.createEnemy('phaselet',600,300);e.phaseClock=0;g.moveEnemy(e,.01,[]);g.player.fluxRemaining=2.5;g.recompute();own(g,'ion',4);const text=C.exportRunSave(g,9),h=C.importRunSave(text).game;near(h.player.fluxRemaining,2.5);near(h.player.damage,24.3);assert.deepEqual(h.enemies[0].phaseIntent,e.phaseIntent);assert.equal(h.hazards[2].kind,'anchor');for(let i=0;i<4;i++)h.recompute();near(h.player.damage,24.3);
  for(const mutate of [d=>d.player.fluxRemaining=6,d=>d.hazards[0].damage=19,d=>d.hazards[2].r=100,d=>d.hazards[2].life=7,d=>d.enemies[0].phaseIntent.x=null,d=>d.enemies[0].phaseClock=-1,d=>d.campaignLevel=8]){const bad=JSON.parse(text);mutate(bad.data);assert.throws(()=>C.importRunSave(JSON.stringify(bad)));}const old=JSON.parse(C.exportRunSave(quiet()));for(const key of ['ionClock','ionInterval','ionTargets','ionRange','ionMultiplier','fluxRemaining'])delete old.data.player[key];delete old.data.stats.damage.ion;const legacy=C.importRunSave(JSON.stringify(old)).game;assert.equal(legacy.player.fluxRemaining,0);assert.equal(legacy.stats.damage.ion.damage,0);
});

test('Star turrets have strong fixed tiers, focus bosses and every third breakthrough volley pierces with extra damage',()=>{
  for(const [level,count,interval,range,mult]of [[1,2,2.1,500,2.5],[2,3,1.7,600,3.5],[3,4,1.3,700,5],[4,6,.9,850,7.5]]){const g=quiet();own(g,'turret',level);assert.equal(g.player.turretCount,count);near(g.player.turretInterval,interval);near(g.player.turretRange,range);near(g.player.turretMultiplier,mult);const e=g.createEnemy('tank',g.player.x+150,g.player.y);e.hp=e.maxHp=100000;for(let i=0;i<3;i++)g.fireTurrets();near(e.maxHp-e.hp,count*18*mult*(level===4?3.25:3));assert.equal(g.player.turretVolley,0);assert.equal(g.effects.filter(e=>e.kind==='turretLaser'&&e.piercing).length,level===4?count:0);near(g.player.turretClock,interval);assert.equal(g.report().damage[0].id,'turret');}
  const empty=quiet();own(empty,'turret',4);empty.fireTurrets();near(empty.player.turretClock,.25);assert.equal(empty.player.turretVolley,0);
});
test('Turret piercing uses exact forward and half-width bounds and lethal boss fire stops before remaining cannons or contact',()=>{
  const g=quiet();own(g,'turret',4);g.player.turretCount=1;g.player.turretVolley=2;const from=g.turretPosition(0),target=g.createEnemy('tank',from.x+100,from.y),edge=g.createEnemy('tank',from.x+180,from.y+30),outside=g.createEnemy('tank',from.x+180,from.y+30.01),behind=g.createEnemy('tank',from.x-100,from.y);for(const e of g.enemies)e.hp=e.maxHp=10000;g.fireTurrets();near(target.hp,10000-18*7.5*1.25);near(edge.hp,10000-18*7.5*1.25);near(outside.hp,10000);near(behind.hp,10000);
  const h=quiet();own(h,'turret',4);h.upgrades=10;h.spawnBoss(1);h.boss.x=h.player.x+35;h.boss.y=h.player.y;h.boss.hp=1;h.player.turretClock=0;h.createEnemy('tank',h.player.x,h.player.y);h.step(.04);assert.equal(h.state,'lottery');assert.equal(h.player.hp,100);assert.equal(h.effects.filter(e=>e.kind==='turretLaser').length,1);near(h.report().totalDamage,1);
});
test('Pylons give bounded removable boss protection, expire without rewards and cannot contact the player after expiry',()=>{
  const g=new Game({campaignLevel:10});g.upgrades=10;g.spawnBoss(1);g.spawnPylons(3);near(g.reactorShieldReduction(),.45);near(g.hurt(g.boss,100,{source:'turret'}),55);g.spawnPylons(10);assert.equal(g.enemies.filter(e=>e.type==='pylon').length,4);near(g.reactorShieldReduction(),.5);near(g.hurt(g.boss,100,{source:'turret'}),50);const hp=g.boss.hp;g.useItem({type:'bomb',dead:false,x:g.player.x,y:g.player.y});near(g.boss.hp,hp);near(g.reactorShieldReduction(),0);near(g.hurt(g.boss,100,{source:'turret'}),100);
  const h=new Game({campaignLevel:10});h.spawnClock=h.player.fireClock=1e9;const p=h.createEnemy('pylon',h.player.x,h.player.y);p.pylonLife=.01;h.step(.04);assert.equal(p.dead,true);assert.equal(h.player.hp,100);assert.equal(h.kills,0);assert.equal(h.gems.length,0);assert.equal(h.minorCount(),0);
});
test('Pylon pulse gives a one-second warning, respects stun and later waves cap the support columns at six',()=>{
  const g=new Game({campaignLevel:10});g.upgrades=20;g.bossesDefeated=[1,2];g.spawnPylons(20);assert.equal(g.enemies.length,6);const e=g.enemies[0];e.pylonClock=0;g.moveEnemy(e,.01,[]);near(e.pylonIntent.remaining,1);const life=e.pylonLife;e.stun=.2;g.moveEnemy(e,.1,[]);near(e.pylonIntent.remaining,1);near(e.pylonLife,life);e.stun=0;g.moveEnemy(e,1,[]);assert.equal(e.pylonIntent,null);near(e.pylonClock,5);assert.equal(g.hazards[0].r,100);assert.equal(g.hazards[0].damage,16);
});
test('Reactor purge telegraphs three real shelters, protects exact safe boundaries and can be countered by shields or bombs',()=>{
  const safe=new Game({campaignLevel:10});safe.spawnPurge(3);assert.equal(safe.hazards.length,4);const zone=safe.hazards[0];safe.player.x=zone.x+95;safe.player.y=zone.y;safe.updateHazards(3);near(safe.player.hp,100);safe.updateHazards(.01);near(safe.player.hp,100);const danger=new Game({campaignLevel:10});danger.spawnPurge(3);danger.updateHazards(3);near(danger.player.hp,100);danger.updateHazards(.01);near(danger.player.hp,72);assert.equal(danger.stats.recent[0].source,'reactorPurge');
  const shield=new Game({campaignLevel:10});own(shield,'shield',1);shield.spawnPurge(3);shield.updateHazards(3);shield.updateHazards(.01);near(shield.player.hp,100);near(shield.stats.blockedDamage,28);shield.useItem({type:'bomb',dead:false,x:shield.player.x,y:shield.player.y});assert.equal(shield.hazards.length,3);assert.ok(shield.hazards.every(h=>h.kind==='shelter'));for(const n of [20,21]){const g=new Game({campaignLevel:10});for(let i=0;i<n;i++)g.addHazard({kind:'reactor',shape:'circle',x:100,y:100,r:75,warning:1.25,life:.55,damage:22});g.spawnPurge(3);assert.ok(g.hazards.length<=24);assert.equal(g.hazards.some(h=>h.kind==='purge'),n===20);if(n===20)assert.equal(g.hazards.filter(h=>h.kind==='shelter').length,3);}
});
test('Tenth campaign has distinct shield, solar rain and purge patterns and completes the full forty-upgrade finale',()=>{
  const g=new Game({campaignLevel:10,random:()=>.2});g.upgrades=10;g.spawnBoss(1);g.boss.attackClock=0;g.updateBossAttack(.01);assert.equal(g.boss.intent.kind,'reactorShield');g.updateBossAttack(1.2);assert.equal(g.enemies.filter(e=>e.type==='pylon').length,3);g.boss.attackClock=0;g.updateBossAttack(.01);assert.equal(g.boss.intent.kind,'solarRain');const x=g.boss.intent.x;g.player.x-=100;g.updateBossAttack(1);assert.equal(g.hazards.length,4);near(g.hazards[0].x,x);
  const full=new Game({campaignLevel:10,random:()=>.2});full.addEnergy(100000);full.maybeUpgrade();for(const stage of [1,2,3]){while(full.upgrades<(stage===3?40:stage*10))chooseAny(full);assert.equal(full.bossDue.warning,stage*10);full.spawnBoss(stage);assert.equal(full.boss.name,CAMPAIGN_LEVELS[9].bosses[stage-1]);near(full.boss.maxHp,[0,2400,8000,17000][stage]);full.kill(full.boss);full.acknowledgeLottery();}assert.equal(full.state,'ended');assert.equal(full.won,true);assert.equal(full.upgrades,40);assert.equal(CAMPAIGN_LEVELS.length,10);
});
test('Turret volley, pylon support and purge shelters round-trip safely while old saves start without turret counters',()=>{
  const C=require('../dist/core.js'),g=new Game({campaignLevel:10});own(g,'turret',4);g.player.turretVolley=2;g.upgrades=10;g.spawnBoss(1);g.spawnPylons(3);g.spawnPurge(3);const text=C.exportRunSave(g,10),h=C.importRunSave(text).game;assert.equal(h.player.turretVolley,2);assert.equal(h.hazards.length,4);near(h.reactorShieldReduction(),.45);h.resume();h.fireTurrets();assert.ok(h.effects.some(e=>e.kind==='turretLaser'&&e.piercing));
  for(const mutate of [d=>d.player.turretVolley=3,d=>d.hazards.find(h=>h.kind==='purge').r=100,d=>d.hazards=d.hazards.filter(h=>h.kind!=='shelter'),d=>d.hazards[0].r=100,d=>d.enemies.find(e=>e.type==='pylon').pylonLife=13,d=>d.enemies.find(e=>e.type==='pylon').pylonIntent={remaining:2,total:1}]){const bad=JSON.parse(text);mutate(bad.data);assert.throws(()=>C.importRunSave(JSON.stringify(bad)));}const old=JSON.parse(C.exportRunSave(quiet()));for(const key of ['turretClock','turretInterval','turretCount','turretRange','turretMultiplier','turretVolley'])delete old.data.player[key];delete old.data.stats.damage.turret;const legacy=C.importRunSave(JSON.stringify(old)).game;assert.equal(legacy.player.turretVolley,0);assert.equal(legacy.stats.damage.turret.damage,0);
});

test('Starfire fusion retains both catastrophic weapons, frees a slot and applies the same fifteen-percent cost to acid and meteor echoes',()=>{
  const C=require('../dist/core.js'),g=quiet();own(g,'meteor',4);own(g,'flask',4);const e=g.createEnemy('tank',600,300);e.hp=e.maxHp=100000;g.dropMeteors();g.throwFlasks();const oldMeteor=g.meteors[0],oldFlask=g.flasks[0];g.advanceSkill('starfire');assert.deepEqual(g.owned,['starfire']);assert.equal(g.level('meteor'),4);assert.equal(g.level('flask'),4);near(oldMeteor.damage,180);near(oldFlask.damage,180);near(oldFlask.acidDamage,32.4);g.meteors=[];g.flasks=[];g.dropMeteors();g.throwFlasks();assert.equal(g.meteors.length,7);assert.equal(g.flasks.length,5);near(g.meteors[0].damage,180*.85);near(g.flasks[0].damage,180*.85);near(g.flasks[0].acidDamage,32.4*.85);const h=C.importRunSave(C.exportRunSave(g)).game;h.resume();h.updateMeteors(.65);h.updateMeteors(.25);h.updateFlasks(.45);assert.equal(h.acidPools.length,5);near(h.acidPools[0].damage,32.4*.85);assert.ok(h.report().damage.some(row=>row.id==='meteor'));assert.ok(h.report().damage.some(row=>row.id==='flask'));assert.equal(h.report().damage.length,2);
  const raw=JSON.parse(C.exportRunSave(g));raw.data.player.build.goldenDomain=4;assert.throws(()=>C.importRunSave(JSON.stringify(raw)),/配方冲突/);
});
test('Ion citadel preserves third-volley timing and both weapons with one slot and noncompounding damage reduction',()=>{
  const C=require('../dist/core.js'),g=quiet();own(g,'ion',4);own(g,'turret',4);g.player.turretVolley=2;g.advanceSkill('ionCitadel');assert.deepEqual(g.owned,['ionCitadel']);near(g.player.ionMultiplier,7*.85);near(g.player.turretMultiplier,7.5*.85);near(g.player.turretInterval,.9);assert.equal(g.player.turretVolley,2);for(let i=0;i<5;i++)g.recompute();near(g.player.ionMultiplier,7*.85);const e=g.createEnemy('tank',600,320);e.hp=e.maxHp=100000;g.fireTurrets();assert.equal(g.effects.filter(e=>e.kind==='turretLaser'&&e.piercing).length,6);g.castIon();const h=C.importRunSave(C.exportRunSave(g)).game;assert.equal(h.player.build.ionCitadel,4);assert.equal(h.player.build.ion,undefined);assert.equal(h.level('turret'),4);assert.equal(h.player.turretVolley,0);h.equipCatalyst('relay');near(h.player.ionMultiplier,7*.85*.9);assert.equal(h.player.ionTargets,16);
});
test('Meteor catalyst adds two strikes with a smaller saved footprint, supports fusion and never alters already falling snapshots',()=>{
  const C=require('../dist/core.js'),g=quiet();own(g,'meteor',4);own(g,'flask',4);g.advanceSkill('starfire');const e=g.createEnemy('tank',600,300);e.hp=e.maxHp=100000;g.dropMeteors();const old=g.meteors[0];g.equipCatalyst('comet');assert.equal(g.player.meteorShots,9);near(g.player.meteorRadius,114.75);near(old.r,135);g.dropMeteors();near(g.meteors.at(-1).r,114.75);const h=C.importRunSave(C.exportRunSave(g)).game;assert.equal(h.player.meteorShots,9);assert.equal(h.meteors[0].r,135);assert.equal(h.meteors.at(-1).r,114.75);for(let i=0;i<5;i++)h.recompute();assert.equal(h.player.meteorShots,9);h.equipCatalyst('pressure');assert.equal(h.player.meteorShots,7);near(h.player.meteorRadius,135);near(h.meteors.at(-1).r,114.75);
});
test('Relay and refractor catalyst tradeoffs apply once and changing catalysts caps cooldown without banking a free volley',()=>{
  const g=quiet();own(g,'ion',4);own(g,'turret',4);g.advanceSkill('ionCitadel');g.equipCatalyst('relay');near(g.player.ionRange,560);assert.equal(g.player.ionTargets,16);near(g.player.ionMultiplier,7*.85*.9);g.player.turretClock=.1;g.equipCatalyst('refractor');assert.equal(g.player.turretCount,8);near(g.player.turretInterval,1.035);near(g.player.turretClock,.1);assert.equal(g.player.ionTargets,14);near(g.player.ionRange,400);near(g.player.ionMultiplier,7*.85);for(let i=0;i<5;i++)g.recompute();assert.equal(g.player.turretCount,8);g.player.turretClock=1.035;g.equipCatalyst('pressure');assert.equal(g.player.turretCount,6);near(g.player.turretClock,.9);
  for(const id of ['comet','relay','refractor']){const empty=quiet(),before=JSON.stringify(empty);assert.throws(()=>empty.equipCatalyst(id),/不适用/);assert.equal(JSON.stringify(empty),before);}
});

test('Custom practice supports each base skill in all ten campaigns and boss tiers without equipment or campaign income',()=>{
  const C=require('../dist/core.js');let combinations=0;for(const campaign of CAMPAIGN_LEVELS)for(const stage of [1,2,3])for(const skill of SKILLS.filter(s=>!s.fusion)){const g=createPracticeGame({campaignLevel:campaign.id,stage,buildId:'custom',customSkills:[skill.id],random:()=>.5});assert.equal(g.level(skill.id),stage+1);assert.equal(g.practiceConfig.buildId,'custom');assert.deepEqual(g.equipment,{});assert.equal(g.catalyst,null);assert.equal(g.player.hp,g.player.maxHp);assert.equal(g.player.shieldCharges,g.player.shieldMaxCharges);assert.equal(g.bossDue.name,campaign.bosses[stage-1]);g.addEnergy(99999);assert.equal(g.player.xp,0);g.spawnBoss(stage);g.kill(g.boss);assert.equal(g.state,'ended');assert.equal(g.won,true);assert.equal(C.claimEquipmentRewards(C.createEquipmentProfile(),g).gained,0);assert.equal(createRunRecord(g,{at:1,version:'v32'}),null);assert.throws(()=>C.exportRunSave(g),/正式|练习|战场/);combinations++;}assert.equal(combinations,690);
});
test('Custom practice can preview every fusion and applicable catalyst with isolated repeatable configuration snapshots',()=>{
  const C=require('../dist/core.js');for(const f of C.FUSIONS){const skills=[...f.requires],c=C.CATALYSTS.find(c=>c.skill===skills[0])?.id||'pressure',g=createPracticeGame({stage:3,buildId:'custom',customSkills:skills,customCatalyst:c,customFusion:f.id,random:()=>.5});assert.deepEqual(g.owned,[f.id]);assert.equal(g.catalyst,c);assert.equal(g.practiceConfig.customFusion,f.id);skills.push('move');assert.equal(g.practiceConfig.customSkills.length,2);const snapshot=g.snapshot();snapshot.practiceConfig.customSkills.push('power');assert.equal(g.practiceConfig.customSkills.length,2);const restart=createPracticeGame({...g.practiceConfig,random:()=>.5});assert.deepEqual(restart.owned,g.owned);assert.deepEqual(restart.practiceConfig,g.practiceConfig);assert.equal(restart.time,0);}
  for(const c of C.CATALYSTS){const skill=c.skill||'rate',g=createPracticeGame({stage:3,buildId:'custom',customSkills:[skill],customCatalyst:c.id});assert.equal(g.catalyst,c.id);assert.equal(g.player.hp,g.player.maxHp);}
});
test('Malformed custom skill, catalyst or fusion selections reject before constructing or consuming battle randomness',()=>{
  let calls=0;const random=()=>{calls++;return .5;};for(const options of [{customSkills:[]},{customSkills:['rate','rate']},{customSkills:['unknown']},{customSkills:['__proto__']},{customSkills:['starfire']},{customSkills:[{}]},{customSkills:SKILLS.filter(s=>!s.fusion).slice(0,9).map(s=>s.id)},{customSkills:['rate'],customCatalyst:'comet'},{customSkills:['rate'],customCatalyst:'__proto__'},{customSkills:['meteor','flask'],customFusion:'starfire',stage:2},{customSkills:['meteor'],customFusion:'starfire',stage:3},{customSkills:['meteor','flask'],customFusion:'unknown',stage:3}]){assert.throws(()=>createPracticeGame({buildId:'custom',random,...options}));assert.equal(calls,0);}
});

test('Turrets do not spend a volley at the circular broad-phase edge when no actual cannon can reach the target',()=>{
  const g=new Game({width:2000,height:2000,random:()=>.5});own(g,'turret',1);const e=g.createEnemy('tank',g.player.x,g.player.y+550);e.hp=e.maxHp=10000;g.player.turretVolley=2;g.fireTurrets();near(g.player.turretClock,.25);assert.equal(g.player.turretVolley,2);assert.equal(g.effects.length,0);near(e.hp,10000);e.y=g.player.y+490;g.fireTurrets();assert.equal(g.player.turretVolley,0);near(g.player.turretClock,2.1);assert.ok(e.hp<10000);assert.equal(g.effects.filter(e=>e.kind==='turretLaser').length,2);
});

test('Cataclysm calibration shortens only the three new weapon cooldowns at every rank and composes once with fusion and catalysts',()=>{
  for(const [level,bonus]of [[1,.06],[2,.1],[3,.15]]){const g=new Game({equipment:{cataclysm:{id:'cataclysm',level}}});for(const id of ['meteor','ion','turret','power'])own(g,id,4);const basic=g.player.fireRate;for(let i=0;i<5;i++)g.recompute();near(g.player.meteorInterval,1.8*(1-bonus));near(g.player.ionInterval,1.6*(1-bonus));near(g.player.turretInterval,.9*(1-bonus));near(g.player.fireRate,basic);g.advanceSkill('ionCitadel');g.equipCatalyst('refractor');near(g.player.turretInterval,.9*(1-bonus)*1.15);near(g.player.turretMultiplier,7.5*.85);const C=require('../dist/core.js'),h=C.importRunSave(C.exportRunSave(g)).game;near(h.player.turretInterval,g.player.turretInterval);h.resume();h.pause();const clocks=JSON.stringify(h.player);h.step(.1);assert.equal(JSON.stringify(h.player),clocks);}
});
test('Slayer badge boosts boss damage only, records actual post-protection damage and never overcounts a lethal hit',()=>{
  for(const [level,bonus]of [[1,.08],[2,.12],[3,.18]]){const g=new Game({campaignLevel:10,equipment:{slayer:{id:'slayer',level}}});g.upgrades=10;const b=g.spawnBoss(1),e=g.createEnemy('tank',500,300);near(g.hurt(e,20,{source:'meteor'}),20);near(g.hurt(b,100,{source:'meteor'}),100*(1+bonus));g.spawnPylons(3);near(g.hurt(b,100,{source:'ion'}),100*(1+bonus)*.55);b.hp=1;near(g.hurt(b,10000,{source:'turret'}),1);assert.equal(g.state,'lottery');near(g.report().bossDamage,100*(1+bonus)*1.55+1);near(g.report().totalDamage,g.report().bossDamage+20);}
});
test('Rebirth protects one lethal outcome per run, saves the spent charge and cannot be refilled by healing, upgrading or recomputation',()=>{
  const C=require('../dist/core.js');for(const [level,ratio]of [[1,.3],[2,.45],[3,.6]]){const g=new Game({equipment:{rebirth:{id:'rebirth',level}}});assert.equal(g.player.revivalCharges,1);g.damagePlayer(999,'bossContact');assert.equal(g.state,'playing');near(g.player.hp,100*ratio);near(g.player.invuln,1.5);assert.equal(g.player.revivalCharges,0);assert.equal(g.report().revivals,1);assert.equal(g.stats.death,null);near(g.report().damageTaken,100);assert.ok(g.takeEvents().some(e=>e.type==='revived'));for(let i=0;i<4;i++)g.recompute();own(g,'heal',4);assert.equal(g.player.revivalCharges,0);const h=C.importRunSave(C.exportRunSave(g)).game;h.resume();assert.equal(h.player.revivalCharges,0);assert.equal(h.player.revivalUsed,1);assert.equal(h.damagePlayer(999,'bossContact'),false);h.player.invuln=0;h.damagePlayer(999,'bossContact');assert.equal(h.state,'ended');assert.equal(h.won,false);assert.equal(h.report().revivals,1);}
  const g=new Game({equipment:{rebirth:{id:'rebirth',level:3},hull:{id:'hull',level:3}}});own(g,'heal',4);own(g,'shield',1);g.player.shieldCharges=1;assert.equal(g.damagePlayer(999),false);assert.equal(g.player.revivalCharges,1);assert.equal(g.damagePlayer(999),false);g.player.invuln=0;g.player.ghostActive=true;assert.equal(g.damagePlayer(999),false);g.player.ghostActive=false;g.damagePlayer(999);near(g.player.hp,224*.6);assert.equal(g.player.revivalUsed,1);
});
test('Old nine-item workshop profiles migrate new ranks to zero while twelve distinct items retain unlimited equip and safe revival imports',()=>{
  const C=require('../dist/core.js');for(const schema of [1,2]){const old=C.createEquipmentProfile();old.shards=71;old.levels.ember=2;old.equipped=schema===1?{core:'ember',shell:null,boots:null}:['ember'];old.schema=schema;for(const id of ['cataclysm','slayer','rebirth'])delete old.levels[id];const p=C.validateEquipmentProfile(old);assert.equal(p.shards,71);assert.equal(p.levels.ember,2);assert.equal(p.levels.rebirth,0);assert.equal(p.levels.cataclysm,0);assert.equal(p.levels.slayer,0);assert.deepEqual(p.equipped,['ember']);delete old.levels.focus;assert.throws(()=>C.validateEquipmentProfile(old));}
  let p=C.createEquipmentProfile();p.shards=384;for(const e of C.EQUIPMENT){for(let i=0;i<3;i++)p=C.upgradeEquipment(p,e.id);p=C.equipEquipment(p,e.id);}assert.equal(p.shards,0);assert.equal(p.equipped.length,12);const g=new Game({equipment:C.equipmentLoadout(p)});assert.equal(Object.keys(g.equipment).length,12);assert.equal(g.player.revivalCharges,1);const text=C.exportRunSave(g,1,p);for(const mutate of [d=>d.player.revivalCharges=2,d=>d.player.revivalUsed=1,d=>d.player.revivalCharges=-1,d=>d.player.revivalUsed='0',d=>{delete d.equipment.rebirth;}]){const raw=JSON.parse(text);mutate(raw.data);assert.throws(()=>C.importRunSave(JSON.stringify(raw)));}
  const old=JSON.parse(C.exportRunSave(new Game()));for(const key of ['bossDamageBonus','revivalHeal','revivalCharges','revivalUsed'])delete old.data.player[key];const h=C.importRunSave(JSON.stringify(old)).game;assert.equal(h.player.revivalCharges,0);assert.equal(h.report().revivals,0);const noRefill=JSON.parse(text);for(const key of ['bossDamageBonus','revivalHeal','revivalCharges','revivalUsed'])delete noRefill.data.player[key];assert.equal(C.importRunSave(JSON.stringify(noRefill)).game.player.revivalCharges,0);
});

test('Boss move guide covers every real intent in all ten campaigns, three stages and normal or enraged rotations',()=>{
  const C=require('../dist/core.js'),seen=new Set();for(const campaign of CAMPAIGN_LEVELS)for(const stage of [1,2,3])for(const enraged of [false,true]){const g=new Game({campaignLevel:campaign.id,random:()=>.5}),b=g.spawnBoss(stage);if(enraged)b.hp=b.maxHp*.4;for(let i=0;i<10;i++){b.intent=null;b.dashRemaining=0;b.attackClock=0;g.updateBossAttack(.01);const kind=b.intent.kind,move=C.BOSS_ATTACK_GUIDE[kind];assert.ok(move,`${campaign.id}/${stage}/${kind} has no guide`);for(const key of ['name','hint','description'])assert.equal(typeof move[key],'string');assert.ok(move.hint.length>=8);seen.add(kind);}}
  assert.deepEqual([...seen].sort(),Object.keys(C.BOSS_ATTACK_GUIDE).sort());assert.equal(seen.size,17);
});

test('Rocket tiers deliver strong snapshotted explosions and one delayed sixty-percent breakthrough cluster without friendly damage',()=>{
  const C=require('../dist/core.js');for(const [level,shots,interval,radius,mult]of [[1,1,3,70,4],[2,2,2.4,85,5],[3,3,1.8,100,6],[4,5,1.2,130,8]]){const g=quiet();own(g,'rocket',level);const e=g.createEnemy('tank',g.player.x+35,g.player.y);e.hp=e.maxHp=100000;near(g.player.rocketInterval,interval);assert.equal(g.player.rocketShots,shots);near(g.player.rocketRadius,radius);g.fireRockets();assert.equal(g.rockets.length,shots);own(g,'power',1);g.updateRockets(.1);near(e.maxHp-e.hp,shots*18*mult);near(g.player.hp,100);assert.equal(g.report().damage[0].id,'rocket');if(level===4){assert.ok(g.rockets.every(r=>r.phase===1));g.updateRockets(.14);near(e.maxHp-e.hp,shots*18*mult);const h=C.importRunSave(C.exportRunSave(g)).game;h.resume();h.updateRockets(.01);near(h.enemies[0].maxHp-h.enemies[0].hp,shots*18*mult*1.6);assert.equal(h.rockets.length,0);h.updateRockets(.1);near(h.enemies[0].maxHp-h.enemies[0].hp,shots*18*mult*1.6);}else assert.equal(g.rockets.length,0);}
});
test('Rockets aim at the boss but explode at the first swept collision, retarget dead enemies and remain bounded and frozen on pause',()=>{
  const g=quiet();own(g,'rocket',1);g.upgrades=10;const boss=g.spawnBoss(1);boss.x=g.player.x+300;boss.y=g.player.y;const far=g.createEnemy('tank',g.player.x+90,g.player.y),nearby=g.createEnemy('tank',g.player.x+35,g.player.y);g.fireRockets();assert.equal(g.rockets[0].targetId,boss.id);g.updateRockets(.1);near(boss.hp,boss.maxHp);assert.ok(nearby.hp<nearby.maxHp);assert.ok(far.hp<far.maxHp);assert.equal(g.rockets.length,0);
  const h=quiet();own(h,'rocket',4);const target=h.createEnemy('tank',800,320);target.hp=target.maxHp=100000;h.fireRockets();target.dead=true;target.hp=0;const next=h.createEnemy('tank',850,500);next.hp=next.maxHp=100000;for(let i=0;i<10;i++)h.updateRockets(.01);assert.equal(h.rockets[0].targetId,next.id);assert.ok(h.rockets.every(r=>r.trail.length<=8));for(let i=0;i<20;i++)h.fireRockets();assert.equal(h.rockets.length,20);h.pause();const frozen=JSON.stringify(h);h.step(.1);assert.equal(JSON.stringify(h),frozen);h.resume();for(const e of h.enemies){e.dead=true;e.hp=0;}h.updateRockets(3);assert.equal(h.rockets.length,0);
});
test('Lethal boss rocket impact saves its already-advanced phase and resumes only the pending cluster after the lottery',()=>{
  const C=require('../dist/core.js'),g=quiet();own(g,'rocket',4);g.upgrades=10;const boss=g.spawnBoss(1);boss.x=g.player.x+35;boss.y=g.player.y;boss.hp=1;const e=g.createEnemy('tank',g.player.x+60,g.player.y);e.hp=e.maxHp=100000;g.fireRockets();const first=g.rockets[0];g.updateRockets(.1);assert.equal(g.state,'lottery');assert.equal(first.phase,1);near(e.hp,e.maxHp);g.rockets=[first];const h=C.importRunSave(C.exportRunSave(g)).game;h.acknowledgeLottery();h.updateRockets(.15);const minor=h.enemies.find(e=>e.type==='tank');near(minor.maxHp-minor.hp,144*.6);assert.equal(h.rockets.length,0);near(h.report().damage.find(row=>row.id==='rocket').damage,1+144*.6);
});
test('Sky hunter merges rocket and drone breakthroughs with the usual damage cost and warheads keep old projectile snapshots intact',()=>{
  const C=require('../dist/core.js'),g=quiet();own(g,'rocket',4);own(g,'drone',4);const drone=g.player.droneDamageMultiplier,e=g.createEnemy('tank',600,320);e.hp=e.maxHp=100000;g.fireRockets();const old=g.rockets[0];g.advanceSkill('skyHunter');assert.deepEqual(g.owned,['skyHunter']);near(g.player.rocketMultiplier,8*.85);near(g.player.droneDamageMultiplier,drone*.85);g.equipCatalyst('warhead');assert.equal(g.player.rocketShots,7);near(g.player.rocketRadius,110.5);near(old.damage,144);near(old.blast,130);g.fireRockets();near(g.rockets.at(-1).damage,144*.85);near(g.rockets.at(-1).blast,110.5);const h=C.importRunSave(C.exportRunSave(g)).game;assert.equal(h.level('rocket'),4);assert.equal(h.level('drone'),4);assert.equal(h.catalyst,'warhead');for(let i=0;i<5;i++)h.recompute();near(h.player.rocketMultiplier,8*.85);near(h.player.droneDamageMultiplier,drone*.85);assert.equal(h.player.rocketShots,7);h.equipCatalyst('pressure');assert.equal(h.player.rocketShots,5);near(h.rockets.at(-1).blast,110.5);
});
test('Rocket save validation bounds phases, trajectories and counts while older saves receive empty actors and harmless defaults',()=>{
  const C=require('../dist/core.js'),g=quiet();own(g,'rocket',4);g.createEnemy('tank',600,320);g.fireRockets();g.updateRockets(.02);const text=C.exportRunSave(g);for(const mutate of [d=>d.rockets[0].phase=3,d=>d.rockets[0].blast=999,d=>d.rockets[0].life=4,d=>d.rockets[0].vx=10000,d=>d.rockets[0].targetId=-1,d=>d.rockets[0].delay=.2,d=>d.rockets[0].trail=Array(9).fill({x:1,y:1}),d=>delete d.rockets[0].trail[0].x,d=>d.rockets=Array(21).fill(d.rockets[0]),d=>{d.rockets[0].phase=1;d.rockets[0].echo=false;}]){const raw=JSON.parse(text);mutate(raw.data);assert.throws(()=>C.importRunSave(JSON.stringify(raw)));}
  const old=JSON.parse(C.exportRunSave(quiet()));delete old.data.rockets;for(const key of ['rocketClock','rocketInterval','rocketShots','rocketRadius','rocketMultiplier'])delete old.data.player[key];delete old.data.stats.damage.rocket;const h=C.importRunSave(JSON.stringify(old)).game;assert.equal(h.rockets.length,0);assert.equal(h.player.rocketShots,0);assert.equal(h.level('rocket'),0);assert.deepEqual(h.stats.damage.rocket,{damage:0,bossDamage:0});
});

test('Menders are absent through the second boss gate, have an exact four-percent late replacement and enforce living three/five caps',()=>{
  for(const upgrades of [0,10,19,20]){const g=new Game({random:()=>0});g.upgrades=upgrades;g.bossesDefeated=[1];for(let i=0;i<20;i++)g.spawnEnemy();assert.equal(g.enemies.some(e=>e.type==='mender'),false);assert.equal(g.menderCap(),0);}
  for(const [upgrades,cap]of [[20,3],[29,3],[30,5],[39,5]]){const g=new Game({random:()=>0});g.upgrades=upgrades;g.bossesDefeated=[1,2];for(let i=0;i<70;i++)g.spawnEnemy();assert.equal(g.enemies.filter(e=>!e.dead&&e.type==='mender').length,cap);assert.equal(g.menderCap(),cap);const first=g.enemies.find(e=>e.type==='mender');first.x=-10000;g.spawnEnemy();assert.equal(g.enemies.filter(e=>!e.dead&&e.type==='mender').length,cap);g.kill(first);g.spawnEnemy();assert.equal(g.enemies.filter(e=>!e.dead&&e.type==='mender').length,cap);}
  for(const [roll,expected]of [[.039999,true],[.04,false]]){const g=new Game({random:()=>roll});g.upgrades=21;g.bossesDefeated=[1,2];g.spawnEnemy();assert.equal(g.enemies[0].type==='mender',expected);}const practice=createPracticeGame({stage:3});practice.random=()=>0;practice.spawnEnemy();assert.equal(practice.enemies.some(e=>e.type==='mender'),false);
});
test('Menders telegraph, freeze during stun and heal at most six wounded small enemies without repairing bosses, columns or other menders',()=>{
  const g=new Game({campaignLevel:10,random:()=>.5});g.upgrades=21;g.bossesDefeated=[1,2];const healer=g.createEnemy('mender',400,300);healer.menderClock=0;healer.hp=10;const targets=[];for(let i=0;i<8;i++){const e=g.createEnemy('tank',410+i*8,300);e.maxHp=1000;e.hp=100+i;targets.push(e);}const boss=g.spawnBoss(3);boss.x=420;boss.y=300;boss.hp=100;const column=g.createEnemy('pylon',430,300);column.hp=10;const other=g.createEnemy('mender',440,300);other.hp=10;const outside=g.createEnemy('tank',600,300);outside.hp=1;
  g.moveEnemy(healer,.01,[]);assert.equal(healer.menderIntent.remaining,.9);const before=targets.map(e=>e.hp);healer.stun=1;g.moveEnemy(healer,.5,[]);near(healer.menderIntent.remaining,.9);g.moveEnemy(healer,.5,[]);near(healer.menderIntent.remaining,.9);g.moveEnemy(healer,.89,[]);assert.deepEqual(targets.map(e=>e.hp),before);g.moveEnemy(healer,.01,[]);assert.equal(healer.menderIntent,null);near(healer.menderClock,5);for(let i=0;i<8;i++)near(targets[i].hp,before[i]+(i<6?45:0));near(boss.hp,100);near(column.hp,10);near(other.hp,10);near(healer.hp,10);near(outside.hp,1);assert.equal(g.takeEvents().filter(e=>e.type==='enemyHeal').length,6);near(g.report().totalDamage,0);
  const h=quiet(),m=h.createEnemy('mender',400,300),e=h.createEnemy('blob',410,300);e.hp=e.maxHp-1;m.menderClock=0;h.moveEnemy(m,.01,[]);h.moveEnemy(m,.9,[]);near(e.hp,e.maxHp);assert.equal(h.menderTargets(m).length,0);h.hurt(e,5);h.hurt(m,9999);h.step(.1);near(e.hp,e.maxHp-5);
});
test('Mender channel and healing cooldown preserve exact save timing, and damaged channel files are rejected without relaxing old enemy validation',()=>{
  const C=require('../dist/core.js'),g=quiet(),m=g.createEnemy('mender',400,300),e=g.createEnemy('tank',430,300);e.hp=10;m.menderClock=0;g.moveEnemy(m,.01,[]);g.moveEnemy(m,.4,[]);const text=C.exportRunSave(g),h=C.importRunSave(text).game;h.resume();const restored=h.enemies.find(e=>e.type==='mender'),ally=h.enemies.find(e=>e.type==='tank');near(restored.menderIntent.remaining,.5);h.moveEnemy(restored,.49,[]);near(ally.hp,10);h.moveEnemy(restored,.01,[]);near(ally.hp,10+ally.maxHp*.15);near(restored.menderClock,5);for(const mutate of [d=>delete d.enemies[0].menderClock,d=>d.enemies[0].menderClock=6,d=>d.enemies[0].menderIntent.radius=999,d=>d.enemies[0].menderIntent.remaining=1,d=>d.enemies[0].menderIntent.total=1]){const raw=JSON.parse(text);mutate(raw.data);assert.throws(()=>C.importRunSave(JSON.stringify(raw)));}
  const capped=quiet();for(let i=0;i<6;i++)capped.createEnemy('mender',400+i*5,300);capped.useItem({type:'bomb',x:400,y:300});assert.equal(capped.enemies.some(e=>!e.dead&&e.type==='mender'),false);
});

test('Visible edge deaths place every new pickup inside walkable bounds without extra random rolls or altered drop rates',()=>{
  for(const [x,y]of [[0,0],[960,0],[0,640],[960,640],[480,640]]){
    let rolls=0;const g=quiet(()=>{rolls++;return 0;}),p=g.player,e=g.createEnemy('blob',x,y);e.energy=2;rolls=0;g.kill(e);assert.equal(rolls,9);assert.equal(g.gems.length,2);assert.equal(g.items[0].type,'bomb');near(p.magnet,80);
    for(const drop of [...g.gems,...g.items]){assert.ok(drop.x>=p.r+8&&drop.x<=g.width-p.r-8);assert.ok(drop.y>=p.r+56&&drop.y<=g.height-p.r-50);}
  }
});

test('Bomb, magnet and pill at each legacy edge are collectable without upgrading pickup range, while central items still require contact',()=>{
  for(const type of ['bomb','magnet','pill'])for(const [x,y]of [[480,640],[0,320],[960,320],[480,0],[960,640],[0,640]]){
    const g=quiet(),p=g.player;p.x=Math.max(p.r+8,Math.min(g.width-p.r-8,x));p.y=Math.max(p.r+56,Math.min(g.height-p.r-50,y));p.hp=60;
    g.items=[{id:1,type,x,y,r:6,life:30,dead:false}];g.seq=1;g.step(.01);assert.equal(g.items.length,0,`${type} at ${x},${y}`);near(p.magnet,80);if(type==='pill')near(p.hp,80);assert.ok(g.takeEvents().some(e=>e.type===type));
  }
  const g=quiet(),item={type:'pill',x:g.player.x+30,y:g.player.y,r:6,life:30,dead:false};g.items=[item];g.step(.01);assert.equal(g.items[0],item);near(item.x,g.player.x+30);near(g.player.hp,100);item.life=.001;item.x=g.player.x;g.step(.01);assert.equal(g.items.length,0);assert.ok(!g.takeEvents().some(e=>e.type==='pill'));
});

test('Unattracted edge energy cannot drift out of reach and distant off-screen loot is not pulled into view',()=>{
  const g=quiet(),p=g.player;p.x=g.width-p.r-8;p.y=g.height-p.r-50;
  const gem={id:1,x:g.width+8,y:g.height+8,r:4,value:1,vx:40,vy:40,magnetized:false,dead:false};g.gems=[gem];g.updateGems(.04);assert.equal(g.gems.length,0);near(p.xp,1);near(p.magnet,80);
  p.x=480;p.y=320;const idle={...gem,dead:false,attracted:false,x:950,y:630};g.gems=[idle];for(let i=0;i<30;i++)g.updateGems(.1);assert.ok(idle.x<=g.width-p.r-8&&idle.y<=g.height-p.r-50);assert.equal(idle.attracted,false);
  const far={...idle,x:g.width+200,y:g.height+200,vx:0,vy:0};g.gems=[far];g.updateGems(.1);near(far.x,g.width+200);near(far.y,g.height+200);
});

test('Legacy saved edge pickups stay frozen while paused and become reachable after restoring at a smaller viewport',()=>{
  const C=require('../dist/core.js'),g=quiet();g.seq=2;g.items=[{id:1,type:'pill',x:960,y:640,r:6,life:30,dead:false}];g.gems=[{id:2,x:968,y:648,r:4,value:1,vx:0,vy:0,magnetized:false,dead:false}];g.pause();const saved=C.exportRunSave(g),h=C.importRunSave(saved).game,before=JSON.stringify(h);h.step(.1);assert.equal(JSON.stringify(h),before);
  h.width=480;h.height=320;h.items[0].x*=.5;h.items[0].y*=.5;h.gems[0].x*=.5;h.gems[0].y*=.5;h.resume();h.spawnClock=h.player.fireClock=1e9;h.player.x=480-h.player.r-8;h.player.y=320-h.player.r-50;h.player.hp=60;h.step(.04);near(h.player.hp,80);near(h.player.xp,1);assert.equal(h.items.length,0);assert.equal(h.gems.length,0);
});

console.log(`\n${passed} gameplay checks passed.`);
