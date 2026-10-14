const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const base=path.resolve(__dirname,'../dist');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const code=fs.readFileSync(path.join(base,'game.js'),'utf8');
const NeonCore=require('../dist/core.js');
const {BY_CATALYST}=NeonCore;
let passed=0;
function test(name,fn){fn();passed++;console.log(`PASS ${name}`);}

// This deliberately stays a DOM/Canvas smoke test, not a real browser or visual QA.
function launch({offline=false,deniedStorage=false,readDenied=false,writeDenied=false,removeDenied=false,reducedMotion=false,savedEffects=null,storage=new Map()}={}){
  const nodes=new Map(),callbacks=[],listeners={},documentListeners={},drawCalls=[],storageCalls=[],games=[];
  if(savedEffects!==null)storage.set('neonEffects',savedEffects);
  // Track normal file:// instances privately, without adding a runtime QA API.
  class TrackedGame extends NeonCore.Game{constructor(options){super(options);games.push(this);}}
  function element(id='',attributes={}){
    const classes=new Set((attributes.class||'').split(/\s+/).filter(Boolean)),children=[];
    const item={id,style:{},dataset:{},disabled:false,inert:false,value:'',textContent:'',attributes:{...attributes},
      classList:{toggle(name,force){const enabled=force===undefined?!classes.has(name):force;if(enabled)classes.add(name);else classes.delete(name);return enabled;},add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name)),contains:name=>classes.has(name)},
      setAttribute(name,value){this.attributes[name]=String(value);},getAttribute(name){return this.attributes[name]??null;},
      addEventListener(name,fn){(this.listeners||(this.listeners={}))[name]=fn;},focus(){this.focused=true;},
      querySelectorAll(selector){return selector==='button'?children:children.filter(child=>child.classList.contains(selector.replace(/^\./,'')));},
      querySelector(selector){return this.querySelectorAll(selector)[0]||null;},children};
    for(const [name,value] of Object.entries(attributes))if(name.startsWith('data-'))item.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=value;
    let markup='';Object.defineProperty(item,'innerHTML',{get:()=>markup,set(value){markup=String(value);children.length=0;for(const match of markup.matchAll(/<button\b([^>]*)>/g)){const attrs={};for(const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g))attrs[attr[1]]=attr[2];children.push(element('',attrs));}}});
    Object.defineProperty(item,'firstElementChild',{get:()=>children[0]||{style:{}}});return item;
  }
  const node=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);};
  let drawDepth=0;
  const context2d=new Proxy({},{get(target,key){if(key in target)return target[key];return target[key]=(...args)=>{
    if(key==='save')drawDepth++;drawCalls.push({method:key,args,depth:drawDepth,...(key==='stroke'||key==='fill'?{color:key==='stroke'?target.strokeStyle:target.fillStyle,lineWidth:target.lineWidth}: {})});if(key==='restore')drawDepth--;
    if(['moveTo','lineTo','translate','rotate','arc','ellipse','fillRect','strokeRect','clearRect'].includes(key)){
      for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value),`${key} received nonfinite coordinate`);
      if(key==='arc')assert.ok(args[2]>=0,'arc received negative radius');
    }
  };}});
  context2d.createRadialGradient=(...args)=>{drawCalls.push({method:'createRadialGradient',args});return {addColorStop(){}};};
  context2d.createLinearGradient=()=>({addColorStop(){}});
  const canvas=node('game');canvas.getContext=()=>context2d;canvas.setPointerCapture=()=>{};
  const sandbox={NeonCore:{...NeonCore,Game:TrackedGame,createPracticeGame:options=>{const g=NeonCore.createPracticeGame(options);games.push(g);return g;}},document:{querySelector:selector=>node(selector.slice(1)),addEventListener:(name,fn)=>{documentListeners[name]=fn;},modelContext:null,hidden:false},
    innerWidth:960,innerHeight:640,devicePixelRatio:1,matchMedia:()=>({matches:reducedMotion}),
    location:offline?{hostname:'',search:'',protocol:'file:'}:{hostname:'127.0.0.1',search:'?qa=1',protocol:'http:'},URLSearchParams,
    localStorage:{getItem(key){storageCalls.push({method:'get',key});if(deniedStorage||readDenied)throw new Error('Storage read unavailable');return storage.get(key)??null;},setItem(key,value){storageCalls.push({method:'set',key,value:String(value)});if(deniedStorage||writeDenied)throw new Error('Storage write unavailable');storage.set(key,String(value));},removeItem(key){storageCalls.push({method:'remove',key});if(deniedStorage||removeDenied)throw new Error('Storage remove unavailable');storage.delete(key);},clear(){assert.fail('Feature must not clear unrelated localStorage keys');}},
    addEventListener:(name,fn)=>{listeners[name]=fn;},requestAnimationFrame:fn=>callbacks.push(fn),setTimeout:fn=>{fn();return 1;},clearTimeout(){},
    Math,console,performance:{now:()=>0},window:null};
  sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(code,sandbox,{filename:offline?'offline-game.js':'game.js'});
  let tick=0;const frame=(advance=16)=>{tick+=advance;const callback=callbacks.shift();assert.equal(typeof callback,'function');callback(tick);};
  const key=(code,repeat=false,target)=>listeners.keydown({code,repeat,target,preventDefault(){}});
  const change=(id,value)=>{const target=node(id);target.value=value;assert.equal(typeof target.onchange,'function');target.onchange({target,currentTarget:target});};
  return{sandbox,node,nodes,listeners,documentListeners,callbacks,drawCalls,storage,storageCalls,games,frame,key,change,qa:sandbox.neonQA};
}

