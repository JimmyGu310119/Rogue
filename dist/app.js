(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const canvas = $('#game'), ctx = canvas.getContext('2d');
  const ui = {
    start: $('#startOverlay'), upgrade: $('#upgradeOverlay'), pause: $('#pauseOverlay'), end: $('#endOverlay'),
    hpBar: $('#hpBar'), hpText: $('#hpText'), xpBar: $('#xpBar'), xpText: $('#xpText'), level: $('#level'),
    kills: $('#kills'), combo: $('#combo'), timer: $('#timer'), grid: $('#upgradeGrid'), build: $('#buildList'),
    toast: $('#toast'), bossWrap: $('#bossWrap'), bossBar: $('#bossBar'), joystick: $('#joystick')
  };
  const TAU = Math.PI * 2;
  let W = 0, H = 0, DPR = 1, last = 0, raf = 0, state = 'menu', soundOn = true, audio = null;
  let keys = {}, pointer = null, shake = 0, flash = 0, runNo = +(localStorage.getItem('neonRun') || 0) + 1;
  let player, enemies, bullets, gems, particles, texts, rings, elapsed, spawnClock, kills, combo, comboClock, boss, offered;

  const upgrades = [
    {id:'rate',icon:'⟲',name:'催化循环',desc:'攻击间隔缩短 18%。让试剂更快抵达目标。',type:'效率',color:'#b9ff4a',apply:p=>p.fireRate*=.82},
    {id:'power',icon:'↑',name:'高压注入',desc:'弹丸伤害提升 35%，击退效果小幅增强。',type:'强度',color:'#ffb45c',apply:p=>{p.damage*=1.35;p.knock+=18}},
    {id:'multi',icon:'×2',name:'双螺旋',desc:'额外发射 1 枚弹丸，并略微扩大散射角。',type:'结构',color:'#35f4d2',apply:p=>p.projectiles++},
    {id:'pierce',icon:'↠',name:'穿透膜',desc:'弹丸可以额外穿透 1 个目标。',type:'结构',color:'#67a8ff',apply:p=>p.pierce++},
    {id:'orbit',icon:'◉',name:'磁悬浮核',desc:'增加一颗环绕试剂，持续腐蚀靠近的敌人。',type:'防御',color:'#a575ff',apply:p=>p.orbits++},
    {id:'move',icon:'»',name:'过载步频',desc:'移动速度提升 16%，拾取范围提升 20%。',type:'机动',color:'#4cff9b',apply:p=>{p.speed*=1.16;p.magnet*=1.2}},
    {id:'crit',icon:'◇',name:'不稳定晶格',desc:'暴击率提升 12%，暴击造成 2.4 倍伤害。',type:'爆发',color:'#ff6fa7',apply:p=>p.crit+=.12},
    {id:'size',icon:'◎',name:'膨胀反应',desc:'弹丸尺寸提升 32%，并增加少量伤害。',type:'范围',color:'#ffda54',apply:p=>{p.bulletSize*=1.32;p.damage*=1.1}},
    {id:'heal',icon:'+',name:'活性修复',desc:'立即恢复 35 生命，并将生命上限提高 10。',type:'生存',color:'#ff667a',apply:p=>{p.maxHp+=10;p.hp=Math.min(p.maxHp,p.hp+35)}},
    {id:'nova',icon:'✦',name:'裂变脉冲',desc:'每 5 秒释放一次环形冲击，清理贴身威胁。',type:'技能',color:'#d88cff',apply:p=>{p.nova++;p.novaClock=0}}
  ];

  function resize(){DPR=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=W*DPR;canvas.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0)}
  addEventListener('resize',resize);resize();
  const rnd=(a,b)=>a+Math.random()*(b-a), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

  function reset(){
    player={x:W/2,y:H/2,r:15,hp:100,maxHp:100,speed:235,damage:18,fireRate:.62,fireClock:0,projectiles:1,pierce:0,bulletSize:5,crit:.06,knock:25,magnet:80,orbits:0,nova:0,novaClock:0,invuln:0,level:1,xp:0,nextXp:8,build:{}};
    enemies=[];bullets=[];gems=[];particles=[];texts=[];rings=[];elapsed=0;spawnClock=.4;kills=0;combo=1;comboClock=0;boss=null;offered=[];shake=0;flash=0;
    ui.bossWrap.classList.add('hidden');updateHud();updateBuild();
  }

  function startGame(){reset();state='playing';ui.start.classList.remove('show');ui.end.classList.remove('show');ui.pause.classList.remove('show');ui.upgrade.classList.remove('show');last=performance.now();beep(180,.08,'sawtooth',.04);cancelAnimationFrame(raf);raf=requestAnimationFrame(loop)}
  function togglePause(force){if(state==='menu'||state==='ended'||state==='upgrade')return;const pause=force===undefined?state==='playing':force;state=pause?'paused':'playing';ui.pause.classList.toggle('show',pause);if(!pause){last=performance.now();raf=requestAnimationFrame(loop)}}

  function spawnEnemy(){
    let side=Math.floor(Math.random()*4),pad=45,x,y;
    if(side===0){x=rnd(-pad,W+pad);y=-pad}else if(side===1){x=W+pad;y=rnd(-pad,H+pad)}else if(side===2){x=rnd(-pad,W+pad);y=H+pad}else{x=-pad;y=rnd(-pad,H+pad)}
    const t=elapsed>260&&Math.random()<.14?'splitter':elapsed>110&&Math.random()<.24?'tank':elapsed>45&&Math.random()<.3?'swift':'blob';
    const data={blob:[11,42,54,'#b9ff4a'],swift:[8,25,96,'#35f4d2'],tank:[20,145,31,'#a575ff'],splitter:[15,72,44,'#ff7dac']}[t];
    const scale=1+elapsed/720;enemies.push({x,y,type:t,r:data[0],hp:data[1]*scale,maxHp:data[1]*scale,speed:data[2]*(1+elapsed/1200),color:data[3],hit:0,phase:rnd(0,TAU),dead:false});
  }
  function spawnBoss(){const angle=Math.random()*TAU;boss={x:player.x+Math.cos(angle)*Math.max(W,H)*.55,y:player.y+Math.sin(angle)*Math.max(W,H)*.55,r:48,hp:1800,maxHp:1800,speed:26,color:'#ff537a',hit:0,phase:0,dead:false,type:'boss'};enemies.push(boss);ui.bossWrap.classList.remove('hidden');toast('⚠ 异常聚合体已生成')}

  function shoot(){
    let target=null,best=Infinity;for(const e of enemies){if(e.dead)continue;const d=dist(player,e);if(d<best){best=d;target=e}}
    if(!target)return;const base=Math.atan2(target.y-player.y,target.x-player.x),count=player.projectiles,spread=Math.min(.5,.11*(count-1));
    for(let i=0;i<count;i++){const a=base+(count===1?0:(i/(count-1)-.5)*spread);bullets.push({x:player.x,y:player.y,vx:Math.cos(a)*520,vy:Math.sin(a)*520,r:player.bulletSize,life:1.45,hit:new Set(),pierce:player.pierce})}
    player.fireClock=player.fireRate;beep(280,.025,'square',.012);
  }
  function damageEnemy(e,amount,angle,crit=false){e.hp-=amount;e.hit=.08;e.x+=Math.cos(angle)*player.knock*.12;e.y+=Math.sin(angle)*player.knock*.12;texts.push({x:e.x,y:e.y-8,text:Math.round(amount)+(crit?'!':''),life:.55,color:crit?'#ffda54':'#eaffe2',big:crit});for(let i=0;i<(crit?8:3);i++)spark(e.x,e.y,e.color);if(e.hp<=0&&!e.dead)killEnemy(e)}
  function killEnemy(e){e.dead=true;kills++;combo=Math.min(9.9,combo+.08);comboClock=2.2;const n=e.type==='boss'?28:e.type==='tank'?3:1;for(let i=0;i<n;i++)gems.push({x:e.x+rnd(-10,10),y:e.y+rnd(-10,10),r:e.type==='boss'?6:4,value:e.type==='boss'?3:1,vx:rnd(-50,50),vy:rnd(-50,50)});for(let i=0;i<(e.type==='boss'?55:12);i++)spark(e.x,e.y,e.color,true);shake=Math.max(shake,e.type==='boss'?18:3);if(e.type==='splitter'){for(let j=0;j<2;j++)enemies.push({x:e.x+rnd(-10,10),y:e.y+rnd(-10,10),type:'swift',r:7,hp:18,maxHp:18,speed:115,color:'#ff8bb6',hit:0,phase:rnd(0,TAU),dead:false})}if(e===boss){boss=null;ui.bossWrap.classList.add('hidden');toast('聚合体崩解 · 大量反应能释放');beep(70,.4,'sawtooth',.07)}}
  function spark(x,y,color,wide=false){const a=Math.random()*TAU,s=rnd(wide?60:25,wide?240:110);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,r:rnd(1,wide?5:3),life:rnd(.25,.7),color})}
  function gainXp(v){player.xp+=v;while(player.xp>=player.nextXp){player.xp-=player.nextXp;player.level++;player.nextXp=Math.floor(player.nextXp*1.28+3);openUpgrade();break}updateHud()}
  function openUpgrade(){state='upgrade';offered=[...upgrades].sort(()=>Math.random()-.5).slice(0,3);ui.grid.innerHTML=offered.map((u,i)=>`<button class="upgrade-card" style="--card:${u.color}" data-i="${i}"><span class="num">0${i+1}</span><span class="upgrade-icon">${u.icon}</span><h3>${u.name}</h3><p>${u.desc}</p><span class="type">${u.type} // LV.${(player.build[u.id]||0)+1}</span></button>`).join('');ui.upgrade.classList.add('show');ui.grid.querySelectorAll('button').forEach(b=>b.onclick=()=>chooseUpgrade(+b.dataset.i));beep(520,.13,'sine',.04)}
  function chooseUpgrade(i){if(state!=='upgrade'||!offered[i])return;const u=offered[i];u.apply(player);player.build[u.id]=(player.build[u.id]||0)+1;ui.upgrade.classList.remove('show');state='playing';toast(`${u.icon} ${u.name} · LV.${player.build[u.id]}`);updateBuild();updateHud();last=performance.now();raf=requestAnimationFrame(loop)}
  function updateBuild(){const entries=Object.entries(player?.build||{});ui.build.innerHTML=entries.length?entries.map(([id,l])=>{const u=upgrades.find(x=>x.id===id);return `<div class="build-item"><i style="--item:${u.color}">${u.icon}</i><span>${u.name}</span><b>LV.${l}</b></div>`}).join(''):'<span class="empty-build">等待首次变异…</span>'}

  function update(dt){
    elapsed+=dt;if(elapsed>=480){finish(true);return}
    let dx=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0),dy=(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0);if(pointer){dx=pointer.dx;dy=pointer.dy}const len=Math.hypot(dx,dy)||1;player.x=clamp(player.x+dx/len*player.speed*dt,24,W-24);player.y=clamp(player.y+dy/len*player.speed*dt,70,H-40);player.invuln=Math.max(0,player.invuln-dt);
    player.fireClock-=dt;if(player.fireClock<=0)shoot();if(player.nova){player.novaClock-=dt;if(player.novaClock<=0){player.novaClock=Math.max(2.7,5-.25*player.nova);rings.push({x:player.x,y:player.y,r:10,max:180+player.nova*15,life:.55});for(const e of enemies)if(!e.dead&&dist(player,e)<190+player.nova*15)damageEnemy(e,22+player.damage*.7,Math.atan2(e.y-player.y,e.x-player.x));beep(120,.18,'sine',.05)}}
    spawnClock-=dt;const interval=Math.max(.13,.78-elapsed*.00125);if(spawnClock<=0){spawnEnemy();if(elapsed>180&&Math.random()<.12)spawnEnemy();spawnClock=interval}
    if(!boss&&elapsed>150&&elapsed<152)spawnBoss();if(!boss&&elapsed>330&&elapsed<332)spawnBoss();
    for(const b of bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;for(const e of enemies){if(e.dead||b.hit.has(e)||dist(b,e)>b.r+e.r)continue;b.hit.add(e);const crit=Math.random()<player.crit;damageEnemy(e,player.damage*(crit?2.4:1),Math.atan2(b.vy,b.vx),crit);if(b.hit.size>b.pierce)b.life=0;break}}
    bullets=bullets.filter(b=>b.life>0&&b.x>-60&&b.x<W+60&&b.y>-60&&b.y<H+60);
    for(const e of enemies){if(e.dead)continue;e.hit=Math.max(0,e.hit-dt);e.phase+=dt*2;const a=Math.atan2(player.y-e.y,player.x-e.x);e.x+=Math.cos(a)*e.speed*dt;e.y+=Math.sin(a)*e.speed*dt;if(dist(player,e)<player.r+e.r&&player.invuln<=0){const dmg=e.type==='boss'?28:e.type==='tank'?19:12;player.hp-=dmg;player.invuln=.72;shake=10;flash=.16;texts.push({x:player.x,y:player.y-24,text:`-${dmg}`,life:.8,color:'#ff537a',big:true});beep(55,.15,'sawtooth',.06);if(player.hp<=0){finish(false);return}}}
    for(let o=0;o<player.orbits;o++){const a=elapsed*(1.8+o*.06)+o/player.orbits*TAU,ox=player.x+Math.cos(a)*(48+player.orbits*4),oy=player.y+Math.sin(a)*(48+player.orbits*4);for(const e of enemies)if(!e.dead&&Math.hypot(e.x-ox,e.y-oy)<e.r+10&&(!e.orbitHit||elapsed-e.orbitHit>.28)){e.orbitHit=elapsed;damageEnemy(e,8+player.damage*.3,a)}}
    enemies=enemies.filter(e=>!e.dead);
    for(const g of gems){g.vx*=.92;g.vy*=.92;g.x+=g.vx*dt;g.y+=g.vy*dt;const d=dist(player,g);if(d<player.magnet){const s=460*(1-d/player.magnet+.25);g.x+=(player.x-g.x)/d*s*dt;g.y+=(player.y-g.y)/d*s*dt}if(d<player.r+g.r+4){g.dead=true;gainXp(g.value)}}gems=gems.filter(g=>!g.dead);
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.95;p.vy*=.95;p.life-=dt}particles=particles.filter(p=>p.life>0);for(const t of texts){t.y-=30*dt;t.life-=dt}texts=texts.filter(t=>t.life>0);for(const r of rings){r.r+=(r.max-r.r)*10*dt;r.life-=dt}rings=rings.filter(r=>r.life>0);
    comboClock-=dt;if(comboClock<=0)combo=Math.max(1,combo-dt*2);shake*=.86;flash=Math.max(0,flash-dt);updateHud();
  }

  function draw(){
    ctx.save();const sx=rnd(-shake,shake),sy=rnd(-shake,shake);ctx.translate(sx,sy);ctx.clearRect(-20,-20,W+40,H+40);drawGrid();
    for(const g of gems){ctx.save();ctx.translate(g.x,g.y);ctx.rotate(elapsed*2+g.x);ctx.fillStyle='#35f4d2';ctx.shadowColor='#35f4d2';ctx.shadowBlur=14;ctx.beginPath();ctx.moveTo(0,-g.r*1.5);ctx.lineTo(g.r,0);ctx.lineTo(0,g.r*1.5);ctx.lineTo(-g.r,0);ctx.closePath();ctx.fill();ctx.restore()}
    for(const r of rings){ctx.strokeStyle=`rgba(216,140,255,${r.life})`;ctx.lineWidth=5*r.life;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,TAU);ctx.stroke()}
    for(const b of bullets){ctx.fillStyle='#eaffbf';ctx.shadowColor='#b9ff4a';ctx.shadowBlur=16;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.fill();ctx.shadowBlur=0}
    for(const e of enemies)drawEnemy(e);
    drawPlayer();
    for(const p of particles){ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x-p.r/2,p.y-p.r/2,p.r,p.r)}ctx.globalAlpha=1;
    ctx.textAlign='center';for(const t of texts){ctx.globalAlpha=Math.min(1,t.life*3);ctx.fillStyle=t.color;ctx.font=`${t.big?'800 18px':'700 13px'} JetBrains Mono`;ctx.fillText(t.text,t.x,t.y)}ctx.globalAlpha=1;ctx.restore();if(flash){ctx.fillStyle=`rgba(255,83,122,${flash*.6})`;ctx.fillRect(0,0,W,H)}
  }
  function drawGrid(){const size=56,ox=(-elapsed*7)%size,oy=(-elapsed*4)%size;ctx.strokeStyle='rgba(121,204,174,.055)';ctx.lineWidth=1;ctx.beginPath();for(let x=ox;x<W;x+=size){ctx.moveTo(x,0);ctx.lineTo(x,H)}for(let y=oy;y<H;y+=size){ctx.moveTo(0,y);ctx.lineTo(W,y)}ctx.stroke();for(let i=0;i<18;i++){const x=(i*173+elapsed*4)%W,y=(i*97+40)%H;ctx.fillStyle='rgba(185,255,74,.09)';ctx.fillRect(x,y,2,2)}}
  function drawEnemy(e){ctx.save();ctx.translate(e.x,e.y);const pulse=1+Math.sin(e.phase)*.05;ctx.scale(pulse,pulse);ctx.fillStyle=e.hit?'#fff':e.color;ctx.shadowColor=e.color;ctx.shadowBlur=e.type==='boss'?30:12;ctx.beginPath();if(e.type==='tank'||e.type==='boss'){const sides=e.type==='boss'?8:6;for(let i=0;i<sides;i++){const a=i/sides*TAU,r=e.r*(i%2?.88:1.06);i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath()}else{ctx.arc(0,0,e.r,0,TAU)}ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#07110f';ctx.beginPath();ctx.arc(-e.r*.25,-e.r*.08,Math.max(2,e.r*.12),0,TAU);ctx.arc(e.r*.25,-e.r*.08,Math.max(2,e.r*.12),0,TAU);ctx.fill();if(e.hp<e.maxHp&&e.type!=='boss'){ctx.fillStyle='#0008';ctx.fillRect(-e.r,e.r+6,e.r*2,3);ctx.fillStyle=e.color;ctx.fillRect(-e.r,e.r+6,e.r*2*(e.hp/e.maxHp),3)}ctx.restore()}
  function drawPlayer(){ctx.save();ctx.translate(player.x,player.y);if(player.invuln&&Math.floor(player.invuln*14)%2){ctx.globalAlpha=.35}ctx.rotate(elapsed*.8);ctx.shadowColor='#b9ff4a';ctx.shadowBlur=26;ctx.fillStyle='#b9ff4a';ctx.beginPath();for(let i=0;i<6;i++){const a=i/6*TAU;ctx.lineTo(Math.cos(a)*player.r,Math.sin(a)*player.r)}ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#07110f';ctx.beginPath();ctx.arc(0,0,6,0,TAU);ctx.fill();ctx.strokeStyle='#35f4d2';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,player.r+6,0,Math.PI*1.5);ctx.stroke();ctx.restore();for(let o=0;o<player.orbits;o++){const a=elapsed*(1.8+o*.06)+o/player.orbits*TAU,x=player.x+Math.cos(a)*(48+player.orbits*4),y=player.y+Math.sin(a)*(48+player.orbits*4);ctx.fillStyle='#a575ff';ctx.shadowColor='#a575ff';ctx.shadowBlur=18;ctx.beginPath();ctx.arc(x,y,8,0,TAU);ctx.fill();ctx.shadowBlur=0}}

  function updateHud(){if(!player)return;ui.hpBar.style.width=`${Math.max(0,player.hp/player.maxHp*100)}%`;ui.hpText.textContent=`${Math.max(0,Math.ceil(player.hp))} / ${player.maxHp}`;ui.xpBar.style.width=`${player.xp/player.nextXp*100}%`;ui.xpText.textContent=`${player.xp} / ${player.nextXp}`;ui.level.textContent=player.level;ui.kills.textContent=kills;ui.combo.textContent=`×${combo.toFixed(1)}`;const remain=Math.max(0,480-elapsed);ui.timer.textContent=`${String(Math.floor(remain/60)).padStart(2,'0')}:${String(Math.floor(remain%60)).padStart(2,'0')}`;if(boss)ui.bossBar.style.width=`${Math.max(0,boss.hp/boss.maxHp*100)}%`}
  function finish(win){state='ended';ui.upgrade.classList.remove('show');ui.pause.classList.remove('show');ui.end.classList.add('show');$('#resultEyebrow').textContent=win?'EXPERIMENT COMPLETE':'REACTION COLLAPSED';$('#resultTitle').textContent=win?'净化完成':'实验失控';$('#resultText').textContent=win?'反应堆重新稳定。至少现在如此。':'配方已经记录。下一滴试剂会走得更远。';$('#finalKills').textContent=kills;$('#finalLevel').textContent=player.level;$('#finalTime').textContent=`${Math.floor(elapsed/60)}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`;beep(win?620:80,.5,win?'sine':'sawtooth',.07)}
  function loop(now){if(state!=='playing')return;const dt=Math.min(.033,(now-last)/1000||0);last=now;update(dt);draw();if(state==='playing')raf=requestAnimationFrame(loop)}
  function toast(msg){ui.toast.textContent=msg;ui.toast.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>ui.toast.classList.remove('show'),1600)}
  function beep(freq,dur,type='sine',vol=.03){if(!soundOn)return;try{audio ||= new (AudioContext||webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.7),audio.currentTime+dur);g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+dur);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+dur)}catch{}}

  addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyP'||e.code==='Escape')togglePause();if(state==='upgrade'&&['Digit1','Digit2','Digit3'].includes(e.code))chooseUpgrade(+e.code.slice(-1)-1)});addEventListener('keyup',e=>keys[e.code]=false);
  canvas.addEventListener('pointerdown',e=>{if(state!=='playing'||e.pointerType==='mouse')return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0};ui.joystick.style.display='block';ui.joystick.style.left=`${e.clientX-55}px`;ui.joystick.style.top=`${e.clientY-55}px`;canvas.setPointerCapture(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(!pointer||e.pointerId!==pointer.id)return;let dx=e.clientX-pointer.x,dy=e.clientY-pointer.y,d=Math.hypot(dx,dy),m=Math.min(38,d);pointer.dx=d?dx/d:0;pointer.dy=d?dy/d:0;ui.joystick.firstElementChild.style.transform=`translate(${pointer.dx*m}px,${pointer.dy*m}px)`});
  const endTouch=e=>{if(pointer&&e.pointerId===pointer.id){pointer=null;ui.joystick.style.display='none';ui.joystick.firstElementChild.style.transform=''}};canvas.addEventListener('pointerup',endTouch);canvas.addEventListener('pointercancel',endTouch);
  $('#startBtn').onclick=startGame;$('#restartBtn').onclick=()=>{runNo++;localStorage.setItem('neonRun',runNo);$('#runNo').textContent=String(runNo).padStart(2,'0');startGame()};$('#pauseBtn').onclick=()=>togglePause();$('#resumeBtn').onclick=()=>togglePause(false);$('#soundBtn').onclick=e=>{soundOn=!soundOn;e.currentTarget.textContent=soundOn?'♪':'×';e.currentTarget.setAttribute('aria-label',soundOn?'关闭音效':'开启音效');if(soundOn)beep(400,.08)};$('#runNo').textContent=String(runNo).padStart(2,'0');

  function registerWebMCP(){const mc=document.modelContext;if(!mc?.registerTool)return;const safe=fn=>{try{return fn()}catch(err){throw new Error(err?.message||'操作失败')}};mc.registerTool({name:'start_new_run',title:'开始新实验',description:'开始或重新开始一局霓虹炼金场，并重置本局进度。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>safe(()=>{startGame();return{status:'playing',goal_seconds:480}})});mc.registerTool({name:'select_mutation',title:'选择变异',description:'在升级选择出现时，选择第 1、2 或第 3 个变异。',inputSchema:{type:'object',properties:{choice:{type:'integer',minimum:1,maximum:3}},required:['choice'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:({choice})=>safe(()=>{if(state!=='upgrade')throw new Error('当前没有可选择的变异');const u=offered[choice-1];chooseUpgrade(choice-1);return{selected:u.name,level:player.build[u.id],status:'playing'}})});}
  registerWebMCP();reset();draw();
})();
