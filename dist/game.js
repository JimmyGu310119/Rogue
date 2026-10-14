(() => {
  'use strict';
  const {Game,BY_ID,BY_CATALYST,SYNERGIES,DAMAGE_SOURCES,PLAYER_DAMAGE_NAMES,MAX_SLOTS,RUN_UPGRADES,BOSS_MILESTONES,CAMPAIGN_LEVELS,RUN_HISTORY_LIMIT,createRunRecord,sanitizeRunHistory,appendRunHistory,summarizeRunHistory,PRACTICE_BUILDS,createPracticeGame}=NeonCore;
  const $=s=>document.querySelector(s),canvas=$('#game'),ctx=canvas.getContext('2d');
  const ui={start:$('#startOverlay'),upgrade:$('#upgradeOverlay'),catalyst:$('#catalystOverlay'),lottery:$('#lotteryOverlay'),pause:$('#pauseOverlay'),end:$('#endOverlay'),
    hp:$('#hpText'),hpBar:$('#hpBar'),xp:$('#xpText'),xpBar:$('#xpBar'),level:$('#level'),kills:$('#kills'),combo:$('#combo'),timer:$('#timer'),
    progress:$('#progressText'),phase:$('#phaseText'),grid:$('#upgradeGrid'),build:$('#buildList'),synergies:$('#synergyList'),catalystSlot:$('#catalystSlot'),slots:$('#slotCount'),toast:$('#toast'),
    bossWrap:$('#bossWrap'),bossTitle:$('#bossTitle'),bossBar:$('#bossBar'),bossCountdown:$('#bossCountdown'),joystick:$('#joystick'),wavePanel:$('#wavePanel'),wave:$('#waveText'),chapter:$('#chapterText'),waveProgress:$('#waveProgress'),waveHint:$('#waveHint'),waveNotice:$('#waveNotice')};
  let width=innerWidth,height=innerHeight,dpr=1,game=new Game({width,height}),keys={},pointer=null;
  const directionKeys={ArrowUp:[0,-1],KeyW:[0,-1],ArrowDown:[0,1],KeyS:[0,1],ArrowLeft:[-1,0],KeyA:[-1,0],ArrowRight:[1,0],KeyD:[1,0]};
  let lastDirectionTap=null,inputScope='';
  let soundOn=true,audio=null,shake=0,flash=0,skillFlash=0,skillFlashColor='#67a8ff',last=0,hudClock=0,particles=[],texts=[],muzzles=[],lastRevision=-1,view='',lotteryTimer=0,lastWave=-1,lastWaveNumber=-1,lastWaveProgress='';
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Keep visual randomness separate: Game's default random source is Math.random.
  let visualSeed=(Date.now()>>>0)||0x6d2b79f5;
  const visualRandom=()=>{visualSeed^=visualSeed<<13;visualSeed^=visualSeed>>>17;visualSeed^=visualSeed<<5;return(visualSeed>>>0)/4294967296;};
  const FX={clean:{particles:.22,shadow:0,shake:0,flash:0,details:0},standard:{particles:1,shadow:1,shake:.65,flash:.55,details:1},spectacular:{particles:1.55,shadow:1.35,shake:1,flash:1,details:2}};
  let effectsMode='standard';try{const saved=localStorage.getItem('neonEffects');if(Object.hasOwn(FX,saved))effectsMode=saved;}catch{}
  const fx=()=>FX[effectsMode],glow=amount=>amount*fx().shadow;
  const qaMode=['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).has('qa');
  const HISTORY_KEY='neonRunHistoryV1',historyArchived=new WeakMap();
  const CAMPAIGN_KEY='neonCampaignUnlockV1';let unlockedCampaignLevel=1;
  let guideOpen=false,guideOrigin=null;
  const GUIDE_TABS={skills:'技能等级',fusions:'合体配方',synergies:'技能联动',catalysts:'炼金催化',equipment:'局外装备',enemies:'敌人与精英',bosses:'首领招式',levels:'主线关卡'};
  function guideRows(tab){
    if(tab==='skills')return NeonCore.SKILLS.filter(skill=>!skill.fusion).map(skill=>({title:`${skill.icon} ${skill.name}`,tag:skill.type,color:skill.color,body:skill.descriptions.map((text,index)=>`<li><b>${index===3?`突破 · ${skill.breakthrough}`:`LV.${index+1}`}</b><span>${text}</span></li>`).join(''),list:true}));
    if(tab==='fusions')return NeonCore.FUSIONS.map(fusion=>({title:`${fusion.icon} ${fusion.name}`,tag:fusion.requires.map(id=>BY_ID[id].breakthrough).join(' ＋ '),color:fusion.color,body:`${fusion.description} 两项分别突破后，在下一次常规升级中选择合体卡；占用槽位2→1，不由Boss抽奖自动触发。`}));
    if(tab==='synergies')return SYNERGIES.map(recipe=>({title:`✦ ${recipe.name}`,tag:recipe.requires.map(id=>BY_ID[id].name).join(' ＋ '),color:recipe.color,body:recipe.description||recipe.short}));
    if(tab==='catalysts')return NeonCore.CATALYSTS.map(catalyst=>({title:`${catalyst.icon} ${catalyst.name}`,tag:'本局独立一槽 · LV.6 / 14 / 24',color:catalyst.color,body:`收益：${catalyst.benefit}；代价：${catalyst.cost}。换装会移除上一件效果，不累计叠加。`}));
    if(tab==='equipment')return GEAR.map(gear=>({title:`${gear.icon} ${gear.name}`,tag:`${NeonCore.EQUIPMENT_SLOTS[gear.slot]} · I / II / III`,color:'#b9ff4a',body:`${gear.description} 解锁/强化费用：${NeonCore.EQUIPMENT_COSTS.join(' / ')}碎片。分类不限制数量，所有不同装备可一起装配、每件只生效一次。开局锁定配置，不占技能或催化槽，练习不应用。`}));
    if(tab==='enemies'){
      const notes={blob:'接触追击，熟悉自动瞄准和绕行。',swift:'快速接近，保持移动。',tank:'生命较高、行动较慢，适合范围和穿透输出。',splitter:'非炸弹击杀会分裂成两只子怪，仍遵守小怪总上限。',child:'分裂子怪，速度快，不掉消耗道具。',catalyst:'为周围110范围的小怪提供25%移速，优先处理可减轻敌潮。',charger:'站定预警后直线冲锋，横向躲避。',sentinel:'1秒锁定射角后射出能量弹，横移躲开；第1–20波10只、之后15只上限。',warden:'每4.8秒开启1.4秒护甲，减伤50%，炸弹仍能秒杀。',sporeling:'第七关屏内非炸弹死亡留下紫色毒区，预警1.2秒、持续3秒；炸弹能净化。'};
      notes.glacial='进入屏幕后近距离站定蓄力0.9秒，半径95霜爆造成12伤害及寒滞；可击杀或晕眩打断，第1–20波最多10只、之后14只。';
      notes.phaselet='0.9秒预告紫色跃迁落点后瞬移，落地停顿0.65秒；站定蓄力可击杀或晕眩打断。前20波最多12只，之后18只。';
      notes.pylon='存活供能柱每根给第十关Boss减伤15%，最多50%；击碎或等待12秒失效即可解除。脉冲提前1秒警告，半径100内16伤害。前20波最多4根、之后6根。';
      notes.mender='仅第21波后4%替换刷新，21–30波最多3只、之后5只。站定蓄力0.9秒后修复附近最多6只受伤小怪，各回复15%生命上限、每只最多45；不治疗首领、供能柱、自己或其它再生体，可击杀/晕眩打断。';
      return [...Object.entries(NeonCore.BASE_ENEMIES).map(([id,enemy])=>({title:PLAYER_DAMAGE_NAMES[id].replace(/接触$/,''),tag:`基础生命 ${enemy.hp} · 速度 ${enemy.speed} · 能量 ${enemy.energy}`,color:enemy.color,body:`${notes[id]} 显示为基础值，实战还应用波段/关卡及精英倍率。`})),...Object.entries(NeonCore.ELITE_AFFIXES).map(([id,affix])=>({title:`精英 · ${affix.name}`,tag:'第21波起 · 4 / 6存活上限',color:affix.color,body:`血量×${affix.hp}，速度×${affix.speed}，额外2能量。只从普通/迅捷/装甲体的正常刷新产生，适用怪8%概率。${id==='pulse'?'进入屏幕后4秒首攻，之后每5秒站定蓄力1秒，半径85内造成14伤害；可击杀、炸弹或晕眩应对。':'彩环和词缀用于辨认，不会叠加到Boss或已有特殊怪。'}`}))];
    }
    if(tab==='bosses')return Object.values(NeonCore.BOSS_ATTACK_GUIDE).map(move=>({title:move.name,tag:move.hint,color:'#ffba93',body:move.description}));
    if(tab==='levels')return CAMPAIGN_LEVELS.map(level=>({title:level.name,tag:level.id<=unlockedCampaignLevel?'已解锁 · 每关40波':'尚未解锁 · 先通关上一关',color:level.id<=unlockedCampaignLevel?'#b9ff4a':'#bfa8ce',body:`${level.description} 三位首领：${level.bosses.join(' / ')}。LV.10 / 20 / 40触发，预警10 / 20 / 30秒；每关独立构筑，已解锁首领可到练习室学习。`}));
    return [];
  }
  function renderGuide(){const tab=$('#guideTab').value,query=$('#guideSearch').value.slice(0,100).trim().toLocaleLowerCase(),rows=guideRows(tab).filter(row=>`${row.title} ${row.tag} ${row.body.replace(/<[^>]*>/g,' ')}`.toLocaleLowerCase().includes(query));$('#guideCount').textContent=Object.hasOwn(GUIDE_TABS,tab)?`${GUIDE_TABS[tab]} · ${rows.length} 项。只读，不改变当前实验或随机序列。`:'请选择有效分类。';$('#guideGrid').innerHTML=rows.length?rows.map(row=>`<article class="guide-card" style="--guide:${row.color}"><h3>${row.title}</h3><small>${row.tag}</small>${row.list?`<ol>${row.body}</ol>`:`<p>${row.body}</p>`}</article>`).join(''):'<p class="empty-report">没有匹配内容，可以更换分类或关键词。</p>';}
  function openGuide(origin){if(guideOpen||historyOpen||saveOpen||workshopOpen||!['menu','paused','ended'].includes(game.state))return;guideOpen=true;guideOrigin=origin;keys={};lastDirectionTap=null;hideJoystick();$('#guideSearch').value='';$('#guideTab').value='skills';renderGuide();view='';syncView();$('#guideCloseBtn').focus();}
  function closeGuide(){guideOpen=false;view='';syncView();guideOrigin?.focus();guideOrigin=null;}
  try{const value=Number(localStorage.getItem(CAMPAIGN_KEY));if(Number.isInteger(value)&&value>=1&&value<=CAMPAIGN_LEVELS.length)unlockedCampaignLevel=value;}catch{}
  const EQUIPMENT_KEY='neonEquipmentV1',GEAR=NeonCore.EQUIPMENT;let equipmentProfile=NeonCore.createEquipmentProfile(),equipmentPersistent=true,equipmentReadFailed=false,workshopOpen=false;
  try{const raw=localStorage.getItem(EQUIPMENT_KEY);if(raw!==null){if(raw.length>20000)throw new Error('工坊档案过大');equipmentProfile=NeonCore.validateEquipmentProfile(JSON.parse(raw));}}catch{equipmentPersistent=false;equipmentReadFailed=true;}
  function persistEquipment(){try{localStorage.setItem(EQUIPMENT_KEY,JSON.stringify(equipmentProfile));equipmentPersistent=!equipmentReadFailed;}catch{equipmentPersistent=false;}renderEquipmentSummary();}
  function equipmentSummary(loadout){const items=Object.values(loadout).filter(Boolean);return items.length?items.map(item=>`${NeonCore.BY_EQUIPMENT[item.id].name} ${['','I','II','III'][item.level]}`).join(' · '):'未装配装备 · 原始属性';}
  function renderEquipmentSummary(){
    $('#equipmentEntryNote').textContent=`${equipmentProfile.shards} 研究碎片 · 已装配 ${equipmentProfile.equipped.length} 件 / 无槽位限制 · ${equipmentSummary(NeonCore.equipmentLoadout(equipmentProfile))}`;
    $('#equipmentStorageNote').textContent=equipmentPersistent?'本机本浏览器保存；建议导出工坊档案备份。':'本机档案不可读或不可写；当前工坊仅在本页面有效，请导出备份。';
  }
  function settleEquipmentRewards(){if(qaMode||game.mode!=='normal'||game.formal===false)return;const result=NeonCore.claimEquipmentRewards(equipmentProfile,game);if(result.gained){equipmentProfile=result.profile;persistEquipment();toast(`首领首胜 · 研究碎片 +${result.gained}`);}}
  function renderWorkshop(){
    renderEquipmentSummary();$('#equipmentShards').textContent=String(equipmentProfile.shards);
    $('#equipmentGrid').innerHTML=Object.entries(NeonCore.EQUIPMENT_SLOTS).map(([slot,name])=>`<section class="equipment-group"><h3>${name} · 分类，不限制数量</h3>${GEAR.filter(gear=>gear.slot===slot).map(gear=>{const level=equipmentProfile.levels[gear.id],equipped=equipmentProfile.equipped.includes(gear.id),cost=NeonCore.EQUIPMENT_COSTS[level];return `<article class="equipment-card${equipped?' equipped':''}"><h4>${gear.icon} ${gear.name}<b>${level?['','I','II','III'][level]:'未解锁'}</b></h4><p>${gear.description}</p><div><button class="secondary-btn" data-gear-upgrade="${gear.id}"${level>=3||equipmentProfile.shards<cost?' disabled':''}>${level>=3?'已满级':`${level?'强化':'解锁'} · ${cost}碎片`}</button><button class="secondary-btn" data-gear-equip="${gear.id}"${!level?' disabled':''}>${equipped?'卸下':'装配'}</button></div></article>`;}).join('')}</section>`).join('');
    for(const button of $('#equipmentGrid').querySelectorAll('button'))button.onclick=()=>{try{if(button.dataset.gearUpgrade)equipmentProfile=NeonCore.upgradeEquipment(equipmentProfile,button.dataset.gearUpgrade);else{const id=button.dataset.gearEquip;equipmentProfile=NeonCore.equipEquipment(equipmentProfile,id,!equipmentProfile.equipped.includes(id));}persistEquipment();renderWorkshop();$('#equipmentStatus').textContent='配置已更新，下次开始实验时生效。同类装备可一起装配，每件只生效一次。';}catch(error){$('#equipmentStatus').textContent=error.message;}};
  }
  function openWorkshop(){if(!['menu','ended'].includes(game.state)||historyOpen||saveOpen||guideOpen)return;settleEquipmentRewards();workshopOpen=true;keys={};lastDirectionTap=null;hideJoystick();$('#equipmentText').value='';$('#equipmentDownload').classList.add('hidden');$('#equipmentStatus').textContent='每关三位Boss首次击败分别获得10 / 15 / 25碎片。解锁6、强化II为10、强化III为16；重打不重复发放。只在开局应用装备，练习不生效。';renderWorkshop();view='';syncView();$('#equipmentCloseBtn').focus();}
  function closeWorkshop(){workshopOpen=false;view='';syncView();$('#equipmentStartBtn').focus();}
  function exportWorkshop(){const text=JSON.stringify({format:'neon-workshop',schema:1,unlocked:unlockedCampaignLevel,profile:equipmentProfile},null,2);$('#equipmentText').value=text;$('#equipmentDownload').href='data:application/json;charset=utf-8,'+encodeURIComponent(text);$('#equipmentDownload').classList.remove('hidden');$('#equipmentStatus').textContent='工坊档案已生成，包含装备、碎片、首胜记录和关卡解锁；不包含局内战场。';}
  function importWorkshop(){try{const text=$('#equipmentText').value;if(typeof text!=='string'||text.length>20000)throw new Error('工坊档案过大');const raw=JSON.parse(text);if(raw.format!=='neon-workshop'||raw.schema!==1||!Number.isInteger(raw.unlocked)||raw.unlocked<1||raw.unlocked>CAMPAIGN_LEVELS.length)throw new Error('不支持此工坊档案');const profile=NeonCore.validateEquipmentProfile(raw.profile);equipmentProfile=profile;unlockedCampaignLevel=Math.max(unlockedCampaignLevel,raw.unlocked);persistEquipment();try{localStorage.setItem(CAMPAIGN_KEY,String(unlockedCampaignLevel));}catch{}renderWorkshop();renderCampaignChoice();$('#equipmentStatus').textContent='工坊档案已读取并替换装备/碎片/首胜记录；已解锁关卡取较高值，下次开局应用。';}catch(error){$('#equipmentStatus').textContent='读取失败，当前工坊未改变：'+error.message;}}
  let historyRecords=[],historyPersistent=true,historyStorageReason='',historyOpen=false,historyOrigin=null,historyClearPending=false,saveOpen=false;
  function openSave(){if(workshopOpen||guideOpen||historyOpen)return;if(game.state==='playing')game.pause();keys={};hideJoystick();saveOpen=true;$('#saveText').value='';$('#saveDownload').classList.add('hidden');$('#saveStatus').textContent='任何阶段均可备份关卡解锁、工坊和最近十局档案；未结束正式局还保存战场。读取会替换对应进度，建议先备份当前内容。';view='';syncView();$('#saveCloseBtn').focus();}
  const QUICK_SAVE_KEY='neonQuickRunV1';
  let quickText=null,quickLabel='',quickProblem='',quickAttemptGame=null,quickOwner=null,quickStamp='',quickAt=0,quickEndingGame=null;
  function renderQuickSave(){
    const button=$('#quickContinueBtn'),note=$('#quickSaveNote'),label=quickText?`继续上次实验 · ${quickLabel}`:'继续上次实验 · 暂无战场备份';button.disabled=!quickText;if(button.textContent!==label)button.textContent=label;
    const message=`${quickProblem?quickProblem+' ':''}${quickText?'已有本机战场备份；恢复后暂停或保留奖励选择，工坊/档案保持当前值，关卡取较高值。':'战斗每20秒及升级/催化/首领/暂停节点自动备份本机战场。'}新开正式实验会覆盖续玩档；完整进度仍请导出文件。`;if(note.textContent!==message)note.textContent=message;
  }
  function readQuickSave(){
    try{const text=localStorage.getItem(QUICK_SAVE_KEY);if(text){if(text.length>2000000)throw new Error('自动战场备份过大');const raw=JSON.parse(text),d=raw?.data;if(raw?.format!=='neon-run'||d?.mode!=='normal'||!['playing','paused','upgrade','catalyst','lottery'].includes(d.state)||!CAMPAIGN_LEVELS.some(l=>l.id===d.campaignLevel)||!Number.isInteger(d.upgrades)||d.upgrades<0||d.upgrades>RUN_UPGRADES)throw new Error('自动战场备份格式异常');quickText=text;quickLabel=`第${d.campaignLevel}关 LV.${d.upgrades}`;}}
    catch{quickProblem='本机自动备份不可读取或已损坏，请使用手动文件备份；未改动原存储。';}renderQuickSave();
  }
  function updateQuickSave(){
    if(qaMode||game.mode!=='normal'||game.formal===false)return;
    if(game.state==='ended'){
      if(quickEndingGame===game)return;quickEndingGame=game;
      if(quickOwner===game){try{localStorage.removeItem(QUICK_SAVE_KEY);}catch{try{localStorage.setItem(QUICK_SAVE_KEY,'');}catch{quickProblem='本局已结束，但自动备份清除失败；请导出全局进度，重载后可能仍有旧战场。';}}quickText=null;quickLabel='';quickOwner=null;renderQuickSave();}return;
    }
    if(!['playing','paused','upgrade','catalyst','lottery'].includes(game.state))return;
    const stamp=`${game.state}:${game.upgrades}:${game.rerollsRemaining}:${game.catalyst}:${game.bossesSpawned.length}:${game.bossesDefeated.length}:${game.options.join(',')}`;
    if(quickAttemptGame===game&&quickStamp===stamp&&game.time-quickAt<20)return;
    quickAttemptGame=game;quickStamp=stamp;quickAt=game.time;
    try{const text=NeonCore.exportRunSave(game,unlockedCampaignLevel);if(text.length>2000000)throw new Error('自动战场备份过大');localStorage.setItem(QUICK_SAVE_KEY,text);quickText=text;quickOwner=game;quickLabel=`第${game.campaignLevel}关 LV.${game.upgrades}`;quickProblem='';}
    catch{quickProblem='自动备份写入失败，保留上次成功备份；请使用手动导出文件。';}renderQuickSave();
  }
  function continueQuickSave(){
    if(game.state!=='menu'||historyOpen||saveOpen||workshopOpen||guideOpen||!quickText)return;
    try{const restored=NeonCore.importRunSave(quickText),g=restored.game;rescaleGame(g,width,height);unlockedCampaignLevel=Math.max(unlockedCampaignLevel,restored.unlocked);try{localStorage.setItem(CAMPAIGN_KEY,String(unlockedCampaignLevel));}catch{}quickOwner=g;quickAttemptGame=null;activateGame(g);$('#campaignLevelSelect').value=String(g.campaignLevel);renderCampaignChoice();toast('本机战场已恢复 · 保留当前工坊和档案 · 完整备份仍请导出文件');}
    catch{quickProblem='自动战场读取失败，当前游戏/工坊/档案未改变；请使用手动文件备份。';renderQuickSave();}
  }
  function closeSave(){saveOpen=false;view='';syncView();}
  function writeSave(){
    try{
      settleEquipmentRewards();archiveFinishedRun();
      const active=game.mode==='normal'&&['playing','paused','upgrade','catalyst','lottery'].includes(game.state),history={schema:1,records:historyRecords};
      const selected=game.mode==='normal'&&game.state==='ended'&&game.won?Math.min(game.campaignLevel+1,unlockedCampaignLevel):Number($('#campaignLevelSelect').value);
      const text=active?NeonCore.exportRunSave(game,unlockedCampaignLevel,equipmentProfile,history):NeonCore.exportProgressSave({unlocked:unlockedCampaignLevel,profile:equipmentProfile,history,selected:Number.isInteger(selected)&&selected>=1&&selected<=unlockedCampaignLevel?selected:unlockedCampaignLevel});
      $('#saveText').value=text;$('#saveDownload').href='data:application/json;charset=utf-8,'+encodeURIComponent(text);$('#saveDownload').classList.remove('hidden');
      $('#saveStatus').textContent=active?'完整存档已生成：本局战场、锁定装备、工坊、关卡解锁和最近十局档案。点击下载或复制全部内容保存。':'全局存档已生成：关卡解锁、工坊和最近十局档案。读取后返回选关，不重开已结算战斗；点击下载或复制保存。';
    }catch(error){$('#saveStatus').textContent=error.message;}
  }
  function readSave(){try{const restored=NeonCore.importGameSave($('#saveText').value);let g=restored.game;if(g)rescaleGame(g,width,height);else{g=new Game({width,height,campaignLevel:restored.selected});g.state='menu';}unlockedCampaignLevel=Math.max(unlockedCampaignLevel,restored.unlocked);try{localStorage.setItem(CAMPAIGN_KEY,String(unlockedCampaignLevel));}catch{}saveOpen=false;activateGame(g,restored.profile,restored.history);if(restored.kind==='progress')$('#campaignLevelSelect').value=String(restored.selected);renderCampaignChoice();toast(restored.kind==='progress'?'全局进度已读取，请选择关卡继续':'存档读取成功');}catch(error){$('#saveStatus').textContent='读取失败：'+error.message;}}
  let runNo=1;try{const storedRun=Number(localStorage.getItem('neonRun')||0);runNo=Number.isSafeInteger(storedRun)&&storedRun>=0&&storedRun<999999999?storedRun+1:1;}catch{}
  const formatTime=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
  const bossInfo=stage=>game.bossMilestone(stage);
  const bossLabel=stage=>stage===BOSS_MILESTONES.length?'终战':stage===1?'首战':'第二战';
  const chapters=[{name:'第一幕 · 稳态实验',color:'#b9ff4a'},{name:'第二幕 · 裂变洪流',color:'#ffc078'},{name:'第三幕 · 终末临界',color:'#c39aff'}];
  const CAMPAIGN_CHAPTERS={2:['熔炉启封','赤潮增压','炉心过载'],3:['镜界启封','棱镜分裂','虚空回廊'],4:['枢纽启封','折跃追猎','零界引擎'],5:['禁区潜入','交叉火力','哨兵母核'],6:['风眼初现','雷轨交错','天穹风暴'],7:['孢芽初生','荆棘蔓延','永生花期'],8:['寒霜初降','冰脊断层','永冻地心'],9:['裂隙初现','逐相奔流','潮汐回响'],10:['熔核苏醒','天启供能','终焉净化']};
  const hideJoystick=()=>{pointer=null;ui.joystick.style.display='none';ui.joystick.firstElementChild.style.transform='';};

  function rescaleGame(g,nextWidth,nextHeight){
    const sx=nextWidth/g.width,sy=nextHeight/g.height;
    const collections=[[g.player],...['enemies','bullets','gems','items','mines','gravityWells','portals','enemyShots','saws','flasks','acidPools','sporeZones','hazards','meteors','rockets'].map(key=>g[key]||[]),g.boss?.intent&&Number.isFinite(g.boss.intent.x)?[g.boss.intent]:[],g.whistle?[g.whistle]:[],g.arenaIntent?[g.arenaIntent]:[]];
    for(const collection of collections)for(const e of collection){e.x*=sx;e.y*=sy;if(typeof e.startX==='number'){e.startX*=sx;e.startY*=sy;}if(typeof e.prevX==='number')e.prevX*=sx;if(typeof e.prevY==='number')e.prevY*=sy;if(typeof e.goalX==='number'){e.goalX*=sx;e.goalY*=sy;}if(e.type==='phaselet'&&e.phaseIntent){e.phaseIntent.x*=sx;e.phaseIntent.y*=sy;}for(const point of e.trail||[]){point.x*=sx;point.y*=sy;}if(e.shape==='strip'&&['ice','rift'].includes(e.kind))e.length=Math.max(nextWidth,nextHeight)*1.2;}
    for(const hazard of g.hazards)if(hazard.kind==='purge')hazard.r=Math.hypot(nextWidth,nextHeight);
    g.width=nextWidth;g.height=nextHeight;
  }
  function resize(){
    width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    if(game)rescaleGame(game,width,height);
  }
  addEventListener('resize',resize);resize();game.state='menu';
  const isPractice=()=>game.mode==='practice';
  let customPracticeSkills=['meteor','ion','turret','power','move','ghost','shield','heal'];
  const practiceBuildName=config=>config.buildId==='custom'?'自选实验':PRACTICE_BUILDS.find(b=>b.id===config.buildId)?.name||'首领练习';
  function activateGame(nextGame,restoredProfile=null,restoredHistory=null){
    guideOpen=false;guideOrigin=null;
    settleEquipmentRewards();
    archiveFinishedRun();
    if(restoredProfile){equipmentProfile=restoredProfile;persistEquipment();}
    if(restoredHistory){historyRecords=restoredHistory.records;persistHistory();updateHistoryNotices();}
    historyOpen=false;historyClearPending=false;historyOrigin=null;
    clearTimeout(lotteryTimer);clearTimeout(waveNotice.timer);ui.waveNotice.classList.remove('show');hideJoystick();keys={};lastDirectionTap=null;inputScope='';game=nextGame;particles=[];texts=[];muzzles=[];shake=0;flash=0;skillFlash=0;lastRevision=-1;lastWave=-1;lastWaveNumber=-1;lastWaveProgress='';view='';
    $('#runNo').textContent=String(runNo).padStart(2,'0');beep(180,.1,'sawtooth',.04);canvas.focus();syncView();updateHud();
  }
  function renderCampaignChoice(){
    const selected=Number($('#campaignLevelSelect').value),level=CAMPAIGN_LEVELS.find(item=>item.id===selected),available=!!level&&selected<=unlockedCampaignLevel;
    $('#startBtn').disabled=!available;$('#newWeaponsBtn').disabled=!available;$('#campaignLevelInfo').textContent=!level?'请选择有效关卡。':available?`${level.description} 每关独立四十波，构筑重新开始。`:`${level.name}尚未解锁：先完成上一关的四十波和三场首领战。`;
    renderPracticeInfo();
  }
  function start(campaignLevel=Number($('#campaignLevelSelect').value)){
    if(!Number.isInteger(campaignLevel)||campaignLevel<1||campaignLevel>unlockedCampaignLevel)return;
    activateGame(new Game({width,height,campaignLevel,equipment:NeonCore.equipmentLoadout(equipmentProfile)}));
  }
  function startPractice(stage=Number($('#practiceBossSelect').value),buildId=$('#practiceBuildSelect').value,campaignLevel=Number($('#practiceCampaignSelect').value),custom=null){
    if(!Number.isInteger(campaignLevel)||campaignLevel<1||campaignLevel>unlockedCampaignLevel)return;
    const configuration=custom||{customSkills:[...customPracticeSkills],customCatalyst:$('#practiceCatalystSelect').value||null,customFusion:$('#practiceFusionSelect').value||null};
    try{activateGame(createPracticeGame({stage,buildId,width,height,campaignLevel,...configuration}));flushEvents();}
    catch(error){toast(error.message);}
  }
  function showMenu(){
    if(!isPractice()&&!['menu','ended'].includes(game.state))return;
    const menu=new Game({width,height});menu.state='menu';activateGame(menu);renderCampaignChoice();$('#startBtn').focus();
  }
  function renderPracticeInfo(){
    const campaignLevel=Number($('#practiceCampaignSelect').value),level=CAMPAIGN_LEVELS.find(l=>l.id===campaignLevel),stage=Number($('#practiceBossSelect').value),build=PRACTICE_BUILDS.find(b=>b.id===$('#practiceBuildSelect').value),boss=Number.isInteger(stage)&&stage>=1&&stage<=3&&level?level.bosses[stage-1]:null,available=!!level&&campaignLevel<=unlockedCampaignLevel;
    $('#practiceBossSelect').innerHTML=(level?level.bosses:BOSS_MILESTONES.map(b=>b.name)).map((name,index)=>`<option value="${index+1}">${name}</option>`).join('');$('#practiceBossSelect').value=String(boss?stage:1);
    const custom=$('#practiceBuildSelect').value==='custom',catalystSelect=$('#practiceCatalystSelect'),fusionSelect=$('#practiceFusionSelect');$('#practiceCustom').classList.toggle('hidden',!custom);
    const eligibleCatalysts=NeonCore.CATALYSTS.filter(c=>!c.skill||customPracticeSkills.includes(c.skill)),oldCatalyst=catalystSelect.value,oldFusion=fusionSelect.value;
    catalystSelect.innerHTML='<option value="">不装配催化</option>'+eligibleCatalysts.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');catalystSelect.value=eligibleCatalysts.some(c=>c.id===oldCatalyst)?oldCatalyst:'';
    const recipes=stage===3?NeonCore.FUSIONS.filter(f=>f.requires.every(id=>customPracticeSkills.includes(id))):[];
    fusionSelect.innerHTML='<option value="">不合体，保留两项原技能</option>'+recipes.map(f=>`<option value="${f.id}">${f.name} · 2→1槽</option>`).join('');fusionSelect.value=recipes.some(f=>f.id===oldFusion)?oldFusion:'';fusionSelect.disabled=!recipes.length;
    $('#practiceSkillCount').textContent=`自选技能 ${customPracticeSkills.length} / ${MAX_SLOTS}`;
    const grid=$('#practiceSkillGrid');grid.innerHTML=NeonCore.SKILLS.filter(s=>!s.fusion).map(s=>`<button type="button" data-practice-skill="${s.id}" aria-pressed="${customPracticeSkills.includes(s.id)}"${customPracticeSkills.length>=MAX_SLOTS&&!customPracticeSkills.includes(s.id)?' disabled':''}>${s.icon} ${s.name}</button>`).join('');
    for(const button of grid.querySelectorAll('button')){const id=button.dataset.practiceSkill;button.disabled=customPracticeSkills.length>=MAX_SLOTS&&!customPracticeSkills.includes(id);button.onclick=()=>{if(game.state!=='menu')return;const index=customPracticeSkills.indexOf(id);if(index>=0)customPracticeSkills.splice(index,1);else if(customPracticeSkills.length<MAX_SLOTS)customPracticeSkills.push(id);else return;renderPracticeInfo();[...grid.querySelectorAll('button')].find(b=>b.dataset.practiceSkill===id)?.focus();};}
    const skills=custom?customPracticeSkills:build?.skills,catalyst=custom?catalystSelect.value:build?.catalyst,recipe=recipes.find(f=>f.id===fusionSelect.value);
    $('#practiceStartBtn').disabled=!boss||!skills?.length||!available;
    $('#practiceInfo').textContent=!available?'该关尚未解锁，请先完成上一关；练习不会绕过主线解锁。':boss&&skills?.length?`${level.name} · ${boss} · 全技能${stage===3?'突破':` LV.${stage+1}`} · ${skills.map(id=>BY_ID[id].name).join('、')}。催化：${BY_CATALYST[catalyst]?.name||'无'}。${custom?(recipe?`预演合体：${recipe.name}。`:'自选实验，不改变正式局。'):build.description} 只练首领，不运行普通关卡场地循环，无局外装备加成。`:custom?'至少选择一种基础技能。':'请选择有效的首领和构筑。';
  }
  function pause(){if(historyOpen||saveOpen||guideOpen)return;if(game.state==='playing'){game.pause();keys={};hideJoystick();}else if(game.state==='paused'){game.resume();canvas.focus();}syncView();}
  function select(index){try{game.choose(index);flushEvents();syncView();updateHud();}catch(error){toast(error.message);}}
  function reroll(){try{const result=game.reroll();flushEvents();view='';syncView();updateHud();return result;}catch(error){toast(error.message);return null;}}
  function setEffects(mode){
    if(!Object.hasOwn(FX,mode))throw new Error('未知特效档位');effectsMode=mode;
    try{localStorage.setItem('neonEffects',mode);}catch{}
    for(const id of ['effectsStart','effectsPause'])$(`#${id}`).value=mode;document.documentElement?.setAttribute('data-effects',mode);
    const note=reducedMotion?'已遵守系统“减少动态效果”：禁用震动与全屏闪光。伤害、范围及敌人预警不变。':'只改变粒子、光效与镜头反馈，伤害、范围及敌人预警不变。';
    for(const id of ['effectsStartNote','effectsPauseNote'])$(`#${id}`).textContent=note;
    if(mode==='clean'){shake=0;flash=0;skillFlash=0;particles=particles.slice(-120);}return{mode:effectsMode,reducedMotion};
  }
  function selectCatalyst(index){try{game.chooseCatalyst(index);flushEvents();syncView();updateHud();if(game.state==='playing')canvas.focus();}catch(error){toast(error.message);}}
  function keepCatalyst(){if(game.state!=='catalyst')return;game.keepCatalyst();flushEvents();syncView();updateHud();if(game.state==='playing')canvas.focus();}
  function continueLottery(){if(game.state!=='lottery')return;game.acknowledgeLottery();flushEvents();syncView();updateHud();if(game.state==='playing')canvas.focus();}
  function overlayVisibility(element,on){element.classList.toggle('show',on);element.setAttribute('aria-hidden',String(!on));element.inert=!on;}
  function syncView(){
    settleEquipmentRewards();
    archiveFinishedRun();
    updateQuickSave();
    const scope=`${game.state}:${historyOpen}:${saveOpen}:${workshopOpen}:${guideOpen}`;if(scope!==inputScope){lastDirectionTap=null;if(game.state!=='playing'||historyOpen||saveOpen||workshopOpen||guideOpen)keys={};inputScope=scope;}
    const signature=`${game.state}:${game.upgrades}:${game.revision}:${game.rerollsRemaining}:${game.options.join(',')}:${historyOpen}:${saveOpen}:${workshopOpen}:${guideOpen}`;
    if(view===signature)return;view=signature;hideJoystick();
    overlayVisibility($('#guideOverlay'),guideOpen);
    for(const name of ['start','upgrade','catalyst','lottery','pause','end'])overlayVisibility(ui[name],!saveOpen&&!historyOpen&&!workshopOpen&&!guideOpen&&game.state===({start:'menu',pause:'paused',end:'ended'}[name]||name));
    overlayVisibility($('#equipmentOverlay'),workshopOpen);$('#saveBtn').disabled=workshopOpen||guideOpen;if(guideOpen){$('#pauseBtn').disabled=true;return;}if(workshopOpen){$('#pauseBtn').disabled=true;return;}
    overlayVisibility($('#saveOverlay'),saveOpen);if(saveOpen)return;
    overlayVisibility($('#historyOverlay'),historyOpen);
    $('#pauseBtn').disabled=historyOpen||!['playing','paused'].includes(game.state);
    if(historyOpen){renderHistory();return;}
    if(game.state==='upgrade')renderOptions();
    if(game.state==='catalyst')renderCatalysts();
    if(game.state==='lottery')renderLottery();
    if(game.state==='paused'){renderPause();$('#resumeBtn').focus();}
    if(game.state==='ended')renderEnd();
  }
  function renderOptions(){
    $('#upgradeTitle').textContent=`第 ${game.upgrades+1} 波完成 · 升至 LV.${game.upgrades+1}`;
    $('#upgradeSubtitle').textContent=game.owned.length>=MAX_SLOTS?'八槽已满，继续强化你的反应式。':`${NeonCore.SKILLS.filter(skill=>!skill.fusion).length}种基础技能，${NeonCore.FUSIONS.length}组合体，最多八槽。观察配方预告，选择你的流派。`;
    ui.grid.innerHTML=game.options.map((id,index)=>{
      const skill=BY_ID[id],level=game.level(id),breaking=level===3;
      const name=skill?(breaking?skill.breakthrough:skill.name):'普攻强化';
      const description=skill?skill.descriptions[level]:'所有技能均已突破；普攻基础伤害累计增加 15%。';
      const label=skill?.fusion?'合体 · 释放一格':skill?(breaking?'突破':`LV.${level+1}`):'基础伤害 +15%';
      const preview=game.skillPreview(id).map(s=>`<span class="preview-item preview-${s.status}">${s.status==='activate'?`✦ 选后激活 · ${s.name}`:s.status==='active'?`✓ 已激活 · ${s.name}`:`◇ ${s.name} · 还缺 ${s.missing.join('、')}`}</span>`).join('');
      return `<button class="upgrade-card ${breaking?'breakthrough':''}" style="--card:${skill?.color||'#b9ff4a'}" data-index="${index}"><span class="num">0${index+1}</span><span class="upgrade-icon">${skill?.icon||'↑'}</span><h3>${name}</h3><p>${description}</p><span class="type">${skill?.type||'普攻'} // ${label}</span>${preview?`<span class="synergy-preview">${preview}</span>`:''}</button>`;
    }).join('');
    ui.grid.querySelectorAll('button').forEach(button=>button.onclick=()=>select(Number(button.dataset.index)));
    ui.grid.querySelector('button')?.focus();
    const canChange=game.candidates().length>game.options.length;
    $('#rerollBtn').disabled=game.rerollsRemaining<=0||!canChange;$('#rerollBtn').textContent=`重抽选项 · 剩余 ${game.rerollsRemaining} 次`;$('#rerollBtn').title=canChange?'不消耗经验或升级次数':'可用选项已全部显示，没有不同选项';
  }
  function renderLottery(){
    const result=game.lottery,number=$('#lotteryNumber'),list=$('#lotteryResults'),button=$('#lotteryContinue');
    $('#lotteryAt').textContent=`${bossInfo(result.bossStage).name} · ${bossLabel(result.bossStage)}击败奖励`;
    button.textContent=result.bossStage===BOSS_MILESTONES.length?'领取奖励并完成四十波实验':'领取奖励并继续下一幕';
    number.textContent='?';number.classList.add('rolling');button.disabled=true;list.innerHTML='<li>正在解析反应结果…</li>';
    clearTimeout(lotteryTimer);
    lotteryTimer=setTimeout(()=>{
      if(game.state!=='lottery')return;number.textContent=result.count;number.classList.remove('rolling');
      list.innerHTML=result.results.length?result.results.map(r=>`<li>${r.id==='attack'?`普攻基础伤害 +15%（累计 +${Math.round(r.bonus*100)}%）`:`${r.name} <b>${r.level===4?'突破':`LV.${r.level}`}</b>`}</li>`).join(''):'<li>本次没有额外强化。继续积累反应能。</li>';
      $('#lotteryCaption').textContent=result.count?`获得 ${result.count} 次随机强化`:'本次获得 0 次强化';button.disabled=false;button.focus();beep(result.count===3?760:400,.2,'sine',.04);
    },reducedMotion?0:850);
  }
  function renderCatalysts(){
    const current=game.equippedCatalyst,grid=$('#catalystGrid');
    $('#catalystTitle').textContent=current?'更换炼金催化':'选择炼金催化';
    $('#catalystSubtitle').textContent=`LV.${game.upgrades} 催化奖励 · 独立一槽，本局生效${current?`。当前：${current.name}`:'，选择一种增益与取舍。'}`;
    grid.innerHTML=game.catalystOptions.map((id,index)=>{
      const c=BY_CATALYST[id];return `<button class="upgrade-card catalyst-card" style="--card:${c.color}" data-index="${index}"><span class="num">0${index+1}</span><span class="upgrade-icon">${c.icon}</span><h3>${c.name}</h3><p>${c.description}</p><div class="catalyst-benefit">＋ ${c.benefit}</div><div class="catalyst-cost">↔ ${c.cost}</div><span class="type">${c.skill?BY_ID[c.skill].name:'通用催化'} // 装配后替换原道具</span></button>`;
    }).join('');
    grid.querySelectorAll('button').forEach(button=>button.onclick=()=>selectCatalyst(Number(button.dataset.index)));
    $('#catalystKeep').textContent=current?'保留当前催化':'暂不装备';grid.querySelector('button')?.focus();
  }
  function updateBuild(){
    const entries=game.owned.map(id=>({s:BY_ID[id],level:game.level(id)}));
    ui.slots.textContent=`${entries.length} / ${MAX_SLOTS}`;
    ui.build.innerHTML=entries.map(({s,level})=>`<div class="build-item ${level===4?'is-broken':''}" title="${s.descriptions[level-1]}"><i style="--item:${s.color}">${s.icon}</i><span>${level===4?s.breakthrough:s.name}</span><b style="--item:${s.color}">${level===4?'突破':`LV.${level}`}</b></div>`).join('')+Array.from({length:Math.max(0,MAX_SLOTS-entries.length)},(_,i)=>`<div class="build-item empty-slot"><i>${entries.length+i+1}</i><span>空槽</span></div>`).join('');
    ui.synergies.innerHTML=game.synergies.length?game.synergies.map(s=>`<div class="synergy-item" style="--synergy:${s.color}"><span>✦ ${s.name}</span><small>${s.short}</small></div>`).join(''):'<span class="empty-build">组合技能可激活联动</span>';
    const catalyst=game.equippedCatalyst;
    ui.catalystSlot.innerHTML=catalyst?`<div class="catalyst-item" style="--catalyst:${catalyst.color}"><b>${catalyst.icon} ${catalyst.name}</b><small>${catalyst.benefit}</small><small class="catalyst-slot-cost">${catalyst.cost}</small></div>`:'<span class="empty-build">第 6 / 14 / 24 级可装配</span>';
  }
  function updateHud(){
    const p=game.player;ui.hp.textContent=`${Math.ceil(p.hp)} / ${p.maxHp}`;ui.hpBar.style.width=`${p.hp/p.maxHp*100}%`;
    ui.xp.textContent=game.upgrades>=RUN_UPGRADES?`LV.${RUN_UPGRADES} · 终战已就绪`:`${p.xp} / ${game.nextXp}${game.upgradeLocked?' · 暂存':''}`;
    ui.xpBar.style.width=`${game.upgrades>=RUN_UPGRADES?100:Math.min(100,p.xp/game.nextXp*100)}%`;
    ui.level.textContent=game.upgrades;ui.kills.textContent=game.kills;ui.combo.textContent=`×${game.combo.toFixed(1)}`;
    ui.timer.textContent=formatTime(game.time);ui.progress.textContent=`${game.upgrades} / ${RUN_UPGRADES}`;
    const chapter=isPractice()?game.practiceConfig.stage:Math.min(chapters.length,game.boss?.bossStage||game.bossDue?.stage||(game.state==='lottery'&&game.lottery?.bossStage)||Math.floor(game.upgrades/10)+1);
    ui.phase.textContent=game.boss?`${bossLabel(game.boss.bossStage)} · 首领战`:game.bossDue?`${bossLabel(game.bossDue.stage)} · 预警中`:CAMPAIGN_CHAPTERS[game.campaignLevel]?.[chapter-1]||chapters[chapter-1].name.split(' · ')[1];
    ui.bossWrap.classList.toggle('hidden',!game.boss);if(game.boss){const protection=game.campaignLevel===10?game.reactorShieldReduction():0;ui.bossTitle.textContent=`${bossInfo(game.boss.bossStage).name} · ${bossLabel(game.boss.bossStage)}${game.boss.enraged?' / 狂暴':''}${protection?` / 供能减伤${Math.round(protection*100)}%`:''}`;ui.bossBar.style.width=`${Math.max(0,game.boss.hp/game.boss.maxHp*100)}%`;}
    const b=game.boss,move=b?.intent&&NeonCore.BOSS_ATTACK_GUIDE[b.intent.kind];$('#bossAttackInfo').textContent=!b?'':move?`${move.name} · ${Math.max(0,b.intent.remaining).toFixed(1)}秒 · ${move.hint}`:b.dashRemaining>0?'锁向冲锋进行中 · 横向避开，留意二段追击':`下一招蓄力 ${Math.max(0,b.attackClock).toFixed(1)}秒 · 观察预警再移动`;
    ui.bossCountdown.classList.toggle('hidden',!game.bossDue);
    if(game.bossDue)ui.bossCountdown.textContent=`⚠ ${isPractice()?'练习准备 · ':''}${bossInfo(game.bossDue.stage).name} · ${Math.ceil(Math.max(0,game.bossDue.at-game.time))} 秒后降临`;
    if(isPractice()){ui.xp.textContent='固定构筑 · 不进行局内升级';ui.xpBar.style.width='0%';ui.progress.textContent='首领练习';ui.phase.textContent=game.boss?'练习 · 首领战':game.bossDue?'练习 · 准备中':'练习 · 已结束';}
    updateWaves(chapter);
    if(lastRevision!==game.revision){lastRevision=game.revision;updateBuild();}
  }
  function updateWaves(chapter){
    ui.waveProgress.classList.toggle('hidden',isPractice());
    if(isPractice()){
      const config=game.practiceConfig;ui.wave.textContent='首领练习 · 非正式';ui.chapter.textContent=bossInfo(config.stage).name;
      ui.wavePanel.dataset.chapter=String(config.stage);$('#game-shell').dataset.chapter=String(config.stage);
      ui.waveHint.textContent=`${practiceBuildName(config)} · ${config.tier===4?'全技能突破':`全技能 LV.${config.tier}`} · 无普通敌潮，仅保留首领召唤`;
      return;
    }
    const wave=game.wave,gate=game.state!=='ended'&&BOSS_MILESTONES.some(b=>b.upgrade===game.upgrades&&wave===b.upgrade),labels=CAMPAIGN_CHAPTERS[game.campaignLevel];ui.wave.textContent=`第 ${wave} / ${RUN_UPGRADES} 波`;ui.chapter.textContent=labels?`${CAMPAIGN_LEVELS[game.campaignLevel-1].name.split(' · ')[0]} · ${labels[chapter-1]}`:chapters[chapter-1].name;ui.wavePanel.dataset.chapter=String(chapter);$('#game-shell').dataset.chapter=String(chapter);$('#game-shell').dataset.campaign=String(game.campaignLevel);
    ui.waveHint.textContent=game.state==='ended'?(game.won?'四十波净化完成':`实验结束 · 完成 ${game.upgrades} 波`):game.state==='lottery'?'首领已击败 · 确认奖励后继续':game.boss?game.boss.bossStage===BOSS_MILESTONES.length?'四十波完成 · 击败最终首领完成实验':`LV.${game.upgrades} 首领关卡 · 击败后继续`:game.bossDue?`LV.${game.upgrades} 首领关卡 · 等待降临`:game.upgrades>=RUN_UPGRADES?`四十波已完成 · ${bossInfo(3).name}待净化`:'收集反应能，选择升级后推进下一波';
    const signature=`${game.upgrades}:${wave}:${gate}`;
    if(lastWaveProgress!==signature){lastWaveProgress=signature;ui.waveProgress.innerHTML=Array.from({length:RUN_UPGRADES},(_,i)=>{const boss=BOSS_MILESTONES.find(b=>b.upgrade===i+1);return `<i data-wave="${i+1}" class="${i<game.upgrades?'done':i+1===wave&&game.upgrades<RUN_UPGRADES?'current':''}${boss?' boss-step':''}${gate&&i+1===wave?' gate-step':''}" title="第 ${i+1} 波${boss?` · ${boss.name}`:''}"></i>`;}).join('');ui.waveProgress.setAttribute('aria-label',`已完成 ${game.upgrades} / ${RUN_UPGRADES} 波`);}
    if(lastWave!==game.upgrades){
      if(lastWave>=0&&game.upgrades>lastWave){const boss=BOSS_MILESTONES.find(b=>b.upgrade===game.upgrades);waveNotice(boss?`第 ${game.upgrades} 波完成 · LV.${game.upgrades} · ${boss.name}预警 ${boss.warning} 秒`:`第 ${game.upgrades} 波完成 · LV.${game.upgrades} · 下一波 ${wave}`);}
      lastWave=game.upgrades;
    }else if(lastWaveNumber>=0&&wave>lastWaveNumber)waveNotice(`${ui.chapter.textContent} · 第 ${wave} 波开始`);
    lastWaveNumber=wave;
  }
  function waveNotice(message){ui.waveNotice.textContent=message;ui.waveNotice.classList.add('show');clearTimeout(waveNotice.timer);waveNotice.timer=setTimeout(()=>ui.waveNotice.classList.remove('show'),2400);}
  function renderEnd(){
    $('#nextLevelBtn').textContent='进入下一关';
    $('#resultEyebrow').textContent=game.won?'EXPERIMENT COMPLETE':'REACTION COLLAPSED';$('#resultTitle').textContent=game.won?'净化完成':'实验失控';
    $('#resultText').textContent=game.won?`${CAMPAIGN_LEVELS[game.campaignLevel-1].name}四十波完成，三名首领击败。`:`${CAMPAIGN_LEVELS[game.campaignLevel-1].name}已完成 ${game.upgrades} / ${RUN_UPGRADES} 波，达到 LV.${game.upgrades}。`;
    if(!isPractice()&&game.won&&game.campaignLevel<CAMPAIGN_LEVELS.length&&unlockedCampaignLevel>game.campaignLevel)$('#resultText').textContent+=CAMPAIGN_LEVELS[game.campaignLevel].name+'已解锁。';
    updateHistoryNotices();
    $('#finalKills').textContent=game.kills;$('#finalLevel').textContent=game.upgrades;$('#finalWaves').textContent=`${game.upgrades} / ${RUN_UPGRADES}`;$('#finalTime').textContent=formatTime(game.time);
    $('#finalWavesLabel').textContent=isPractice()?'练习目标':'完成波次';
    $('#restartBtn').innerHTML=isPractice()?'<span>再练一次</span><small>重复同一首领与固定构筑</small>':'<span>再来一局</span><small>新的变异序列已经就绪</small>';
    $('#nextLevelBtn').classList.toggle('hidden',isPractice()||!game.won||game.campaignLevel>=CAMPAIGN_LEVELS.length||unlockedCampaignLevel<=game.campaignLevel);
    if(isPractice()){$('#resultEyebrow').textContent='BOSS PRACTICE // UNRANKED';$('#resultTitle').textContent=game.won?'练习目标击败':'练习结束';$('#resultText').textContent=`${bossInfo(game.practiceConfig.stage).name} · ${practiceBuildName(game.practiceConfig)}。本次为非正式练习，不代表完成主线，不计入正式档案。`;$('#finalWaves').textContent=game.won?'击败':'未击败';}
    const report=game.report(),number=value=>Math.round(value||0).toLocaleString('zh-CN');
    $('#reportTotalDamage').textContent=number(report.totalDamage);$('#reportBossDamage').textContent=number(report.bossDamage);$('#reportTaken').textContent=number(report.damageTaken);$('#reportBlocked').textContent=number(report.blockedDamage);
    const rows=report.damage.filter(row=>row.damage>0).slice().sort((a,b)=>b.damage-a.damage);
    $('#reportDamageRows').innerHTML=rows.map(row=>{const share=Math.max(0,Math.min(100,row.share*100));return `<tr><td><span>${row.name} <small>${share.toFixed(1)}%</small></span><i class="damage-share" style="width:${share}%"></i></td><td>${number(row.damage)}</td><td>${number(row.bossDamage)}</td></tr>`;}).join('');
    $('#reportDamageEmpty').classList.toggle('hidden',rows.length>0);
    $('#reportBosses').innerHTML=BOSS_MILESTONES.map(({stage})=>{const name=bossInfo(stage).name;
      const record=report.bosses.find(b=>b.stage===stage),health=record&&Number.isFinite(record.hp)&&record.maxHp>0?Math.max(0,Math.min(100,record.hp/record.maxHp*100)):null;
      return `<div><b>${name} · ${bossLabel(stage)}</b><span>${record?`${record.killed?'已击败':'未击败'} · 战斗 ${formatTime(record.duration)}${record.killed?'':'（截至结算）'}`:'未遭遇'}</span>${record&&!record.killed&&health!==null?`<small class="boss-remaining">剩余 ${health.toFixed(1)}% 生命</small>`:''}</div>`;
    }).join('');
    $('#reportDeath').textContent=report.death?`致命攻击：${report.death.name} · 实际损失 ${number(report.death.amount)} 点生命。`:game.won?(isPractice()?'成功击败本次练习首领，不计正式成绩。':'成功完成实验。以下构筑已完成本局净化。'):'本局没有致命攻击记录。';
    $('#reportEquipment').textContent=`本局装备 · ${equipmentSummary(game.equipment)}。${game.equipment.rebirth?`复苏触发 ${report.revivals} / 1 次。`:''}装备不同的战报不宜直接比较强度。`;
    $('#reportRecentHits').innerHTML=report.death?.recent?.length?report.death.recent.map(hit=>`<li><span>${hit.name}</span><b>−${number(hit.amount)}</b></li>`).join(''):'<li class="empty-report">无近期受击记录。</li>';
    $('#restartBtn').focus();
  }
  function renderPause(){
    $('#pauseProgress').textContent=`${CAMPAIGN_LEVELS[game.campaignLevel-1].name} · 当前第 ${game.wave} / ${RUN_UPGRADES} 波 · LV.${game.upgrades}。收集反应能并选择升级推进波次，不按固定时间换波。LV.10 / 20 / 40 后分别预警 10 / 20 / 30 秒，再迎战首领；期间反应能暂存，暂停时倒计时冻结。${game.level('blackholeKing')?'真·黑洞之王：0.2秒内双击同一方向瞬移，冷却2秒。':''}${game.campaignLevel===2?'赤潮红圈会提前点名脚下位置。':''}`;
    $('#practiceExitBtn').classList.toggle('hidden',!isPractice());
    if(isPractice())$('#pauseProgress').textContent=`首领练习 · ${bossInfo(game.practiceConfig.stage).name}。${practiceBuildName(game.practiceConfig)}，${game.owned.length}槽，3秒准备后开始，不进行经验升级、抽奖或普通出怪；保留首领召唤和真实招式。暂停冻结倒计时，不计正式档案；可结束本次练习返回实验室。`;
    $('#pauseBuildList').innerHTML=game.owned.length?game.owned.map(id=>{const s=BY_ID[id],level=game.level(id);return `<article style="--skill:${s.color}"><h4>${s.icon} ${level===4?s.breakthrough:s.name}<b>${level===4?'突破':`LV.${level}`}</b></h4><p>${s.descriptions[level-1]}</p></article>`;}).join(''):'<p class="empty-report">尚未安装技能，自动普攻正在运作。</p>';
    $('#pauseSynergyList').innerHTML=game.synergies.length?game.synergies.map(s=>`<article><b style="color:${s.color}">✦ ${s.name}</b><small class="synergy-recipe">${s.requires.map(id=>BY_ID[id].name).join(' ＋ ')}</small><p>${s.description||s.short}</p></article>`).join(''):'<p class="empty-report">九组联动等待发现。组合两项配方技能，即可自动激活。</p>';
    $('#pauseCatalystInfo').textContent=game.equippedCatalyst?`本局催化 · ${game.equippedCatalyst.name}：${game.equippedCatalyst.benefit}；代价：${game.equippedCatalyst.cost}`:'催化槽尚未装备，第 6、14 和 24 级时可选择。';
    $('#pauseEquipmentInfo').textContent=`${isPractice()?'练习不应用局外装备':'本局锁定装备'} · ${equipmentSummary(game.equipment)}${game.equipment.rebirth?` · ${game.player.revivalCharges?'复苏待命（本局一次）':game.player.revivalUsed?'复苏已消耗':'本局无复苏次数'}`:''}`;
  }
  function historyFallback(reason){historyPersistent=false;historyStorageReason=reason;}
  function readHistory(){
    try{
      const raw=localStorage.getItem(HISTORY_KEY);if(raw===null)return;
      if(raw.length>250000)throw new Error('oversized archive');
      const parsed=JSON.parse(raw);if(!parsed||parsed.schema!==1||!Array.isArray(parsed.records))throw new Error('unsupported archive');
      historyRecords=sanitizeRunHistory(parsed).records;
      if(historyRecords.length<Math.min(parsed.records.length,RUN_HISTORY_LIMIT))historyFallback('部分档案数据损坏，已忽略无效记录。');
    }catch{historyFallback('无法读取本机档案，可能是数据损坏或浏览器禁止存储。');}
  }
  function persistHistory(){
    if(!historyPersistent)return false;
    try{localStorage.setItem(HISTORY_KEY,JSON.stringify({schema:1,records:historyRecords}));return true;}
    catch{historyFallback('浏览器无法保存本机档案。');return false;}
  }
  function archiveFinishedRun(){
    if(game.state!=='ended'||historyArchived.has(game))return;
    historyArchived.set(game,'excluded');
    if(qaMode||game.practice===true||game.formal===false)return;
    const record=createRunRecord(game,{at:Date.now(),version:'v39'});if(!record)return;
    if(record.won&&record.campaignLevel<CAMPAIGN_LEVELS.length&&record.level===RUN_UPGRADES&&record.bosses.length===BOSS_MILESTONES.length&&record.bosses.every(boss=>boss.killed)&&unlockedCampaignLevel<=record.campaignLevel){unlockedCampaignLevel=record.campaignLevel+1;try{localStorage.setItem(CAMPAIGN_KEY,String(unlockedCampaignLevel));}catch{}renderCampaignChoice();}
    historyRecords=appendRunHistory(historyRecords,record);historyArchived.set(game,'recorded');persistHistory();updateHistoryNotices();
  }
  function updateHistoryNotices(){
    const memory=historyPersistent?'':`${historyStorageReason} 仅保留本次会话，刷新或关闭页面会丢失；浏览器此前保存的档案可能仍保留。`;
    $('#historyEntryNote').textContent=historyPersistent?'本机本浏览器 · 仅保存最近十局正式结算 · 无局外属性':memory;
    $('#historyStatus').textContent=historyPersistent?`本机本浏览器已保存 ${historyRecords.length} / ${RUN_HISTORY_LIMIT} 条正式结算。只统计这十局以内的记录，不代表永久最好成绩。`:memory;
    $('#historyStatus').classList.toggle('is-memory',!historyPersistent);
    $('#historyArchiveNote').textContent=historyArchived.get(game)==='recorded'?(historyPersistent?'本局已加入本机实验档案，仅保留最近十局。':'本局已加入会话档案，但无法保证下次打开仍保留。'):qaMode||game.practice===true||game.formal===false||game.mode&&game.mode!=='normal'?'QA / 练习实验不计入正式档案。':'仅正式结算会加入本机档案，中途重开不会记录。';
  }
  function openHistory(origin){
    if(historyOpen||saveOpen||workshopOpen||guideOpen||!['menu','ended'].includes(game.state))return;
    historyOpen=true;historyClearPending=false;historyOrigin=origin;keys={};hideJoystick();view='';syncView();$('#historyCloseBtn').focus();
  }
  function closeHistory(){
    if(!historyOpen)return;historyOpen=false;historyClearPending=false;keys={};const origin=historyOrigin;historyOrigin=null;view='';syncView();origin?.focus();
  }
  const historyNumber=value=>Math.round(Number.isFinite(value)?value:0).toLocaleString('zh-CN');
  function renderHistory(){
    updateHistoryNotices();const stats=summarizeRunHistory(historyRecords),rate=stats.count?`${Math.round(stats.wins/stats.count*100)}%`:'—';
    $('#historyStats').innerHTML=`<div><b>${rate}</b><span>近 ${stats.count} 局胜率 · ${stats.wins} 胜</span></div><div><b>${stats.count?`${stats.highestCompletedWave} / ${RUN_UPGRADES}`:'—'}</b><span>最高完成波数</span></div><div><b>${stats.fastestWin===null?'—':formatTime(stats.fastestWin)}</b><span>最快成功通关</span></div><div><b>${stats.count?historyNumber(stats.highestDamage):'—'}</b><span>最高有效伤害</span></div>`;
    $('#historyList').innerHTML=historyRecords.length?historyRecords.map(renderHistoryRecord).join(''):'<p class="history-empty">还没有正式实验档案。<br>完成一次成功或失败结算后，构筑与战报会显示在这里。<br>中途重开、QA 和练习实验不计入。</p>';
    $('#historyClearBtn').disabled=historyRecords.length===0&&historyPersistent;
    $('#historyClearBtn').textContent=historyPersistent?'清空本机档案':'重置本机档案';
    $('#historyClearBtn').classList.toggle('hidden',historyClearPending);$('#historyClearConfirm').classList.toggle('hidden',!historyClearPending);
  }
  function renderHistoryRecord(record){
    // Stored strings never become markup: all names come from current whitelists.
    const skills=record.skills.filter(s=>Object.hasOwn(BY_ID,s.id)),synergies=record.synergies.map(id=>SYNERGIES.find(s=>s.id===id)).filter(Boolean),catalyst=Object.hasOwn(BY_CATALYST,record.catalyst)?BY_CATALYST[record.catalyst]:null;
    const date=new Date(record.at),dateLabel=Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'记录时间不可用';
    const damage=record.damage.filter(row=>Object.hasOwn(DAMAGE_SOURCES,row.id)&&row.damage>0),version=/^v\d{1,4}$/.test(record.version)?record.version:'历史版本';
    const build=skills.length?`<ul class="history-build">${skills.map(({id,level})=>{const s=BY_ID[id];return `<li>${level===4?s.breakthrough:s.name}<b>${level===4?'突破':`LV.${level}`}</b></li>`;}).join('')}</ul>`:'<p class="history-detail">未安装技能，使用基础普攻。</p>';
    const recipes=synergies.length?`<ul class="history-synergies">${synergies.map(s=>`<li>✦ ${s.name}</li>`).join('')}</ul>`:'<p class="history-detail">没有激活技能联动。</p>';
    const gear=record.equipment?equipmentSummary(record.equipment):'旧档未记录装备（不推断当时配置）';
    const sourceRows=damage.length?`<div class="report-table-wrap"><table class="report-table"><thead><tr><th>有效来源 / 占比</th><th>总伤害</th><th>Boss 伤害</th></tr></thead><tbody>${damage.map(row=>{const share=record.totalDamage>0?Math.max(0,Math.min(100,row.damage/record.totalDamage*100)):0;return `<tr><td>${DAMAGE_SOURCES[row.id]} <small>${share.toFixed(1)}%</small></td><td>${historyNumber(row.damage)}</td><td>${historyNumber(row.bossDamage)}</td></tr>`;}).join('')}</tbody></table></div>`:'<p class="history-detail">本局没有造成有效伤害。</p>';
    const level=CAMPAIGN_LEVELS[(record.campaignLevel||1)-1],bosses=BOSS_MILESTONES.map(b=>{const r=record.bosses.find(item=>item.stage===b.stage),health=r&&!r.killed&&r.maxHp>0?` · 剩余 ${Math.max(0,Math.min(100,r.hp/r.maxHp*100)).toFixed(1)}% 生命`:'';return `<li>${level.bosses[b.stage-1]}：${r?`${r.killed?'已击败':'未击败'} · ${formatTime(r.duration)}${health}`:'未遭遇'}</li>`;}).join('');
    const death=record.deathSource&&Object.hasOwn(PLAYER_DAMAGE_NAMES,record.deathSource)?`致命来源：${PLAYER_DAMAGE_NAMES[record.deathSource]}`:record.won?'成功击败三名首领':'没有致命来源记录';
    return `<details class="history-run ${record.won?'is-win':'is-loss'}"><summary><span><b>${level.name} · ${record.won?'净化完成':'实验终止'} · 完成 ${record.level} / ${Number(record.version.slice(1))>=18?RUN_UPGRADES:30} 波 · LV.${record.level}</b><small>${dateLabel} · ${version} · ${formatTime(record.time)} · 击碎 ${historyNumber(record.kills)} · 有效伤害 ${historyNumber(record.totalDamage)}</small></span></summary><div class="history-run-body"><h4 class="section-label">终局构筑 · ${skills.length} / ${MAX_SLOTS} 槽</h4>${build}${recipes}<p class="history-detail"><strong>本局装备：</strong>${gear}</p><p class="history-detail"><strong>催化：</strong>${catalyst?`${catalyst.name} · ${catalyst.benefit}；代价：${catalyst.cost}`:'未装配'}</p><p class="history-detail">Boss 伤害 ${historyNumber(record.bossDamage)} · 受伤 ${historyNumber(record.damageTaken)} · 护盾拦截 ${historyNumber(record.blockedDamage)}</p><h4 class="section-label">有效伤害来源</h4>${sourceRows}<h4 class="section-label">三场首领</h4><ul class="history-boss-list">${bosses}</ul><p class="history-detail">${death}</p></div></details>`;
  }
  function requestHistoryClear(){if(!historyOpen||(!historyRecords.length&&historyPersistent))return;historyClearPending=true;renderHistory();$('#historyCancelClearBtn').focus();}
  function cancelHistoryClear(){if(!historyOpen)return;historyClearPending=false;renderHistory();$('#historyClearBtn').focus();}
  function confirmHistoryClear(){
    if(!historyOpen||!historyClearPending)return;historyRecords=[];historyClearPending=false;
    // Only an explicit second confirmation may replace a damaged stored archive.
    try{localStorage.setItem(HISTORY_KEY,JSON.stringify({schema:1,records:[]}));historyPersistent=true;historyStorageReason='';}
    catch{historyFallback('浏览器无法保存本机档案。');}
    renderHistory();$('#historyCloseBtn').focus();
  }
  function toast(message){ui.toast.textContent=message;ui.toast.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>ui.toast.classList.remove('show'),2200);}
  function beep(freq,duration,type='sine',volume=.025){
    if(!soundOn)return;
    try{audio||=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')void audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.65),audio.currentTime+duration);gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch{}
  }
  function sparks(x,y,color,count){if(!Number.isFinite(x)||!Number.isFinite(y))return;count=Math.round(count*fx().particles*(reducedMotion?.5:1));for(let i=0;i<count;i++){const angle=visualRandom()*Math.PI*2,speed=45+visualRandom()*180;particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,color,r:1+visualRandom()*3,life:.3+visualRandom()*.4});}const cap=effectsMode==='clean'?120:effectsMode==='spectacular'?900:550;if(particles.length>cap)particles.splice(0,particles.length-cap);}
  function flushEvents(){
    for(const e of game.takeEvents()){
      if(e.type==='shot'){beep(game.player.overloadRemaining>0?430:280,.025,'square',.009);muzzles.push({x:e.x,y:e.y,angle:e.angle,count:e.count||1,life:.085,total:.085});}
      if(e.type==='upgrade')beep(520,.14,'sine',.035);
      if(e.type==='chosen')toast(`${e.name} · ${e.level===4?'突破':e.id==='attack'?'伤害 +15%':`LV.${e.level}`}`);
      if(e.type==='synergy'){toast(`联动激活 · ${e.name}`);beep(740,.24,'triangle',.04);}
      if(e.type==='catalystEquipped'){toast(`催化装配 · ${e.name}`);beep(620,.28,'triangle',.04);}
      if(e.type==='damage'){texts.push({x:e.x,y:e.y,text:Math.round(e.amount)+(e.critical?'!':''),color:e.critical?(e.source==='drone'?'#ffbfe9':'#ffda54'):'#eaffe2',life:.55,big:e.critical});if(e.critical&&e.source==='drone')muzzles.push({kind:'seekerCritical',x:e.x,y:e.y+8,life:.14,total:.14});}
      if(e.type==='auraDamage'){sparks(e.x,e.y,'#39d96a',2);texts.push({x:e.x,y:e.y,text:'腐蚀',color:'#39d96a',life:.45,big:false});}
      if(e.type==='kill'){sparks(e.x,e.y,e.color,e.boss?45:9);shake=Math.max(shake,e.boss?12:2);}
      if(e.type==='playerHurt'){shake=9;flash=.13;texts.push({x:game.player.x,y:game.player.y-26,text:`-${e.amount}`,color:'#ff537a',life:.65,big:true});beep(55,.13,'sawtooth',.045);}
      if(e.type==='bomb'){shake=14;toast('炸弹 · 屏内小怪已清除');beep(55,.35,'sawtooth',.06);}
      if(e.type==='magnet'){toast('磁铁 · 全屏反应能汇聚');beep(660,.22,'sine',.04);}
      if(e.type==='pill'){toast(`恢复药丸 · 生命 +${e.amount}`);beep(820,.18,'sine',.035);}
      if(e.type==='fusion'){toast(`${e.name} · 合体完成，释放一个技能槽`);beep(940,.3,'sine',.04);}
      if(e.type==='portal'){toast('折跃完成 · 传送门冷却三秒');beep(420,.25,'sine',.04);}
      if(e.type==='beam'){beep(360,.15,'triangle',.025);}
      if(e.type==='nova'){sparks(e.x,e.y,'#ff9c77',6);}
      if(e.type==='meteorImpact'){sparks(e.x,e.y,'#ffc78e',14);shake=Math.max(shake,5);beep(85,.18,'sawtooth',.025);}
      if(e.type==='ionCast')beep(920,.14,'triangle',.025);
      if(e.type==='turretFire')beep(650,.08,'triangle',.018);
      if(e.type==='fluxBoost'){toast('相位增幅 · 5秒普攻伤害+35% / 移速+15%');beep(760,.2,'sine',.03);}
      if(e.type==='lightning'){shake=Math.max(shake,6);skillFlash=.08;skillFlashColor='#67a8ff';beep(72,.26,'sawtooth',.04);beep(510,.12,'triangle',.025);}
      if(e.type==='ringShot')beep(320,.08,'triangle',.025);
      if(e.type==='rail'){shake=Math.max(shake,5);sparks(e.x,e.y,'#fff1ae',12);beep(140,.17,'sawtooth',.032);beep(650,.08,'triangle',.025);}
      if(e.type==='overloadStart'){toast('晶格过载 · 连续暴击，火力爆发');beep(920,.25,'triangle',.035);}
      if(e.type==='frost'){sparks(e.x,e.y,'#9eeaff',16);beep(880,.18,'sine',.025);}
      if(e.type==='drone')beep(560,.05,'triangle',.013);
      if(e.type==='stormEye')toast('天穹雷暴 · 进入绿色风眼，圈内可回复6生命');
      if(e.type==='saws')beep(380,.08,'triangle',.018);
      if(e.type==='well'){sparks(e.x,e.y,'#c09dff',15);beep(105,.22,'sine',.035);}
      if(e.type==='blink')beep(650,.1,'sine',.025);
      if(e.type==='shieldBlock'){texts.push({x:e.x,y:e.y-24,text:'护盾拦截',color:'#79f6ee',life:.65,big:true});sparks(e.x,e.y,'#79f6ee',12);beep(740,.12,'sine',.032);}
      if(e.type==='explosion'){shake=Math.max(shake,e.resonance?11:8);skillFlash=.1;skillFlashColor=e.color||'#ffbf65';sparks(e.x,e.y,e.color||'#ffbf65',24);beep(48,.32,'sawtooth',.05);beep(125,.16,'triangle',.03);}
      if(e.type==='bossWarning'){waveNotice(`${isPractice()?'练习准备':'首领关卡'} · ${e.name} · ${e.seconds} 秒后降临`);beep(180,.35,'triangle',.045);}
      if(e.type==='boss'){toast(`${bossInfo(e.stage).name}降临 · ${bossLabel(e.stage)}`);beep(80,.45,'sawtooth',.06);}
      if(e.type==='bossEnrage'){toast(`${e.name} · 狂暴，招式加速`);beep(115,.38,'sawtooth',.045);}
      if(e.type==='bossWindup'){const move=NeonCore.BOSS_ATTACK_GUIDE[e.kind];toast(move?`${move.name} · ${move.hint}`:'首领蓄力 · 留意地面预警');beep(165,.25,'triangle',.035);}
      if(e.type==='arenaWindup'){toast('赤潮点名 · 离开脚下红圈');beep(190,.18,'triangle',.03);}
      if(e.type==='arenaBurst'){sparks(e.x,e.y,'#ff795d',16);shake=Math.max(shake,5);}
      if(e.type==='bossDefeated'){toast(isPractice()?'练习目标击败 · 不计正式成绩':`${bossLabel(e.stage)}完成 · ${e.stage===BOSS_MILESTONES.length?'领取奖励后结算':'升级已解锁'}`);beep(500,.25,'sine',.04);}
      if(e.type==='ghostStart')toast('穿越火线 · 无敌');
      if(e.type==='healed')texts.push({x:game.player.x,y:game.player.y-22,text:`+${e.amount}`,color:'#4cff9b',life:.6,big:false});
      if(e.type==='revived'){toast('复苏胚核触发 · 本局次数已消耗 · 1.5秒保护');texts.push({x:e.x,y:e.y-26,text:`复苏 +${Math.ceil(e.amount)}`,color:'#96ffcb',life:.8,big:true});sparks(e.x,e.y,'#96ffcb',30);beep(820,.22,'sine',.04);}
      if(e.type==='rockets')beep(190,.07,'sawtooth',.02);
      if(e.type==='rocketImpact'){sparks(e.x,e.y,e.echo?'#ffe6bf':'#ffac78',e.echo?12:18);shake=Math.max(shake,e.echo?2:4);beep(e.echo?110:75,.09,'triangle',.025);}
      if(e.type==='enemyHeal')texts.push({x:e.x,y:e.y-20,text:`敌方 +${Math.ceil(e.amount)}`,color:'#ffb0c3',life:.7,big:false});
      if(e.type==='end')beep(e.won?620:70,.5,e.won?'sine':'sawtooth',.06);
    }const textCap=effectsMode==='clean'?45:150;if(texts.length>textCap)texts.splice(0,texts.length-textCap);if(muzzles.length>12)muzzles.splice(0,muzzles.length-12);
  }
  function updateFx(dt){for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-6*dt);p.vy*=Math.exp(-6*dt);p.life-=dt;}particles=particles.filter(p=>p.life>0);for(const t of texts){if(!reducedMotion)t.y-=25*dt;t.life-=dt;}texts=texts.filter(t=>t.life>0);for(const m of muzzles)m.life-=dt;muzzles=muzzles.filter(m=>m.life>0);shake*=Math.exp(-10*dt);flash=Math.max(0,flash-dt);skillFlash=Math.max(0,skillFlash-dt);}
  function circle(x,y,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
  function drawGrid(){ctx.strokeStyle=game.campaignLevel===3?'rgba(168,234,255,.12)':'rgba(121,204,174,.06)';ctx.lineWidth=1;ctx.beginPath();const offset=reducedMotion||effectsMode==='clean'?0:game.time*4%56;for(let x=-offset;x<width;x+=56){ctx.moveTo(x,0);ctx.lineTo(x,height);}for(let y=-offset;y<height;y+=56){ctx.moveTo(0,y);ctx.lineTo(width,y);}ctx.stroke();}
  function drawAura(){const p=game.player;if(!p.auraRadius)return;const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.auraRadius);g.addColorStop(0,'rgba(57,217,106,.32)');g.addColorStop(.5,'rgba(57,217,106,.16)');g.addColorStop(1,'rgba(57,217,106,0)');circle(p.x,p.y,p.auraRadius,g);}
  function drawWarnings(){
    for(const e of game.enemies)if(!e.dead&&e.type==='mender'&&e.menderIntent){ctx.save();ctx.strokeStyle='#ffb0c3';ctx.lineWidth=1.5;ctx.setLineDash([3,6]);ctx.beginPath();ctx.arc(e.x,e.y,e.menderIntent.radius,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#ffceda';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText(`敌方修复 ${e.menderIntent.remaining.toFixed(1)}s`,e.x,e.y-e.menderIntent.radius-8);ctx.restore();}
    for(const e of game.enemies)if(!e.dead&&e.type==='pylon'&&e.pylonIntent){ctx.save();ctx.strokeStyle='#ffc699';ctx.fillStyle='rgba(255,143,82,.14)';ctx.setLineDash([5,5]);ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,100,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#ffdab5';ctx.textAlign='center';ctx.font='11px sans-serif';ctx.fillText(`供能脉冲 ${e.pylonIntent.remaining.toFixed(1)}s`,e.x,e.y-110);ctx.restore();}
    if(game.player.fluxRemaining>0){ctx.save();ctx.fillStyle='#b4ffd9';ctx.textAlign='center';ctx.font='bold 11px sans-serif';ctx.fillText(`相位增幅 ${game.player.fluxRemaining.toFixed(1)}s`,game.player.x,game.player.y+78);ctx.restore();}
    for(const e of game.enemies)if(!e.dead&&e.type==='phaselet'&&e.phaseIntent){const m=e.phaseIntent;ctx.save();ctx.strokeStyle='#d9c1ff';ctx.lineWidth=2;ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(m.x,m.y,e.r+18,0,Math.PI*2);ctx.moveTo(e.x,e.y);ctx.lineTo(m.x,m.y);ctx.stroke();ctx.fillStyle='#e4cfff';ctx.textAlign='center';ctx.font='11px sans-serif';ctx.fillText(`跃迁 ${m.remaining.toFixed(1)}s`,m.x,m.y-e.r-26);ctx.restore();}
    if(game.player.chillRemaining>0){ctx.save();ctx.fillStyle='#bdefff';ctx.textAlign='center';ctx.font='bold 11px sans-serif';ctx.fillText(`寒滞 ${game.player.chillRemaining.toFixed(1)}s`,game.player.x,game.player.y+50);ctx.restore();}
    for(const hazard of game.hazards)if(!['anchor','shelter'].includes(hazard.kind))drawHazard(hazard);
    for(const hazard of game.hazards)if(['anchor','shelter'].includes(hazard.kind))drawHazard(hazard);
    for(const e of game.enemies)if(!e.dead&&e.type==='glacial'&&e.frostIntent){ctx.save();circle(e.x,e.y,95,'rgba(125,218,255,.16)');ctx.strokeStyle='#c1f2ff';ctx.setLineDash([5,5]);ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,95,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#ddf8ff';ctx.textAlign='center';ctx.font='bold 11px sans-serif';ctx.fillText(`霜爆 ${e.frostIntent.remaining.toFixed(1)}s`,e.x,e.y-104);ctx.restore();}
    for(const enemy of game.enemies)if(!enemy.dead&&enemy.eliteIntent){ctx.save();circle(enemy.x,enemy.y,85,'rgba(233,161,255,.16)');ctx.strokeStyle='#f1beff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(enemy.x,enemy.y,85,0,Math.PI*2);ctx.stroke();ctx.font='bold 11px sans-serif';ctx.fillStyle='#f8d7ff';ctx.textAlign='center';ctx.fillText(`脉冲 ${enemy.eliteIntent.remaining.toFixed(1)}s`,enemy.x,enemy.y-96);ctx.restore();}
    for(const zone of game.sporeZones){ctx.save();ctx.fillStyle=zone.warning>0?'rgba(204,116,235,.13)':'rgba(177,65,208,.3)';ctx.strokeStyle=zone.warning>0?'#efb2ff':'#e58aff';ctx.lineWidth=zone.warning>0?2:3;ctx.setLineDash(zone.warning>0?[5,5]:[]);ctx.beginPath();ctx.arc(zone.x,zone.y,zone.r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#f1c5ff';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText(zone.warning>0?`孢子 ${zone.warning.toFixed(1)}s`:'毒区',zone.x,zone.y-zone.r-7);ctx.restore();}
    if(game.arenaIntent?.kind==='storm'){const m=game.arenaIntent;ctx.save();ctx.fillStyle='rgba(109,150,255,.13)';ctx.beginPath();ctx.rect(0,0,width,height);ctx.arc(m.x,m.y,m.radius,0,Math.PI*2,true);ctx.fill('evenodd');circle(m.x,m.y,m.radius,'rgba(84,255,186,.12)');ctx.strokeStyle='#86ffd7';ctx.lineWidth=4;ctx.beginPath();ctx.arc(m.x,m.y,m.radius,0,Math.PI*2);ctx.stroke();ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.fillStyle='#bcffe4';ctx.fillText(`进入风眼 · ${m.remaining.toFixed(1)}s`,m.x,m.y-m.radius-12);ctx.fillText('圈内安全 / +6生命',m.x,m.y+5);ctx.restore();}
    for(let i=0;i<(game.portals||[]).length;i++){const gate=game.portals[i],ready=game.portalCooldown<=0;ctx.save();ctx.strokeStyle=i?'#96f1ff':'#c29bff';ctx.lineWidth=ready?4:2;ctx.setLineDash(ready?[]:[5,7]);ctx.beginPath();ctx.arc(gate.x,gate.y,gate.r,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(gate.x,gate.y,gate.r+7,0,Math.PI*2);ctx.stroke();ctx.font='bold 12px sans-serif';ctx.fillStyle=ctx.strokeStyle;ctx.textAlign='center';ctx.fillText(ready?'折跃门':`${game.portalCooldown.toFixed(1)}s`,gate.x,gate.y-gate.r-15);ctx.restore();}
    if(game.arenaIntent?.kind==='mirror'){const m=game.arenaIntent;ctx.save();ctx.fillStyle='rgba(168,234,255,.2)';ctx.strokeStyle='#b9edff';ctx.lineWidth=2;if(m.axis!=='horizontal'){ctx.fillRect(m.x-m.radius,0,m.radius*2,height);ctx.strokeRect(m.x-m.radius,0,m.radius*2,height);}if(m.axis!=='vertical'){ctx.fillRect(0,m.y-m.radius,width,m.radius*2);ctx.strokeRect(0,m.y-m.radius,width,m.radius*2);}ctx.fillStyle='#e4f8ff';ctx.font='bold 14px sans-serif';ctx.fillText(`裂线 ${Math.max(0,m.remaining).toFixed(1)}s`,m.x+50,m.y-25);ctx.restore();}
    for(const e of game.enemies){if(e.dead)continue;
      if(e.type==='sentinel'&&e.shotIntent){ctx.save();ctx.strokeStyle='#ff79d2';ctx.globalAlpha=.65;ctx.setLineDash([8,6]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.x+Math.cos(e.shotIntent.angle)*500,e.y+Math.sin(e.shotIntent.angle)*500);ctx.stroke();ctx.restore();}
      if(e.type==='catalyst'){ctx.strokeStyle='rgba(118,231,255,.22)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(e.x,e.y,110,0,Math.PI*2);ctx.stroke();}
      if(e.type==='charger'&&e.chargeWindup>0){ctx.strokeStyle='rgba(255,181,107,.3)';ctx.lineWidth=23;ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.x+Math.cos(e.chargeAngle)*220,e.y+Math.sin(e.chargeAngle)*220);ctx.stroke();ctx.strokeStyle='#ffdb9d';ctx.lineWidth=2;ctx.stroke();}
    }
    if(game.arenaIntent&&!['mirror','storm'].includes(game.arenaIntent.kind)){const mark=game.arenaIntent,progress=1-mark.remaining/mark.total;ctx.save();ctx.fillStyle='rgba(255,80,65,.21)';ctx.strokeStyle='#ffad7d';ctx.lineWidth=3;ctx.beginPath();ctx.arc(mark.x,mark.y,mark.radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#fff0a9';ctx.lineWidth=4;ctx.beginPath();ctx.arc(mark.x,mark.y,mark.radius+6,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke();ctx.restore();}
    const b=game.boss;if(!b?.intent){drawBossDirection();return;}const {kind,angle}=b.intent;
    ctx.save();ctx.strokeStyle='#ffab82';ctx.fillStyle='rgba(255,83,122,.24)';
    if(['reactorShield','solarRain','purge'].includes(kind)){ctx.fillStyle='#ffdab0';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText(kind==='reactorShield'?'供能柱即将出现 · 优先击碎':kind==='purge'?'熔核净化将至 · 留意绿色避难区':'太阳雨锁定 · 离开标记',b.intent.x,b.intent.y-120);if(kind==='solarRain'){const count=b.bossStage*2+1,points=[{x:b.intent.x,y:b.intent.y}];for(let i=0;i<count;i++){const a=i/count*Math.PI*2;points.push({x:Math.max(75,Math.min(width-75,b.intent.x+Math.cos(a)*150)),y:Math.max(75,Math.min(height-75,b.intent.y+Math.sin(a)*150))});}ctx.strokeStyle='#ffca99';ctx.setLineDash([5,6]);for(const point of points){ctx.beginPath();ctx.arc(point.x,point.y,75,0,Math.PI*2);ctx.stroke();}}}
    else if(kind==='riftCross'){for(let i=0;i<2;i++)drawHazard({kind:'rift',shape:'strip',x:b.intent.x,y:b.intent.y,r:18,length:Math.max(width,height)*1.2,angle:angle+i*Math.PI/2,warning:b.intent.remaining});}
    else if(kind==='phaseJump'){ctx.strokeStyle='#d8b4ff';ctx.setLineDash([6,6]);ctx.lineWidth=3;ctx.beginPath();ctx.arc(b.intent.x,b.intent.y,95,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#e4ccff';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText('首领跃迁落点 · 远离标记',b.intent.x,b.intent.y-108);}
    else if(kind==='iceFan'||kind==='frostWheel'){ctx.strokeStyle='#b7edff';ctx.fillStyle='rgba(132,220,255,.15)';ctx.setLineDash([5,6]);if(kind==='iceFan'){for(let i=0;i<b.bossStage*2+1;i++){ctx.beginPath();ctx.arc(Math.max(55,Math.min(width-55,b.intent.x+(i-b.bossStage)*85)),b.intent.y,55,0,Math.PI*2);ctx.stroke();}}else{ctx.beginPath();ctx.arc(b.intent.x,b.intent.y,210,0,Math.PI*2);ctx.arc(b.intent.x,b.intent.y,100,0,Math.PI*2,true);ctx.fill('evenodd');ctx.stroke();}ctx.fillStyle='#d8f6ff';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText(kind==='iceFan'?'冰扇即将锁定 · 纵向离开':'冰封轮 · 内圈或外侧安全',b.intent.x,b.intent.y-225);}
    else if(kind==='seedRain')drawSeedRain(b.intent.x,b.intent.y,b.bossStage);
    else if(kind==='vineSweep')drawVine(b.x,b.y,angle,true);
    else if(kind==='stormLances')drawStormLances(b.x,b.y,angle,b.intent.lanes,true);
    else if(kind==='stormCage')drawStormCage(b.intent.x,b.intent.y,true);
    else if(kind==='cone'){ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.arc(b.x,b.y,b.intent.radius??210,angle-.57,angle+.57);ctx.closePath();ctx.fill();ctx.lineWidth=2;ctx.stroke();}
    else if(kind==='cross'){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(angle);ctx.fillStyle='rgba(255,83,122,.25)';ctx.fillRect(-240,-27,480,54);ctx.fillRect(-27,-240,54,480);ctx.strokeStyle='#ffcf94';ctx.lineWidth=2;ctx.strokeRect(-240,-27,480,54);ctx.strokeRect(-27,-240,54,480);ctx.restore();}
    else if(kind==='corePulse'){ctx.fillStyle='rgba(255,83,122,.24)';ctx.beginPath();ctx.arc(b.x,b.y,150,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffc3ac';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#fff0cd';ctx.textAlign='center';ctx.font='bold 12px sans-serif';ctx.fillText('离开核心',b.x,b.y-110);}
    else if(kind==='dash'){const length=b.bossStage===3?(b.enraged?520:480)*.75:440*.72;ctx.strokeStyle='rgba(255,173,84,.22)';ctx.lineWidth=(b.r+game.player.r)*2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x+Math.cos(angle)*length,b.y+Math.sin(angle)*length);ctx.stroke();ctx.strokeStyle='#ffcf94';ctx.lineWidth=2;ctx.stroke();}
    else if(kind==='shockwave'){
      const inner=b.intent.innerRadius??120,outer=b.intent.radius??b.intent.outerRadius??260;
      ctx.fillStyle='rgba(255,92,125,.21)';ctx.beginPath();ctx.arc(b.x,b.y,outer,0,Math.PI*2);ctx.arc(b.x,b.y,inner,0,Math.PI*2,true);ctx.fill('evenodd');
      ctx.lineWidth=3;ctx.strokeStyle='#ff9aa5';ctx.beginPath();ctx.arc(b.x,b.y,outer,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='rgba(76,230,177,.09)';ctx.beginPath();ctx.arc(b.x,b.y,inner,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#7cf2c5';ctx.beginPath();ctx.arc(b.x,b.y,inner,0,Math.PI*2);ctx.stroke();
      const progress=Math.max(0,Math.min(1,1-b.intent.remaining/(b.intent.total||1.2)));ctx.strokeStyle='#fff4ba';ctx.lineWidth=5;ctx.beginPath();ctx.arc(b.x,b.y,outer+5,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke();
      ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillStyle='#7cf2c5';ctx.fillText('内圈安全 · 避开本体',b.x,b.y+inner-17);ctx.fillStyle='#ffc2c8';ctx.fillText('外环危险',b.x,b.y-(inner+outer)/2);
    }
    else {const count=b.bossStage===3?5:3,radius=b.bossStage===3?90:70;for(let i=0;i<count;i++){const a=i/count*Math.PI*2;ctx.beginPath();ctx.arc(b.x+Math.cos(a)*radius,b.y+Math.sin(a)*radius,15,0,Math.PI*2);ctx.fill();ctx.stroke();}}
    ctx.restore();drawBossDirection();
  }
  function drawHazard(h){
    const anchor=['anchor','shelter'].includes(h.kind),rift=h.kind==='rift',reactor=h.kind==='reactor',warning=h.warning>0;ctx.save();
    if(h.kind==='purge'){ctx.fillStyle=warning?'rgba(255,91,70,.10)':'rgba(255,91,70,.25)';ctx.fillRect(0,0,width,height);ctx.fillStyle='#ffd0a2';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.fillText(warning?`熔核净化 ${h.warning.toFixed(1)}s · 进入绿色避难区`:'熔核净化 · 绿色圈内安全',width/2,height*.25);ctx.restore();return;}
    ctx.strokeStyle=anchor?'#92ffd0':rift?'#e3b3ff':reactor?'#ffc18c':warning?'#b8edff':'#f1fcff';ctx.fillStyle=anchor?'rgba(100,255,186,.24)':rift?`rgba(178,104,244,${warning?.15:.38})`:reactor?`rgba(255,136,75,${warning?.15:.38})`:warning?'rgba(116,211,255,.15)':'rgba(151,230,255,.38)';ctx.lineWidth=warning?2:3;ctx.setLineDash(warning?[6,5]:[]);ctx.beginPath();
    if(h.shape==='strip'){ctx.translate(h.x,h.y);ctx.rotate(h.angle);ctx.rect(-h.length,-h.r,h.length*2,h.r*2);}else{ctx.arc(h.x,h.y,h.r,0,Math.PI*2);if(h.shape==='ring')ctx.arc(h.x,h.y,h.inner,0,Math.PI*2,true);}ctx.fill('evenodd');ctx.stroke();if(h.shape==='strip'){ctx.rotate(-h.angle);ctx.translate(-h.x,-h.y);}ctx.setLineDash([]);ctx.fillStyle=anchor?'#b5ffdf':rift?'#eacfff':reactor?'#ffdab5':'#d8f6ff';ctx.font='bold 11px sans-serif';ctx.textAlign='center';const name=rift?'裂隙':reactor?'熔核':'冰裂';ctx.fillText(h.kind==='shelter'?'避难区 · 净化安全':anchor?'稳定锚点 · 5s增幅':warning?`${name} ${h.warning.toFixed(1)}s`:`${name}危险区`,h.x,h.y-h.r-8);ctx.restore();
  }
  function drawStormLances(x,y,angle,lanes,warning){ctx.save();ctx.translate(x,y);ctx.rotate(angle);for(let i=0;i<lanes;i++){const offset=(i-(lanes-1)/2)*80;ctx.fillStyle=warning?'rgba(115,175,255,.22)':'rgba(170,225,255,.6)';ctx.fillRect(0,offset-18,560,36);ctx.strokeStyle=warning?'#9ad5ff':'#fff';ctx.lineWidth=warning?2:4;ctx.strokeRect(0,offset-18,560,36);}ctx.restore();}
  function drawStormCage(x,y,warning){ctx.save();ctx.fillStyle=warning?'rgba(139,165,255,.25)':'rgba(182,197,255,.5)';ctx.beginPath();ctx.arc(x,y,155,0,Math.PI*2);ctx.arc(x,y,60,0,Math.PI*2,true);ctx.fill('evenodd');ctx.lineWidth=3;ctx.strokeStyle='#b7d5ff';ctx.beginPath();ctx.arc(x,y,155,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#87ffd6';ctx.beginPath();ctx.arc(x,y,60,0,Math.PI*2);ctx.stroke();if(warning){ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillStyle='#baffdf';ctx.fillText('留在内圈 / 离开外环',x,y-170);}ctx.restore();}
  function drawVine(x,y,angle,warning){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=warning?'rgba(220,114,230,.18)':'rgba(217,162,246,.7)';ctx.strokeStyle='#eac2ff';ctx.lineWidth=warning?2:4;ctx.fillRect(0,-24,650,48);ctx.strokeRect(0,-24,650,48);ctx.restore();}
  function drawSeedRain(x,y,stage){const count=stage+2,points=[{x,y}];for(let i=0;i<count;i++){const a=i/count*Math.PI*2;points.push({x:x+Math.cos(a)*135,y:y+Math.sin(a)*135});}ctx.save();ctx.strokeStyle='#edbbff';ctx.lineWidth=2;ctx.setLineDash([4,5]);for(const point of points){ctx.beginPath();ctx.arc(Math.max(44,Math.min(width-44,point.x)),Math.max(44,Math.min(height-44,point.y)),44,0,Math.PI*2);ctx.stroke();}ctx.setLineDash([]);ctx.fillStyle='#edbbff';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText('播种锁定 · 离开落点',x,y-195);ctx.restore();}
  function drawBossDirection(){
    const b=game.boss;if(width<960||height<500||!b||b.dead||b.x>=0&&b.x<=width&&b.y>=0&&b.y<=height)return;
    const inset=26,top=Math.min(215,height*.43),bottom=Math.max(top+30,height-125),x=Math.max(230,Math.min(width-inset,b.x)),y=Math.max(top,Math.min(bottom,b.y)),angle=Math.atan2(b.y-y,b.x-x);
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#ffb4a6';ctx.strokeStyle='#2a0c16';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(-7,-7);ctx.lineTo(-4,0);ctx.lineTo(-7,7);ctx.closePath();ctx.stroke();ctx.fill();ctx.rotate(-angle);ctx.font='bold 10px sans-serif';ctx.textAlign=x<width/2?'left':'right';ctx.fillStyle='#ffd4c4';ctx.fillText('首领',x<width/2?15:-15,4);ctx.restore();
  }
  function drawMine(m){
    if(m.life<=0)return;ctx.save();ctx.translate(m.x,m.y);const armed=m.armed<=0,color=m.blackHole?'#b28aff':'#ffcb75';
    ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=glow(armed?18:5);ctx.lineWidth=1.5;
    if(m.blackHole&&armed){
      const field=ctx.createRadialGradient(0,0,4,0,0,m.pullRadius);field.addColorStop(0,'rgba(132,83,255,.22)');field.addColorStop(.55,'rgba(132,83,255,.06)');field.addColorStop(1,'rgba(132,83,255,0)');circle(0,0,m.pullRadius,field);
      ctx.globalAlpha=.4;for(let i=0;i<(fx().details?4:1);i++){const r=24+i*30,a=(reducedMotion?0:game.time)*(1+i*.2)+i;ctx.beginPath();ctx.arc(0,0,r,a,a+2);ctx.stroke();}ctx.globalAlpha=1;
    }
    ctx.shadowBlur=0;ctx.globalAlpha=armed?.32:.15;ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(0,0,m.trigger||28,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
    ctx.shadowBlur=glow(armed?18:5);circle(0,0,m.r+3,'#15202c');ctx.beginPath();ctx.arc(0,0,m.r+3,0,Math.PI*2);ctx.stroke();
    if(m.blackHole){circle(0,0,8,'#02020b');ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,8,game.time*3,game.time*3+Math.PI*1.6);ctx.stroke();}
    else{ctx.fillStyle=color;for(let i=0;i<4;i++){ctx.save();ctx.rotate(i*Math.PI/2);ctx.fillRect(9,-3,6,6);ctx.restore();}circle(0,0,5,armed?'#fff6d0':'#718085');}
    ctx.shadowBlur=0;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,m.r+7,-Math.PI/2,-Math.PI/2+Math.PI*2*(armed?1:Math.max(0,1-m.armed/m.armTime)));ctx.stroke();ctx.restore();
  }
  function drawItem(item){ctx.save();ctx.translate(item.x,item.y);ctx.globalAlpha=item.life<5&&!reducedMotion?.45+.45*Math.sin(game.time*9):1;const color=item.type==='pill'?'#ff82ba':item.type==='bomb'?'#ffad54':'#35f4d2';ctx.shadowColor=color;ctx.shadowBlur=glow(13);
    if(item.type==='bomb'){circle(0,1,5.5,color);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(1,-4);ctx.lineTo(3,-7);ctx.lineTo(5,-6);ctx.stroke();circle(-1,0,1.7,'#081511');}
    else if(item.type==='pill'){ctx.rotate(-Math.PI/4);ctx.fillStyle='#fff2fa';ctx.beginPath();ctx.ellipse(0,0,4,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=color;ctx.fillRect(-3.5,0,7,4);ctx.strokeStyle='#b73f78';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-4,0);ctx.lineTo(4,0);ctx.stroke();}
    else{ctx.strokeStyle=color;ctx.lineWidth=3.5;ctx.beginPath();ctx.moveTo(-4,-5);ctx.lineTo(-4,1);ctx.arc(0,1,4,Math.PI,0,true);ctx.lineTo(4,-5);ctx.stroke();ctx.fillStyle='#eaffe2';ctx.fillRect(-5.6,-6,3.3,2);ctx.fillRect(2.3,-6,3.3,2);}ctx.restore();}
  function drawEnemy(e,icebite){ctx.save();ctx.translate(e.x,e.y);const pulse=reducedMotion?1:1+Math.sin(e.phase)*.04;ctx.scale(pulse,pulse);ctx.fillStyle=e.hit?'#fff':e.stun>0||e.slowRemaining>0?'#abdfff':e.color;ctx.shadowColor=e.color;ctx.shadowBlur=glow(e.type==='boss'?24:9);ctx.beginPath();
    if(e.type==='mender'){ctx.fillRect(-e.r,-4,e.r*2,8);ctx.fillRect(-4,-e.r,8,e.r*2);}
    else if(e.type==='tank'||e.type==='boss'||e.type==='catalyst'){const sides=e.type==='boss'?8:6;for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2,r=e.r*(i%2?.88:1.06);if(i)ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);else ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();}
    else if(e.type==='charger'){ctx.save();ctx.rotate(e.chargeAngle);ctx.moveTo(e.r*1.25,0);ctx.lineTo(-e.r*.8,-e.r*.9);ctx.lineTo(-e.r*.8,e.r*.9);ctx.closePath();ctx.fill();ctx.restore();}
    else{ctx.arc(0,0,e.r,0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;circle(-e.r*.25,-e.r*.08,Math.max(2,e.r*.12),'#07110f');circle(e.r*.25,-e.r*.08,Math.max(2,e.r*.12),'#07110f');
    if(e.type==='catalyst'){ctx.strokeStyle='#d4fbff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,e.r+4,0,Math.PI*2);ctx.stroke();}
    if(e.type==='sentinel'){ctx.save();ctx.rotate(e.shotIntent?.angle||Math.atan2(game.player.y-e.y,game.player.x-e.x));ctx.fillStyle='#ffe6fa';ctx.fillRect(4,-3,e.r+4,6);ctx.strokeStyle='#ffe6fa';ctx.lineWidth=1.5;ctx.strokeRect(-e.r,-e.r,e.r*2,e.r*2);ctx.restore();}
    if(e.type==='warden'){ctx.strokeStyle=e.guardRemaining>0?'#d9f4ff':'#405e78';ctx.lineWidth=e.guardRemaining>0?4:1;ctx.setLineDash(e.guardRemaining>0?[]:[4,5]);ctx.beginPath();ctx.arc(0,0,e.r+5,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);if(e.guardRemaining>0){ctx.fillStyle='#e4f5ff';ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText('减伤',0,-e.r-9);}}
    if(e.type==='sporeling'){ctx.strokeStyle='#efb2ff';ctx.lineWidth=2;for(let i=0;i<5;i++){const a=i/5*Math.PI*2;ctx.beginPath();ctx.arc(Math.cos(a)*(e.r+3),Math.sin(a)*(e.r+3),3,0,Math.PI*2);ctx.stroke();}}
    if(e.type==='glacial'){ctx.strokeStyle='#e4f9ff';ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<6;i++){const a=i/6*Math.PI*2;ctx.moveTo(Math.cos(a)*(e.r-2),Math.sin(a)*(e.r-2));ctx.lineTo(Math.cos(a)*(e.r+8),Math.sin(a)*(e.r+8));}ctx.stroke();}
    if(e.type==='phaselet'){ctx.save();ctx.rotate(Math.PI/4);ctx.strokeStyle='#eddbff';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.strokeRect(-e.r,-e.r,e.r*2,e.r*2);ctx.restore();}
    if(e.type==='pylon'){ctx.strokeStyle='#ffe1b4';ctx.lineWidth=3;ctx.strokeRect(-e.r,-e.r,e.r*2,e.r*2);ctx.font='9px sans-serif';ctx.fillStyle='#ffdeb7';ctx.textAlign='center';ctx.fillText('供能',0,-e.r-9);}
    if(e.elite){const affix=NeonCore.ELITE_AFFIXES[e.elite];ctx.strokeStyle=affix.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,e.r+7,0,Math.PI*2);ctx.stroke();ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillStyle=affix.color;ctx.fillText(affix.name,0,-e.r-15);}
    if(e.type==='boss'&&e.bossStage===3){ctx.strokeStyle=e.enraged?'#ffe5b3':'#ffc4f3';ctx.lineWidth=3;ctx.beginPath();for(let i=0;i<8;i++){const a=i/8*Math.PI*2;ctx.moveTo(Math.cos(a)*(e.r+5),Math.sin(a)*(e.r+5));ctx.lineTo(Math.cos(a)*(e.r+13),Math.sin(a)*(e.r+13));}ctx.stroke();}
    if(e.stun>0){ctx.strokeStyle='#b3efff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-e.r-4,-4);ctx.lineTo(-e.r-8,2);ctx.lineTo(-e.r-3,5);ctx.moveTo(e.r+4,-5);ctx.lineTo(e.r+8,0);ctx.lineTo(e.r+3,6);ctx.stroke();}
    if(icebite&&e.slowRemaining>0&&Math.hypot(e.x-game.player.x,e.y-game.player.y)<=game.player.auraRadius){ctx.lineWidth=1.5;ctx.strokeStyle='#60e8b4';ctx.beginPath();ctx.arc(0,0,e.r+4,-Math.PI/2,Math.PI/2);ctx.stroke();ctx.strokeStyle='#9ae7ff';ctx.beginPath();ctx.arc(0,0,e.r+4,Math.PI/2,Math.PI*1.5);ctx.stroke();}
    if(e.hp<e.maxHp&&e.type!=='boss'){ctx.fillStyle='#0008';ctx.fillRect(-e.r,e.r+6,e.r*2,3);ctx.fillStyle=e.color;ctx.fillRect(-e.r,e.r+6,e.r*2*Math.max(0,e.hp/e.maxHp),3);}ctx.restore();}
  function drawPlayer(guardian){const p=game.player;ctx.save();ctx.translate(p.x,p.y);if(p.ghostActive)ctx.globalAlpha=.35;else if(p.invuln&&Math.floor(p.invuln*14)%2)ctx.globalAlpha=.5;
    ctx.rotate(reducedMotion?0:game.time*.8);ctx.shadowColor=p.ghostActive?'#b2d8ff':'#b9ff4a';ctx.shadowBlur=glow(p.overloadRemaining>0?40:24);ctx.fillStyle=p.ghostActive?'#b2d8ff':p.overloadRemaining>0?'#fff2a6':'#b9ff4a';ctx.beginPath();for(let i=0;i<6;i++){const a=i/6*Math.PI*2;ctx.lineTo(Math.cos(a)*p.r,Math.sin(a)*p.r);}ctx.closePath();ctx.fill();ctx.shadowBlur=0;circle(0,0,6,'#07110f');ctx.strokeStyle='#35f4d2';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,p.r+6,0,Math.PI*1.5);ctx.stroke();ctx.restore();
    for(let i=0;i<p.orbits;i++){const a=game.time*p.orbitSpeed+i/p.orbits*Math.PI*2,x=p.x+Math.cos(a)*p.orbitRadius,y=p.y+Math.sin(a)*p.orbitRadius;ctx.shadowColor='#a575ff';ctx.shadowBlur=glow(16);circle(x,y,8,'#a575ff');ctx.shadowBlur=0;if(guardian&&p.shieldCharges>0){ctx.strokeStyle='#79f6ee';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.stroke();}}
    if(game.level('drone'))drawDrones();
    if(p.revivalCharges>0){ctx.save();ctx.strokeStyle='#96ffcb';ctx.lineWidth=1;ctx.setLineDash([3,5]);ctx.beginPath();ctx.arc(p.x,p.y,p.r+23,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#96ffcb';ctx.font='10px monospace';ctx.textAlign='left';ctx.fillText('复苏',p.x+30,p.y-10);ctx.restore();}
    if(game.level('turret'))for(let i=0;i<p.turretCount;i++){const point=game.turretPosition(i);ctx.save();ctx.translate(point.x,point.y);ctx.rotate(Math.PI/4);ctx.fillStyle='#fff1a8';ctx.shadowColor='#fff1a8';ctx.shadowBlur=glow(12);ctx.fillRect(-5,-5,10,10);ctx.shadowBlur=0;ctx.strokeStyle='#ffcf82';ctx.strokeRect(-8,-8,16,16);ctx.restore();}
    if(game.level('shield')){ctx.save();ctx.strokeStyle=p.shieldCharges>0?'#79f6ee':'#51716e';ctx.lineWidth=p.shieldCharges>0?2:1;ctx.shadowColor='#79f6ee';ctx.shadowBlur=glow(12);ctx.setLineDash(p.shieldCharges>0?[]:[3,5]);ctx.beginPath();ctx.arc(p.x,p.y,p.r+13,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.shadowBlur=0;const max=p.shieldMaxCharges||1;for(let i=0;i<max;i++){const a=-Math.PI/2+i/max*Math.PI*2;circle(p.x+Math.cos(a)*(p.r+17),p.y+Math.sin(a)*(p.r+17),2.5,i<p.shieldCharges?'#79f6ee':'#37524e');}ctx.fillStyle='#79f6ee';ctx.font='10px monospace';ctx.textAlign='center';ctx.fillText(`◈ ${p.shieldCharges||0}/${max}`,p.x,p.y-35);ctx.restore();}
    if(p.overloadRemaining>0){ctx.fillStyle='#fff2a6';ctx.font='bold 11px monospace';ctx.textAlign='center';ctx.fillText('火力过载',p.x,p.y-49);}
    if(game.level('ghost')){const remain=p.ghostActive?Math.max(0,p.ghostRemaining):Math.max(0,p.ghostClock);ctx.fillStyle='#b2d8ff';ctx.font='11px monospace';ctx.textAlign='center';ctx.fillText(p.ghostActive?'无敌':`${remain.toFixed(1)}s`,p.x,p.y+32);}
    ctx.font='10px monospace';ctx.textAlign='center';if(game.level('lightning')){ctx.fillStyle='#93caff';ctx.fillText(`ϟ ${Math.max(0,p.lightningClock).toFixed(1)}`,p.x-25,p.y+45);}if(game.level('mine')){ctx.fillStyle='#ffcb75';ctx.fillText(`⊕ ${Math.max(0,p.mineClock).toFixed(1)}`,p.x+25,p.y+45);}
    if(game.level('blackholeKing')){ctx.fillStyle=p.blinkClock>0?'#a792bc':'#e3bcff';ctx.fillText(p.blinkClock>0?`折跃 ${p.blinkClock.toFixed(1)}s`:'双击方向 · 折跃就绪',p.x,p.y+60);}
  }
  function drawDrones(){
    const p=game.player,count=p.droneShots||1;ctx.save();
    for(let i=0;i<count;i++){const angle=game.time*.9+i/count*Math.PI*2,x=p.x+Math.cos(angle)*36,y=p.y+Math.sin(angle)*36;ctx.save();ctx.translate(x,y);ctx.rotate(angle+Math.PI/2);ctx.strokeStyle='#ffc078';ctx.fillStyle='#ffc078';ctx.shadowColor='#ffb56c';ctx.shadowBlur=glow(12);ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(6,5);ctx.lineTo(0,2);ctx.lineTo(-6,5);ctx.closePath();ctx.fill();ctx.shadowBlur=0;circle(0,-2,2,'#07110f');ctx.restore();}ctx.restore();
  }
  function drawBullet(b){
    const rail=b.kind==='rail',drone=b.kind==='drone',seeker=drone&&b.canCrit,color=rail?'#fff1ae':seeker?'#ff9cdb':drone?'#ffb56c':b.critical?'#ffe575':'#b9ff4a',angle=Math.atan2(b.vy,b.vx),length=rail?(fx().details?76:36):drone?(fx().details?28:13):(fx().details?17:8);
    ctx.save();ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=glow(rail?25:12);ctx.lineCap='round';ctx.lineWidth=rail?b.r*1.7:drone?3:2;ctx.globalAlpha=rail?.7:.45;ctx.beginPath();ctx.moveTo(b.x-Math.cos(angle)*length,b.y-Math.sin(angle)*length);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.globalAlpha=1;
    if(rail){ctx.strokeStyle='#fffef0';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(b.x-Math.cos(angle)*length*.65,b.y-Math.sin(angle)*length*.65);ctx.lineTo(b.x+Math.cos(angle)*b.r,b.y+Math.sin(angle)*b.r);ctx.stroke();}
    circle(b.x,b.y,b.r,rail?'#fffef0':seeker?'#ffbfe9':drone?'#ffe8bf':'#eaffbf');if(seeker)circle(b.x,b.y,b.r*.45,'#fff0fa');ctx.restore();
  }
  function drawArrow(a){
    ctx.save();ctx.strokeStyle='#ff6a53';ctx.shadowColor='#ff634f';ctx.shadowBlur=glow(a.trail?18:10);ctx.lineWidth=2.5;
    if(a.trail?.length&&!reducedMotion){ctx.beginPath();const points=a.trail.slice(-Math.max(4,fx().details?16:4));for(let i=0;i<points.length;i++)if(i)ctx.lineTo(points[i].x,points[i].y);else ctx.moveTo(points[i].x,points[i].y);ctx.stroke();}
    ctx.translate(a.x,a.y);ctx.rotate(Math.atan2(a.vy,a.vx));ctx.beginPath();ctx.moveTo(-18,0);ctx.lineTo(9,0);ctx.stroke();ctx.fillStyle='#fff0d8';ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(3,-5);ctx.lineTo(3,5);ctx.closePath();ctx.fill();ctx.restore();
  }
  function drawMuzzles(){
    for(const m of muzzles){if(!Number.isFinite(m.x)||!Number.isFinite(m.y))continue;ctx.save();ctx.translate(m.x,m.y);ctx.globalAlpha=m.life/m.total;if(m.kind==='seekerCritical'){ctx.strokeStyle='#ffbfe9';ctx.lineWidth=2;const r=fx().details?8:5;ctx.beginPath();ctx.moveTo(-r,0);ctx.lineTo(r,0);ctx.moveTo(0,-r);ctx.lineTo(0,r);ctx.stroke();circle(0,0,2.5,'#fff0fa');ctx.restore();continue;}ctx.rotate(m.angle||0);ctx.fillStyle=game.player.overloadRemaining>0?'#ffeaa2':'#eaffbf';ctx.shadowColor='#b9ff4a';ctx.shadowBlur=glow(16);const size=fx().details?16:9;
      for(let i=0;i<Math.min(3,m.count);i++){ctx.save();ctx.rotate((i-(Math.min(3,m.count)-1)/2)*.16);ctx.beginPath();ctx.moveTo(16,-3);ctx.lineTo(16+size,0);ctx.lineTo(16,3);ctx.closePath();ctx.fill();ctx.restore();}ctx.restore();}
  }
  function drawWell(w){
    if(w.life<=0)return;ctx.save();const ratio=Math.min(1,w.life/.5),rotation=reducedMotion?0:game.time*.65;ctx.globalAlpha=ratio;
    if(w.royal){ctx.strokeStyle='#f2ceff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(w.x,w.y,w.r*.85,0,Math.PI*2);ctx.stroke();}
    const field=ctx.createRadialGradient(w.x,w.y,4,w.x,w.y,w.r);field.addColorStop(0,'rgba(169,105,255,.2)');field.addColorStop(.65,'rgba(130,83,255,.1)');field.addColorStop(1,'rgba(130,83,255,0)');circle(w.x,w.y,w.r,field);
    ctx.strokeStyle='#ac86ff';ctx.lineWidth=1.5;ctx.globalAlpha=ratio*.6;ctx.setLineDash([5,8]);ctx.beginPath();ctx.arc(w.x,w.y,w.r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.shadowColor='#a575ff';ctx.shadowBlur=glow(15);
    for(let i=0;i<(fx().details?3:1);i++){ctx.beginPath();ctx.arc(w.x,w.y,w.r*(.25+i*.2),rotation*(1+i*.3)+i,rotation*(1+i*.3)+i+Math.PI*1.6);ctx.stroke();}ctx.globalAlpha=ratio;circle(w.x,w.y,13,'#c09dff');circle(w.x,w.y,9,'#070712');ctx.restore();
  }
  const effectNoise=(seed,index)=>{const n=Math.sin(seed*937.1+index*71.7)*43758.5453;return n-Math.floor(n);};
  function boltPath(x1,y1,x2,y2,seed,width){
    const dx=x2-x1,dy=y2-y1,length=Math.max(1,Math.hypot(dx,dy));ctx.beginPath();ctx.moveTo(x1,y1);
    for(let i=1;i<=12;i++){const t=i/12,jitter=(effectNoise(seed,i)-.5)*width*Math.sin(t*Math.PI);ctx.lineTo(x1+dx*t-dy/length*jitter,y1+dy*t+dx/length*jitter);}
  }
  function drawLightning(e,progress){
    const age=e.total-e.life,expansion=reducedMotion?1:1-Math.pow(1-progress,3),storm=!!e.gravityStorm,core=storm?'247,221,255':'208,240,255',outer=storm?'183,126,255':'65,167,255';
    const field=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,e.r);field.addColorStop(0,`rgba(${core},${fx().details?.55:.12})`);field.addColorStop(.3,`rgba(${outer},${fx().details?.25:.06})`);field.addColorStop(1,`rgba(${outer},0)`);circle(e.x,e.y,e.r,field);
    if(storm){ctx.strokeStyle='#d3b6ff';ctx.shadowColor='#b67cff';}
    ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,Math.max(1,e.r*expansion),0,Math.PI*2);ctx.stroke();
    if(age<.34){
      ctx.globalAlpha=Math.max(0,1-age/.34);const topY=Math.min(-10,e.y-280),topX=e.x+(effectNoise(e.seed,0)-.5)*100;
      boltPath(topX,topY,e.x,e.y,e.seed,48);ctx.lineWidth=fx().details?12+(e.level||1)*2:6;ctx.strokeStyle=storm?'#b67cff':'#278bff';ctx.shadowBlur=glow(32);ctx.stroke();ctx.lineWidth=fx().details?4:2;ctx.strokeStyle=storm?'#fff4ff':'#f2fcff';ctx.shadowBlur=glow(10);ctx.stroke();
      for(let i=0;i<(fx().details===2?5:fx().details===1?3:0);i++){const t=.25+i*.13,x=topX+(e.x-topX)*t,y=topY+(e.y-topY)*t;boltPath(x,y,e.x+(i%2?1:-1)*e.r*.7,e.y-e.r*.12,e.seed+i+1,26);ctx.lineWidth=2;ctx.strokeStyle=storm?'#e6c8ff':'#a4ddff';ctx.stroke();}
      circle(e.x,e.y,Math.max(3,(fx().details?19:7)*(1-age/.34)),'#ffffff');
    }
    ctx.globalAlpha=Math.min(1,e.life/e.total*1.4);ctx.shadowBlur=glow(5);ctx.strokeStyle=storm?'#e6c8ff':'#a4e3ff';ctx.lineWidth=1.5;
    const cracks=fx().details===2?16:fx().details===1?10:3;
    for(let i=0;i<cracks;i++){const angle=i/cracks*Math.PI*2,length=e.r*(.25+effectNoise(e.seed,i+20)*.65)*expansion;ctx.beginPath();ctx.moveTo(e.x+Math.cos(angle)*length*.4,e.y+Math.sin(angle)*length*.4);ctx.lineTo(e.x+Math.cos(angle+.05)*length*.7,e.y+Math.sin(angle+.05)*length*.7);ctx.lineTo(e.x+Math.cos(angle)*length,e.y+Math.sin(angle)*length);ctx.stroke();}
  }
  function drawMineExplosion(e,progress){
    const expansion=reducedMotion?1:1-Math.pow(1-progress,3),r=Math.max(2,e.r*expansion),age=e.total-e.life;
    const field=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,r);field.addColorStop(0,fx().details?(age<.18?'rgba(255,255,225,.8)':'rgba(255,181,85,.22)'):'rgba(255,181,85,.12)');field.addColorStop(.4,fx().details?(e.blackHole?'rgba(156,102,255,.35)':'rgba(255,127,50,.35)'):'rgba(255,127,50,.07)');field.addColorStop(1,'rgba(255,127,50,0)');circle(e.x,e.y,r,field);
    ctx.lineWidth=(fx().details?7:3)*(1-progress)+1;ctx.strokeStyle=e.color;ctx.shadowBlur=glow(24);ctx.beginPath();ctx.arc(e.x,e.y,r,0,Math.PI*2);ctx.stroke();ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,r*.72,0,Math.PI*2);ctx.stroke();
    if(age<.22&&fx().details)circle(e.x,e.y,Math.max(2,e.r*.23*(1-age/.22)),'#fffbdc');
    ctx.shadowBlur=glow(7);ctx.lineWidth=2.5;const fragments=fx().details===2?26:fx().details===1?18:4;
    for(let i=0;i<fragments;i++){const angle=i/fragments*Math.PI*2+effectNoise(e.seed,i)*.3,length=e.r*(.4+effectNoise(e.seed,i+20)*.58)*expansion;ctx.beginPath();ctx.moveTo(e.x+Math.cos(angle)*Math.max(0,length-9),e.y+Math.sin(angle)*Math.max(0,length-9));ctx.lineTo(e.x+Math.cos(angle)*length,e.y+Math.sin(angle)*length);ctx.stroke();}
    ctx.shadowBlur=0;circle(e.x,e.y,e.r*.2*progress,`rgba(12,9,21,${(1-progress)*.45})`);
  }
  function drawFrost(e,progress){
    const radius=e.r*(reducedMotion?1:1-Math.pow(1-progress,3)),count=fx().details===2?16:fx().details===1?10:4;
    ctx.lineWidth=3;ctx.strokeStyle='#b8f4ff';ctx.beginPath();ctx.arc(e.x,e.y,Math.max(1,radius),0,Math.PI*2);ctx.stroke();
    const field=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,Math.max(1,radius));field.addColorStop(0,'rgba(131,221,255,0)');field.addColorStop(.8,fx().details?'rgba(131,221,255,.15)':'rgba(131,221,255,.04)');field.addColorStop(1,'rgba(131,221,255,0)');circle(e.x,e.y,Math.max(1,radius),field);
    for(let i=0;i<count;i++){ctx.save();const a=i/count*Math.PI*2;ctx.translate(e.x+Math.cos(a)*radius*.8,e.y+Math.sin(a)*radius*.8);ctx.rotate(a);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(6,0);ctx.moveTo(-3,-4);ctx.lineTo(3,4);ctx.moveTo(-3,4);ctx.lineTo(3,-4);ctx.stroke();ctx.restore();}
  }
  // These helpers only read existing actors/effects. No gameplay state or random stream is touched.
  function drawSaw(s){
    const color=s.returning?'#87ffdf':'#f2df86',detail=fx().details;ctx.save();ctx.translate(s.x,s.y);
    if(detail){ctx.strokeStyle=color;ctx.globalAlpha=.28;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,s.r*1.15,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    ctx.rotate(reducedMotion?0:game.time*14);ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=glow(12);ctx.beginPath();
    for(let i=0;i<24;i++){const angle=i/24*Math.PI*2,r=s.r*(i%2?.7:1.2);ctx.lineTo(Math.cos(angle)*r,Math.sin(angle)*r);}ctx.closePath();ctx.fill();ctx.shadowBlur=0;
    circle(0,0,s.r*.59,'#263d3b');ctx.strokeStyle='#fff5c9';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,s.r*.58,0,Math.PI*2);ctx.stroke();
    if(detail){ctx.strokeStyle=color;ctx.lineWidth=2;for(let i=0;i<4;i++){const a=i*Math.PI/2;ctx.beginPath();ctx.arc(0,0,s.r*.83,a,a+.65);ctx.stroke();}circle(0,0,s.r*.3,'#a9c6b9');}
    circle(0,0,3,'#152021');ctx.restore();
  }
  function drawFlask(flask){
    const t=Math.max(0,Math.min(1,flask.age/flask.flight)),lift=reducedMotion?0:Math.sin(t*Math.PI)*70;ctx.save();ctx.strokeStyle='#f7ca7366';ctx.setLineDash([3,5]);ctx.beginPath();ctx.arc(flask.goalX,flask.goalY,flask.blast,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    circle(flask.x,flask.y,5,'#f7ca7333');ctx.translate(flask.x,flask.y-lift);if(!reducedMotion)ctx.rotate(t*Math.PI*2);
    ctx.shadowColor='#f7ca73';ctx.shadowBlur=glow(10);ctx.fillStyle='#183b35';ctx.beginPath();ctx.moveTo(-3,-10);ctx.lineTo(-3,-5);ctx.lineTo(-7,2);ctx.lineTo(-7,7);ctx.lineTo(7,7);ctx.lineTo(7,2);ctx.lineTo(3,-5);ctx.lineTo(3,-10);ctx.closePath();ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle='#eebf5f';ctx.fillRect(-5,1,10,5);ctx.strokeStyle='#fff0bd';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#d9eecf';ctx.fillRect(-4,-12,8,3);
    if(fx().details){ctx.strokeStyle='#ffffff';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-4,-1);ctx.lineTo(-4,4);ctx.stroke();circle(2,3,1,'#fff9ca');circle(-1,5,1,'#fff9ca');}ctx.restore();
  }
  function drawBlast(e,progress){
    const detail=fx().details,flask=e.kind==='flaskBurst',echo=e.kind==='meteorEcho',expand=reducedMotion?1:1-Math.pow(1-progress,3),r=Math.max(1,e.r*expand),alpha=ctx.globalAlpha;
    ctx.shadowBlur=0;
    if(detail){const field=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,r);field.addColorStop(0,flask?'rgba(255,243,178,.38)':'rgba(255,244,214,.48)');field.addColorStop(.4,flask?'rgba(213,232,103,.18)':'rgba(255,161,95,.2)');field.addColorStop(1,'rgba(255,174,93,0)');circle(e.x,e.y,r,field);}
    ctx.strokeStyle=e.color;ctx.shadowColor=e.color;ctx.shadowBlur=glow(12);ctx.lineWidth=detail?3:2;ctx.beginPath();ctx.arc(e.x,e.y,r,0,Math.PI*2);ctx.stroke();
    if(!detail){circle(e.x,e.y,3,flask?'#fff0bd':'#ffedca');return;}
    ctx.globalAlpha=alpha*.65;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(e.x,e.y,Math.max(1,r*(echo?.74:.56)),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=alpha;
    const count=detail===2?14:8;ctx.shadowBlur=0;ctx.strokeStyle=flask?'#e6ee9c':'#ffe4bc';ctx.lineWidth=2;
    for(let i=0;i<count;i++){const a=i/count*Math.PI*2+effectNoise(e.seed,i)*.3,length=r*(.45+effectNoise(e.seed,i+30)*.5),x=e.x+Math.cos(a)*length,y=e.y+Math.sin(a)*length;
      if(flask){ctx.beginPath();ctx.arc(x,y,1+effectNoise(e.seed,i+60)*3,0,Math.PI*2);ctx.stroke();}
      else{ctx.beginPath();ctx.moveTo(e.x+Math.cos(a)*Math.max(0,length-12),e.y+Math.sin(a)*Math.max(0,length-12));ctx.lineTo(x,y);ctx.stroke();}}
    const core=Math.max(2,Math.min(e.r*.18,22)*(reducedMotion?.55:Math.max(.1,1-progress*2)));
    circle(e.x,e.y,core,flask?'#fff4bc':'#fff4e3');
    if(!flask){ctx.strokeStyle='#fff0d7';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(e.x-core*1.8,e.y);ctx.lineTo(e.x+core*1.8,e.y);ctx.moveTo(e.x,e.y-core*1.8);ctx.lineTo(e.x,e.y+core*1.8);ctx.stroke();}
  }
  function drawIonLink(e,progress){
    // Mender repairs share ionLink but must retain their distinct pink, non-weapon identity.
    if(e.color==='#ffb0c3'){ctx.shadowBlur=0;ctx.strokeStyle=e.color;ctx.lineWidth=2;ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(e.fromX,e.fromY);ctx.lineTo(e.x,e.y);ctx.stroke();ctx.setLineDash([]);return;}
    const detail=fx().details,alpha=ctx.globalAlpha;ctx.lineCap='round';boltPath(e.fromX,e.fromY,e.x,e.y,e.seed,12);ctx.lineWidth=detail?9:4;ctx.globalAlpha=alpha*.45;ctx.stroke();ctx.globalAlpha=alpha;ctx.strokeStyle='#f3ecff';ctx.lineWidth=detail?2:1.5;ctx.stroke();
    if(!detail)return;const dx=e.x-e.fromX,dy=e.y-e.fromY,length=Math.max(1,Math.hypot(dx,dy)),phase=reducedMotion?0:progress*Math.PI*4;
    ctx.shadowBlur=glow(6);ctx.strokeStyle=e.color;ctx.lineWidth=1;for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(e.fromX,e.fromY);for(let i=1;i<=12;i++){const t=i/12,wave=side*Math.sin(t*Math.PI)*Math.sin(t*Math.PI*5+phase)*7;ctx.lineTo(e.fromX+dx*t-dy/length*wave,e.fromY+dy*t+dx/length*wave);}ctx.stroke();}
    ctx.shadowBlur=0;ctx.strokeStyle='#e2eaff';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(e.x,e.y,Math.min(10,e.r)*(reducedMotion?1:.55+progress*.45),0,Math.PI*2);ctx.stroke();circle(e.x,e.y,2.5,'#f8f1ff');
  }
  function drawTurretLaser(e,progress){
    const detail=fx().details,alpha=ctx.globalAlpha,dx=e.x-e.fromX,dy=e.y-e.fromY;ctx.lineCap='round';ctx.lineWidth=e.piercing?20:5;ctx.globalAlpha=alpha*.4;ctx.beginPath();ctx.moveTo(e.fromX,e.fromY);ctx.lineTo(e.x,e.y);ctx.stroke();
    ctx.globalAlpha=alpha;ctx.strokeStyle='#fffce5';ctx.lineWidth=e.piercing?3:2;ctx.shadowBlur=glow(8);ctx.stroke();if(!detail)return;
    ctx.shadowBlur=0;ctx.save();ctx.translate(e.fromX,e.fromY);ctx.rotate(Math.atan2(dy,dx));ctx.strokeStyle='#ffd896';ctx.lineWidth=1.5;
    const length=Math.hypot(dx,dy),count=e.piercing?(detail===2?7:4):2;for(let i=1;i<=count;i++){const x=length*i/(count+1),span=e.piercing?6:3;ctx.beginPath();ctx.moveTo(x-3,-span);ctx.lineTo(x+3,span);ctx.stroke();}ctx.restore();
    ctx.strokeStyle='#ffe8bb';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(e.fromX,e.fromY,(e.piercing?12:7)*(reducedMotion?1:.7+progress*.3),0,Math.PI*2);ctx.stroke();circle(e.fromX,e.fromY,3,'#fff9e8');
  }
  function drawRocket(rocket){
    if(rocket.phase===2)return;ctx.save();
    if(rocket.phase===1){ctx.strokeStyle='#ffd0a4';ctx.lineWidth=1.5;ctx.setLineDash([3,5]);ctx.beginPath();ctx.arc(rocket.x,rocket.y,rocket.blast+25,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#ffd0a4';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText('己方集束',rocket.x,rocket.y-rocket.blast-30);ctx.restore();return;}
    const detail=fx().details;
    if(detail&&!reducedMotion&&rocket.trail.length){ctx.strokeStyle='#ffae74';ctx.lineWidth=5;ctx.globalAlpha=.22;ctx.beginPath();for(const [i,point]of rocket.trail.entries())if(i)ctx.lineTo(point.x,point.y);else ctx.moveTo(point.x,point.y);ctx.stroke();ctx.globalAlpha=.8;ctx.strokeStyle='#ffe4bc';ctx.lineWidth=1.5;ctx.stroke();ctx.globalAlpha=1;}
    ctx.translate(rocket.x,rocket.y);ctx.rotate(Math.atan2(rocket.vy,rocket.vx));ctx.shadowColor='#ffb586';ctx.shadowBlur=glow(12);
    const flame=detail?(reducedMotion?19:19+Math.sin(game.time*22+rocket.x*.03)*4):12;ctx.fillStyle='#ff935e';ctx.beginPath();ctx.moveTo(-5,-3);ctx.lineTo(-flame,0);ctx.lineTo(-5,3);ctx.closePath();ctx.fill();ctx.shadowBlur=0;
    if(detail){ctx.fillStyle='#fff0bf';ctx.beginPath();ctx.moveTo(-5,-1.5);ctx.lineTo(-flame*.7,0);ctx.lineTo(-5,1.5);ctx.closePath();ctx.fill();}
    ctx.fillStyle='#ffe0b5';ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-6,-5);ctx.lineTo(-3,0);ctx.lineTo(-6,5);ctx.closePath();ctx.fill();ctx.strokeStyle='#fff9e3';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-3,-2);ctx.lineTo(6,0);ctx.stroke();ctx.restore();
  }
  function drawMeteor(m){
    ctx.save();ctx.strokeStyle=m.phase?'#ffe5b9':'#ffbe89';ctx.lineWidth=2;ctx.setLineDash([4,6]);ctx.beginPath();ctx.arc(m.x,m.y,m.r+(m.phase===1?25:0),0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#ffd9ad';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(m.phase?'陨星余震':'己方陨星',m.x,m.y-m.r-8);
    if(!m.phase){const fall=reducedMotion?0:Math.max(0,1-m.age/m.delay)*200,x=m.x,y=m.y-fall,detail=fx().details;ctx.lineCap='round';ctx.strokeStyle='#ffac72';ctx.lineWidth=detail?12:4;ctx.globalAlpha=detail?.35:1;ctx.shadowColor='#ffad78';ctx.shadowBlur=glow(15);ctx.beginPath();ctx.moveTo(x-30,y-65);ctx.lineTo(x,y);ctx.stroke();ctx.globalAlpha=1;ctx.shadowBlur=0;
      if(detail){ctx.strokeStyle='#ffeac7';ctx.lineWidth=3;ctx.stroke();ctx.strokeStyle='#ffbe8e';ctx.lineWidth=1.5;for(let i=0;i<(detail===2?3:2);i++){const side=i%2?1:-1,offset=7+i*4;ctx.beginPath();ctx.moveTo(x-22+side*offset,y-55);ctx.lineTo(x+side*5,y-12);ctx.stroke();}}
      circle(x,y,detail?9:7,'#ffe3b0');if(detail)circle(x,y,4,'#fff9e9');}
    ctx.restore();
  }
  function drawBlink(e,progress){
    const radius=e.r*(reducedMotion?1:.65+.5*Math.sin(progress*Math.PI));
    for(const point of [{x:e.fromX,y:e.fromY},e]){
      const field=ctx.createRadialGradient(point.x,point.y,radius*.2,point.x,point.y,radius*1.5);
      field.addColorStop(0,'rgba(14,3,28,.95)');field.addColorStop(.42,'rgba(163,98,255,.6)');field.addColorStop(1,'rgba(163,98,255,0)');circle(point.x,point.y,radius*1.5,field);
      ctx.strokeStyle='#d6a6ff';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(point.x,point.y,radius,radius*.47,-.35,0,Math.PI*2);ctx.stroke();
      const count=fx().details?3:1;for(let i=0;i<count;i++){
        const angle=e.seed*Math.PI*2+(reducedMotion?0:progress*Math.PI*4)+i*Math.PI*2/count;
        ctx.strokeStyle=i%2?'#9460ee':'#eddaff';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(point.x,point.y,radius*(.55+i*.17),angle,angle+1.8);ctx.stroke();
      }
      ctx.shadowBlur=0;circle(point.x,point.y,radius*.34,'#080310');ctx.shadowBlur=glow(14);
    }
  }
  function drawEffect(e){const progress=1-e.life/e.total;ctx.save();ctx.globalAlpha=Math.min(1,e.life/e.total*2);ctx.strokeStyle=e.color;ctx.shadowColor=e.color;ctx.shadowBlur=glow(14);
    if(e.kind==='beam'){ctx.translate(e.x,e.y);ctx.rotate(e.angle);ctx.lineWidth=(e.halfWidth||10)*2;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(e.r,0);ctx.stroke();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();}
    else if(e.kind==='mirror'){ctx.fillStyle='rgba(168,234,255,.35)';if(e.axis!=='horizontal')ctx.fillRect(e.x-e.r,0,e.r*2,height);if(e.axis!=='vertical')ctx.fillRect(0,e.y-e.r,width,e.r*2);}
    else if(e.kind==='blink')drawBlink(e,progress);
    else if(e.kind==='stormLances')drawStormLances(e.x,e.y,e.angle,e.lanes,false);
    else if(e.kind==='vineSweep')drawVine(e.x,e.y,e.angle,false);
    else if(e.kind==='flaskBurst'||e.kind==='meteor'||e.kind==='meteorEcho')drawBlast(e,progress);
    else if(e.kind==='elitePulse'){ctx.strokeStyle='#f1beff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,e.r*(1-e.life/e.total),0,Math.PI*2);ctx.stroke();}
    else if(e.kind==='stormCage')drawStormCage(e.x,e.y,false);
    else if(e.kind==='lightning')drawLightning(e,progress);
    else if(e.kind==='mine')drawMineExplosion(e,progress);
    else if(e.kind==='frost')drawFrost(e,progress);
    else if(e.kind==='rail'){ctx.translate(e.x,e.y);ctx.rotate(e.angle||0);ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(12,-9);ctx.lineTo(e.r+24,0);ctx.lineTo(12,9);ctx.stroke();ctx.strokeStyle='#fff8d8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(e.r+38,0);ctx.stroke();}
    else if(e.kind==='shield'){ctx.lineWidth=3;ctx.beginPath();for(let i=0;i<=6;i++){const a=i/6*Math.PI*2;ctx.lineTo(e.x+Math.cos(a)*e.r,e.y+Math.sin(a)*e.r);}ctx.stroke();circle(e.x,e.y,e.r,'rgba(125,242,255,.08)');}
    else if(e.kind==='overload'){ctx.lineWidth=2;ctx.setLineDash([5,9]);ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,Math.PI*2);ctx.stroke();}
    else if(e.kind==='turretLaser')drawTurretLaser(e,progress);
    else if(e.kind==='ionLink')drawIonLink(e,progress);
    else if(e.kind==='chain'){if(e.gravityStorm){ctx.strokeStyle='#c995ff';ctx.shadowColor='#c995ff';}boltPath(e.fromX,e.fromY,e.x,e.y,e.seed,24);ctx.lineWidth=5;ctx.stroke();ctx.lineWidth=1.5;ctx.strokeStyle=e.gravityStorm?'#fff0ff':'#e1fff1';ctx.stroke();circle(e.x,e.y,6,e.gravityStorm?'#ffe2ff':'#dcfff2');}
    else if(e.kind==='bossCone'){ctx.fillStyle='rgba(255,83,122,.3)';ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.arc(e.x,e.y,e.r,e.angle-.57,e.angle+.57);ctx.closePath();ctx.fill();}
    else if(e.kind==='bossShockwave'){const inner=e.innerRadius??120;ctx.shadowBlur=0;ctx.fillStyle='rgba(255,108,149,.15)';ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,Math.PI*2);ctx.arc(e.x,e.y,inner,0,Math.PI*2,true);ctx.fill('evenodd');ctx.strokeStyle='#ffb8bb';ctx.lineWidth=4;ctx.beginPath();ctx.arc(e.x,e.y,reducedMotion?e.r:inner+(e.r-inner)*progress,0,Math.PI*2);ctx.stroke();}
    else if(e.kind==='bossCross'){ctx.translate(e.x,e.y);ctx.rotate(e.angle||0);ctx.fillStyle='rgba(255,83,122,.24)';ctx.fillRect(-e.r,-27,e.r*2,54);ctx.fillRect(-27,-e.r,54,e.r*2);}
    else if(e.kind==='bossCorePulse'||e.kind==='arenaEruption'){ctx.fillStyle='rgba(255,87,76,.24)';ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,Math.PI*2);ctx.fill();ctx.lineWidth=4;ctx.beginPath();ctx.arc(e.x,e.y,e.r*(reducedMotion?1:progress),0,Math.PI*2);ctx.stroke();}
    else{ctx.lineWidth=e.kind==='bomb'?5:2;ctx.beginPath();ctx.arc(e.x,e.y,Math.max(1,e.r*(reducedMotion?1:progress)),0,Math.PI*2);ctx.stroke();}ctx.restore();}
  function draw(){ctx.clearRect(0,0,width,height);ctx.save();if(game.state==='playing'&&!reducedMotion&&fx().shake&&shake>.02)ctx.translate((visualRandom()-.5)*shake*fx().shake,(visualRandom()-.5)*shake*fx().shake);drawGrid();drawAura();
    for(const rocket of game.rockets)drawRocket(rocket);
    for(const m of game.meteors)drawMeteor(m);
    for(const pool of game.acidPools){circle(pool.x,pool.y,pool.r,'rgba(247,202,115,.14)');ctx.strokeStyle='#f7ca73';ctx.lineWidth=2;ctx.beginPath();ctx.arc(pool.x,pool.y,pool.r,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#ffdf98';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText('己方酸池',pool.x,pool.y+4);}
    for(const well of game.gravityWells||[])drawWell(well);
    for(const mine of game.mines)drawMine(mine);
    for(const g of game.gems){if(g.dead)continue;if(g.magnetized){ctx.strokeStyle='#35f4d255';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(g.x,g.y);ctx.lineTo(g.x-g.vx*.02,g.y-g.vy*.02+9);ctx.stroke();}ctx.save();ctx.translate(g.x,g.y);ctx.rotate(Math.PI/4);ctx.fillStyle='#35f4d2';ctx.shadowColor='#35f4d2';ctx.shadowBlur=glow(9);ctx.fillRect(-g.r,-g.r,g.r*2,g.r*2);ctx.restore();}
    for(const item of game.items)drawItem(item);
    for(const b of game.bullets)if(b.kind==='arrow')drawArrow(b);else drawBullet(b);
    if(game.whistle)drawArrow(game.whistle);
    for(const saw of game.saws)drawSaw(saw);
    for(const flask of game.flasks)drawFlask(flask);
    for(const s of game.enemyShots||[]){ctx.save();ctx.strokeStyle='#ffd2f7';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(s.x-s.vx*.04,s.y-s.vy*.04);ctx.lineTo(s.x,s.y);ctx.stroke();circle(s.x,s.y,s.r,'#ff79d2');ctx.restore();}
    const icebite=game.hasSynergy('icebite'),guardian=game.hasSynergy('guardian');for(const e of game.enemies)if(!e.dead)drawEnemy(e,icebite);drawPlayer(guardian);
    for(const e of game.effects)drawEffect(e);
    drawMuzzles();
    for(const p of particles){ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.r,p.r);}ctx.globalAlpha=1;
    ctx.textAlign='center';for(const t of texts){ctx.globalAlpha=Math.min(1,t.life*3);ctx.fillStyle=t.color;ctx.font=t.big?'800 18px monospace':'700 12px monospace';ctx.fillText(t.text,t.x,t.y);}ctx.globalAlpha=1;
    if(game.state==='playing'&&!reducedMotion&&fx().flash){
      if(flash){ctx.fillStyle=`rgba(255,83,122,${flash*.5*fx().flash})`;ctx.fillRect(-25,-25,width+50,height+50);}
      if(skillFlash){ctx.save();ctx.globalAlpha=skillFlash*.45*fx().flash;ctx.fillStyle=skillFlashColor;ctx.fillRect(-25,-25,width+50,height+50);ctx.restore();}
    }
    // Telegraphs are always last: no particle, glow or full-screen flash can cover them.
    drawWarnings();ctx.restore();
  }
  function loop(now){const dt=Math.min(.04,(now-last)/1000||0);last=now;const wasPlaying=!saveOpen&&game.state==='playing';
    if(wasPlaying){const x=pointer?pointer.dx:(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0),y=pointer?pointer.dy:(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0);game.step(dt,{x,y});updateFx(dt);flushEvents();}
    syncView();hudClock+=dt;if(hudClock>.1||lastRevision!==game.revision){hudClock=0;updateHud();}draw();requestAnimationFrame(loop);}

  addEventListener('keydown',e=>{
    if(guideOpen){if(!e.repeat&&e.code==='Escape'){e.preventDefault();closeGuide();}else if(e.code==='Tab'){const controls=Array.from($('#guideOverlay').querySelectorAll('button,select,input,summary')).filter(el=>(el.getClientRects?.().length??1)>0),first=controls[0],last=controls[controls.length-1],active=document.activeElement;if(!first){e.preventDefault();$('#guideCloseBtn').focus();}else if(!controls.includes(active)||!e.shiftKey&&active===last){e.preventDefault();first.focus();}else if(e.shiftKey&&active===first){e.preventDefault();last.focus();}}return;}
    if(workshopOpen){if(!e.repeat&&e.code==='Escape'){e.preventDefault();closeWorkshop();}else if(e.code==='Tab'){const controls=Array.from($('#equipmentOverlay').querySelectorAll('button:not([disabled]),a:not(.hidden),textarea')).filter(el=>(el.getClientRects?.().length??1)>0),first=controls[0],last=controls[controls.length-1],active=document.activeElement;if(!first){e.preventDefault();$('#equipmentCloseBtn').focus();}else if(!controls.includes(active)||!e.shiftKey&&active===last){e.preventDefault();first.focus();}else if(e.shiftKey&&active===first){e.preventDefault();last.focus();}}return;}
    if(saveOpen){if(e.code==='Escape'){e.preventDefault();closeSave();}return;}
    if(historyOpen){
      if(!e.repeat&&e.code==='Escape'){e.preventDefault();closeHistory();}
      else if(e.code==='Tab'){
        const controls=Array.from($('#historyOverlay').querySelectorAll('button:not([disabled]),summary')).filter(el=>(el.getClientRects?.().length??1)>0),first=controls[0],last=controls[controls.length-1],active=document.activeElement;
        if(!first){e.preventDefault();$('#historyCloseBtn').focus();}
        else if(!controls.includes(active)||!e.shiftKey&&active===last){e.preventDefault();first.focus();}
        else if(e.shiftKey&&active===first){e.preventDefault();last.focus();}
      }
      return;
    }
    const target=e.target||document.activeElement;if(target?.isContentEditable||['SELECT','INPUT','TEXTAREA'].includes(target?.tagName)){lastDirectionTap=null;return;}
    const direction=directionKeys[e.code],directionId=direction?.join(',');
    const fresh=direction&&!Object.keys(keys).some(code=>keys[code]&&directionKeys[code]?.join(',')===directionId);
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys[e.code]=true;
    if(direction&&!e.repeat&&fresh&&game.state==='playing'&&game.level('blackholeKing')){
      const now=performance.now();
      if(lastDirectionTap?.id===directionId&&now-lastDirectionTap.at>=0&&now-lastDirectionTap.at<=200){game.tryBlink(...direction);lastDirectionTap=null;}
      else lastDirectionTap={id:directionId,at:now};
    }
    if(!e.repeat&&(e.code==='KeyP'||e.code==='Escape'))pause();
    if(!e.repeat&&game.state==='upgrade'&&/^Digit[123]$/.test(e.code)){e.preventDefault();select(Number(e.code.slice(-1))-1);}
    else if(!e.repeat&&game.state==='upgrade'&&e.code==='KeyR'){e.preventDefault();reroll();}
    else if(!e.repeat&&game.state==='catalyst'&&/^Digit[123]$/.test(e.code)){e.preventDefault();selectCatalyst(Number(e.code.slice(-1))-1);}
  });addEventListener('keyup',e=>{keys[e.code]=false;});
  addEventListener('blur',()=>{keys={};lastDirectionTap=null;hideJoystick();if(game.state==='playing'){game.pause();syncView();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.state==='playing'){game.pause();keys={};hideJoystick();syncView();}});
  canvas.addEventListener('pointerdown',e=>{if(game.state!=='playing'||e.pointerType==='mouse')return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0};ui.joystick.style.display='block';ui.joystick.style.left=`${e.clientX-55}px`;ui.joystick.style.top=`${e.clientY-55}px`;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y,d=Math.hypot(dx,dy);pointer.dx=d>5?dx/d*Math.min(1,d/38):0;pointer.dy=d>5?dy/d*Math.min(1,d/38):0;ui.joystick.firstElementChild.style.transform=`translate(${pointer.dx*38}px,${pointer.dy*38}px)`;});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(pointer?.id===e.pointerId)hideJoystick();});
  $('#saveBtn').onclick=openSave;$('#saveCloseBtn').onclick=closeSave;$('#saveExportBtn').onclick=writeSave;$('#saveImportBtn').onclick=readSave;$('#saveFile').onchange=async()=>{try{const file=$('#saveFile').files?.[0];if(!file)return;if(file.size>2000000)throw new Error('存档文件过大');$('#saveText').value=await file.text();$('#saveStatus').textContent='文件已打开，点击读取进度。';}catch(error){$('#saveStatus').textContent=error.message;}};
  $('#equipmentStartBtn').onclick=openWorkshop;$('#equipmentEndBtn').onclick=openWorkshop;$('#equipmentCloseBtn').onclick=closeWorkshop;$('#equipmentExportBtn').onclick=exportWorkshop;$('#equipmentImportBtn').onclick=importWorkshop;
  for(const [id,enabled]of [['equipmentAllBtn',true],['equipmentNoneBtn',false]])$('#'+id).onclick=()=>{if(!workshopOpen)return;for(const gear of GEAR)if(equipmentProfile.levels[gear.id])equipmentProfile=NeonCore.equipEquipment(equipmentProfile,gear.id,enabled);persistEquipment();renderWorkshop();$('#equipmentStatus').textContent=enabled?'全部已解锁装备已装配，下次开局同时生效。':'装备已全部卸下，下次开局使用原始属性。';};
  $('#guideStartBtn').onclick=()=>openGuide($('#guideStartBtn'));$('#guidePauseBtn').onclick=()=>openGuide($('#guidePauseBtn'));$('#guideEndBtn').onclick=()=>openGuide($('#guideEndBtn'));$('#guideCloseBtn').onclick=closeGuide;$('#guideTab').onchange=renderGuide;$('#guideSearch').oninput=renderGuide;$('#guideTab').innerHTML=Object.entries(GUIDE_TABS).map(([id,name])=>`<option value="${id}">${name}</option>`).join('');$('#guideTab').value='skills';
  $('#equipmentFile').onchange=async()=>{try{const file=$('#equipmentFile').files?.[0];if(!file)return;if(file.size>20000)throw new Error('工坊档案过大');$('#equipmentText').value=await file.text();$('#equipmentStatus').textContent='文件已打开；读取会替换当前工坊装备、碎片和首胜记录，请先导出当前档案。';}catch(error){$('#equipmentStatus').textContent=error.message;}};
  $('#campaignLevelSelect').innerHTML=CAMPAIGN_LEVELS.map(level=>`<option value="${level.id}">${level.name}</option>`).join('');$('#campaignLevelSelect').value='1';$('#campaignLevelSelect').onchange=renderCampaignChoice;renderCampaignChoice();
  $('#startBtn').onclick=()=>start();$('#restartBtn').onclick=()=>{if(isPractice()){const {stage,buildId,customSkills,customCatalyst,customFusion}=game.practiceConfig;startPractice(stage,buildId,game.campaignLevel,{customSkills,customCatalyst,customFusion});return;}const level=game.campaignLevel;runNo++;try{localStorage.setItem('neonRun',runNo);}catch{}start(level);};$('#nextLevelBtn').onclick=()=>{if(game.state==='ended'&&game.won&&game.campaignLevel<CAMPAIGN_LEVELS.length){const next=game.campaignLevel+1;$('#campaignLevelSelect').value=String(next);renderCampaignChoice();start(next);}};$('#pauseBtn').onclick=pause;$('#resumeBtn').onclick=pause;$('#lotteryContinue').onclick=continueLottery;
  $('#menuBtn').onclick=showMenu;$('#practiceExitBtn').onclick=showMenu;$('#practiceStartBtn').onclick=()=>startPractice();
  $('#quickContinueBtn').onclick=continueQuickSave;
  $('#practiceBossSelect').innerHTML=BOSS_MILESTONES.map(b=>`<option value="${b.stage}">${b.name}</option>`).join('');$('#practiceBossSelect').value='1';
  $('#newWeaponsBtn').onclick=()=>{if(game.state!=='menu')return;const level=Number($('#campaignLevelSelect').value);if(Number.isInteger(level)&&level>=1&&level<=unlockedCampaignLevel)startPractice(3,'cataclysm',level);};
  $('#practiceBuildSelect').innerHTML=PRACTICE_BUILDS.map(b=>`<option value="${b.id}">${b.name}</option>`).join('')+'<option value="custom">自选实验 · 自由搭配技能</option>';$('#practiceBuildSelect').value='hunter';
  $('#practiceRules').textContent=`${PRACTICE_BUILDS.length}套固定八槽或自选1–${MAX_SLOTS}种技能。首名首领二级、第二首领三级、最终首领突破，满血满盾。不刷普通敌潮、无局外装备，保留首领真实招式和召唤。不代表正式局平衡或通关成绩。`;
  $('#practiceCampaignSelect').innerHTML=CAMPAIGN_LEVELS.map(level=>`<option value="${level.id}">${level.name}</option>`).join('');$('#practiceCampaignSelect').value='1';$('#practiceCampaignSelect').onchange=renderPracticeInfo;
  $('#practiceBossSelect').onchange=renderPracticeInfo;$('#practiceBuildSelect').onchange=renderPracticeInfo;$('#practiceCatalystSelect').onchange=renderPracticeInfo;$('#practiceFusionSelect').onchange=renderPracticeInfo;renderPracticeInfo();
  $('#soundBtn').onclick=e=>{soundOn=!soundOn;e.currentTarget.textContent=soundOn?'♪':'×';e.currentTarget.setAttribute('aria-label',soundOn?'关闭音效':'开启音效');if(soundOn)beep(400,.08);};
  $('#catalystKeep').onclick=keepCatalyst;
  $('#rerollBtn').onclick=reroll;
  $('#historyStartBtn').onclick=()=>openHistory($('#historyStartBtn'));$('#historyEndBtn').onclick=()=>openHistory($('#historyEndBtn'));$('#historyCloseBtn').onclick=closeHistory;
  $('#historyClearBtn').onclick=requestHistoryClear;$('#historyCancelClearBtn').onclick=cancelHistoryClear;$('#historyConfirmClearBtn').onclick=confirmHistoryClear;
  for(const id of ['effectsStart','effectsPause'])$(`#${id}`).onchange=e=>setEffects(e.currentTarget.value);

  // Test hooks exist only on an explicitly requested local QA preview.
  if(qaMode){
    window.neonQA={getGame:()=>game,snapshot:()=>game.snapshot(),start,grantEnergy:v=>game.addEnergy(v),choose:index=>select(index),reroll,setEffects,effects:()=>({mode:effectsMode,reducedMotion}),chooseCatalyst:selectCatalyst,keepCatalyst,continueLottery,
      installSkill:(id,level)=>{while(game.level(id)<level)game.advanceSkill(id);updateHud();},spawnItem:type=>game.items.push({type,x:game.player.x,y:game.player.y,r:6,life:30,dead:false}),
      defeatBoss:()=>{if(game.boss)game.hurt(game.boss,game.boss.hp+1);flushEvents();syncView();},setBossDue:seconds=>{if(game.bossDue)game.bossDue.at=game.time+seconds;}};
  }
  function registerWebMCP(){
    const context=document.modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();
    const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
    register({name:'start_new_run',title:'开始新实验',description:'开始新一局，重置进度；目标是完成四十波、升至四十级并击败三名首领。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>{start();return{state:game.state,goal_upgrades:RUN_UPGRADES,goal_bosses:BOSS_MILESTONES.length};}});
    register({name:'select_mutation',title:'选择变异',description:'从当前升级选项中选择第 1、2 或第 3 项。',inputSchema:{type:'object',properties:{choice:{type:'integer',minimum:1,maximum:3}},required:['choice'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||!Number.isInteger(input.choice))throw new Error('choice 必须为整数');const result=game.choose(input.choice-1);flushEvents();syncView();updateHud();return{selected:result.name,skill_level:result.level,state:game.state,upgrades:game.upgrades};}});
    register({name:'reroll_mutations',title:'重抽升级选项',description:'仅常规升级时重抽当前技能候选，每局最多两次，不消耗经验或升级次数；没有不同候选时不扣次数。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>{game.reroll();flushEvents();view='';syncView();updateHud();return game.snapshot();}});
    register({name:'continue_lottery',title:'确认抽奖结果',description:'确认首战、第二战奖励后继续下一幕；确认第三名首领奖励后完成四十波实验。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>{if(game.state!=='lottery')throw new Error('当前没有抽奖');continueLottery();return{state:game.state,upgrades:game.upgrades};}});
    register({name:'choose_catalyst',title:'装配炼金催化',description:'在催化选择期间装配第 1、2 或第 3 项，替换当前唯一催化道具。',inputSchema:{type:'object',properties:{choice:{type:'integer',minimum:1,maximum:3}},required:['choice'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||!Number.isInteger(input.choice))throw new Error('choice 必须为整数');game.chooseCatalyst(input.choice-1);flushEvents();syncView();updateHud();return game.snapshot();}});
    register({name:'keep_catalyst',title:'保留当前催化',description:'跳过当前催化选择，不更换已装备道具。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>{game.keepCatalyst();flushEvents();syncView();updateHud();return game.snapshot();}});
    register({name:'read_run_state',title:'查看本局状态',description:'读取生命、四十波/四十级进度、八技能槽、重抽、催化、护盾、三名首领/预警状态及有效伤害战报。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>game.snapshot()});
    addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
  readHistory();updateHistoryNotices();renderEquipmentSummary();readQuickSave();setEffects(effectsMode);registerWebMCP();syncView();updateHud();requestAnimationFrame(loop);
})();