test('Every direct and dynamic UI ID exists and v39 entry loads only current scripts',()=>{
  const ids=[...new Set([...code.matchAll(/\$\('#([^']+)'\)/g)].map(match=>match[1]))];
  for(const id of [...ids,'effectsStart','effectsPause','effectsStartNote','effectsPauseNote'])assert.match(html,new RegExp(`id="${id}"`),`Missing page element #${id}`);
  assert.match(html,/src="\.\/core\.js\?v=39"/);assert.match(html,/src="\.\/game\.js\?v=39"/);assert.match(html,/href="\.\/style\.css\?v=39"/);assert.doesNotMatch(html,/src="\.\/app\.js/);
});
test('Menu, start, upgrade, focusable card buttons and pause/resume initialize correctly',()=>{
  const view=launch();assert.equal(view.qa.snapshot().state,'menu');view.node('startBtn').onclick();assert.equal(view.qa.snapshot().state,'playing');
  assert.equal(view.qa.snapshot().level,0);assert.equal(view.qa.snapshot().wave,1);assert.equal(String(view.node('level').textContent),'0');assert.equal(view.node('progressText').textContent,'0 / 40');
  view.qa.grantEnergy(8);view.frame();assert.equal(view.qa.snapshot().state,'upgrade');assert.ok(view.node('upgradeGrid').innerHTML.includes('upgrade-card'));
  const first=view.node('upgradeGrid').querySelector('button');assert.equal(typeof first.onclick,'function');assert.equal(first.focused,true);first.onclick();
  assert.equal(view.qa.snapshot().upgrades,1);assert.equal(view.qa.snapshot().state,'playing');view.node('pauseBtn').onclick();assert.equal(view.qa.snapshot().state,'paused');view.node('resumeBtn').onclick();assert.equal(view.qa.snapshot().state,'playing');
});
test('Build shows eight slots and shooting synergy previews before acquiring the missing partner',()=>{
  const view=launch();view.qa.start();view.qa.installSkill('power',1);const g=view.qa.getGame();g.options=['rate','crit','frost'];g.state='upgrade';g.revision++;view.frame();
  assert.ok(view.node('upgradeGrid').innerHTML.includes('贯穿齐射'));assert.ok(view.node('upgradeGrid').innerHTML.includes('preview-activate'));
  assert.ok(view.node('upgradeGrid').innerHTML.includes('不稳定晶格'));view.qa.choose(0);assert.ok(view.node('synergyList').innerHTML.includes('贯穿齐射'));
  assert.equal((view.node('buildList').innerHTML.match(/class="build-item/g)||[]).length,8);assert.equal(view.node('slotCount').textContent,'2 / 8');
});
test('Reroll button and R key update cards, but held R and nonupgrade states cannot spend rerolls',()=>{
  const view=launch();view.qa.start();const g=view.qa.getGame();view.qa.grantEnergy(8);view.frame();const xp=g.player.xp;
  view.key('KeyR',true);assert.equal(g.rerollsRemaining,2);view.key('KeyR');assert.equal(g.rerollsRemaining,1);assert.equal(g.player.xp,xp);
  view.node('rerollBtn').onclick();assert.equal(g.rerollsRemaining,0);assert.equal(view.node('rerollBtn').disabled,true);
  view.qa.choose(0);view.key('KeyR');assert.equal(g.rerollsRemaining,0);view.node('pauseBtn').onclick();view.key('KeyR');assert.equal(g.state,'paused');
});
test('Form fields do not trigger pause, reroll or numeric selection shortcuts',()=>{
  for(const target of [{tagName:'SELECT'},{tagName:'INPUT'},{tagName:'TEXTAREA'},{tagName:'DIV',isContentEditable:true}]){
    const view=launch();view.qa.start();view.key('KeyP',false,target);assert.equal(view.qa.snapshot().state,'playing');view.qa.grantEnergy(8);view.frame();const g=view.qa.getGame();
    view.key('KeyR',false,target);assert.equal(g.rerollsRemaining,2);view.key('Digit1',false,target);assert.equal(g.state,'upgrade');assert.equal(g.upgrades,0);
  }
});
test('Catalyst choice, overflow card refresh and held digit rejection preserve the original flow',()=>{
  const view=launch();view.qa.start();view.qa.installSkill('aura',1);view.qa.installSkill('lightning',1);const g=view.qa.getGame();g.upgrades=5;g.spawnClock=1e9;g.player.fireClock=1e9;
  view.qa.grantEnergy(g.nextXp+100);view.frame();view.qa.choose(0);assert.equal(g.state,'catalyst');assert.ok(view.node('catalystGrid').innerHTML.includes('catalyst-benefit'));assert.match(view.node('catalystSubtitle').textContent,/LV\.6/);
  const expected=BY_CATALYST[g.catalystOptions[0]].name;view.key('Digit1',true);assert.equal(g.state,'catalyst');view.key('Digit1');assert.ok(view.node('catalystSlot').innerHTML.includes(expected));
  assert.equal(g.state,'upgrade');assert.match(view.node('upgradeTitle').textContent,/第 7 波完成.*LV\.7/);view.qa.choose(0);assert.match(view.node('upgradeTitle').textContent,/第 8 波完成.*LV\.8/);
  g.player.xp=0;g.state='playing';g.upgrades=14;g.afterUpgrade();view.frame();view.node('catalystKeep').onclick();assert.equal(g.state,'playing');
  view.node('pauseBtn').onclick();assert.ok(view.node('pauseCatalystInfo').textContent.includes(expected));assert.ok(view.node('pauseBuildList').innerHTML.includes('腐蚀领域'));view.node('resumeBtn').onclick();
});
test('Effect presets synchronize menu/pause settings and storage without changing gameplay or consuming randomness',()=>{
  const view=launch();view.qa.start();const g=view.qa.getGame();let randomCalls=0;g.random=()=>{randomCalls++;return .5;};const before=JSON.stringify(g),snapshot=JSON.stringify(g.snapshot());
  for(const mode of ['clean','standard','spectacular']){view.qa.setEffects(mode);assert.equal(view.qa.effects().mode,mode);assert.equal(view.node('effectsStart').value,mode);assert.equal(view.node('effectsPause').value,mode);assert.equal(view.storage.get('neonEffects'),mode);assert.equal(JSON.stringify(g),before);assert.equal(JSON.stringify(g.snapshot()),snapshot);}
  assert.equal(randomCalls,0);assert.throws(()=>view.qa.setEffects('unknown'));assert.equal(view.qa.effects().mode,'spectacular');
  view.change('effectsStart','clean');assert.equal(view.qa.effects().mode,'clean');view.node('pauseBtn').onclick();view.change('effectsPause','spectacular');assert.equal(view.qa.effects().mode,'spectacular');assert.equal(g.state,'paused');
});
test('Stored effect mode restores while unknown stored values fall back to standard',()=>{
  assert.equal(launch({savedEffects:'clean'}).qa.effects().mode,'clean');assert.equal(launch({savedEffects:'invalid'}).qa.effects().mode,'standard');
});
test('Empty end report is readable and lists no damage rather than invalid percentages',()=>{
  const view=launch();view.qa.start();const g=view.qa.getGame();g.finish(true);view.frame();assert.equal(g.state,'ended');
  assert.equal(view.node('reportTotalDamage').textContent,'0');assert.equal(view.node('reportBossDamage').textContent,'0');assert.equal(view.node('reportDamageEmpty').classList.contains('hidden'),false);
  assert.doesNotMatch(view.node('reportDamageRows').innerHTML,/NaN|Infinity|undefined/);assert.ok(view.node('reportDeath').textContent);
  assert.equal((view.node('reportBosses').innerHTML.match(/未遭遇/g)||[]).length,3);assert.doesNotMatch(view.node('reportBosses').innerHTML,/剩余|NaN|Infinity/);
});
test('End report renders effective damage, separate boss damage, time and recent death reason',()=>{
  const view=launch();view.qa.start();const g=view.qa.getGame();g.random=()=>.2;g.spawnBoss(1);g.time=2;g.hurt(g.boss,1500,{source:'rail'});g.acknowledgeLottery();
  g.hurt(g.createEnemy('blob',100,100),999,{source:'frost'});g.time=3;g.damagePlayer(12,'blob');g.player.invuln=0;g.time=4;g.damagePlayer(999,'bossCone');view.frame();
  assert.equal(g.state,'ended');assert.match(view.node('reportTotalDamage').textContent,/1.?242/);assert.match(view.node('reportBossDamage').textContent,/1.?200/);
  assert.ok(view.node('reportDamageRows').innerHTML.includes('贯穿'));assert.ok(view.node('reportDamageRows').innerHTML.includes('霜'));assert.ok(view.node('reportBosses').innerHTML.includes('00:02'));
  assert.ok(view.node('reportDeath').textContent.includes('扇形')||view.node('reportDeath').textContent.includes('冲击'));assert.ok(view.node('reportRecentHits').innerHTML.includes('12'));
  assert.doesNotMatch(view.node('reportDamageRows').innerHTML,/NaN|Infinity|undefined/);
});
test('Every offensive skill, homing bullet and equipped shield render in each mode without invalid Canvas coordinates',()=>{
  for(const mode of ['clean','standard','spectacular']){
    const view=launch();view.qa.start();view.qa.setEffects(mode);const g=view.qa.getGame();g.spawnClock=1e9;g.player.fireClock=1e9;
    for(const id of ['rate','power','crit','lightning','mine','frost','drone','well'])view.qa.installSkill(id,4);
    const enemy=g.createEnemy('tank',g.player.x+120,g.player.y);enemy.hp=enemy.maxHp=1e6;g.shoot();g.lightning();g.frostPulse();g.fireDrones();g.spawnWell();g.layMine();g.detonateMine(g.mines[0],true);
    view.frame();view.frame(60);assert.ok(view.drawCalls.length>0);assert.ok(g.effects.every(effect=>Number.isFinite(effect.x)&&Number.isFinite(effect.y)&&Number.isFinite(effect.r)));
    const shieldView=launch();shieldView.qa.start();shieldView.qa.installSkill('shield',4);shieldView.qa.installSkill('orbit',4);shieldView.frame();assert.ok(shieldView.drawCalls.length>0);
  }
});
test('Reduced-motion mode renders stronger skills safely and suppresses nonzero camera shake',()=>{
  const view=launch({reducedMotion:true});view.qa.start();view.qa.setEffects('spectacular');assert.equal(view.qa.effects().reducedMotion,true);const g=view.qa.getGame();
  for(const id of ['rate','power','crit','lightning','mine','frost','drone','well'])view.qa.installSkill(id,4);
  const enemy=g.createEnemy('tank',g.player.x+100,g.player.y);enemy.hp=enemy.maxHp=1e6;
  g.lightning();g.frostPulse();g.fireDrones();g.spawnWell();g.layMine();g.detonateMine(g.mines[0],true);for(let i=0;i<6;i++)g.shoot();for(let i=0;i<4;i++)g.recordCriticalHit();view.frame();
  const cameraMoves=view.drawCalls.filter(call=>call.method==='translate'&&call.depth===1);assert.ok(cameraMoves.every(call=>call.args[0]===0&&call.args[1]===0));
  assert.ok(!view.drawCalls.some(call=>call.method==='fillRect'&&call.args[0]===-25&&call.args[1]===-25&&call.args[2]===1010&&call.args[3]===690));
  const shield=launch({reducedMotion:true});shield.qa.start();shield.qa.installSkill('shield',4);shield.qa.getGame().damagePlayer(12,'blob');shield.frame();
});
test('Paused rendering freezes battle state and suppresses damage and skill full-screen flashes',()=>{
  const view=launch();view.qa.start();view.qa.setEffects('spectacular');const g=view.qa.getGame();view.qa.installSkill('lightning',1);g.createEnemy('tank',600,300);g.lightning();g.damagePlayer(12,'blob');view.frame();
  view.node('pauseBtn').onclick();const before=JSON.stringify(g);view.drawCalls.length=0;view.frame();view.frame();assert.equal(JSON.stringify(g),before);
  assert.ok(!view.drawCalls.some(call=>call.method==='translate'&&call.depth===1));
  assert.ok(!view.drawCalls.some(call=>call.method==='fillRect'&&call.args[0]===-25&&call.args[1]===-25&&call.args[2]===1010&&call.args[3]===690));
});
test('Page blur and hidden document pause gameplay, preserving the read-only report',()=>{
  const view=launch();view.qa.start();view.listeners.blur();assert.equal(view.qa.snapshot().state,'paused');view.node('resumeBtn').onclick();view.sandbox.document.hidden=true;view.documentListeners.visibilitychange();assert.equal(view.qa.snapshot().state,'paused');
});
test('file:// launch and denied storage support starting, changing presets, pausing and restarting with QA disabled',()=>{
  const view=launch({offline:true,deniedStorage:true});assert.equal(view.sandbox.neonQA,undefined);view.node('startBtn').onclick();
  assert.equal(view.node('progressText').textContent,'0 / 40');assert.equal(view.node('hpText').textContent,'100 / 100');view.change('effectsStart','clean');
  view.node('pauseBtn').onclick();view.change('effectsPause','spectacular');view.node('resumeBtn').onclick();view.node('restartBtn').onclick();
  assert.equal(view.node('progressText').textContent,'0 / 40');assert.equal(String(view.node('level').textContent),'0');assert.equal(view.sandbox.neonQA,undefined);
});
test('All runtime resources remain local and self-contained for offline distribution',()=>{
  const css=fs.readFileSync(path.join(base,'style.css'),'utf8');
  assert.doesNotMatch(html,/(?:src|href)="(?:https?:)?\/\//i);assert.doesNotMatch(css,/@import\s+|url\(\s*["']?(?:https?:)?\/\//i);
  for(const match of html.matchAll(/(?:src|href)="\.\/([^"?]+)(?:\?[^\"]*)?"/g))assert.ok(fs.existsSync(path.join(base,match[1])),`Missing offline resource ${match[1]}`);
});
test('Wave HUD renders forty steps, three boss gates and XP-driven level-zero progression',()=>{
  const view=launch();view.qa.start();assert.match(view.node('waveText').textContent,/第 1 \/ 40 波/);assert.match(view.node('chapterText').textContent,/第一幕/);
  assert.equal((view.node('waveProgress').innerHTML.match(/data-wave=/g)||[]).length,40);assert.equal((view.node('waveProgress').innerHTML.match(/boss-step/g)||[]).length,3);
  assert.match(view.node('waveProgress').innerHTML,/data-wave="1" class="current/);view.qa.grantEnergy(8);view.frame();view.qa.choose(0);
  assert.match(view.node('waveText').textContent,/第 2 \/ 40 波/);assert.equal(String(view.node('level').textContent),'1');assert.equal(view.node('progressText').textContent,'1 / 40');
  assert.match(view.node('waveProgress').innerHTML,/data-wave="1" class="done/);assert.match(view.node('waveProgress').innerHTML,/data-wave="2" class="current/);assert.match(view.node('waveNotice').textContent,/第 1 波完成.*LV\.1/);
  view.node('pauseBtn').onclick();assert.match(view.node('pauseProgress').textContent,/不按固定时间换波/);assert.match(view.node('pauseProgress').textContent,/10 \/ 20 \/ 30 秒/);
});
test('Full forty-wave UI keeps boss waves until reward acknowledgement and only the third reward ends the run',()=>{
  const view=launch();view.qa.start();const g=view.qa.getGame();g.random=()=>.2;g.spawnClock=1e9;g.player.fireClock=1e9;view.qa.grantEnergy(100000);view.frame();const catalysts=[];
  for(let stage=1;stage<=3;stage++){
    for(let upgrade=(stage-1)*10+1;upgrade<=NeonCore.BOSS_MILESTONES[stage-1].upgrade;upgrade++){
      assert.equal(g.state,'upgrade');assert.match(view.node('upgradeTitle').textContent,new RegExp(`LV\\.${upgrade}$`));view.qa.choose(0);
      if(g.state==='catalyst'){catalysts.push(g.upgrades);assert.match(view.node('catalystSubtitle').textContent,new RegExp(`LV\\.${upgrade} `));view.node('catalystKeep').onclick();}
    }
    assert.equal(g.state,'playing');assert.equal(String(view.node('level').textContent),String(NeonCore.BOSS_MILESTONES[stage-1].upgrade));assert.match(view.node('waveText').textContent,new RegExp(`第 ${NeonCore.BOSS_MILESTONES[stage-1].upgrade} / 40 波`));
    assert.ok(view.node('bossCountdown').textContent.includes(NeonCore.BOSS_MILESTONES[stage-1].name));assert.match(view.node('bossCountdown').textContent,new RegExp(`${stage*10} 秒`));
    const before=JSON.stringify(g);view.node('pauseBtn').onclick();const paused=JSON.stringify(g);view.frame();assert.equal(JSON.stringify(g),paused);view.node('resumeBtn').onclick();assert.equal(JSON.stringify(g),before);
    g.time=g.bossDue.at;g.step(.001);g.revision++;view.frame();assert.ok(view.node('bossTitle').textContent.includes(NeonCore.BOSS_MILESTONES[stage-1].name));assert.match(view.node('waveText').textContent,new RegExp(`第 ${NeonCore.BOSS_MILESTONES[stage-1].upgrade} / 40 波`));
    g.kill(g.boss);g.revision++;view.frame();assert.equal(g.state,'lottery');assert.ok(view.node('lotteryAt').textContent.includes(NeonCore.BOSS_MILESTONES[stage-1].name));assert.match(view.node('waveText').textContent,new RegExp(`第 ${NeonCore.BOSS_MILESTONES[stage-1].upgrade} / 40 波`));
    view.node('lotteryContinue').onclick();assert.equal(g.state,stage===3?'ended':'upgrade');if(stage<3)assert.match(view.node('waveText').textContent,new RegExp(`第 ${stage*10+1} / 40 波`));
  }
  assert.deepEqual(catalysts,[6,14,24]);assert.equal(String(view.node('level').textContent),'40');assert.equal(String(view.node('finalLevel').textContent),'40');assert.equal(view.node('finalWaves').textContent,'40 / 40');
  assert.ok(view.node('resultText').textContent.includes('三名首领'));for(const boss of NeonCore.BOSS_MILESTONES)assert.ok(view.node('reportBosses').innerHTML.includes(boss.name));
  assert.equal((view.node('reportBosses').innerHTML.match(/已击败/g)||[]).length,3);assert.doesNotMatch(view.node('resultText').textContent,/LV\.41/);
  assert.doesNotMatch(view.node('reportBosses').innerHTML,/剩余/);
});
test('Unbeaten boss report shows actual remaining health and handles invalid health denominators without fabricated percentages',()=>{
  const view=launch();view.qa.start();const g=view.qa.getGame();g.time=10;g.spawnBoss(3);g.time=12;g.hurt(g.boss,6800,{source:'bullet'});g.damagePlayer(999,'bossContact');view.frame();
  assert.equal(g.report().bosses[0].hp,1700);assert.match(view.node('reportBosses').innerHTML,/终末炼金核/);assert.match(view.node('reportBosses').innerHTML,/剩余 20\.0% 生命/);
  assert.match(view.node('reportBosses').innerHTML,/战斗 00:02/);assert.equal((view.node('reportBosses').innerHTML.match(/未遭遇/g)||[]).length,2);assert.equal((view.node('reportBosses').innerHTML.match(/boss-remaining/g)||[]).length,1);
  g.stats.bosses[0].maxHp=0;g.revision++;view.frame();assert.doesNotMatch(view.node('reportBosses').innerHTML,/剩余|NaN|Infinity|undefined/);assert.match(view.node('reportBosses').innerHTML,/战斗 00:02/);
});
test('Third boss ring warning preserves the 120 safe and 260 danger radii in every effect preset and reduced motion',()=>{
  for(const reducedMotion of [false,true])for(const mode of ['clean','standard','spectacular']){
    const view=launch({reducedMotion});view.qa.start();view.qa.setEffects(mode);const g=view.qa.getGame();g.spawnClock=1e9;g.player.fireClock=1e9;g.spawnBoss(3);g.boss.x=g.player.x-150;g.boss.y=g.player.y;
    g.boss.intent={kind:'shockwave',remaining:1.2,total:1.2,innerRadius:120,radius:260,angle:0};g.emit('explosion',{x:g.player.x,y:g.player.y,radius:100,color:'#ffbf65'});view.frame();
    assert.ok(view.drawCalls.some(call=>call.method==='arc'&&call.args[2]===120),`${mode}: inner ring`);assert.ok(view.drawCalls.some(call=>call.method==='arc'&&call.args[2]===260),`${mode}: outer ring`);
    assert.ok(view.drawCalls.some(call=>call.method==='fill'&&call.args[0]==='evenodd'),`${mode}: hollow warning ring`);assert.ok(view.drawCalls.some(call=>call.method==='fillText'&&String(call.args[0]).includes('内圈安全')));
    const flashIndex=view.drawCalls.findIndex(call=>call.method==='fillRect'&&call.args[0]===-25&&call.args[1]===-25&&call.args[2]===1010&&call.args[3]===690);
    const warningIndex=view.drawCalls.findIndex(call=>call.method==='fill'&&call.args[0]==='evenodd');if(flashIndex>=0)assert.ok(warningIndex>flashIndex,'warning must draw after full-screen flashes');
    g.boss.intent.remaining=0;g.updateBossAttack(.1);view.frame();assert.ok(g.effects.some(effect=>effect.kind==='bossShockwave'));assert.equal(g.player.hp,76);
  }
});
test('All nine recipe previews, activation labels and pause details use current dynamic metadata',()=>{
  assert.equal(NeonCore.SYNERGIES.length,9);
  for(const synergy of NeonCore.SYNERGIES){
    const view=launch();view.qa.start();const g=view.qa.getGame(),[first,second]=synergy.requires;g.options=[first];g.state='upgrade';g.revision++;view.frame();
    assert.ok(view.node('upgradeGrid').innerHTML.includes(synergy.name));assert.ok(view.node('upgradeGrid').innerHTML.includes(NeonCore.BY_ID[second].name));assert.ok(view.node('upgradeGrid').innerHTML.includes('preview-missing'));
    view.qa.installSkill(second,1);g.revision++;view.frame();assert.ok(view.node('upgradeGrid').innerHTML.includes(`选后激活 · ${synergy.name}`));
    view.qa.choose(0);assert.ok(view.node('synergyList').innerHTML.includes(synergy.name));g.options=[first];g.state='upgrade';g.revision++;view.frame();assert.ok(view.node('upgradeGrid').innerHTML.includes(`已激活 · ${synergy.name}`));
    g.state='playing';g.revision++;view.frame();view.node('pauseBtn').onclick();assert.ok(view.node('pauseSynergyList').innerHTML.includes(synergy.name));for(const id of synergy.requires)assert.ok(view.node('pauseSynergyList').innerHTML.includes(NeonCore.BY_ID[id].name));
  }
});
test('Four new catalyst cards expose their tradeoff, equip correctly and remain visible in pause details',()=>{
  assert.equal(NeonCore.CATALYSTS.length,15);
  for(const id of ['cryo','guidance','singularity','prism']){
    const view=launch();view.qa.start();const catalyst=BY_CATALYST[id];view.qa.installSkill(catalyst.skill,1);const g=view.qa.getGame();g.upgrades=6;g.catalystMilestones=[6];g.catalystOptions=[id];g.state='catalyst';g.revision++;view.frame();
    assert.ok(view.node('catalystGrid').innerHTML.includes(catalyst.name));assert.ok(view.node('catalystGrid').innerHTML.includes(catalyst.benefit));assert.ok(view.node('catalystGrid').innerHTML.includes(catalyst.cost));
    view.node('catalystGrid').querySelector('button').onclick();assert.equal(g.catalyst,id);assert.ok(view.node('catalystSlot').innerHTML.includes(catalyst.name));view.node('pauseBtn').onclick();assert.ok(view.node('pauseCatalystInfo').textContent.includes(catalyst.benefit));assert.ok(view.node('pauseCatalystInfo').textContent.includes(catalyst.cost));
  }
});
test('All new synergies, four drones and four shield charges render safely in three presets and reduced motion',()=>{
  for(const reducedMotion of [false,true])for(const mode of ['clean','standard','spectacular']){
    const view=launch({reducedMotion});view.qa.start();view.qa.setEffects(mode);const g=view.qa.getGame();g.spawnClock=1e9;g.player.fireClock=1e9;
    for(const id of ['frost','aura','well','lightning','drone','crit','shield','orbit'])view.qa.installSkill(id,4);
    const enemy=g.createEnemy('tank',g.player.x+100,g.player.y);enemy.hp=enemy.maxHp=1e6;g.random=()=>0;
    g.equipCatalyst('guidance');assert.equal(g.player.droneShots,4);g.spawnWell();g.frostPulse();g.lightning();g.fireDrones();view.frame();assert.ok(g.effects.some(effect=>effect.gravityStorm));
    assert.ok(g.bullets.some(bullet=>bullet.source==='drone'&&bullet.canCrit));g.equipCatalyst('prism');g.updateShield(100);assert.equal(g.player.shieldMaxCharges,4);assert.equal(g.player.shieldCharges,4);view.frame();
    assert.ok(view.drawCalls.some(call=>call.method==='fillText'&&String(call.args[0]).includes('4/4')));assert.ok(g.effects.every(effect=>Number.isFinite(effect.x)&&Number.isFinite(effect.y)&&Number.isFinite(effect.r)));
  }
});
test('Default gameplay Math.random is not consumed by menu, particle flashes, camera shake, pause or effect presets',()=>{
  const previousRandom=Math.random;let calls=0;const probe=()=>{calls++;return .37;};Math.random=probe;
  try{
    const view=launch();const initial=calls;view.frame();view.frame();assert.equal(calls,initial,'menu drawing used gameplay randomness');view.qa.start();const g=view.qa.getGame();assert.equal(g.random,probe,'test must use the default shared gameplay RNG');
    g.spawnClock=1e9;g.player.fireClock=1e9;g.createEnemy('tank',600,300);const before=calls;
    g.emit('kill',{x:600,y:300,color:'#b9ff4a',boss:false});g.emit('explosion',{x:600,y:300,radius:100,color:'#ffc573'});view.qa.setEffects('spectacular');view.frame();assert.equal(calls,before,'particles or shake used gameplay randomness');
    view.node('pauseBtn').onclick();for(const mode of ['clean','standard','spectacular']){view.qa.setEffects(mode);view.frame();}assert.equal(calls,before,'pause or preset selection used gameplay randomness');
  }finally{Math.random=previousRandom;}
});
const HISTORY_KEY='neonRunHistoryV1';
function storedRun(index=1,changes={}){
  return {id:`run-1700000000000-${index}`,at:1700000000000+index,version:'v10',won:false,level:3,wave:4,time:30,kills:index,totalDamage:20,bossDamage:10,damageTaken:12,blockedDamage:19,
    skills:[{id:'rate',level:1},{id:'power',level:4}],catalyst:'pressure',synergies:['rail'],damage:[{id:'bullet',damage:20,bossDamage:10}],bosses:[{stage:1,hp:1000,maxHp:1200,duration:4,killed:false}],deathSource:'blob',...changes};
}
const storedEnvelope=records=>JSON.stringify({schema:1,records});
const historyWrites=view=>view.storageCalls.filter(call=>call.method==='set'&&call.key===HISTORY_KEY);
function finishFileRun(view,{won=false,level=0,time=5,kills=0}={}){
  view.node('startBtn').onclick();const g=view.games.at(-1);g.upgrades=level;g.time=time;g.kills=kills;g.finish(won);view.frame();return g;
}

test('A normal non-QA file run archives exactly once and viewing the record never mutates gameplay or its report',()=>{
  const previousRandom=Math.random;let calls=0;Math.random=()=>{calls++;return .37;};
  try{
    const view=launch({offline:true});assert.equal(view.qa,undefined);view.node('startBtn').onclick();const g=view.games.at(-1);assert.equal(g.random,Math.random);
    g.advanceSkill('rate');g.advanceSkill('power');g.equipCatalyst('pressure');g.spawnBoss(3);g.hurt(g.boss,6800,{source:'bullet'});g.time=5;g.damagePlayer(999,'bossShockwave');
    const before=JSON.stringify(g),report=JSON.stringify(g.report()),randomBefore=calls;view.frame();assert.equal(historyWrites(view).length,1);assert.equal(JSON.stringify(g),before);assert.equal(JSON.stringify(g.report()),report);assert.equal(calls,randomBefore);
    const records=JSON.parse(view.storage.get(HISTORY_KEY)).records;assert.equal(records.length,1);assert.equal(records[0].version,'v39');assert.equal(records[0].campaignLevel,1);assert.equal(records[0].deathSource,'bossShockwave');assert.equal(records[0].bosses[0].hp,1700);
    view.frame();g.revision++;view.frame();const afterRevision=JSON.stringify(g);view.node('historyEndBtn').onclick();view.frame();view.node('historyCloseBtn').onclick();view.frame();
    assert.equal(historyWrites(view).length,1);assert.equal(JSON.stringify(g),afterRevision);assert.equal(calls,randomBefore);assert.match(view.node('historyList').innerHTML,/终末炼金核|终末环形冲击/);assert.match(view.node('historyArchiveNote').textContent,/已加入/);
  }finally{Math.random=previousRandom;}
});
test('Menu, abandoned restarts, QA and explicitly nonformal games are excluded from the archive',()=>{
  const file=launch({offline:true});file.frame();assert.equal(historyWrites(file).length,0);file.node('startBtn').onclick();file.node('restartBtn').onclick();file.frame();assert.equal(historyWrites(file).length,0);
  const g=file.games.at(-1);g.state='menu';g.revision++;file.frame();assert.equal(historyWrites(file).length,0);
  const qa=launch();qa.qa.start();qa.qa.getGame().finish(false);qa.frame();assert.equal(historyWrites(qa).length,0);assert.match(qa.node('historyArchiveNote').textContent,/QA|练习/);
  for(const changes of [{mode:'practice',practiceConfig:{stage:1,buildId:'hunter',tier:2}},{mode:'qa'},{practice:true},{formal:false}]){
    const view=launch({offline:true});view.node('startBtn').onclick();Object.assign(view.games.at(-1),changes);view.games.at(-1).finish(false);view.frame();assert.equal(historyWrites(view).length,0);
  }
});
test('A second file launch restores local records, dynamic metadata and effect preference without exposing QA',()=>{
  const storage=new Map([['neonEffects','clean']]),first=launch({offline:true,storage});finishFileRun(first,{level:4,time:45,kills:7});const saved=storage.get(HISTORY_KEY);
  const restored=launch({offline:true,storage});assert.equal(restored.qa,undefined);assert.equal(restored.node('effectsStart').value,'clean');restored.node('historyStartBtn').onclick();
  assert.match(restored.node('historyList').innerHTML,/完成 4 \/ 40 波 · LV\.4/);assert.match(restored.node('historyList').innerHTML,/00:45/);assert.match(restored.node('historyList').innerHTML,/击碎 7/);assert.match(restored.node('historyStatus').textContent,/1 \/ 10/);
  assert.equal(storage.get(HISTORY_KEY),saved);assert.equal(historyWrites(restored).length,0);assert.equal(restored.games.length,1);
});
test('Malformed schema, oversized or damaged stored records fall back safely to a clearly labelled session archive',()=>{
  for(const bad of ['{',JSON.stringify({schema:2,records:[]}),JSON.stringify({schema:1,records:{}}),' '.repeat(250001),storedEnvelope([storedRun(1,{skills:[{id:'__proto__',level:1}]})])]){
    const storage=new Map([[HISTORY_KEY,bad]]),view=launch({offline:true,storage});view.node('historyStartBtn').onclick();assert.match(view.node('historyStatus').textContent,/会话/);assert.match(view.node('historyList').innerHTML,/还没有/);view.node('historyCloseBtn').onclick();
    finishFileRun(view,{kills:1});view.node('historyEndBtn').onclick();assert.match(view.node('historyList').innerHTML,/击碎 1/);assert.match(view.node('historyStatus').textContent,/会话/);assert.equal(storage.get(HISTORY_KEY),bad);assert.equal(historyWrites(view).length,0);
  }
});
test('Independent storage read and write failures keep multiple completed results available during the current session',()=>{
  for(const config of [{deniedStorage:true},{readDenied:true},{writeDenied:true}]){
    const view=launch({offline:true,...config});finishFileRun(view,{kills:1});finishFileRun(view,{kills:2});view.node('historyEndBtn').onclick();
    assert.equal((view.node('historyList').innerHTML.match(/<details /g)||[]).length,2);assert.match(view.node('historyStatus').textContent,/会话/);assert.match(view.node('historyArchiveNote').textContent,/会话/);assert.equal(view.storage.has(HISTORY_KEY),false);
    assert.doesNotMatch(view.node('historyList').innerHTML,/NaN|Infinity|undefined/);view.node('historyCloseBtn').onclick();view.node('restartBtn').onclick();assert.equal(view.games.at(-1).state,'playing');
  }
});
test('Archive HTML uses whitelisted metadata and ignores injected names, versions and unknown identifiers',()=>{
  const payload='<img src=x onerror=alert(1)>',valid=storedRun(1,{name:payload,skills:[{id:'power',level:4,name:payload}],damage:[{id:'bullet',damage:20,bossDamage:10,name:payload}],bosses:[{stage:3,hp:1700,maxHp:8500,duration:5,killed:false,name:payload}],deathSource:'bossShockwave'});
  const invalid=[storedRun(2,{version:payload}),storedRun(3,{catalyst:payload}),storedRun(4,{deathSource:'constructor'})];const view=launch({offline:true,storage:new Map([[HISTORY_KEY,storedEnvelope([valid,...invalid])]])});view.node('historyStartBtn').onclick();
  const rendered=view.node('historyList').innerHTML;assert.equal((rendered.match(/<details /g)||[]).length,1);assert.doesNotMatch(rendered,/<img|onerror|<script|alert\(/);assert.ok(rendered.includes(NeonCore.BY_ID.power.breakthrough));assert.match(rendered,/终末炼金核/);assert.match(rendered,/剩余 20\.0% 生命/);assert.match(rendered,/终末环形冲击/);assert.match(view.node('historyStatus').textContent,/损坏|会话/);
});
test('Archive statistics and display order describe at most ten recent results, not a permanent career best',()=>{
  const runs=Array.from({length:12},(_,i)=>storedRun(i+1,{won:i>=10,time:i===11?60:i===10?90:1,level:i===0?30:i===11?20:3,wave:i===11?21:4,totalDamage:i===0?1e6:20+i,bossDamage:0}));
  const view=launch({offline:true,storage:new Map([[HISTORY_KEY,storedEnvelope(runs)]])});view.node('historyStartBtn').onclick();const list=view.node('historyList').innerHTML,stats=view.node('historyStats').innerHTML;
  assert.equal((list.match(/<details /g)||[]).length,10);assert.ok(list.indexOf('击碎 12')<list.indexOf('击碎 11'));assert.match(list,/完成 20 \/ 30 波 · LV\.20/);assert.doesNotMatch(list,/完成 21 \/ 30 波/);
  assert.match(stats,/近 10 局胜率 · 2 胜/);assert.match(stats,/20%/);assert.match(stats,/20 \/ 40/);assert.match(stats,/01:00/);assert.doesNotMatch(stats,/00:01|1,000,000/);assert.match(view.node('historyStatus').textContent,/不代表永久最好成绩/);
});
test('History open, close and keyboard handling preserve the same menu or ended instance without leaking movement keys',()=>{
  const view=launch({offline:true}),menu=view.games.at(-1),before=JSON.stringify(menu);view.node('historyStartBtn').onclick();assert.equal(view.node('historyOverlay').classList.contains('show'),true);assert.equal(view.node('historyCloseBtn').focused,true);
  for(const code of ['KeyP','KeyR','Digit1','KeyW','ArrowRight'])view.key(code);view.frame();assert.equal(JSON.stringify(menu),before);assert.equal(view.games.length,1);assert.equal(view.node('historyOverlay').classList.contains('show'),true);
  view.key('Escape');assert.equal(view.node('historyOverlay').classList.contains('show'),false);assert.equal(view.node('historyStartBtn').focused,true);assert.equal(JSON.stringify(menu),before);
  view.node('startBtn').onclick();const g=view.games.at(-1);g.spawnClock=1e9;g.player.fireClock=1e9;const x=g.player.x,y=g.player.y;view.frame();assert.equal(g.player.x,x);assert.equal(g.player.y,y);
  const playing=JSON.stringify(g);view.node('historyStartBtn').onclick();assert.equal(view.node('historyOverlay').classList.contains('show'),false);assert.equal(JSON.stringify(g),playing);
  view.node('pauseBtn').onclick();const paused=JSON.stringify(g);view.node('historyEndBtn').onclick();assert.equal(JSON.stringify(g),paused);assert.equal(view.node('historyOverlay').classList.contains('show'),false);
  g.finish(false);view.frame();const ended=JSON.stringify(g),count=view.games.length;view.node('historyEndBtn').onclick();view.key('KeyP');view.key('Digit2');view.frame();view.node('historyCloseBtn').onclick();assert.equal(JSON.stringify(g),ended);assert.equal(view.games.length,count);assert.equal(view.node('historyEndBtn').focused,true);
});
test('Clearing history needs a distinct second confirmation, supports cancel and only writes its dedicated key',()=>{
  const storage=new Map([[HISTORY_KEY,storedEnvelope([storedRun()])],['neonEffects','clean'],['unrelated','preserve']]),view=launch({offline:true,storage});view.node('historyStartBtn').onclick();const initial=storage.get(HISTORY_KEY),before=JSON.stringify(view.games.at(-1));
  view.node('historyConfirmClearBtn').onclick();assert.equal(storage.get(HISTORY_KEY),initial);view.node('historyClearBtn').onclick();view.node('historyClearBtn').onclick();assert.equal(storage.get(HISTORY_KEY),initial);assert.equal(view.node('historyClearConfirm').classList.contains('hidden'),false);assert.equal(view.node('historyCancelClearBtn').focused,true);
  view.node('historyCancelClearBtn').onclick();assert.equal(view.node('historyClearConfirm').classList.contains('hidden'),true);assert.equal(storage.get(HISTORY_KEY),initial);view.node('historyClearBtn').onclick();const callCount=view.storageCalls.length;view.node('historyConfirmClearBtn').onclick();
  assert.deepEqual(JSON.parse(storage.get(HISTORY_KEY)),{schema:1,records:[]});assert.equal(storage.get('neonEffects'),'clean');assert.equal(storage.get('unrelated'),'preserve');assert.equal(JSON.stringify(view.games.at(-1)),before);assert.match(view.node('historyList').innerHTML,/还没有/);
  assert.ok(view.storageCalls.slice(callCount).every(call=>call.key===HISTORY_KEY));assert.equal(view.node('historyClearBtn').disabled,true);assert.equal(view.node('historyCloseBtn').focused,true);
  const restored=launch({offline:true,storage});restored.node('historyStartBtn').onclick();assert.match(restored.node('historyList').innerHTML,/还没有/);
});
test('A failed clear leaves existing persisted data intact and truthfully reports that only the session was cleared',()=>{
  const persisted=storedEnvelope([storedRun()]),storage=new Map([[HISTORY_KEY,persisted],['neonEffects','clean']]),view=launch({offline:true,writeDenied:true,storage});view.node('historyStartBtn').onclick();view.node('historyClearBtn').onclick();view.node('historyConfirmClearBtn').onclick();
  assert.match(view.node('historyList').innerHTML,/还没有/);assert.match(view.node('historyStatus').textContent,/会话/);assert.match(view.node('historyStatus').textContent,/此前保存.*仍保留/);assert.equal(storage.get(HISTORY_KEY),persisted);assert.equal(storage.get('neonEffects'),'clean');
  const restored=launch({offline:true,storage});restored.node('historyStartBtn').onclick();assert.equal((restored.node('historyList').innerHTML.match(/<details /g)||[]).length,1);
});
test('Twelve actual formal file endings retain ten unique results and clearing cannot resurrect the last ended game',()=>{
  const view=launch({offline:true});for(let i=1;i<=12;i++)finishFileRun(view,{kills:i});assert.equal(historyWrites(view).length,12);const records=JSON.parse(view.storage.get(HISTORY_KEY)).records;assert.equal(records.length,10);assert.equal(new Set(records.map(row=>row.id)).size,10);assert.equal(records[0].kills,12);assert.equal(records.at(-1).kills,3);
  view.node('historyEndBtn').onclick();view.node('historyClearBtn').onclick();view.node('historyConfirmClearBtn').onclick();view.node('historyCloseBtn').onclick();view.frame();view.games.at(-1).revision++;view.frame();assert.deepEqual(JSON.parse(view.storage.get(HISTORY_KEY)).records,[]);assert.equal(historyWrites(view).length,13);
});
test('An empty damaged archive can be explicitly reset to persistent storage, while denied storage remains a truthful session fallback',()=>{
  const storage=new Map([[HISTORY_KEY,'{'],['neonEffects','clean'],['unrelated','preserve']]),view=launch({offline:true,storage});view.node('historyStartBtn').onclick();assert.equal(view.node('historyClearBtn').disabled,false);assert.match(view.node('historyStatus').textContent,/会话/);
  const before=historyWrites(view).length;view.node('historyClearBtn').onclick();assert.equal(historyWrites(view).length,before);view.node('historyCancelClearBtn').onclick();assert.equal(historyWrites(view).length,before);assert.equal(storage.get(HISTORY_KEY),'{');
  view.node('historyClearBtn').onclick();const callCount=view.storageCalls.length;view.node('historyConfirmClearBtn').onclick();assert.deepEqual(JSON.parse(storage.get(HISTORY_KEY)),{schema:1,records:[]});assert.ok(view.storageCalls.slice(callCount).every(call=>call.key===HISTORY_KEY));assert.doesNotMatch(view.node('historyStatus').textContent,/会话|无法|损坏/);assert.equal(view.node('historyClearBtn').disabled,true);assert.equal(storage.get('neonEffects'),'clean');assert.equal(storage.get('unrelated'),'preserve');
  view.node('historyCloseBtn').onclick();finishFileRun(view,{kills:8});assert.equal(JSON.parse(storage.get(HISTORY_KEY)).records[0].kills,8);assert.equal(historyWrites(view).length,before+2);assert.match(view.node('historyArchiveNote').textContent,/已加入本机/);
  const deniedStorage=new Map([['neonEffects','clean'],['unrelated','preserve']]),denied=launch({offline:true,deniedStorage:true,storage:deniedStorage});denied.node('historyStartBtn').onclick();assert.equal(denied.node('historyClearBtn').disabled,false);denied.node('historyClearBtn').onclick();denied.node('historyCancelClearBtn').onclick();assert.equal(historyWrites(denied).length,0);denied.node('historyClearBtn').onclick();assert.doesNotThrow(()=>denied.node('historyConfirmClearBtn').onclick());
  assert.equal(historyWrites(denied).length,1);assert.match(denied.node('historyStatus').textContent,/会话/);assert.match(denied.node('historyStatus').textContent,/此前保存.*仍保留/);assert.doesNotMatch(denied.node('historyStatus').textContent,/永久.*已.*删/);assert.equal(deniedStorage.has(HISTORY_KEY),false);assert.equal(deniedStorage.get('neonEffects'),'clean');assert.equal(deniedStorage.get('unrelated'),'preserve');
});
test('Practice selectors preview valid builds without starting or changing a formal game',()=>{
  const v=launch({offline:true}),g=v.games.at(-1),before=JSON.stringify(g);
  v.change('practiceBossSelect','3');v.change('practiceBuildSelect','control');assert.match(v.node('practiceInfo').textContent,/突破/);assert.equal(JSON.stringify(g),before);
  v.change('practiceBuildSelect','__proto__');assert.equal(v.node('practiceStartBtn').disabled,true);v.node('practiceStartBtn').onclick();assert.equal(v.games.at(-1),g);
});
test('All twelve practice combinations start with a distinct nonformal HUD and frozen pause',()=>{
  for(const stage of [1,2,3])for(const build of NeonCore.PRACTICE_BUILDS){
    const v=launch({offline:true});v.change('practiceBossSelect',String(stage));v.change('practiceBuildSelect',build.id);v.node('practiceStartBtn').onclick();v.frame();const g=v.games.at(-1);
    assert.equal(g.mode,'practice');assert.equal(g.practiceConfig.stage,stage);assert.equal(g.practiceConfig.buildId,build.id);assert.match(v.node('progressText').textContent,/练习/);assert.match(v.node('xpText').textContent,/固定构筑/);
    v.node('pauseBtn').onclick();const time=g.time;v.frame(100);assert.equal(g.time,time);assert.equal(v.node('practiceExitBtn').classList.contains('hidden'),false);v.node('resumeBtn').onclick();assert.equal(g.state,'playing');
  }
});
test('Practice wins show the selected target rather than a campaign victory and never archive',()=>{
  const v=launch({offline:true});v.change('practiceBossSelect','3');v.node('practiceStartBtn').onclick();const g=v.games.at(-1);g.spawnBoss(3);g.kill(g.enemies.find(e=>e.type==='boss'));v.frame();
  assert.equal(g.state,'ended');assert.equal(g.won,true);assert.match(v.node('finalWavesLabel').textContent,/练习/);assert.doesNotMatch(v.node('resultText').textContent,/完成.*30|三十波.*通关/);assert.equal(historyWrites(v).length,0);assert.match(v.node('restartBtn').innerHTML,/再练/);
  v.node('restartBtn').onclick();const retry=v.games.at(-1);assert.notEqual(retry,g);assert.equal(retry.mode,'practice');assert.equal(retry.practiceConfig.stage,3);assert.equal(retry.player.hp,retry.player.maxHp);assert.equal(retry.kills,0);
});
test('Practice exit restores the formal menu and fresh level-zero progression',()=>{
  const v=launch({offline:true});v.node('practiceStartBtn').onclick();v.node('pauseBtn').onclick();v.node('practiceExitBtn').onclick();assert.equal(v.games.at(-1).state,'menu');assert.equal(v.games.at(-1).mode,'normal');
  v.node('startBtn').onclick();v.frame();const g=v.games.at(-1);assert.equal(g.mode,'normal');assert.equal(g.upgrades,0);assert.equal(g.rerollsRemaining,2);assert.equal(v.node('progressText').textContent,'0 / 40');assert.equal(historyWrites(v).length,0);
});
test('Practice loss can return to menu without a record, while formal loss remains archived once',()=>{
  const v=launch({offline:true});v.node('practiceStartBtn').onclick();v.games.at(-1).finish(false);v.frame();assert.equal(historyWrites(v).length,0);v.node('menuBtn').onclick();assert.equal(v.games.at(-1).state,'menu');
  finishFileRun(v);assert.equal(historyWrites(v).length,1);v.node('menuBtn').onclick();assert.equal(historyWrites(v).length,1);assert.equal(v.games.at(-1).state,'menu');
});
function completeFirstCampaign(view){
  view.node('startBtn').onclick();const g=view.games.at(-1);g.random=()=>.2;g.spawnClock=1e9;g.player.fireClock=1e9;g.addEnergy(100000);view.frame();
  for(let stage=1;stage<=3;stage++){
    for(let n=0;n<(stage===3?20:10);n++){assert.equal(g.state,'upgrade');view.node('upgradeGrid').querySelector('button').onclick();if(g.state==='catalyst')view.node('catalystKeep').onclick();}
    g.spawnBoss(stage);g.kill(g.boss);view.frame();assert.equal(g.state,'lottery');view.node('lotteryContinue').onclick();
  }
  assert.equal(g.state,'ended');assert.equal(g.won,true);return g;
}
test('Second campaign level remains locked until a real first-level win, including QA and storage fallback',()=>{
  const v=launch({offline:true});v.change('campaignLevelSelect','2');assert.equal(v.node('startBtn').disabled,true);assert.match(v.node('campaignLevelInfo').textContent,/尚未解锁/);const menu=v.games.at(-1);v.node('startBtn').onclick();assert.equal(v.games.at(-1),menu);
  const fake=launch({offline:true});fake.node('startBtn').onclick();fake.games.at(-1).finish(true);fake.frame();fake.change('campaignLevelSelect','2');assert.equal(fake.node('startBtn').disabled,true);
  const qa=launch();qa.node('startBtn').onclick();qa.games.at(-1).finish(true);qa.frame();qa.change('campaignLevelSelect','2');assert.equal(qa.node('startBtn').disabled,true);
  const denied=launch({offline:true,deniedStorage:true});completeFirstCampaign(denied);denied.change('campaignLevelSelect','2');assert.equal(denied.node('startBtn').disabled,false);assert.equal(denied.storage.has('neonCampaignUnlockV1'),false);
});
test('A first-level win unlocks a fresh forty-wave second level and records each level separately',()=>{
  const storage=new Map(),v=launch({offline:true,storage});completeFirstCampaign(v);assert.equal(storage.get('neonCampaignUnlockV1'),'2');assert.equal(v.node('nextLevelBtn').classList.contains('hidden'),false);
  v.node('nextLevelBtn').onclick();const second=v.games.at(-1);assert.equal(second.campaignLevel,2);assert.equal(second.upgrades,0);assert.equal(second.wave,1);assert.equal(second.player.hp,100);assert.match(v.node('chapterText').textContent,/第二关/);assert.equal(v.node('progressText').textContent,'0 / 40');second.finish(false);v.frame();
  const records=JSON.parse(storage.get(HISTORY_KEY)).records;assert.deepEqual(records.map(r=>r.campaignLevel),[2,1]);v.node('historyEndBtn').onclick();assert.match(v.node('historyList').innerHTML,/赤潮熔炉/);v.node('historyCloseBtn').onclick();v.node('menuBtn').onclick();v.change('campaignLevelSelect','2');assert.equal(v.node('startBtn').disabled,false);v.node('startBtn').onclick();assert.equal(v.games.at(-1).campaignLevel,2);
  const reload=launch({offline:true,storage});reload.change('campaignLevelSelect','2');assert.equal(reload.node('startBtn').disabled,false);reload.node('startBtn').onclick();assert.equal(reload.games.at(-1).campaignLevel,2);
});
test('Second-level danger circles and advanced boss telegraphs render in every preset and reduced motion',()=>{
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){
    const v=launch({offline:true,reducedMotion,storage:new Map([['neonCampaignUnlockV1','2']])});v.change('campaignLevelSelect','2');v.node('startBtn').onclick();v.change('effectsPause',preset);const g=v.games.at(-1);g.upgrades=5;g.spawnClock=1e9;g.player.fireClock=1e9;g.arenaClock=0;g.step(.02);assert.ok(g.arenaIntent);g.spawnBoss(1);g.boss.intent={kind:'cross',angle:0,remaining:1,total:1};assert.doesNotThrow(()=>v.frame());assert.ok(v.drawCalls.some(call=>call.method==='arc'&&call.args[2]===95));assert.ok(v.drawCalls.some(call=>call.method==='fillRect'&&call.args[2]===480));
    g.boss.intent={kind:'corePulse',angle:0,remaining:1,total:1};assert.doesNotThrow(()=>v.frame());assert.ok(v.drawCalls.some(call=>call.method==='arc'&&call.args[2]===150));
  }
});
test('Portable save UI freezes combat, rejects damaged imports and restores progress with denied storage',()=>{
  const v=launch({offline:true,deniedStorage:true});v.node('startBtn').onclick();const g=v.games.at(-1);g.advanceSkill('beam');g.advanceSkill('nova');g.spawnBoss(1);g.boss.intent={kind:'cross',angle:0,remaining:1,total:1.25,radius:240};v.node('saveBtn').onclick();assert.equal(g.state,'paused');v.node('saveExportBtn').onclick();const text=v.node('saveText').value;assert.match(text,/neon-run/);assert.match(v.node('saveDownload').href,/^data:application\/json/);const before=g.time;v.key('Escape');v.frame();assert.equal(g.time,before);v.node('saveBtn').onclick();v.node('saveText').value='broken';v.node('saveImportBtn').onclick();assert.match(v.node('saveStatus').textContent,/读取失败/);assert.equal(g.state,'paused');v.node('saveText').value=text;v.node('saveImportBtn').onclick();v.frame();assert.equal(v.node('saveOverlay').classList.contains('show'),false);assert.match(v.node('pauseBuildList').innerHTML,/棱光裂束/);assert.match(v.node('pauseBuildList').innerHTML,/裂变回响/);assert.equal(historyWrites(v).length,0);
});
test('Second complete campaign unlocks a fresh third campaign and mirror warnings and new skills render',()=>{
  const v=launch({offline:true,storage:new Map([['neonCampaignUnlockV1','2']])});v.change('campaignLevelSelect','2');completeFirstCampaign(v);assert.equal(v.storage.get('neonCampaignUnlockV1'),'3');assert.equal(v.node('nextLevelBtn').classList.contains('hidden'),false);v.node('nextLevelBtn').onclick();const g=v.games.at(-1);assert.equal(g.campaignLevel,3);assert.equal(g.upgrades,0);assert.match(v.node('chapterText').textContent,/第三关/);g.upgrades=20;g.arenaClock=0;g.player.fireClock=1e9;g.advanceSkill('beam');g.advanceSkill('nova');g.createEnemy('tank',g.player.x+80,g.player.y);g.fireBeam();g.updateArena(.01);v.frame();assert.ok(v.drawCalls.some(call=>call.method==='fillRect'&&call.args[2]===84));assert.ok(v.drawCalls.some(call=>call.method==='lineTo'&&call.args[0]===450));
});
test('Pill pickups render in all effect modes and display actual capped healing',()=>{
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){const v=launch({offline:true,reducedMotion});v.node('startBtn').onclick();v.change('effectsPause',preset);const g=v.games.at(-1);g.player.hp=95;g.items.push({type:'pill',x:g.player.x+80,y:g.player.y,r:6,life:30,dead:false});v.frame();assert.ok(v.drawCalls.some(call=>call.method==='ellipse'));g.items[0].x=g.player.x;v.frame();assert.equal(g.player.hp,100);assert.match(v.node('toast').textContent,/生命 \+5/);}
});
test('Fusion cards explicitly free a slot, combine skills and restore as a single build entry',()=>{
  const v=launch({offline:true});v.node('startBtn').onclick();const g=v.games.at(-1);for(const id of ['nova','beam'])for(let i=0;i<4;i++)g.advanceSkill(id);g.addEnergy(8);v.frame();assert.match(v.node('upgradeGrid').innerHTML,/棱镜回响/);assert.match(v.node('upgradeGrid').innerHTML,/释放一格/);v.node('upgradeGrid').querySelector('button').onclick();assert.equal(g.owned.length,1);assert.equal(g.level('beam'),4);assert.equal(v.node('slotCount').textContent,'1 / 8');v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const text=v.node('saveText').value;v.node('saveText').value=text;v.node('saveImportBtn').onclick();assert.match(v.node('pauseBuildList').innerHTML,/棱镜回响/);
});
test('Completing third campaign unlocks fourth and portal visuals stay valid across effect presets',()=>{
  const v=launch({offline:true,storage:new Map([['neonCampaignUnlockV1','3']])});v.change('campaignLevelSelect','3');completeFirstCampaign(v);assert.equal(v.storage.get('neonCampaignUnlockV1'),'4');v.node('nextLevelBtn').onclick();assert.equal(v.games.at(-1).campaignLevel,4);assert.match(v.node('chapterText').textContent,/第四关/);
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){const w=launch({offline:true,reducedMotion,storage:new Map([['neonCampaignUnlockV1','4']])});w.change('campaignLevelSelect','4');w.node('startBtn').onclick();w.change('effectsPause',preset);const g=w.games.at(-1);w.frame();assert.ok(w.drawCalls.some(call=>call.method==='arc'&&call.args[2]===23));g.player.x=g.portals[0].x;g.player.y=g.portals[0].y;w.frame();assert.equal(g.player.x,g.portals[1].x);assert.match(w.node('toast').textContent,/折跃/);w.node('pauseBtn').onclick();const before=g.portalCooldown;w.frame();assert.equal(g.portalCooldown,before);}
});
test('True blackhole king appears as an explicit fusion and occupies one slot after save restoration',()=>{
  const v=launch({offline:true});v.node('startBtn').onclick();const g=v.games.at(-1);for(const id of ['well','mine'])for(let i=0;i<4;i++)g.advanceSkill(id);g.addEnergy(8);v.frame();assert.equal(g.options[0],'blackholeKing');assert.match(v.node('upgradeGrid').innerHTML,/真·黑洞之王/);v.node('upgradeGrid').querySelector('button').onclick();assert.equal(g.owned.length,1);assert.equal(v.node('slotCount').textContent,'1 / 8');v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();v.node('saveImportBtn').onclick();assert.match(v.node('pauseBuildList').innerHTML,/真·黑洞之王/);
});
test('Fourth campaign unlocks fifth and arrows, sentinels and locked telegraphs render across all presets',()=>{
  const v=launch({offline:true,storage:new Map([['neonCampaignUnlockV1','4']])});v.change('campaignLevelSelect','4');completeFirstCampaign(v);assert.equal(v.storage.get('neonCampaignUnlockV1'),'5');v.node('nextLevelBtn').onclick();assert.equal(v.games.at(-1).campaignLevel,5);assert.match(v.node('chapterText').textContent,/第五关/);
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){const w=launch({offline:true,reducedMotion,storage:new Map([['neonCampaignUnlockV1','5']])});w.change('campaignLevelSelect','5');w.node('startBtn').onclick();w.change('effectsPause',preset);const g=w.games.at(-1),p=g.player;g.spawnClock=1e9;const e=g.createEnemy('sentinel',p.x+200,p.y);e.shotIntent={angle:Math.PI,remaining:1,total:1};g.advanceSkill('arrow');g.fireArrows();w.frame();assert.ok(w.drawCalls.some(c=>c.method==='lineTo'&&Math.abs(c.args[0]-(e.x-500))<.001));for(let i=1;i<4;i++)g.advanceSkill('arrow');g.updateWhistle(.04);g.enemyShots.push({x:100,y:100,prevX:99,prevY:100,vx:220,vy:0,r:5,life:6,damage:14});assert.doesNotThrow(()=>w.frame());assert.ok(g.whistle);w.node('pauseBtn').onclick();const before=JSON.stringify([g.whistle,g.enemyShots,e.shotIntent]);w.frame();assert.equal(JSON.stringify([g.whistle,g.enemyShots,e.shotIntent]),before);}
});
function royalView(options={}){
  const v=launch({offline:true,...options});v.node('startBtn').onclick();const g=v.games.at(-1);g.spawnClock=1e9;g.player.fireClock=1e9;
  for(const id of ['well','mine'])for(let i=0;i<4;i++)g.advanceSkill(id);g.advanceSkill('blackholeKing');
  let time=0;v.sandbox.performance.now=()=>time;
  const tap=(code,at)=>{time=at;v.key(code);v.listeners.keyup({code});};return {v,g,p:g.player,tap,setTime:value=>{time=value;}};
}
test('Double tap triggers only the royal fusion within 200ms and respects its two-second cooldown',()=>{
  for(const gap of [0,199,200,201]){const {g,p,tap}=royalView();const x=p.x;tap('ArrowRight',1000);tap('ArrowRight',1000+gap);assert.equal(p.x,x+(gap<=200?150:0));assert.equal(p.blinkClock,gap<=200?2:0);if(gap<=200){tap('ArrowRight',1400);tap('ArrowRight',1500);assert.equal(p.x,x+150);for(let i=0;i<20;i++)g.step(.1);tap('ArrowRight',4000);tap('ArrowRight',4100);assert.equal(p.x,x+300);}}
  const v=launch({offline:true});v.node('startBtn').onclick();const g=v.games.at(-1),x=g.player.x;v.key('ArrowRight');v.listeners.keyup({code:'ArrowRight'});v.key('ArrowRight');assert.equal(g.player.x,x);
});
test('All four directions and WASD aliases can blink, but a different direction cannot form a double tap',()=>{
  for(const [first,second,dx,dy]of [['ArrowUp','KeyW',0,-150],['KeyS','ArrowDown',0,150],['ArrowLeft','KeyA',-150,0],['KeyD','ArrowRight',150,0]]){const {p,tap}=royalView(),x=p.x,y=p.y;tap(first,0);tap(second,150);assert.equal(p.x,x+dx);assert.equal(p.y,y+dy);}
  const {p,tap}=royalView(),x=p.x;tap('KeyA',0);tap('KeyD',100);assert.equal(p.x,x);tap('ArrowRight',200);assert.equal(p.x,x+150);
});
test('Auto-repeat, missing key release and held alternate aliases never trigger blink',()=>{
  const {v,p,tap,setTime}=royalView(),x=p.x;setTime(0);v.key('ArrowRight');setTime(100);v.key('ArrowRight',true);v.key('ArrowRight');v.key('KeyD');assert.equal(p.x,x);assert.equal(p.blinkClock,0);
  v.listeners.keyup({code:'ArrowRight'});v.listeners.keyup({code:'KeyD'});tap('ArrowRight',150);assert.equal(p.x,x+150);
});
test('Pause, choices, blur, save overlay and editable input clear double-tap history',()=>{
  for(const interruption of ['pause','upgrade','blur','save','form','hidden']){const {v,g,p,tap,setTime}=royalView(),x=p.x;tap('KeyD',0);
    if(interruption==='pause'){v.node('pauseBtn').onclick();v.node('resumeBtn').onclick();}
    if(interruption==='upgrade'){g.state='upgrade';g.options=['rate'];v.frame();g.state='playing';g.options=[];v.frame();}
    if(interruption==='blur'){v.listeners.blur();v.node('resumeBtn').onclick();}
    if(interruption==='save'){v.node('saveBtn').onclick();v.node('saveCloseBtn').onclick();v.node('resumeBtn').onclick();}
    if(interruption==='form'){setTime(50);v.key('KeyD',false,{tagName:'TEXTAREA'});}
    if(interruption==='hidden'){v.sandbox.document.hidden=true;v.documentListeners.visibilitychange();v.sandbox.document.hidden=false;v.node('resumeBtn').onclick();}
    tap('KeyD',100);assert.equal(p.x,x,interruption);assert.equal(p.blinkClock,0,interruption);
  }
});
test('Blink cooldown and endpoints render in all effect presets including reduced motion',()=>{
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){const {v,g,tap}=royalView({reducedMotion});v.change('effectsPause',preset);v.frame(0);assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&c.args[0]==='双击方向 · 折跃就绪'));tap('ArrowUp',0);tap('ArrowUp',150);assert.doesNotThrow(()=>v.frame());assert.ok(g.effects.some(e=>e.kind==='blink'));assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&/^折跃 [\d.]+s$/.test(c.args[0])));v.node('pauseBtn').onclick();assert.match(v.node('pauseProgress').textContent,/冷却2秒/);const before=g.player.blinkClock;v.frame();assert.equal(g.player.blinkClock,before);}
});
test('Reading incompatible legacy final saves fails visibly without replacing the current run',()=>{
  const {v,g}=royalView();const raw=JSON.parse(NeonCore.exportRunSave(g));delete raw.runUpgrades;raw.data.upgrades=30;raw.data.finalBossSpawned=true;
  v.node('saveBtn').onclick();const before=JSON.stringify(g);v.node('saveText').value=JSON.stringify(raw);v.node('saveImportBtn').onclick();assert.match(v.node('saveStatus').textContent,/旧版最终战.*原版离线包/);assert.equal(JSON.stringify(g),before);assert.equal(v.games.at(-1),g);
});
test('Royal blink draws two small black holes at exact endpoints without adding combat actors',()=>{
  for(const reducedMotion of [false,true]){const {v,g,p,tap}=royalView({reducedMotion});v.frame(0);const fromX=p.x,fromY=p.y;tap('ArrowRight',0);tap('ArrowRight',150);const effect=g.effects.find(e=>e.kind==='blink');assert.equal(effect.fromX,fromX);assert.equal(effect.x,fromX+150);assert.equal(effect.total,.55);assert.equal(g.gravityWells.length,0);assert.equal(g.mines.length,0);v.drawCalls.length=0;v.frame(0);
    for(const x of [fromX,fromX+150]){assert.ok(v.drawCalls.some(c=>c.method==='createRadialGradient'&&c.args[0]===x&&c.args[1]===fromY));assert.ok(v.drawCalls.some(c=>c.method==='ellipse'&&c.args[0]===x&&c.args[1]===fromY));}
    if(reducedMotion){const start=v.drawCalls.filter(c=>c.method==='ellipse').map(c=>c.args);v.drawCalls.length=0;v.frame(40);assert.deepEqual(v.drawCalls.filter(c=>c.method==='ellipse').map(c=>c.args),start,'reduced-motion portals should fade without spinning or scaling');}
  }
});
test('Fifth and sixth campaign wins unlock fresh successors and seventh campaign wins unlock fresh successors',()=>{
  const v=launch({offline:true,storage:new Map([['neonCampaignUnlockV1','5']])});v.change('campaignLevelSelect','6');assert.equal(v.node('startBtn').disabled,true);v.change('campaignLevelSelect','5');completeFirstCampaign(v);assert.equal(v.storage.get('neonCampaignUnlockV1'),'6');v.node('nextLevelBtn').onclick();assert.equal(v.games.at(-1).campaignLevel,6);assert.equal(v.games.at(-1).upgrades,0);assert.match(v.node('chapterText').textContent,/第六关/);v.games.at(-1).finish(false);v.frame();v.node('menuBtn').onclick();v.change('campaignLevelSelect','6');completeFirstCampaign(v);assert.equal(v.storage.get('neonCampaignUnlockV1'),'7');v.node('nextLevelBtn').onclick();assert.equal(v.games.at(-1).campaignLevel,7);assert.match(v.node('chapterText').textContent,/第七关/);v.games.at(-1).finish(false);v.frame();v.node('menuBtn').onclick();v.change('campaignLevelSelect','7');completeFirstCampaign(v);assert.equal(v.storage.get('neonCampaignUnlockV1'),'8');assert.equal(v.node('nextLevelBtn').classList.contains('hidden'),false);
});
test('Wind eye, guarded wardens, saws and both storm boss attacks render and freeze in every preset',()=>{
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){const v=launch({offline:true,reducedMotion,storage:new Map([['neonCampaignUnlockV1','6']])});v.change('campaignLevelSelect','6');v.node('startBtn').onclick();v.change('effectsPause',preset);const g=v.games.at(-1),p=g.player;g.spawnClock=1e9;g.player.fireClock=1e9;g.upgrades=5;g.arenaClock=0;g.updateArena(.01);const e=g.createEnemy('warden',p.x+150,p.y);e.guardRemaining=1;e.hp=e.maxHp=100000;for(let i=0;i<4;i++)g.advanceSkill('saw');g.fireSaws();g.spawnBoss(1);g.boss.attackClock=0;g.updateBossAttack(.01);assert.doesNotThrow(()=>v.frame());assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&/进入风眼/.test(c.args[0])));assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&c.args[0]==='减伤'));assert.ok(g.saws.length);
    g.boss.intent={kind:'stormCage',angle:0,x:p.x,y:p.y,lanes:3,remaining:1,total:1.6,radius:155};assert.doesNotThrow(()=>v.frame());assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&c.args[0]==='留在内圈 / 离开外环'));v.node('pauseBtn').onclick();const before=JSON.stringify([g.saws,g.arenaIntent,g.boss.intent,e.guardRemaining]);v.frame();assert.equal(JSON.stringify([g.saws,g.arenaIntent,g.boss.intent,e.guardRemaining]),before);
  }
});
test('Portable sixth-level saves restore saw actors and all locked storm coordinates at another resolution',()=>{
  const v=launch({offline:true,storage:new Map([['neonCampaignUnlockV1','6']])});v.change('campaignLevelSelect','6');v.node('startBtn').onclick();const g=v.games.at(-1);g.upgrades=10;g.arenaClock=0;g.updateArena(.01);g.createEnemy('warden',600,300);g.advanceSkill('saw');g.fireSaws();g.spawnBoss(1);g.boss.intent={kind:'stormCage',angle:0,x:400,y:300,lanes:3,remaining:1,total:1.6,radius:155};const raw=NeonCore.exportRunSave(g,6);v.sandbox.innerWidth=1920;v.sandbox.innerHeight=1280;v.listeners.resize();v.node('saveBtn').onclick();v.node('saveText').value=raw;v.node('saveImportBtn').onclick();v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const restored=JSON.parse(v.node('saveText').value).data;assert.equal(restored.bossesSpawned[0],1);assert.equal(restored.enemies.find(e=>e.type==='boss').intent.x,800);assert.equal(restored.enemies.find(e=>e.type==='boss').intent.y,600);assert.equal(restored.saws[0].x,960);assert.equal(restored.arenaIntent.x,576);
});
function testWorkshopProfile(){const p=NeonCore.createEquipmentProfile();p.shards=100;return p;}
function gearButton(v,kind,id){return v.node('equipmentGrid').querySelectorAll('button').find(b=>b.dataset[kind]===id);}
test('Workshop opens only outside a run, exposes twelve fixed items and applies selected equipment at the next start',()=>{
  const p=testWorkshopProfile(),v=launch({offline:true,storage:new Map([['neonEquipmentV1',JSON.stringify(p)]])});v.node('equipmentStartBtn').onclick();assert.equal(v.node('equipmentOverlay').classList.contains('show'),true);assert.equal(v.node('startOverlay').inert,true);assert.equal(v.node('saveBtn').disabled,true);assert.equal(v.node('equipmentGrid').querySelectorAll('button').length,24);
  gearButton(v,'gearUpgrade','hull').onclick();gearButton(v,'gearEquip','hull').onclick();gearButton(v,'gearUpgrade','reserve').onclick();gearButton(v,'gearEquip','reserve').onclick();assert.equal(JSON.parse(v.storage.get('neonEquipmentV1')).shards,88);assert.match(v.node('equipmentEntryNote').textContent,/复合外壳 I.*备用方案匣 I/);v.key('KeyP');v.key('Digit1');assert.equal(v.games.at(-1).state,'menu');v.key('Escape');assert.equal(v.node('equipmentOverlay').classList.contains('show'),false);
  v.node('startBtn').onclick();const g=v.games.at(-1);assert.equal(g.player.maxHp,110);assert.equal(g.player.hp,110);assert.equal(g.rerollsRemaining,3);assert.equal(g.owned.length,0);v.node('pauseBtn').onclick();assert.match(v.node('pauseEquipmentInfo').textContent,/复合外壳 I/);v.node('equipmentStartBtn').onclick();assert.equal(v.node('equipmentOverlay').classList.contains('show'),false);
  g.finish(false);v.frame();v.node('equipmentEndBtn').onclick();gearButton(v,'gearUpgrade','hull').onclick();assert.equal(g.equipment.hull.level,1);assert.equal(g.player.maxHp,110);v.node('equipmentCloseBtn').onclick();v.node('restartBtn').onclick();assert.equal(v.games.at(-1).player.maxHp,116);
});
test('Workshop rewards boss first wins immediately and only once, even after repeated frames, reloads or imported saves',()=>{
  const storage=new Map(),v=launch({offline:true,storage});v.node('startBtn').onclick();const g=v.games.at(-1);g.upgrades=10;g.spawnBoss(1);g.hurt(g.boss,100000);v.frame();assert.equal(JSON.parse(storage.get('neonEquipmentV1')).shards,10);v.frame();assert.equal(JSON.parse(storage.get('neonEquipmentV1')).shards,10);v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const text=v.node('saveText').value;assert.equal(JSON.parse(text).profile.claimed[0],'1:1');
  const second=launch({offline:true,storage});second.node('saveBtn').onclick();second.node('saveText').value=text;second.node('saveImportBtn').onclick();second.frame();assert.equal(JSON.parse(storage.get('neonEquipmentV1')).shards,10);assert.deepEqual(JSON.parse(storage.get('neonEquipmentV1')).claimed,['1:1']);
  const third=launch({offline:true,storage});assert.match(third.node('equipmentEntryNote').textContent,/10 研究碎片/);
});
test('QA, practice and explicitly nonformal bosses never award permanent workshop resources',()=>{
  for(const options of [{},{offline:true,nonformal:true},{offline:true,practice:true}]){const v=launch(options);if(options.practice)v.node('practiceStartBtn').onclick();else v.node('startBtn').onclick();const g=v.games.at(-1);if(options.nonformal)g.formal=false;g.upgrades=10;g.spawnBoss(1);g.hurt(g.boss,100000);v.frame();assert.equal(v.storage.has('neonEquipmentV1'),false);assert.match(v.node('equipmentEntryNote').textContent,/0 研究碎片/);}
});
test('Workshop portable files restore whitelisted gear and unlocks, but invalid imports leave current progress intact',()=>{
  const v=launch({offline:true,storage:new Map([['neonEquipmentV1',JSON.stringify(testWorkshopProfile())],['neonCampaignUnlockV1','4']])});v.node('equipmentStartBtn').onclick();gearButton(v,'gearUpgrade','ember').onclick();gearButton(v,'gearEquip','ember').onclick();v.node('equipmentExportBtn').onclick();const text=v.node('equipmentText').value;assert.equal(JSON.parse(text).format,'neon-workshop');assert.equal(v.node('equipmentDownload').classList.contains('hidden'),false);
  const second=launch({offline:true});second.node('equipmentStartBtn').onclick();second.node('equipmentText').value=text;second.node('equipmentImportBtn').onclick();assert.match(second.node('equipmentStatus').textContent,/已读取/);assert.match(second.node('equipmentEntryNote').textContent,/94 研究碎片.*余烬反应堆 I/);const saved=second.storage.get('neonEquipmentV1');
  for(const invalid of ['{',JSON.stringify({...JSON.parse(text),unlocked:99}),JSON.stringify({...JSON.parse(text),profile:{...JSON.parse(text).profile,shards:-1}}),'x'.repeat(20001)]){second.node('equipmentText').value=invalid;second.node('equipmentImportBtn').onclick();assert.match(second.node('equipmentStatus').textContent,/读取失败/);assert.equal(second.storage.get('neonEquipmentV1'),saved);}
  second.node('equipmentCloseBtn').onclick();second.change('campaignLevelSelect','4');assert.equal(second.node('startBtn').disabled,false);second.node('startBtn').onclick();assert.equal(second.games.at(-1).equipment.ember.id,'ember');
});
test('Denied or malformed workshop storage supports a truthful portable session without clearing unrelated keys',()=>{
  for(const settings of [{deniedStorage:true},{readDenied:true},{writeDenied:true},{storage:new Map([['neonEquipmentV1','{"schema":99}']])}]){const v=launch({offline:true,...settings});v.node('equipmentStartBtn').onclick();v.node('equipmentText').value=JSON.stringify({format:'neon-workshop',schema:1,unlocked:1,profile:testWorkshopProfile()});v.node('equipmentImportBtn').onclick();gearButton(v,'gearUpgrade','swift').onclick();gearButton(v,'gearEquip','swift').onclick();assert.match(v.node('equipmentEntryNote').textContent,/94 研究碎片.*轻型推进器 I/);v.node('equipmentExportBtn').onclick();assert.equal(JSON.parse(v.node('equipmentText').value).profile.levels.swift,1);if(settings.deniedStorage||settings.writeDenied)assert.match(v.node('equipmentStorageNote').textContent,/仅在本页面/);v.node('equipmentCloseBtn').onclick();v.node('startBtn').onclick();assert.ok(v.games.at(-1).player.speed>235);}
});
test('Run import restores its own equipment plus workshop profile while legacy imports cannot erase the workshop',()=>{
  let p=testWorkshopProfile();p=NeonCore.upgradeEquipment(p,'hull');p=NeonCore.equipEquipment(p,'hull');const v=launch({offline:true,storage:new Map([['neonEquipmentV1',JSON.stringify(p)]])});v.node('startBtn').onclick();v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const text=v.node('saveText').value,second=launch({offline:true});second.node('saveBtn').onclick();second.node('saveText').value=text;second.node('saveImportBtn').onclick();assert.equal(JSON.parse(second.storage.get('neonEquipmentV1')).levels.hull,1);second.node('saveBtn').onclick();second.node('saveExportBtn').onclick();assert.equal(JSON.parse(second.node('saveText').value).data.equipment.hull.level,1);
  const old=NeonCore.exportRunSave(new NeonCore.Game()),before=second.storage.get('neonEquipmentV1');second.node('saveText').value=old;second.node('saveImportBtn').onclick();assert.equal(second.storage.get('neonEquipmentV1'),before);second.node('saveBtn').onclick();second.node('saveExportBtn').onclick();assert.equal(JSON.parse(second.node('saveText').value).data.equipment.hull,undefined);
});
test('Practice ignores the owned workshop loadout and clearing recent results does not remove equipment',()=>{
  let p=testWorkshopProfile();p=NeonCore.upgradeEquipment(p,'hull');p=NeonCore.equipEquipment(p,'hull');const storage=new Map([['neonEquipmentV1',JSON.stringify(p)]]),v=launch({offline:true,storage});v.node('practiceStartBtn').onclick();assert.equal(v.games.at(-1).equipment.hull,undefined);v.node('pauseBtn').onclick();assert.match(v.node('pauseEquipmentInfo').textContent,/练习不应用/);v.node('practiceExitBtn').onclick();v.node('historyStartBtn').onclick();v.node('historyClearBtn').onclick();v.node('historyConfirmClearBtn').onclick();assert.equal(storage.get('neonEquipmentV1'),JSON.stringify(p));
});

test('Seventh garden hazards, poison enemies and arcing flasks render in every preset with reduced motion and frozen menus',()=>{
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){const v=launch({offline:true,reducedMotion,storage:new Map([['neonCampaignUnlockV1','7']])});v.change('campaignLevelSelect','7');v.node('startBtn').onclick();v.change('effectsPause',preset);const g=v.games.at(-1);g.spawnClock=1e9;g.player.fireClock=1e9;const e=g.createEnemy('sporeling',600,300);e.hp=e.maxHp=100000;for(let i=0;i<4;i++)g.advanceSkill('flask');g.throwFlasks();g.updateFlasks(.2);g.addSporeZone(300,300);g.addSporeZone(400,300,40,0,3);g.acidPools.push({x:500,y:300,r:65,life:3,tickClock:.2,damage:20});g.upgrades=10;g.spawnBoss(1);g.boss.attackClock=0;g.updateBossAttack(.01);v.frame();assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&c.args[0]==='毒区'));assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&c.args[0]==='己方酸池'));assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&/播种锁定/.test(c.args[0])));g.boss.intent={kind:'vineSweep',angle:0,radius:650,x:500,y:300,remaining:1,total:1.5};assert.doesNotThrow(()=>v.frame());v.node('pauseBtn').onclick();const before=JSON.stringify([g.flasks,g.acidPools,g.sporeZones,g.boss.intent]);v.frame(100);assert.equal(JSON.stringify([g.flasks,g.acidPools,g.sporeZones,g.boss.intent]),before);}
});
test('Portable garden saves scale complete flask trajectories and poison zones together at a new resolution',()=>{
  const g=new NeonCore.Game({campaignLevel:7});g.advanceSkill('flask');g.createEnemy('sporeling',600,320);g.throwFlasks();g.updateFlasks(.2);g.addSporeZone(200,300);const text=NeonCore.exportRunSave(g,7),v=launch({offline:true});v.sandbox.innerWidth=1920;v.sandbox.innerHeight=1280;v.listeners.resize();v.node('saveBtn').onclick();v.node('saveText').value=text;v.node('saveImportBtn').onclick();v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const d=JSON.parse(v.node('saveText').value).data;assert.equal(d.flasks[0].startX,960);assert.equal(d.flasks[0].goalX,1172);assert.equal(d.flasks[0].x,g.flasks[0].x*2);assert.equal(d.sporeZones[0].x,400);assert.equal(d.sporeZones[0].y,600);assert.equal(d.state,'paused');
});

test('Practice selectors respect campaign unlocks and all real boss variants restart in their selected level',()=>{
  const locked=launch({offline:true});locked.change('practiceCampaignSelect','7');assert.equal(locked.node('practiceStartBtn').disabled,true);assert.match(locked.node('practiceInfo').textContent,/尚未解锁/);const before=locked.games.at(-1);locked.node('practiceStartBtn').onclick();assert.equal(locked.games.at(-1),before);
  for(const campaign of NeonCore.CAMPAIGN_LEVELS)for(const stage of [1,2,3]){const v=launch({offline:true,storage:new Map([['neonCampaignUnlockV1',String(NeonCore.CAMPAIGN_LEVELS.length)]])});v.change('practiceCampaignSelect',String(campaign.id));v.change('practiceBossSelect',String(stage));v.change('practiceBuildSelect','thrower');assert.match(v.node('practiceInfo').textContent,new RegExp(campaign.bosses[stage-1]));assert.match(v.node('practiceInfo').textContent,/炼金投瓶/);v.node('practiceStartBtn').onclick();const g=v.games.at(-1);assert.equal(g.campaignLevel,campaign.id);assert.equal(g.practiceConfig.buildId,'thrower');g.spawnBoss(stage);g.kill(g.boss);v.frame();assert.match(v.node('resultText').textContent,new RegExp(campaign.bosses[stage-1]));assert.equal(v.storage.has('neonEquipmentV1'),false);assert.equal(historyWrites(v).length,0);v.node('restartBtn').onclick();assert.equal(v.games.at(-1).campaignLevel,campaign.id);assert.equal(v.games.at(-1).practiceConfig.stage,stage);}
});
test('Current end reports and persisted records retain original gear and legacy records never fabricate a loadout',()=>{
  let p=testWorkshopProfile();p=NeonCore.upgradeEquipment(p,'ember');p=NeonCore.equipEquipment(p,'ember');const storage=new Map([['neonEquipmentV1',JSON.stringify(p)]]),v=launch({offline:true,storage});v.node('startBtn').onclick();v.games.at(-1).finish(false);v.frame();assert.match(v.node('reportEquipment').textContent,/余烬反应堆 I/);const record=JSON.parse(storage.get(HISTORY_KEY)).records[0];assert.equal(record.equipment.ember.id,'ember');v.node('historyEndBtn').onclick();assert.match(v.node('historyList').innerHTML,/本局装备.*余烬反应堆 I/);
  const second=launch({offline:true,storage});second.node('historyStartBtn').onclick();assert.match(second.node('historyList').innerHTML,/余烬反应堆 I/);delete record.equipment;const legacy=launch({offline:true,storage:new Map([[HISTORY_KEY,JSON.stringify({schema:1,records:[record]})]])});legacy.node('historyStartBtn').onclick();assert.match(legacy.node('historyList').innerHTML,/旧档未记录装备/);assert.doesNotMatch(legacy.node('historyList').innerHTML,/本局装备.*余烬反应堆/);
});

test('Elite labels and pulse warnings remain visible, finite and frozen in every effect preset',()=>{
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){const v=launch({offline:true,reducedMotion});v.node('startBtn').onclick();v.change('effectsPause',preset);const g=v.games.at(-1);g.upgrades=21;g.bossesSpawned=[1,2];g.bossesDefeated=[1,2];g.firstBossSpawned=true;g.firstBossDefeated=true;g.spawnClock=1e9;g.player.fireClock=1e9;for(const [i,affix]of ['frenzy','crystal','pulse'].entries()){const e=g.createEnemy('blob',300+i*150,300);g.promoteElite(e,affix);if(affix==='pulse'){e.eliteClock=0;g.moveEnemy(e,.01,[]);}}v.frame();for(const name of ['狂暴','凝晶','脉冲'])assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&c.args[0]===name));assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&/^脉冲 \d/.test(c.args[0])));v.node('pauseBtn').onclick();const before=JSON.stringify(g.enemies);v.frame(100);assert.equal(JSON.stringify(g.enemies),before);}
});

test('Read-only codex lists all current skills, recipes, gear, enemies and levels directly from runtime metadata',()=>{
  const v=launch({offline:true});v.node('guideStartBtn').onclick();assert.equal(v.node('guideOverlay').classList.contains('show'),true);assert.equal(v.node('startOverlay').inert,true);assert.equal(v.node('saveBtn').disabled,true);for(const [tab,count]of [['skills',NeonCore.SKILLS.filter(s=>!s.fusion).length],['fusions',NeonCore.FUSIONS.length],['synergies',NeonCore.SYNERGIES.length],['catalysts',NeonCore.CATALYSTS.length],['equipment',NeonCore.EQUIPMENT.length],['enemies',Object.keys(NeonCore.BASE_ENEMIES).length+Object.keys(NeonCore.ELITE_AFFIXES).length],['levels',NeonCore.CAMPAIGN_LEVELS.length]]){v.change('guideTab',tab);assert.equal((v.node('guideGrid').innerHTML.match(/class="guide-card"/g)||[]).length,count);assert.match(v.node('guideCount').textContent,new RegExp(`${count} 项`));}
  const original=NeonCore.SKILLS[0].descriptions[0];try{NeonCore.SKILLS[0].descriptions[0]='临时同步校验';v.change('guideTab','skills');assert.match(v.node('guideGrid').innerHTML,/临时同步校验/);}finally{NeonCore.SKILLS[0].descriptions[0]=original;}
  v.change('guideTab','fusions');assert.match(v.node('guideGrid').innerHTML,/五个身位/);assert.match(v.node('guideGrid').innerHTML,/2→1/);v.change('guideTab','levels');assert.match(v.node('guideGrid').innerHTML,/尚未解锁/);assert.equal(v.storage.has('neonCampaignUnlockV1'),false);
});
test('Codex search never injects the query into markup and invalid categories stay harmless',()=>{
  const v=launch({offline:true});v.node('guideStartBtn').onclick();v.node('guideSearch').value='炼金投瓶';v.node('guideSearch').oninput();assert.equal((v.node('guideGrid').innerHTML.match(/class="guide-card"/g)||[]).length,1);assert.match(v.node('guideGrid').innerHTML,/熔金雨/);v.node('guideSearch').value='<img src=x onerror=alert(1)>';v.node('guideSearch').oninput();assert.doesNotMatch(v.node('guideGrid').innerHTML,/onerror|<img/);assert.match(v.node('guideGrid').innerHTML,/没有匹配/);v.change('guideTab','__proto__');assert.match(v.node('guideCount').textContent,/有效分类/);v.key('Escape');assert.equal(v.node('guideOverlay').classList.contains('show'),false);assert.equal(v.node('guideStartBtn').focused,true);
});
test('Paused codex isolates shortcuts, preserves battle and RNG state, and closes without automatically resuming',()=>{
  const v=launch({offline:true});v.node('startBtn').onclick();const g=v.games.at(-1);v.node('guideStartBtn').onclick();assert.equal(v.node('guideOverlay').classList.contains('show'),false);v.node('pauseBtn').onclick();const frozen=JSON.stringify(g),storageBefore=[...v.storage.entries()];let calls=0;const original=Math.random;Math.random=()=>{calls++;return .5;};try{v.node('guidePauseBtn').onclick();v.key('KeyP');v.key('KeyR');v.key('Digit1');v.key('ArrowRight');v.frame(100);for(const tab of ['skills','enemies','equipment'])v.change('guideTab',tab);assert.equal(JSON.stringify(g),frozen);assert.equal(calls,0);assert.deepEqual([...v.storage.entries()],storageBefore);v.node('saveBtn').onclick();assert.equal(v.node('saveOverlay').classList.contains('show'),false);v.key('Escape');assert.equal(g.state,'paused');assert.equal(v.node('pauseOverlay').classList.contains('show'),true);v.node('resumeBtn').onclick();assert.equal(g.state,'playing');}finally{Math.random=original;}
});
test('End-screen codex cannot replace the concluded game or duplicate history and workshop rewards',()=>{
  const v=launch({offline:true});v.node('startBtn').onclick();const g=v.games.at(-1);g.upgrades=10;g.spawnBoss(1);g.kill(g.boss);v.frame();g.acknowledgeLottery();g.finish(false);v.frame();const history=v.storage.get(HISTORY_KEY),workshop=v.storage.get('neonEquipmentV1');v.node('guideEndBtn').onclick();v.frame();assert.equal(v.games.at(-1),g);assert.equal(v.storage.get(HISTORY_KEY),history);assert.equal(v.storage.get('neonEquipmentV1'),workshop);v.node('equipmentEndBtn').onclick();assert.equal(v.node('equipmentOverlay').classList.contains('show'),false);v.node('guideCloseBtn').onclick();assert.equal(v.node('endOverlay').classList.contains('show'),true);
});

test('Paused state consistently shows the pause overlay after key pause, blur and closing portable saves',()=>{
  const v=launch({offline:true});v.node('startBtn').onclick();v.key('KeyP');assert.equal(v.node('pauseOverlay').classList.contains('show'),true);assert.equal(v.node('pauseOverlay').inert,false);v.node('resumeBtn').onclick();assert.equal(v.node('pauseOverlay').classList.contains('show'),false);v.listeners.blur();assert.equal(v.node('pauseOverlay').classList.contains('show'),true);v.node('saveBtn').onclick();assert.equal(v.node('pauseOverlay').classList.contains('show'),false);v.node('saveCloseBtn').onclick();assert.equal(v.node('pauseOverlay').classList.contains('show'),true);assert.equal(v.games.at(-1).state,'paused');
});

test('Damaged new saves never replace the active paused battlefield or its workshop even with a valid different profile',()=>{
  const profile=testWorkshopProfile(),v=launch({offline:true,storage:new Map([['neonEquipmentV1',JSON.stringify(profile)]])});v.node('startBtn').onclick();const g=v.games.at(-1);g.upgrades=10;g.spawnBoss(1);g.boss.attackClock=0;g.updateBossAttack(.01);v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const text=v.node('saveText').value,profileBefore=v.storage.get('neonEquipmentV1'),battleBefore=JSON.stringify(g);
  for(const mutate of [d=>d.width='960',d=>d.rerollsRemaining=100,d=>d.enemies[0].intent.angle={negativeInfinity:true},d=>d.stats.damageTaken={negativeInfinity:true}]){const raw=JSON.parse(text);raw.profile.shards=999;mutate(raw.data);v.node('saveText').value=JSON.stringify(raw);v.node('saveImportBtn').onclick();assert.match(v.node('saveStatus').textContent,/读取失败/);assert.equal(v.node('saveOverlay').classList.contains('show'),true);assert.equal(JSON.stringify(g),battleBefore);assert.equal(v.storage.get('neonEquipmentV1'),profileBefore);}
  v.node('saveText').value=text;v.node('saveImportBtn').onclick();assert.equal(v.node('saveOverlay').classList.contains('show'),false);assert.equal(v.node('pauseOverlay').classList.contains('show'),true);
});

test('Both new fusion cards reduce slots, show real combined mechanics and restore their actors through the save UI',()=>{
  for(const id of ['bladeWing','goldenDomain'])for(const preset of ['clean','standard','spectacular']){const v=launch({offline:true,reducedMotion:true});v.node('startBtn').onclick();v.change('effectsPause',preset);const g=v.games.at(-1),fusion=NeonCore.FUSIONS.find(f=>f.id===id);g.spawnClock=1e9;g.player.fireClock=1e9;for(const component of fusion.requires)for(let level=0;level<4;level++)g.advanceSkill(component);const e=g.createEnemy('tank',600,300);e.hp=e.maxHp=100000;g.addEnergy(8);v.frame();assert.equal(g.options[0],id);assert.match(v.node('upgradeGrid').innerHTML,new RegExp(fusion.name));v.node('upgradeGrid').querySelector('button').onclick();assert.equal(g.owned.length,1);assert.equal(g.player.build[id],4);v.frame();assert.match(v.node('buildList').innerHTML,new RegExp(fusion.name));v.node('pauseBtn').onclick();assert.match(v.node('pauseBuildList').innerHTML,new RegExp(fusion.name));v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const text=v.node('saveText').value;v.node('saveText').value=text;v.node('saveImportBtn').onclick();assert.equal(v.node('saveOverlay').classList.contains('show'),false);assert.equal(v.node('pauseOverlay').classList.contains('show'),true);assert.match(v.node('pauseBuildList').innerHTML,new RegExp(fusion.name));}
});

test('Nine equipment items can be equipped together through the workshop and bulk controls preserve distinct upgrades',()=>{
  const p=testWorkshopProfile();p.shards=288;const v=launch({offline:true,storage:new Map([['neonEquipmentV1',JSON.stringify(p)]])});v.node('equipmentStartBtn').onclick();for(const gear of NeonCore.EQUIPMENT.filter(e=>!e.since))for(let i=0;i<3;i++)gearButton(v,'gearUpgrade',gear.id).onclick();v.node('equipmentAllBtn').onclick();let stored=JSON.parse(v.storage.get('neonEquipmentV1'));assert.equal(stored.schema,2);assert.equal(stored.equipped.length,9);assert.equal(stored.shards,0);assert.match(v.node('equipmentEntryNote').textContent,/已装配 9 件.*无槽位限制/);assert.equal((v.node('equipmentGrid').innerHTML.match(/equipment-card equipped/g)||[]).length,9);
  gearButton(v,'gearEquip','rhythm').onclick();stored=JSON.parse(v.storage.get('neonEquipmentV1'));assert.equal(stored.equipped.length,8);assert.ok(stored.equipped.includes('ember')&&stored.equipped.includes('focus'));v.node('equipmentAllBtn').onclick();v.node('equipmentCloseBtn').onclick();v.node('startBtn').onclick();const g=v.games.at(-1);assert.equal(Object.keys(g.equipment).length,9);assert.equal(g.player.maxHp,124);assert.equal(g.rerollsRemaining,5);const snapshot=JSON.stringify(g.equipment),storage=v.storage.get('neonEquipmentV1');v.node('equipmentNoneBtn').onclick();assert.equal(JSON.stringify(g.equipment),snapshot);assert.equal(v.storage.get('neonEquipmentV1'),storage);g.finish(false);v.frame();v.node('equipmentEndBtn').onclick();v.node('equipmentNoneBtn').onclick();assert.equal(JSON.parse(v.storage.get('neonEquipmentV1')).equipped.length,0);assert.equal(JSON.stringify(g.equipment),snapshot);
});
test('Old local three-slot workshop profiles and portable files migrate to independent selections without losing resources',()=>{
  const p={...testWorkshopProfile(),schema:1,equipped:{core:'ember',shell:'hull',boots:null}};p.levels.ember=2;p.levels.rhythm=1;p.levels.hull=3;p.claimed=['6:1','6:2'];const v=launch({offline:true,storage:new Map([['neonEquipmentV1',JSON.stringify(p)]])});v.node('equipmentStartBtn').onclick();assert.match(v.node('equipmentEntryNote').textContent,/已装配 2 件/);gearButton(v,'gearEquip','rhythm').onclick();assert.deepEqual(JSON.parse(v.storage.get('neonEquipmentV1')).equipped,['ember','hull','rhythm']);v.node('equipmentText').value=JSON.stringify({format:'neon-workshop',schema:1,unlocked:7,profile:p});v.node('equipmentImportBtn').onclick();const migrated=JSON.parse(v.storage.get('neonEquipmentV1'));assert.equal(migrated.schema,2);assert.equal(migrated.shards,100);assert.deepEqual(migrated.claimed,p.claimed);assert.deepEqual(migrated.equipped,['ember','hull']);assert.equal(migrated.levels.rhythm,1);
});
test('Sixth campaign victory exports complete global progress and a fresh browser restores the unlocked final campaign',()=>{
  for(const deniedStorage of [false,true]){const source=launch({offline:true,deniedStorage,storage:new Map([['neonCampaignUnlockV1','6']])});if(deniedStorage){const seed=NeonCore.exportProgressSave({unlocked:6,profile:NeonCore.createEquipmentProfile()});source.node('saveBtn').onclick();source.node('saveText').value=seed;source.node('saveImportBtn').onclick();}source.change('campaignLevelSelect','6');const completed=completeFirstCampaign(source);source.node('saveBtn').onclick();source.node('saveExportBtn').onclick();const text=source.node('saveText').value,raw=JSON.parse(text);assert.equal(raw.format,'neon-progress');assert.equal(raw.unlocked,7);assert.equal(raw.selected,7);assert.equal(raw.profile.shards,50);assert.deepEqual(raw.profile.claimed,['6:1','6:2','6:3']);assert.equal(raw.history.records.length,1);assert.equal(raw.history.records[0].campaignLevel,6);assert.equal(raw.history.records[0].won,true);assert.equal(source.node('saveDownload').classList.contains('hidden'),false);assert.match(source.node('saveStatus').textContent,/全局存档已生成/);
    const target=launch({offline:true,deniedStorage});target.node('saveBtn').onclick();target.node('saveText').value=text;target.node('saveImportBtn').onclick();assert.equal(target.node('saveOverlay').classList.contains('show'),false);assert.equal(target.node('startOverlay').classList.contains('show'),true);target.change('campaignLevelSelect','7');assert.equal(target.node('startBtn').disabled,false);target.node('saveBtn').onclick();target.node('saveExportBtn').onclick();const again=JSON.parse(target.node('saveText').value);assert.equal(again.unlocked,7);assert.equal(again.profile.shards,50);assert.equal(again.history.records.length,1);target.node('saveCloseBtn').onclick();target.node('startBtn').onclick();assert.equal(target.games.at(-1).campaignLevel,7);assert.equal(target.games.at(-1).upgrades,0);assert.equal(completed.state,'ended');
  }
});
test('Menu and failure can export global saves, while second-boss lottery exports a resumable battle with history',()=>{
  const v=launch({offline:true});v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();assert.equal(JSON.parse(v.node('saveText').value).format,'neon-progress');v.node('saveCloseBtn').onclick();finishFileRun(v);v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const failed=JSON.parse(v.node('saveText').value);assert.equal(failed.format,'neon-progress');assert.equal(failed.history.records.length,1);v.node('saveCloseBtn').onclick();v.node('restartBtn').onclick();const g=v.games.at(-1);g.random=()=>.2;g.addEnergy(100000);g.maybeUpgrade();for(const stage of [1,2]){while(g.upgrades<stage*10){if(g.state==='catalyst')g.keepCatalyst();else g.choose(0);}g.spawnBoss(stage);g.kill(g.boss);if(stage===1)g.acknowledgeLottery();}g.equipCatalyst('pressure');v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const text=v.node('saveText').value,raw=JSON.parse(text);assert.equal(raw.format,'neon-run');assert.equal(raw.data.upgrades,20);assert.equal(raw.data.state,'lottery');assert.equal(raw.history.records.length,1);const second=launch({offline:true});second.node('saveBtn').onclick();second.node('saveText').value=text;second.node('saveImportBtn').onclick();assert.equal(second.node('lotteryOverlay').classList.contains('show'),true);second.node('lotteryContinue').onclick();assert.equal(second.node('upgradeOverlay').classList.contains('show'),true);second.node('saveBtn').onclick();second.node('saveExportBtn').onclick();assert.equal(JSON.parse(second.node('saveText').value).data.bossesDefeated.length,2);
});
test('Malformed global saves cannot partially replace the current run, workshop, unlocks or recent history',()=>{
  const v=launch({offline:true,storage:new Map([[HISTORY_KEY,storedEnvelope([storedRun()])],['neonEquipmentV1',JSON.stringify(testWorkshopProfile())]])});v.node('startBtn').onclick();v.node('saveBtn').onclick();const current=v.games.at(-1),before=JSON.stringify(current),workshop=v.storage.get('neonEquipmentV1'),history=v.storage.get(HISTORY_KEY),unlock=v.storage.get('neonCampaignUnlockV1');const text=NeonCore.exportProgressSave({unlocked:7,profile:NeonCore.createEquipmentProfile(),history:{schema:1,records:[storedRun()]}});
  for(const mutate of [r=>r.selected=8,r=>r.profile.equipped=['unknown'],r=>r.history.records[0].at=-1,r=>r.history.records.push(r.history.records[0])]){const raw=JSON.parse(text);mutate(raw);v.node('saveText').value=JSON.stringify(raw);v.node('saveImportBtn').onclick();assert.match(v.node('saveStatus').textContent,/读取失败/);assert.equal(JSON.stringify(current),before);assert.equal(v.storage.get('neonEquipmentV1'),workshop);assert.equal(v.storage.get(HISTORY_KEY),history);assert.equal(v.storage.get('neonCampaignUnlockV1'),unlock);assert.equal(v.node('saveOverlay').classList.contains('show'),true);}
});

test('Eighth campaign is locked behind a formal seventh win and retains forty waves, first-win resources and portable unlocks',()=>{
  const v=launch({offline:true,storage:new Map([['neonCampaignUnlockV1','7']])});v.change('campaignLevelSelect','8');assert.equal(v.node('startBtn').disabled,true);v.change('campaignLevelSelect','7');completeFirstCampaign(v);assert.equal(v.storage.get('neonCampaignUnlockV1'),'8');v.node('nextLevelBtn').onclick();assert.equal(v.games.at(-1).campaignLevel,8);assert.equal(v.games.at(-1).upgrades,0);assert.match(v.node('chapterText').textContent,/第八关/);v.games.at(-1).finish(false);v.frame();v.node('menuBtn').onclick();v.change('campaignLevelSelect','8');completeFirstCampaign(v);assert.equal(v.node('nextLevelBtn').classList.contains('hidden'),false);v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const raw=JSON.parse(v.node('saveText').value);assert.equal(raw.unlocked,9);assert.equal(raw.selected,9);assert.equal(raw.profile.claimed.filter(id=>id.startsWith('8:')).length,3);
});
test('Ice telegraphs, chill text and friendly falling meteors render safely and freeze in every effect preset',()=>{
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){const v=launch({offline:true,reducedMotion,storage:new Map([['neonCampaignUnlockV1','8']])});v.change('campaignLevelSelect','8');v.node('startBtn').onclick();v.change('effectsPause',preset);const g=v.games.at(-1);g.spawnClock=1e9;g.player.fireClock=1e9;g.upgrades=5;g.arenaClock=0;g.updateArena(.01);const e=g.createEnemy('glacial',600,300);e.hp=e.maxHp=100000;e.frostIntent={remaining:.9,total:.9};g.player.chillRemaining=1.5;for(let i=0;i<4;i++)g.advanceSkill('meteor');g.dropMeteors();g.spawnBoss(1);g.boss.attackClock=0;g.updateBossAttack(.01);v.frame();for(const label of [/冰裂 /,/霜爆 /,/寒滞 /,/己方陨星/])assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&label.test(c.args[0])));v.node('pauseBtn').onclick();const before=JSON.stringify(g);v.frame(100);assert.equal(JSON.stringify(g),before);}
});
test('Ice hazard anchors, full-screen strip lengths and meteor landing points scale consistently on resize and portable import',()=>{
  const g=new NeonCore.Game({campaignLevel:8});g.upgrades=5;g.arenaClock=0;g.updateArena(.01);g.createEnemy('glacial',600,300);g.advanceSkill('meteor');g.dropMeteors();const raw=NeonCore.exportRunSave(g,8),v=launch({offline:true});v.sandbox.innerWidth=1920;v.sandbox.innerHeight=1280;v.listeners.resize();v.node('saveBtn').onclick();v.node('saveText').value=raw;v.node('saveImportBtn').onclick();assert.equal(v.node('saveOverlay').classList.contains('show'),false);assert.equal(v.node('pauseOverlay').classList.contains('show'),true);v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const d=JSON.parse(v.node('saveText').value).data;assert.equal(d.hazards[0].x,g.hazards[0].x*2);assert.equal(d.hazards[0].length,2304);assert.equal(d.meteors[0].x,g.meteors[0].x*2);assert.equal(d.meteors[0].y,g.meteors[0].y*2);assert.equal(d.meteors[0].r,80);v.node('saveCloseBtn').onclick();v.sandbox.innerWidth=960;v.sandbox.innerHeight=640;v.listeners.resize();v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();assert.equal(JSON.parse(v.node('saveText').value).data.hazards[0].length,1152);
});

test('Eighth campaign formal win unlocks the ninth, which keeps a fresh forty-wave run and portable progress',()=>{
  const v=launch({offline:true,storage:new Map([['neonCampaignUnlockV1','8']])});v.change('campaignLevelSelect','9');assert.equal(v.node('startBtn').disabled,true);v.change('campaignLevelSelect','8');completeFirstCampaign(v);assert.equal(v.storage.get('neonCampaignUnlockV1'),'9');v.node('nextLevelBtn').onclick();assert.equal(v.games.at(-1).campaignLevel,9);assert.equal(v.games.at(-1).upgrades,0);assert.match(v.node('chapterText').textContent,/第九关/);v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const text=v.node('saveText').value,r=NeonCore.importGameSave(text);assert.equal(r.unlocked,9);assert.equal(r.game.campaignLevel,9);
});
test('Rift warnings, safe anchors, hunter landing marks and ion beams render and pause in all presets',()=>{
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){const v=launch({offline:true,reducedMotion,storage:new Map([['neonCampaignUnlockV1','9']])});v.change('campaignLevelSelect','9');v.node('startBtn').onclick();v.change('effectsPause',preset);const g=v.games.at(-1);g.upgrades=5;g.spawnClock=g.player.fireClock=1e9;g.arenaClock=0;g.updateArena(.01);const e=g.createEnemy('phaselet',600,300);e.hp=e.maxHp=100000;e.phaseClock=0;g.moveEnemy(e,.01,[]);g.player.fluxRemaining=5;g.recompute();for(let i=0;i<4;i++)g.advanceSkill('ion');g.castIon();g.spawnBoss(3);g.boss.attackClock=0;g.updateBossAttack(.01);v.frame();for(const label of [/裂隙 /,/稳定锚点/,/跃迁 /,/相位增幅/,/首领跃迁落点/])assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&label.test(c.args[0])));assert.ok(g.effects.some(effect=>effect.kind==='ionLink'));v.node('pauseBtn').onclick();const before=JSON.stringify(g);v.frame(100);assert.equal(JSON.stringify(g),before);}
});
test('Rift and anchor coordinates, nested hunter marks and boss jumps scale together without compounding phase boost',()=>{
  const g=new NeonCore.Game({campaignLevel:9});g.upgrades=5;g.arenaClock=0;g.updateArena(.01);const e=g.createEnemy('phaselet',600,300);e.phaseClock=0;g.moveEnemy(e,.01,[]);g.player.fluxRemaining=2.5;g.recompute();g.spawnBoss(3);g.boss.attackClock=0;g.updateBossAttack(.01);const text=NeonCore.exportRunSave(g,9),v=launch({offline:true});v.sandbox.innerWidth=1920;v.sandbox.innerHeight=1280;v.listeners.resize();v.node('saveBtn').onclick();v.node('saveText').value=text;v.node('saveImportBtn').onclick();assert.equal(v.node('saveOverlay').classList.contains('show'),false);v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const d=JSON.parse(v.node('saveText').value).data;assert.equal(d.hazards[0].length,2304);assert.equal(d.hazards[2].x,g.hazards[2].x*2);assert.equal(d.enemies[0].phaseIntent.x,e.phaseIntent.x*2);assert.equal(d.enemies.find(e=>e.type==='boss').intent.x,g.boss.intent.x*2);assert.equal(d.player.fluxRemaining,2.5);assert.ok(Math.abs(d.player.damage-24.3)<1e-8);
});

test('Ninth win unlocks the tenth and the full tenth finale exports a final-level global save without an eleventh level',()=>{
  const v=launch({offline:true,storage:new Map([['neonCampaignUnlockV1','9']])});v.change('campaignLevelSelect','10');assert.equal(v.node('startBtn').disabled,true);v.change('campaignLevelSelect','9');completeFirstCampaign(v);assert.equal(v.storage.get('neonCampaignUnlockV1'),'10');v.node('nextLevelBtn').onclick();assert.equal(v.games.at(-1).campaignLevel,10);assert.equal(v.games.at(-1).upgrades,0);assert.match(v.node('chapterText').textContent,/第十关/);v.games.at(-1).finish(false);v.frame();v.node('menuBtn').onclick();v.change('campaignLevelSelect','10');completeFirstCampaign(v);assert.equal(v.node('nextLevelBtn').classList.contains('hidden'),true);v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const text=v.node('saveText').value,raw=JSON.parse(text);assert.equal(raw.unlocked,10);assert.equal(raw.selected,10);assert.equal(raw.profile.claimed.filter(id=>id.startsWith('10:')).length,3);const restored=launch({offline:true});restored.node('saveBtn').onclick();restored.node('saveText').value=text;restored.node('saveImportBtn').onclick();assert.equal(restored.node('startOverlay').classList.contains('show'),true);assert.equal(restored.node('campaignLevelSelect').value,'10');assert.equal(restored.node('startBtn').disabled,false);restored.change('campaignLevelSelect','11');assert.equal(restored.node('startBtn').disabled,true);
});
test('Pylon protection, purge countdown, safe zones and six star turrets render and freeze with safety labels above danger',()=>{
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){const v=launch({offline:true,reducedMotion,storage:new Map([['neonCampaignUnlockV1','10']])});v.change('campaignLevelSelect','10');v.node('startBtn').onclick();v.change('effectsPause',preset);const g=v.games.at(-1);g.spawnClock=g.player.fireClock=1e9;g.upgrades=10;g.spawnBoss(1);g.spawnPylons(3);g.enemies.find(e=>e.type==='pylon').pylonIntent={remaining:1,total:1};const e=g.createEnemy('tank',600,300);e.hp=e.maxHp=100000;for(let i=0;i<4;i++)g.advanceSkill('turret');g.fireTurrets();g.spawnPurge(3);g.boss.attackIndex=1;g.boss.attackClock=0;g.updateBossAttack(.01);v.frame();assert.match(v.node('bossTitle').textContent,/供能减伤45%/);for(const label of [/供能脉冲 /,/熔核净化 /,/避难区/,/太阳雨锁定/])assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&label.test(c.args[0])));const danger=v.drawCalls.findIndex(c=>c.method==='fillText'&&/^熔核净化 /.test(c.args[0])),safe=v.drawCalls.findIndex(c=>c.method==='fillText'&&/^避难区/.test(c.args[0]));assert.ok(safe>danger);assert.ok(g.effects.some(effect=>effect.kind==='turretLaser'));v.node('pauseBtn').onclick();assert.match(v.node('pauseBuildList').innerHTML,/歼星卫阵/);const before=JSON.stringify(g);v.frame(100);assert.equal(JSON.stringify(g),before);}
});
test('Reactor purge coverage adapts to the new viewport while shelters and turret cycles round-trip and the new practice build is available',()=>{
  const g=new NeonCore.Game({campaignLevel:10});g.upgrades=10;g.spawnBoss(1);g.spawnPylons(3);g.spawnPurge(3);for(let i=0;i<4;i++)g.advanceSkill('turret');g.player.turretVolley=2;const text=NeonCore.exportRunSave(g,10),v=launch({offline:true});v.sandbox.innerWidth=1920;v.sandbox.innerHeight=1280;v.listeners.resize();v.node('saveBtn').onclick();v.node('saveText').value=text;v.node('saveImportBtn').onclick();assert.equal(v.node('saveOverlay').classList.contains('show'),false);v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const d=JSON.parse(v.node('saveText').value).data;assert.equal(d.hazards.find(h=>h.kind==='purge').r,Math.hypot(1920,1280));assert.equal(d.hazards[0].x,g.hazards[0].x*2);assert.equal(d.hazards[0].r,95);assert.equal(d.player.turretVolley,2);assert.doesNotThrow(()=>NeonCore.importGameSave(v.node('saveText').value));const practice=launch({offline:true,storage:new Map([['neonCampaignUnlockV1','10']])});practice.change('practiceCampaignSelect','10');practice.change('practiceBuildSelect','cataclysm');assert.match(practice.node('practiceInfo').textContent,/陨星轰炸.*离子连锁.*星环棱炮/);practice.node('practiceStartBtn').onclick();assert.equal(practice.games.at(-1).mode,'practice');assert.equal(practice.games.at(-1).owned.length,8);
});

test('Catastrophic fusion cards free one slot, retain catalyst eligibility and save their real weapon state in every preset',()=>{
  for(const [id,catalyst]of [['starfire','comet'],['ionCitadel','refractor']])for(const preset of ['clean','standard','spectacular']){
    const v=launch({offline:true,reducedMotion:true});v.node('startBtn').onclick();v.change('effectsPause',preset);const g=v.games.at(-1),recipe=NeonCore.FUSIONS.find(f=>f.id===id);g.spawnClock=g.player.fireClock=1e9;
    for(const component of recipe.requires)for(let tier=0;tier<4;tier++)g.advanceSkill(component);const e=g.createEnemy('tank',600,300);e.hp=e.maxHp=100000;g.addEnergy(8);v.frame();assert.equal(g.options[0],id);assert.match(v.node('upgradeGrid').innerHTML,new RegExp(recipe.name));v.node('upgradeGrid').querySelector('button').onclick();assert.deepEqual(g.owned,[id]);
    g.equipCatalyst(catalyst);if(id==='starfire'){g.dropMeteors();g.throwFlasks();assert.equal(g.meteors.length,9);}else{g.fireTurrets();g.castIon();assert.equal(g.player.turretCount,8);}v.frame();assert.match(v.node('buildList').innerHTML,new RegExp(recipe.name));assert.match(v.node('catalystSlot').innerHTML,new RegExp(NeonCore.BY_CATALYST[catalyst].name));
    v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const saved=v.node('saveText').value;v.node('saveImportBtn').onclick();assert.equal(v.node('pauseOverlay').classList.contains('show'),true);assert.match(v.node('pauseBuildList').innerHTML,new RegExp(recipe.name));v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const restored=NeonCore.importRunSave(v.node('saveText').value).game;assert.equal(restored.catalyst,catalyst);assert.deepEqual(restored.owned,[id]);if(id==='starfire')assert.equal(restored.meteors.length,JSON.parse(saved).data.meteors.length);else assert.equal(restored.player.turretVolley,JSON.parse(saved).data.player.turretVolley);
  }
});
test('All three new specialist catalyst cards expose their tradeoff and codex entries without changing formal progression',()=>{
  for(const [id,skill]of [['comet','meteor'],['relay','ion'],['refractor','turret']]){const v=launch({offline:true});v.node('startBtn').onclick();const g=v.games.at(-1);g.advanceSkill(skill);g.upgrades=6;g.catalystMilestones=[6];g.catalystOptions=[id,'pressure','collector'];g.state='catalyst';g.revision++;v.frame();const c=NeonCore.BY_CATALYST[id];assert.match(v.node('catalystGrid').innerHTML,new RegExp(c.name));assert.ok(v.node('catalystGrid').innerHTML.includes(c.cost));v.node('catalystGrid').querySelector('button').onclick();assert.equal(g.catalyst,id);assert.equal(g.upgrades,6);assert.equal(g.owned.length,1);v.node('pauseBtn').onclick();v.node('guidePauseBtn').onclick();v.change('guideTab','catalysts');assert.match(v.node('guideCount').textContent,/15 项/);assert.match(v.node('guideGrid').innerHTML,new RegExp(c.name));}
});

function practiceSkillButton(view,id){const button=view.node('practiceSkillGrid').querySelectorAll('button').find(b=>b.dataset.practiceSkill===id);assert.ok(button,`missing practice skill ${id}`);return button;}
test('Custom practice controls cap selection at eight, permit deselection and reject an empty or locked launch',()=>{
  const v=launch({offline:true});v.change('practiceBuildSelect','custom');assert.equal(v.node('practiceCustom').classList.contains('hidden'),false);assert.match(v.node('practiceSkillCount').textContent,/8 \/ 8/);assert.equal(practiceSkillButton(v,'rate').disabled,true);practiceSkillButton(v,'rate').onclick();assert.match(v.node('practiceSkillCount').textContent,/8 \/ 8/);
  for(const id of ['meteor','ion','turret','power','move','ghost','shield','heal'])practiceSkillButton(v,id).onclick();assert.match(v.node('practiceSkillCount').textContent,/0 \/ 8/);assert.equal(v.node('practiceStartBtn').disabled,true);const original=v.games.at(-1);v.node('practiceStartBtn').onclick();assert.equal(v.games.at(-1),original);practiceSkillButton(v,'meteor').onclick();assert.equal(v.node('practiceStartBtn').disabled,false);assert.equal(practiceSkillButton(v,'meteor').focused,true);assert.match(v.node('practiceCatalystSelect').innerHTML,/陨轨透镜/);assert.doesNotMatch(v.node('practiceCatalystSelect').innerHTML,/共振线圈/);v.change('practiceCatalystSelect','comet');practiceSkillButton(v,'meteor').onclick();assert.equal(v.node('practiceCatalystSelect').value,'');practiceSkillButton(v,'flask').onclick();v.change('practiceCampaignSelect','10');assert.equal(v.node('practiceStartBtn').disabled,true);v.node('practiceStartBtn').onclick();assert.equal(v.games.at(-1),original);
});
test('Custom fusion practice, restart and portable global saves never create formal records or alter workshop progress',()=>{
  for(const deniedStorage of [false,true]){const v=launch({offline:true,deniedStorage});v.change('practiceBuildSelect','custom');for(const id of ['ion','turret','power','move','ghost','shield','heal'])practiceSkillButton(v,id).onclick();practiceSkillButton(v,'flask').onclick();v.change('practiceBossSelect','3');v.change('practiceCatalystSelect','comet');v.change('practiceFusionSelect','starfire');assert.match(v.node('practiceInfo').textContent,/预演合体：星火炼狱/);v.node('practiceStartBtn').onclick();const g=v.games.at(-1);assert.deepEqual(g.owned,['starfire']);assert.equal(g.catalyst,'comet');assert.match(v.node('waveHint').textContent,/自选实验/);assert.equal(g.practiceConfig.stage,3);v.frame();v.node('pauseBtn').onclick();assert.match(v.node('pauseProgress').textContent,/自选实验，1槽/);const frozen=JSON.stringify(g);v.frame(100);assert.equal(JSON.stringify(g),frozen);v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const data=JSON.parse(v.node('saveText').value);assert.equal(data.format,'neon-progress');assert.equal(data.profile.shards,0);assert.equal(data.history.records.length,0);v.node('saveCloseBtn').onclick();v.node('resumeBtn').onclick();g.spawnBoss(3);g.kill(g.boss);v.frame();assert.match(v.node('resultText').textContent,/自选实验/);assert.equal(historyWrites(v).length,0);v.change('practiceBuildSelect','hunter');v.node('restartBtn').onclick();const r=v.games.at(-1);assert.deepEqual(r.owned,['starfire']);assert.equal(r.catalyst,'comet');assert.equal(r.practiceConfig.buildId,'custom');assert.equal(r.time,0);v.node('pauseBtn').onclick();v.node('practiceExitBtn').onclick();assert.equal(v.games.at(-1).state,'menu');}
});
test('One-click new weapon trial is a max-tier practice in the selected unlocked level and cannot bypass campaign gates',()=>{
  const v=launch({offline:true,storage:new Map([['neonCampaignUnlockV1','10']])});v.change('campaignLevelSelect','10');v.node('newWeaponsBtn').onclick();const g=v.games.at(-1);assert.equal(g.mode,'practice');assert.equal(g.campaignLevel,10);assert.equal(g.practiceConfig.buildId,'cataclysm');assert.equal(g.practiceConfig.stage,3);assert.equal(g.level('meteor'),4);assert.equal(g.level('ion'),4);assert.equal(g.level('turret'),4);v.node('newWeaponsBtn').onclick();assert.equal(v.games.at(-1),g);const locked=launch({offline:true});locked.change('campaignLevelSelect','10');assert.equal(locked.node('newWeaponsBtn').disabled,true);const before=locked.games.at(-1);locked.node('newWeaponsBtn').onclick();assert.equal(locked.games.at(-1),before);
});

test('All twelve equipment items can be upgraded and equipped together, exported globally and restored for the next run',()=>{
  const p=testWorkshopProfile();p.shards=384;const v=launch({offline:true,storage:new Map([['neonEquipmentV1',JSON.stringify(p)]])});v.node('equipmentStartBtn').onclick();for(const gear of NeonCore.EQUIPMENT)for(let i=0;i<3;i++)gearButton(v,'gearUpgrade',gear.id).onclick();v.node('equipmentAllBtn').onclick();assert.match(v.node('equipmentEntryNote').textContent,/已装配 12 件.*无槽位限制/);assert.equal(JSON.parse(v.storage.get('neonEquipmentV1')).shards,0);v.node('equipmentCloseBtn').onclick();v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const text=v.node('saveText').value,other=launch({offline:true});other.node('saveBtn').onclick();other.node('saveText').value=text;other.node('saveImportBtn').onclick();other.node('startBtn').onclick();const g=other.games.at(-1);assert.equal(Object.keys(g.equipment).length,12);assert.equal(g.player.revivalCharges,1);assert.equal(g.player.bossDamageBonus,.18);other.node('pauseBtn').onclick();assert.match(other.node('pauseEquipmentInfo').textContent,/复苏待命/);const practice=launch({offline:true,storage:new Map([['neonEquipmentV1',JSON.stringify(JSON.parse(text).profile)]])});practice.node('newWeaponsBtn').onclick();assert.equal(practice.games.at(-1).player.revivalCharges,0);assert.equal(practice.games.at(-1).player.bossDamageBonus,0);
});
test('Rebirth readiness and activation render in all presets, remain spent after saving and appear in the final report without a false death',()=>{
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){const p=testWorkshopProfile();p.levels.rebirth=3;p.equipped=['rebirth'];const v=launch({reducedMotion,storage:new Map([['neonEquipmentV1',JSON.stringify(p)]])});v.node('startBtn').onclick();v.change('effectsPause',preset);const g=v.games.at(-1);g.spawnClock=g.player.fireClock=1e9;v.frame();assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&c.args[0]==='复苏'));g.damagePlayer(999,'bossContact');v.frame();assert.equal(g.state,'playing');assert.match(v.node('toast').textContent,/复苏胚核触发/);assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&/^复苏 \+60/.test(c.args[0])));v.node('pauseBtn').onclick();assert.match(v.node('pauseEquipmentInfo').textContent,/复苏已消耗/);v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();v.node('saveImportBtn').onclick();v.node('resumeBtn').onclick();const raw=NeonCore.importGameSave(v.node('saveText').value).game;assert.equal(raw.player.revivalCharges,0);const active=v.qa.getGame();active.player.invuln=0;active.damagePlayer(999,'bossContact');v.frame();assert.equal(active.state,'ended');assert.match(v.node('reportEquipment').textContent,/复苏触发 1 \/ 1 次/);}
});
test('Older local nine-item workshop data preserves owned levels and unlocks no new equipment during migration',()=>{
  const p=testWorkshopProfile();p.levels.ember=2;p.equipped=['ember'];for(const id of ['cataclysm','slayer','rebirth'])delete p.levels[id];const v=launch({offline:true,storage:new Map([['neonEquipmentV1',JSON.stringify(p)]])});v.node('equipmentStartBtn').onclick();assert.match(v.node('equipmentEntryNote').textContent,/余烬反应堆 II/);assert.match(v.node('equipmentGrid').innerHTML,/data-gear-equip="rebirth" disabled/);v.node('equipmentExportBtn').onclick();const saved=JSON.parse(v.node('equipmentText').value).profile;assert.equal(saved.levels.rebirth,0);assert.equal(saved.shards,100);assert.equal(saved.levels.ember,2);assert.deepEqual(saved.equipped,['ember']);
});

test('Every boss move has an accurate toast and frozen live attack hint instead of mislabelling new attacks as summons',()=>{
  for(const [kind,move]of Object.entries(NeonCore.BOSS_ATTACK_GUIDE))for(const preset of ['clean','standard','spectacular']){const v=launch({offline:true,reducedMotion:true});v.node('startBtn').onclick();v.change('effectsPause',preset);const g=v.games.at(-1);g.spawnClock=g.player.fireClock=1e9;g.upgrades=10;const b=g.spawnBoss(1);b.intent={kind,angle:0,x:500,y:300,radius:210,innerRadius:100,lanes:3,remaining:1,total:1};g.takeEvents();g.emit('bossWindup',{kind});g.revision++;v.frame();assert.ok(v.node('toast').textContent.includes(move.name));assert.ok(v.node('toast').textContent.includes(move.hint));assert.ok(v.node('bossAttackInfo').textContent.includes(move.name));assert.ok(v.node('bossAttackInfo').textContent.includes(move.hint));v.node('pauseBtn').onclick();const hint=v.node('bossAttackInfo').textContent,before=JSON.stringify(g);v.frame(100);assert.equal(v.node('bossAttackInfo').textContent,hint);assert.equal(JSON.stringify(g),before);}
});
test('Boss move codex is searchable, metadata-driven and read-only while late campaign phase labels use their own themes',()=>{
  const v=launch({offline:true});v.node('guideStartBtn').onclick();v.change('guideTab','bosses');assert.match(v.node('guideCount').textContent,/首领招式 · 17 项/);assert.equal((v.node('guideGrid').innerHTML.match(/class="guide-card"/g)||[]).length,17);v.node('guideSearch').value='相位突袭';v.node('guideSearch').oninput();assert.match(v.node('guideGrid').innerHTML,/不是全圆爆炸/);assert.equal((v.node('guideGrid').innerHTML.match(/class="guide-card"/g)||[]).length,1);v.node('guideCloseBtn').onclick();
  for(const [level,label]of [[6,'风眼初现'],[7,'孢芽初生'],[8,'寒霜初降'],[9,'裂隙初现'],[10,'熔核苏醒']]){const w=launch({offline:true,storage:new Map([['neonCampaignUnlockV1','10']])});w.change('campaignLevelSelect',String(level));w.node('startBtn').onclick();assert.equal(w.node('phaseText').textContent,label);}
});

test('Rocket fusion and trails render and freeze in every preset and portable resize retains complete trajectories',()=>{
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){const v=launch({offline:true,reducedMotion});v.node('startBtn').onclick();v.change('effectsPause',preset);const g=v.games.at(-1);g.spawnClock=g.player.fireClock=1e9;for(const skill of ['rocket','drone'])for(let tier=0;tier<4;tier++)g.advanceSkill(skill);const e=g.createEnemy('tank',800,320);e.hp=e.maxHp=100000;g.fireRockets();g.updateRockets(.05);g.addEnergy(8);v.frame();assert.equal(g.options[0],'skyHunter');assert.match(v.node('upgradeGrid').innerHTML,/天火追猎/);v.node('upgradeGrid').querySelector('button').onclick();g.equipCatalyst('warhead');g.fireRockets();v.frame();assert.match(v.node('buildList').innerHTML,/天火追猎/);assert.match(v.node('catalystSlot').innerHTML,/蜂群弹头/);v.node('pauseBtn').onclick();const before=JSON.stringify(g.rockets);v.frame(100);assert.equal(JSON.stringify(g.rockets),before);v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const text=v.node('saveText').value,original=JSON.parse(text).data.rockets;assert.ok(original.length>0);v.sandbox.innerWidth=1920;v.sandbox.innerHeight=1280;v.listeners.resize();v.node('saveText').value=text;v.node('saveImportBtn').onclick();v.node('saveBtn').onclick();v.node('saveExportBtn').onclick();const loaded=NeonCore.importRunSave(v.node('saveText').value).game;assert.equal(loaded.player.build.skyHunter,4);assert.equal(loaded.catalyst,'warhead');assert.equal(loaded.rockets.length,original.length);assert.equal(loaded.rockets[0].x,original[0].x*2);assert.equal(loaded.rockets[0].trail[0].x,original[0].trail[0].x*2);assert.equal(loaded.rockets[0].damage,original[0].damage);assert.equal(loaded.rockets[0].blast,original[0].blast);}
});
test('Rocketeer practice uses the sixth fixed build, keeps global progress isolated and all new metadata is discoverable',()=>{
  const v=launch({offline:true});assert.match(v.node('practiceRules').textContent,/6套/);v.change('practiceBuildSelect','rocketeer');v.change('practiceBossSelect','3');assert.match(v.node('practiceInfo').textContent,/焰尾火箭/);assert.match(v.node('practiceInfo').textContent,/蜂群弹头/);v.node('practiceStartBtn').onclick();const g=v.games.at(-1);assert.equal(g.level('rocket'),4);assert.equal(g.catalyst,'warhead');g.spawnBoss(3);g.kill(g.boss);v.frame();assert.match(v.node('resultText').textContent,/焰尾爆破/);assert.equal(historyWrites(v).length,0);v.node('guideEndBtn').onclick();for(const [tab,text,count]of [['skills','焰尾火箭',23],['fusions','天火追猎',9],['catalysts','蜂群弹头',15]]){v.change('guideTab',tab);assert.ok(v.node('guideGrid').innerHTML.includes(text));assert.match(v.node('guideCount').textContent,new RegExp(`${count} 项`));}
});

test('Pending rocket clusters keep a friendly label, render their explosion and freeze with every effect and motion setting',()=>{
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){const v=launch({offline:true,reducedMotion});v.node('startBtn').onclick();v.change('effectsPause',preset);const g=v.games.at(-1);g.spawnClock=g.player.fireClock=1e9;for(let i=0;i<4;i++)g.advanceSkill('rocket');const e=g.createEnemy('tank',g.player.x+35,g.player.y);e.hp=e.maxHp=100000;g.fireRockets();g.updateRockets(.1);assert.ok(g.rockets.every(r=>r.phase===1));v.frame();assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&c.args[0]==='己方集束'));assert.ok(g.effects.some(e=>e.kind==='meteorEcho'));v.node('pauseBtn').onclick();const frozen=JSON.stringify(g);v.frame(100);assert.equal(JSON.stringify(g),frozen);}
});

test('Enemy mender channels and repair numbers are clearly labelled, frozen on pause and documented without looking like player healing',()=>{
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){const v=launch({offline:true,reducedMotion});v.node('startBtn').onclick();v.change('effectsPause',preset);const g=v.games.at(-1);g.spawnClock=g.player.fireClock=1e9;const m=g.createEnemy('mender',400,300),e=g.createEnemy('tank',430,300);e.hp=10;m.menderClock=0;g.moveEnemy(m,.01,[]);v.frame();assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&/^敌方修复 /.test(c.args[0])));v.node('pauseBtn').onclick();const frozen=JSON.stringify(g);v.frame(100);assert.equal(JSON.stringify(g),frozen);v.node('guidePauseBtn').onclick();v.change('guideTab','enemies');assert.match(v.node('guideGrid').innerHTML,/再生体/);assert.match(v.node('guideGrid').innerHTML,/不治疗首领/);v.node('guideCloseBtn').onclick();v.node('resumeBtn').onclick();g.moveEnemy(m,.9,[]);v.frame();assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&/^敌方 \+/.test(c.args[0])));assert.equal(g.player.hp,100);}
});

const QUICK_KEY='neonQuickRunV1',quickWrites=v=>v.storageCalls.filter(call=>call.method==='set'&&call.key===QUICK_KEY);
test('Local automatic checkpoints are throttled by combat time and persist pause, reroll and catalyst choices',()=>{
  const v=launch({offline:true});assert.equal(v.node('quickContinueBtn').disabled,true);v.node('startBtn').onclick();const g=v.games.at(-1);g.spawnClock=g.player.fireClock=1e9;assert.equal(quickWrites(v).length,1);g.time=19.9;v.frame(0);assert.equal(quickWrites(v).length,1);g.time=20;v.frame(0);assert.equal(quickWrites(v).length,2);v.frame();assert.equal(quickWrites(v).length,2);v.node('pauseBtn').onclick();assert.equal(JSON.parse(v.storage.get(QUICK_KEY)).data.state,'paused');const writes=quickWrites(v).length;v.frame(100);assert.equal(quickWrites(v).length,writes);v.node('guidePauseBtn').onclick();v.change('guideTab','bosses');v.node('guideCloseBtn').onclick();assert.equal(quickWrites(v).length,writes);v.node('resumeBtn').onclick();g.upgrades=5;g.addEnergy(g.nextXp);v.frame();assert.equal(JSON.parse(v.storage.get(QUICK_KEY)).data.state,'upgrade');v.node('rerollBtn').onclick();const rerolled=JSON.parse(v.storage.get(QUICK_KEY)).data;assert.equal(rerolled.rerollsRemaining,1);assert.deepEqual(rerolled.options,[...g.options]);v.node('upgradeGrid').querySelector('button').onclick();assert.equal(JSON.parse(v.storage.get(QUICK_KEY)).data.state,'catalyst');v.node('catalystKeep').onclick();assert.equal(JSON.parse(v.storage.get(QUICK_KEY)).data.upgrades,6);
});
test('Continue-last-run validates and rescales a battle but preserves newer workshop and archive data while merging unlocks',()=>{
  const source=new NeonCore.Game({campaignLevel:10,equipment:{hull:{id:'hull',level:1}}});for(let i=0;i<4;i++)source.advanceSkill('rocket');source.createEnemy('tank',800,320);source.fireRockets();source.updateRockets(.05);const text=NeonCore.exportRunSave(source,10),p=testWorkshopProfile();p.levels.ember=2;p.levels.rebirth=3;p.equipped=['ember','rebirth'];const profile=JSON.stringify(p),history=storedEnvelope([storedRun()]),v=launch({offline:true,storage:new Map([[QUICK_KEY,text],['neonEquipmentV1',profile],[HISTORY_KEY,history]])});assert.equal(v.node('quickContinueBtn').disabled,false);v.sandbox.innerWidth=1920;v.sandbox.innerHeight=1280;v.listeners.resize();v.node('quickContinueBtn').onclick();assert.equal(v.node('pauseOverlay').classList.contains('show'),true);assert.equal(v.storage.get('neonEquipmentV1'),profile);assert.equal(v.storage.get(HISTORY_KEY),history);assert.equal(v.storage.get('neonCampaignUnlockV1'),'10');const r=NeonCore.importRunSave(v.storage.get(QUICK_KEY)).game;assert.equal(r.state,'paused');assert.equal(r.campaignLevel,10);assert.equal(r.equipment.hull.level,1);assert.equal(r.equipment.rebirth,undefined);assert.equal(r.rockets[0].x,source.rockets[0].x*2);assert.equal(r.rockets[0].trail[0].x,source.rockets[0].trail[0].x*2);assert.match(v.node('toast').textContent,/保留当前工坊/);assert.equal(historyWrites(v).length,0);
});
test('Boss lottery checkpoints restore the already drawn reward, practice never overwrites them and a real conclusion removes only its quick slot',()=>{
  const v=launch({offline:true});v.node('startBtn').onclick();const g=v.games.at(-1);g.upgrades=10;g.spawnBoss(1);g.kill(g.boss);v.frame();const text=v.storage.get(QUICK_KEY),drawn=JSON.parse(text).data.lottery;assert.equal(JSON.parse(text).data.state,'lottery');const second=launch({offline:true,storage:new Map(v.storage)});second.node('newWeaponsBtn').onclick();const practice=second.games.at(-1);practice.spawnBoss(3);practice.kill(practice.boss);second.frame();assert.equal(second.storage.get(QUICK_KEY),text);second.node('menuBtn').onclick();second.node('quickContinueBtn').onclick();assert.equal(second.node('lotteryOverlay').classList.contains('show'),true);assert.deepEqual(JSON.parse(second.storage.get(QUICK_KEY)).data.lottery,drawn);
  v.node('lotteryContinue').onclick();g.finish(false);v.frame();assert.equal(v.storage.has(QUICK_KEY),false);assert.equal(v.node('quickContinueBtn').disabled,true);assert.ok(v.storage.has('neonEquipmentV1'));assert.ok(v.storage.has(HISTORY_KEY));assert.deepEqual(v.storageCalls.filter(c=>c.method==='remove').map(c=>c.key),[QUICK_KEY]);
});
test('Corrupt, oversized or unreadable automatic checkpoints cannot partly change the menu, profile or history',()=>{
  const g=new NeonCore.Game(),valid=JSON.parse(NeonCore.exportRunSave(g));valid.data.width='960';for(const text of ['not json','x'.repeat(2000001),JSON.stringify(valid)]){const profile=JSON.stringify(testWorkshopProfile()),history=storedEnvelope([storedRun()]),v=launch({offline:true,storage:new Map([[QUICK_KEY,text],['neonEquipmentV1',profile],[HISTORY_KEY,history]])}),before=JSON.stringify(v.games.at(-1));v.node('quickContinueBtn').onclick();assert.equal(JSON.stringify(v.games.at(-1)),before);assert.equal(v.storage.get('neonEquipmentV1'),profile);assert.equal(v.storage.get(HISTORY_KEY),history);assert.equal(v.storage.get(QUICK_KEY),text);assert.match(v.node('quickSaveNote').textContent,/不可读取|读取失败/);}const denied=launch({offline:true,deniedStorage:true});denied.node('startBtn').onclick();assert.equal(denied.games.at(-1).state,'playing');assert.match(denied.node('quickSaveNote').textContent,/写入失败/);denied.node('saveBtn').onclick();denied.node('saveExportBtn').onclick();assert.match(denied.node('saveStatus').textContent,/完整存档已生成/);
});
test('Quick checkpoint write failures retain the last successful battle and retry only at the next scheduled boundary',()=>{
  class FaultMap extends Map{set(key,value){if(this.fail&&key===QUICK_KEY)throw new Error('quota');return super.set(key,value);}}
  const storage=new FaultMap(),v=launch({offline:true,storage});v.node('startBtn').onclick();const saved=storage.get(QUICK_KEY),g=v.games.at(-1);g.spawnClock=g.player.fireClock=1e9;storage.fail=true;g.time=20;v.frame(0);assert.equal(storage.get(QUICK_KEY),saved);assert.match(v.node('quickSaveNote').textContent,/保留上次成功/);const count=quickWrites(v).length;for(let i=0;i<10;i++)v.frame();assert.equal(quickWrites(v).length,count);storage.fail=false;g.time=40;v.frame(0);assert.ok(JSON.parse(storage.get(QUICK_KEY)).data.time>=40);assert.doesNotMatch(v.node('quickSaveNote').textContent,/写入失败/);
  const old=NeonCore.exportRunSave;try{NeonCore.exportRunSave=()=> 'x'.repeat(2000001);const full=launch({offline:true,storage:new Map([[QUICK_KEY,saved]])});full.node('startBtn').onclick();assert.equal(full.storage.get(QUICK_KEY),saved);assert.match(full.node('quickSaveNote').textContent,/写入失败/);}finally{NeonCore.exportRunSave=old;}
  const restricted=launch({offline:true,removeDenied:true});restricted.node('startBtn').onclick();restricted.games.at(-1).finish(false);restricted.frame();assert.equal(restricted.storage.get(QUICK_KEY),'');assert.equal(launch({offline:true,storage:restricted.storage}).node('quickContinueBtn').disabled,true);
});

test('Reading, restoring and automatically backing up a quiet battle do not consume default gameplay randomness',()=>{
  const text=NeonCore.exportRunSave(new NeonCore.Game()),original=Math.random;let calls=0;Math.random=()=>{calls++;return .5;};try{const v=launch({offline:true,storage:new Map([[QUICK_KEY,text]])});v.node('quickContinueBtn').onclick();assert.equal(calls,0);v.frame(100);assert.equal(calls,0);v.node('guidePauseBtn').onclick();v.change('guideTab','bosses');v.node('guideCloseBtn').onclick();assert.equal(calls,0);v.node('resumeBtn').onclick();v.node('pauseBtn').onclick();assert.equal(calls,0);}finally{Math.random=original;}
});

function visualFixture(v){
  v.qa.start();const g=v.qa.getGame();g.spawnClock=g.player.fireClock=1e9;g.random=()=>.5;
  for(const id of ['saw','flask','meteor','rocket'])for(let i=0;i<4;i++)g.advanceSkill(id);
  const target=g.createEnemy('tank',700,360);target.hp=target.maxHp=100000;g.fireSaws();g.throwFlasks();g.dropMeteors();g.fireRockets();
  for(const s of g.saws)s.returning=true;for(const f of g.flasks)f.age=f.flight*.5;
  for(const r of g.rockets)r.trail=[{x:r.x-25,y:r.y-12},{x:r.x-12,y:r.y-5},{x:r.x,y:r.y}];
  g.rockets.push({...g.rockets[0],x:240,y:220,phase:1});g.meteors.push({...g.meteors[0],x:330,y:270,phase:1});
  for(const [kind,x,color]of [['meteor',150,'#ffad78'],['meteorEcho',310,'#ffe0ad'],['flaskBurst',470,'#f7ca73']])g.addEffect(kind,x,180,80,color,.5).life=.3;
  g.addEffect('ionLink',600,220,8,'#afc7ff',.3,{fromX:450,fromY:240});g.addEffect('ionLink',620,240,8,'#ede5ff',.35,{fromX:450,fromY:240});
  for(const piercing of [false,true])g.addEffect('turretLaser',650,300+(piercing?25:0),piercing?10:4,'#fff1a8',.22,{fromX:410,fromY:300,piercing});
  g.random=()=>{assert.fail('Drawing must not consume the gameplay RNG');};g.pause();return g;
}

test('Six enhanced weapon visuals are read-only, pause-stable and finite in all three presets and both motion settings',()=>{
  const original=Math.random;Math.random=()=>assert.fail('Cosmetic drawing must not call Math.random');
  try{for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){
    const v=launch({reducedMotion}),g=visualFixture(v);v.qa.setEffects(preset);const frozen=JSON.stringify(g),save=NeonCore.exportRunSave(g),storage=JSON.stringify([...v.storage]);
    v.drawCalls.length=0;v.frame();const first=JSON.stringify(v.drawCalls);v.drawCalls.length=0;v.frame(100);assert.equal(JSON.stringify(v.drawCalls),first,'paused paths must not animate');
    assert.equal(JSON.stringify(g),frozen);assert.equal(NeonCore.exportRunSave(g),save);assert.equal(JSON.stringify([...v.storage]),storage);
    assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&c.args[0]==='己方集束'));assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&c.args[0]==='己方陨星'));assert.ok(v.drawCalls.some(c=>c.method==='fillText'&&c.args[0]==='陨星余震'));
    assert.equal(v.drawCalls.filter(c=>c.method==='save').length,v.drawCalls.filter(c=>c.method==='restore').length);
    assert.ok(!v.drawCalls.some(c=>c.method==='translate'&&c.depth===1));assert.ok(!v.drawCalls.some(c=>c.method==='fillRect'&&c.args[0]===-25&&c.args[1]===-25));
  }}finally{Math.random=original;}
});

test('Visual quality increases bounded draw detail without changing actors, timing, ranges or particles',()=>{
  const v=launch(),g=visualFixture(v),before=JSON.stringify(g),counts=[];
  for(const preset of ['clean','standard','spectacular']){v.qa.setEffects(preset);v.drawCalls.length=0;v.frame();counts.push(v.drawCalls.length);assert.equal(JSON.stringify(g),before);assert.ok(v.drawCalls.length<3200,'fixed visual detail must remain bounded');}
  assert.ok(counts[0]<counts[1]&&counts[1]<counts[2],`${counts}`);
  const isolated=launch();isolated.qa.start();const q=isolated.qa.getGame();q.pause();
  for(const kind of ['meteor','meteorEcho','flaskBurst'])for(const ratio of [1,.5,.001])for(const preset of ['clean','standard','spectacular']){
    q.effects=[];const e=q.addEffect(kind,200,250,95,'#ffad78',.5);e.life=e.total*ratio;isolated.qa.setEffects(preset);isolated.drawCalls.length=0;isolated.frame();
    const circles=isolated.drawCalls.filter(c=>c.method==='arc'&&c.args[0]===200&&c.args[1]===250);assert.ok(circles.length);assert.ok(circles.every(c=>c.args[2]<=95),'blast rings must stay inside the existing radius');
  }
});

test('Reduced motion fixes decorative weapon geometry and omits rocket trails without removing friendly markers',()=>{
  const v=launch({reducedMotion:true}),g=visualFixture(v);v.qa.setEffects('spectacular');v.drawCalls.length=0;v.frame();const paths=()=>v.drawCalls.filter(c=>['moveTo','lineTo','arc','translate','rotate'].includes(c.method));const before=JSON.stringify(paths());
  g.time+=7;for(const e of g.effects)e.life=e.total*.2;for(const f of g.flasks)f.age=f.flight*.9;for(const m of g.meteors)if(!m.phase)m.age=m.delay*.9;
  v.drawCalls.length=0;v.frame();assert.equal(JSON.stringify(paths()),before,'reduced motion should not move decorative geometry');
  const rocket=g.rockets.find(r=>r.phase===0);assert.ok(!v.drawCalls.some(c=>c.method==='moveTo'&&c.args[0]===rocket.trail[0].x&&c.args[1]===rocket.trail[0].y));
  assert.ok(v.drawCalls.some(c=>c.method==='arc'&&c.args[2]===rocket.blast+25));
});

test('Layered friendly impacts and beams remain below exact boss and hostile hazard telegraphs',()=>{
  for(const reducedMotion of [false,true])for(const preset of ['clean','standard','spectacular']){
    const v=launch({reducedMotion}),g=visualFixture(v),guard=g.random;g.resume();g.random=()=>.5;g.spawnBoss(3);g.random=guard;g.boss.intent={kind:'shockwave',remaining:1,total:1};g.pause();g.addHazard({kind:'ice',shape:'circle',x:720,y:180,r:61,warning:1,life:2,damage:18});v.qa.setEffects(preset);v.drawCalls.length=0;v.frame();
    const warning=v.drawCalls.findIndex(c=>c.method==='fill'&&c.args[0]==='evenodd'),impact=v.drawCalls.findIndex(c=>c.method==='arc'&&c.args[0]===150&&c.args[1]===180),beam=v.drawCalls.findIndex(c=>c.method==='lineTo'&&c.args[0]===650&&c.args[1]===300);
    assert.ok(warning>impact&&warning>beam);assert.ok(v.drawCalls.some(c=>c.method==='arc'&&c.args[2]===120));assert.ok(v.drawCalls.some(c=>c.method==='arc'&&c.args[2]===260));assert.ok(v.drawCalls.some(c=>c.method==='arc'&&c.args[0]===720&&c.args[1]===180&&c.args[2]===61));
  }
});

test('Enemy repair links stay pink and dashed rather than acquiring the player ion weapon braid',()=>{
  const v=launch();v.qa.start();v.qa.setEffects('spectacular');const g=v.qa.getGame();g.addEffect('ionLink',620,360,6,'#ffb0c3',.35,{fromX:580,fromY:360});g.pause();v.drawCalls.length=0;v.frame();
  const link=v.drawCalls.findIndex(c=>c.method==='moveTo'&&c.args[0]===580&&c.args[1]===360);assert.ok(link>=0);const stroke=v.drawCalls.slice(link).find(c=>c.method==='stroke');assert.equal(stroke.color,'#ffb0c3');assert.equal(stroke.lineWidth,2);assert.ok(v.drawCalls.slice(0,link).some(c=>c.method==='setLineDash'&&String(c.args[0])==='3,5'));
});

console.log(`\n${passed} interface smoke checks passed (mock DOM/Canvas; no real-browser visual claim).`);
