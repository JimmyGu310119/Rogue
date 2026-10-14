(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const MAX_SLOTS = 8;
  const RUN_UPGRADES = 40;
  const BOSS_MILESTONES = [
    {stage:1,upgrade:10,warning:10,name:'异常聚合体'},
    {stage:2,upgrade:20,warning:20,name:'裂变主宰'},
    {stage:3,upgrade:40,warning:30,name:'终末炼金核'}
  ];
  const CAMPAIGN_LEVELS = [
    {id:1,name:'第一关 · 稳态实验',short:'稳态实验',description:'熟悉四十波构筑与三位首领的进阶招式。',bosses:['异常聚合体','裂变主宰','终末炼金核']},
    {id:2,name:'第二关 · 赤潮熔炉',short:'赤潮熔炉',description:'四十波熔炉敌潮；灼热点名、迅捷敌群和强化首领持续施压。',bosses:['熔蚀聚合体','裂焰主宰','赤潮炼金核']},
    {id:3,name:'第三关 · 镜界回廊',short:'镜界回廊',description:'装甲与分裂敌群；镜界裂线交替切断走位，需要提前寻找空隙。',bosses:['镜棱聚合体','双生主宰','虚空棱心']},
    {id:4,name:'第四关 · 折跃枢纽',short:'折跃枢纽',description:'成对传送门连接战场两端；利用折跃甩开迅捷敌潮，冷却三秒。',bosses:['折跃守卫','追猎枢机','零界引擎']},
    {id:5,name:'第五关 · 哨兵禁区',short:'哨兵禁区',description:'远程哨兵保持距离，锁定射线后发射能量弹；横向走位穿过交叉火力。',bosses:['禁区监察者','弹幕裁决者','哨兵母核']},
    {id:6,name:'第六关 · 风暴天穹',short:'风暴天穹',description:'提前进入绿色风眼躲避雷暴并少量回血；穿过脉冲卫士的防御间隙，躲开首领电轨与点名雷笼。',bosses:['风暴巡守','雷轨裁决者','天穹风暴核']},
    {id:7,name:'第七关 · 孢子花园',short:'孢子花园',description:'孢芽体死亡留下提前预警的紫色毒区；炸弹可净化全屏孢子。保持移动，避开播种点与根须横扫。',bosses:['萌芽监护者','荆棘园丁','永生孢心']},
    {id:8,name:'第八关 · 冰封断层',short:'冰封断层',description:'冰裂带交替封路，冰脊兽蓄力释放霜爆；受伤会短暂寒滞。横移离开裂带，利用内外安全圈穿过冰封轮。',bosses:['霜脊守门者','裂冰裁决者','永冻地心']},
    {id:9,name:'第九关 · 虚空潮汐',short:'虚空潮汐',description:'交错裂隙分时切断战场，相位猎手预告后跃迁。拾取绿色稳定锚点，获得5秒普攻及引用伤害+35%、移速+15%的相位增幅。',bosses:['裂隙观测者','逐相猎王','虚空潮心']},
    {id:10,name:'第十关 · 天启熔核',short:'天启熔核',description:'熔核净化前进入绿色避难区；击碎供能柱解除首领减伤。迎战太阳雨、供能阵与最终天启熔核，完成十关主线。',bosses:['熔核监造者','天启执行官','天启熔核']}
  ];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const skill = (id, name, icon, color, type, breakthrough, descriptions) => ({ id, name, icon, color, type, breakthrough, descriptions });
  const SKILLS = [
    skill('rate','超能射击','⟲','#b9ff4a','射击','超频循环',[
      '攻击间隔缩短 18%。', '攻击间隔缩短 33%；每次攻击有 20% 概率射出两发。',
      '攻击间隔缩短 45%；30% 概率射出两发、20% 概率射出三发。',
      '攻击间隔缩短 68%；每次必定三发，每 5 秒发射一圈弹丸。']),
    skill('power','高压注入','↑','#ffb45c','射击','极压注入',[
      '弹丸伤害 +35%，击退 +18。','弹丸伤害 +70%，击退 +36，额外穿透一次。',
      '弹丸伤害 +105%，击退 +54，额外穿透一次。','弹丸伤害 +220%，击退 +100，额外穿透两次，并在屏幕边缘反弹。']),
    skill('lightning','电磁引导','ϟ','#67a8ff','雷电','电磁爆炸',[
      '每 6 秒轰击一处敌群，半径 55，伤害为 3 倍普攻，并短暂麻痹小怪。',
      '每 5 秒轰击两处，半径 70，伤害为 3.5 倍普攻，麻痹小怪 0.35 秒。',
      '每 4 秒轰击三处，半径 90，伤害为 4 倍普攻，麻痹小怪 0.45 秒。',
      '每 3 秒轰击四处，半径 120，伤害为 5.5 倍普攻，麻痹小怪 0.6 秒。']),
    skill('ghost','穿越火线','◌','#b2d8ff','无敌','神行无忌',[
      '每 10 秒进入无敌 2 秒；结束时若与敌人重叠，延长至脱离。',
      '每 10 秒进入无敌 3 秒；结束时延长至脱离敌人。',
      '每 10 秒进入无敌 4 秒；结束时延长至脱离敌人。',
      '每 8 秒进入无敌 4 秒，期间移速翻倍；结束时延长至脱离敌人。']),
    skill('orbit','磁悬浮核','◉','#a575ff','环绕','核环阵列',[
      '获得 1 颗环绕核；单次伤害为 8 + 弹丸伤害 × 30%。',
      '获得 2 颗环绕核，覆盖更广。','获得 3 颗环绕核。',
      '获得 6 颗环绕核，旋转加快 50%，单次伤害翻倍。']),
    skill('move','过载步频','»','#4cff9b','机动','疾速吸引',[
      '移速 +16%，能量拾取半径 +20%。','移速 +32%，拾取半径 +40%。',
      '移速 +48%，拾取半径 +60%。','移速 +80%，拾取半径 +100%。']),
    skill('crit','不稳定晶格','◇','#ff6fa7','暴击','临界晶格',[
      '总暴击率 18%，暴击伤害 2.4 倍。','总暴击率 30%，暴击伤害 2.4 倍。',
      '总暴击率 42%，暴击伤害 2.4 倍。','总暴击率 66%，暴击伤害 3.5 倍。']),
    skill('mine','地雷制造','⊕','#ffd65c','陷阱','黑洞之王',[
      '每 6 秒留下感应地雷，敌人接近便爆炸；半径 70，伤害为 4 倍普攻。',
      '每 5 秒放雷，爆炸半径 95，伤害为 5 倍普攻。',
      '每 4 秒放雷，爆炸半径 125，伤害为 6.5 倍普攻。',
      '每 3 秒留下黑洞地雷，爆炸半径 165，伤害为 9 倍普攻；吸引半径 170。']),
    skill('heal','活性修复','+','#ff667a','修复','完全再生',[
      '生命上限 110，立即恢复 35；每击碎 10 个敌人恢复 1 生命。',
      '生命上限 125，立即恢复 50；每击碎 10 个恢复 2 生命。',
      '生命上限 145，立即恢复 70；每击碎 10 个恢复 3 生命。',
      '生命上限 200，立即回满；每击碎 10 个恢复 5 生命。']),
    skill('aura','腐蚀领域','◎','#39d96a','领域','翠绿熔域',[
      '持续绿色领域，半径 125，中心每秒伤害 14；越近伤害越高。',
      '领域半径 150，中心每秒伤害 22；边缘保留 25% 伤害。',
      '领域半径 175，中心每秒伤害 34。','领域半径 230，中心每秒伤害 68。']),
    skill('frost','霜冻脉冲','❄','#87e8ff','控制','绝对零度',[
      '每 6 秒释放半径 160 的冰环，伤害为普攻 ×1；小怪减速 40% 持续 2.5 秒，Boss 减速 20%、不冻结。',
      '每 5 秒释放半径 185 的冰环，伤害为普攻 ×1.2；小怪减速 40% 持续 2.5 秒，Boss 减速 20%、不冻结。',
      '每 4 秒释放半径 215 的冰环，伤害为普攻 ×1.5；小怪减速 40% 持续 2.5 秒，Boss 减速 20%、不冻结。',
      '每 3 秒释放半径 250 的冰环，伤害为普攻 ×2；小怪减速 40% 持续 2.5 秒且冻结 0.7 秒，Boss 减速 20%、不冻结。']),
    skill('drone','追猎浮游炮','⌖','#58f3d6','追踪','蜂群协议',[
      '每 2.2 秒发射一枚追踪弹，伤害为普攻 ×0.8；优先屏内 Boss，默认不暴击，共振制导可暴击。',
      '每 1.8 秒发射两枚追踪弹，单发伤害为普攻 ×1；优先屏内 Boss，默认不暴击，共振制导可暴击。',
      '每 1.4 秒发射两枚追踪弹，单发伤害为普攻 ×1.2；优先屏内 Boss，默认不暴击，共振制导可暴击。',
      '每 1 秒发射三枚追踪弹，单发伤害为普攻 ×1.5；优先屏内 Boss，默认不暴击，共振制导可暴击。']),
    skill('well','引力奇点','●','#b895ff','聚怪','奇点坍缩',[
      '每 8 秒在屏内敌群生成半径 120 的奇点，持续 3 秒，每秒伤害为普攻 ×0.3、吸引 90 距离；Boss 仅受到四分之一拉力。',
      '每 7 秒生成半径 145 的奇点，持续 3.5 秒，每秒伤害为普攻 ×0.45、吸引 110 距离；Boss 仅受到四分之一拉力。',
      '每 6 秒生成半径 170 的奇点，持续 4 秒，每秒伤害为普攻 ×0.6、吸引 135 距离；Boss 仅受到四分之一拉力。',
      '每 5 秒生成半径 210 的奇点，持续 4 秒，每秒伤害为普攻 ×0.9、吸引 165 距离；Boss 仅受到四分之一拉力。']),
    skill('shield','相位护盾','⬡','#7df2ff','防护','棱镜庇护',[
      '获得一层满充护盾，抵挡一次伤害后短暂无敌；每 18 秒补一层。',
      '护盾上限一层，每 14 秒补一层；每层抵挡一次伤害后短暂无敌。',
      '护盾上限两层，每 12 秒补一层；每层抵挡一次伤害后短暂无敌。',
      '护盾上限三层，每 8 秒补一层；抵挡伤害同样获得短暂无敌。']),
    skill('nova','裂变回响','✹','#ff9c77','连爆','连锁裂变',[
      '小怪被非回响伤害击碎时爆开，半径 85，对周围敌人造成普攻 ×0.8 伤害；回响击杀不再连爆。',
      '回响半径 105，伤害普攻 ×1.1。',
      '回响半径 125，伤害普攻 ×1.5。',
      '回响半径 155，伤害普攻 ×2.2；每帧最多触发 12 次。与棱光裂束同时突破后可合体。']),
    skill('beam','棱光裂束','╱','#a8eaff','射线','镜界贯穿',[
      '每 5.5 秒向最近的屏内目标发射 450 长射线，半宽 14，对路径所有敌人造成普攻 ×2.6 伤害。',
      '每 4.5 秒发射 520 长、半宽 18 的射线，伤害普攻 ×3.5。',
      '每 3.5 秒发射 600 长、半宽 22 的射线，伤害普攻 ×4.6。',
      '每 2.5 秒发射 720 长、半宽 28 的射线，伤害普攻 ×6；与裂变回响同时突破后可合体。']),
    skill('arrow','穿心箭阵','➤','#ff795d','投射','赤焰哨箭',[
      '每 3 秒射出 2 根穿心箭，单箭伤害普攻 ×2.8，额外穿透 5 个目标。',
      '每 2.4 秒射出 3 根箭，单箭伤害普攻 ×3.5，额外穿透 5 个目标。',
      '每 1.8 秒射出 5 根箭，单箭伤害普攻 ×4.5，额外穿透 5 个目标。',
      '化为永久留场的赤焰哨箭，以 1300 速度穿梭敌群，伤害普攻 ×5；同一敌人每 0.25 秒最多受伤一次。']),
    skill('saw','回旋锯轮','✺','#f2df86','回旋','裁决锯阵',[
      '每 3.2 秒投出 2 枚回旋锯，单次伤害普攻 ×2.2，往返各命中一次；优先首领。',
      '每 2.6 秒投出 3 枚，单次伤害普攻 ×3；优先首领并分配不同目标。',
      '每 2 秒投出 4 枚，单次伤害普攻 ×4，往返持续切割。',
      '每 1.4 秒投出 6 枚，伤害普攻 ×5.5；回收引爆半径 105 的锯齿脉冲，伤害等于该枚锯轮。']),
    skill('flask','炼金投瓶','⚗','#f7ca73','投掷','熔金雨',[
      '每 3.8 秒投出 2 瓶，0.45秒后在锁定落点爆炸，半径90，伤害普攻×4.5；优先首领。',
      '每 3 秒投出 3 瓶，半径105，伤害普攻×6。',
      '每 2.4 秒投出 4 瓶，半径120，伤害普攻×7.5，优先分配不同目标。',
      '每 1.8 秒投出 5 瓶，半径145，伤害普攻×10；留下4.5秒金色酸池，半径90，每秒普攻×1.8伤害。']),
    skill('meteor','陨星轰炸','☄','#ffad78','天灾','终焉星雨',[
      '每4.5秒锁定2处落点，0.65秒后陨星坠落；半径80、伤害普攻×4，优先首领。',
      '每3.6秒轰炸3处，半径95、伤害普攻×5.5。',
      '每2.8秒轰炸4处，半径110、伤害普攻×7。',
      '每1.8秒轰炸7处，半径135、伤害普攻×10；0.25秒后余震半径160、追加该枚60%伤害。']),
    skill('ion','离子连锁','⌁','#a9c4ff','连锁','万钧天链',[
      '每3.6秒释放连锁离子束，最多4个不同目标；跳跃距离210，单次普攻×3，首跳优先首领。',
      '每3秒连锁最多6个目标，跳跃距离260，单次普攻×4。',
      '每2.4秒连锁最多9个目标，跳跃距离310，单次普攻×5。',
      '每1.6秒连锁最多14个目标，跳跃距离400，单次普攻×7；存活命中目标再受65%伤害回流。']),
    skill('turret','星环棱炮','✦','#fff1a8','炮台','歼星卫阵',[
      '2座随身星环炮，每2.1秒各发一束激光，伤害普攻×2.5，射程500，优先首领。',
      '3座星环炮，每1.7秒齐射，单束普攻×3.5，射程600。',
      '4座星环炮，每1.3秒齐射，单束普攻×5，射程700。',
      '6座星环炮，每0.9秒齐射，单束普攻×7.5，射程850；每第三轮变为宽20的贯穿齐射，额外伤害+25%。']),
    skill('rocket','焰尾火箭','➤','#ffae7b','投掷','天火集束',[
      '每3秒发射1枚高速追踪火箭，优先首领；爆炸半径70，伤害普攻×4，不伤玩家。',
      '每2.4秒发射2枚追踪火箭，爆炸半径85，伤害普攻×5。',
      '每1.8秒发射3枚追踪火箭，爆炸半径100，伤害普攻×6。',
      '每1.2秒发射5枚追踪火箭，爆炸半径130，伤害普攻×8；0.15秒后集束爆破，半径155、追加60%伤害。'])
  ];
  const FUSIONS=[
    {id:'blackholeKing',name:'真·黑洞之王',icon:'◉',color:'#d6a6ff',requires:['well','mine'],description:'合并突破的引力奇点与黑洞之王，占一槽。两者伤害各降低15%；黑洞地雷吸引半径230、牵引加强，奇点范围+10%、牵引+20%、持续+1秒。0.2秒内双按同一方向键或WASD，瞬移五个身位并无敌0.2秒，冷却2秒。'},
    {id:'prismEcho',name:'棱镜回响',icon:'✧',color:'#ffc2ee',requires:['nova','beam'],description:'合并突破的裂变回响与棱光裂束，占一槽。保留全部机制，两者伤害各降低15%，范围、射速不变。'},
    {id:'stormfield',name:'雷暴雷区',icon:'ϟ',color:'#aabaff',requires:['lightning','mine'],description:'合并突破的电磁引导与地雷制造，占一槽。保留全部机制和联动，两者伤害各降低15%。'},
    {id:'glacierWell',name:'冰川奇点',icon:'❄',color:'#a6eaff',requires:['frost','well'],description:'合并突破的霜冻脉冲与引力奇点，占一槽。保留减速、冻结、牵引和联动，两者伤害各降低15%。'},
    {id:'bladeWing',name:'刃羽风暴',icon:'✺',color:'#ffcf8a',requires:['saw','arrow'],description:'合并突破的裁决锯阵与赤焰哨箭，占一槽。保留往返切割、回收脉冲和永久哨箭，两者伤害各降低15%；数量、间隔、速度和命中频率不变。'},
    {id:'goldenDomain',name:'熔金腐域',icon:'⚗',color:'#d9e783',requires:['flask','aura'],description:'合并突破的熔金雨与翠绿熔域，占一槽。保留五瓶投掷、金色酸池与近强远弱的持续领域；爆炸、酸池及领域伤害各降低15%，范围和频率不变。'},
    {id:'starfire',name:'星火炼狱',icon:'☄',color:'#ffc586',requires:['meteor','flask'],description:'合并突破的终焉星雨与熔金雨，占一槽。保留七陨星与余震、五瓶爆炸与金色酸池；陨星/余震/投瓶/酸池伤害各降低15%，数量、范围和频率保留。'},
    {id:'ionCitadel',name:'天链星阵',icon:'✦',color:'#d6dfff',requires:['ion','turret'],description:'合并突破的万钧天链与歼星卫阵，占一槽。保留14目标连锁/回流、六星环炮及每第三轮贯穿齐射；两武器伤害各降低15%，其它参数保留。'},
    {id:'skyHunter',name:'天火追猎',icon:'➤',color:'#ffc6af',requires:['rocket','drone'],description:'合并突破的天火集束与猎杀编队，占一槽。保留五枚高速追踪火箭/集束爆破及四枚追猎弹；火箭、集束及浮游炮伤害各降低15%，数量和频率不变。'}
  ];
  for(const fusion of FUSIONS)SKILLS.push({...skill(fusion.id,fusion.name,fusion.icon,fusion.color,'合体',fusion.name,Array(4).fill(fusion.description)),fusion:true});
  const BY_ID = Object.fromEntries(SKILLS.map(s => [s.id, s]));
  const SYNERGIES = [
    {id:'conductive',name:'导电腐蚀',short:'落雷连锁',requires:['aura','lightning'],description:'领域内的落雷额外传导至附近两名敌人。',color:'#58eeaa'},
    {id:'resonance',name:'核爆共振',short:'环绕引爆地雷',requires:['mine','orbit'],description:'环绕核掠过已启动的地雷时，引发更大、更强的爆炸。',color:'#c7a2ff'},
    {id:'phase',name:'相位穿刺',short:'无敌穿怪伤害',requires:['ghost','move'],description:'无敌移动时穿过敌人，每次无敌可对同一敌人造成一次伤害。',color:'#a7e8ff'},
    {id:'rail',name:'贯穿齐射',short:'每六轮追加贯穿炮',requires:['rate','power'],description:'每六轮普攻追加一发巨型贯穿弹，伤害为普攻 ×2.5，额外穿透七次。',color:'#ffc573'},
    {id:'overload',name:'晶格过载',short:'连续暴击触发超频',requires:['rate','crit'],description:'两秒内四次普攻暴击命中触发 2.5 秒过载，攻击间隔再缩短 30%；冷却六秒。',color:'#ff85c6'},
    {id:'icebite',name:'冰蚀反应',short:'减速目标腐蚀增伤',requires:['frost','aura'],description:'霜冻减速仍在持续的敌人，受到的腐蚀领域伤害提高 30%。',color:'#81efce'},
    {id:'gravityStorm',name:'引力雷暴',short:'奇点内落雷增伤',requires:['well','lightning'],description:'任意存活奇点范围内的敌人，受到的雷电及导电连锁伤害提高 25%；多个奇点不叠加。',color:'#baadff'},
    {id:'seeker',name:'共振制导',short:'追踪弹获得暴击',requires:['drone','crit'],description:'追猎浮游炮命中时使用当前暴击率与暴击倍率；不会触发晶格过载。',color:'#ff98c9'},
    {id:'guardian',name:'守护共振',short:'有盾时环绕增伤',requires:['shield','orbit'],description:'当前至少拥有一层相位护盾时，环绕核伤害提高 20%；无盾时恢复原伤害。',color:'#8df1ff'}
  ];
  const DAMAGE_SOURCES = {bullet:'普攻',rail:'贯穿炮',lightning:'电磁引导',mine:'地雷制造',orbit:'磁悬浮核',aura:'腐蚀领域',phase:'相位穿刺',frost:'霜冻脉冲',drone:'追猎浮游炮',well:'引力奇点',nova:'裂变回响',beam:'棱光裂束',arrow:'穿心箭阵 / 赤焰哨箭',saw:'回旋锯轮',flask:'炼金投瓶 / 熔金雨',bomb:'炸弹'};
  const PLAYER_DAMAGE_NAMES = {contact:'敌人接触',blob:'普通体接触',swift:'迅捷体接触',tank:'装甲体接触',splitter:'分裂体接触',child:'分裂子怪接触',catalyst:'催化师接触',charger:'冲锋体接触',bossContact:'首领接触',bossCone:'首领扇形冲击',bossDash:'首领冲刺',bossShockwave:'终末环形冲击',bossCross:'首领十字裂隙',bossCorePulse:'首领核心脉冲',arenaEruption:'赤潮灼热点名',arenaMirror:'镜界裂线',sentinel:'哨兵接触',sentinelBolt:'哨兵能量弹',warden:'风暴卫士接触',arenaStorm:'天穹雷暴',bossStormLances:'首领雷轨齐射',bossStormCage:'首领点名雷笼',sporeling:'孢芽体接触',arenaSpores:'孢子毒区',bossVine:'首领根须横扫',elitePulse:'精英脉冲'};
  DAMAGE_SOURCES.meteor='陨星轰炸 / 终焉星雨';
  DAMAGE_SOURCES.ion='离子连锁 / 万钧天链';
  DAMAGE_SOURCES.turret='星环棱炮 / 歼星卫阵';
  DAMAGE_SOURCES.rocket='焰尾火箭 / 天火集束';
  Object.assign(PLAYER_DAMAGE_NAMES,{glacial:'冰脊兽接触',iceHazard:'冰封断层 / 霜爆',phaselet:'相位猎手接触',riftHazard:'虚空交错裂隙',pylon:'供能柱接触',reactorHazard:'熔核太阳雨 / 供能脉冲',reactorPurge:'天启熔核净化'});
  const CATALYSTS = [
    {id:'diffuser',name:'扩散试剂',icon:'◎',color:'#58eeaa',skill:'aura',benefit:'腐蚀领域半径 +40%',cost:'中心伤害 -10%',description:'扩大腐蚀覆盖，适合广域清场。'},
    {id:'conductor',name:'导电晶体',icon:'ϟ',color:'#82baff',skill:'lightning',benefit:'每轮额外轰击一个目标',cost:'雷电冷却 +20%',description:'用更广的轰击覆盖换取更长的蓄能。'},
    {id:'fuse',name:'延时引信',icon:'⊕',color:'#ffc977',skill:'mine',benefit:'地雷爆炸半径 +50%',cost:'启动时间增加至 0.9 秒',description:'先布置再引怪，制造大范围爆破。'},
    {id:'bearing',name:'共振轴承',icon:'◉',color:'#c7a2ff',skill:'orbit',benefit:'环绕距离 +30%',cost:'环绕伤害 -10%',description:'把环绕核送到更远处，也更容易扫过地雷。'},
    {id:'pressure',name:'增压核心',icon:'↑',color:'#ffb45c',skill:null,benefit:'普攻及引用普攻的技能伤害 +30%',cost:'普攻攻击间隔 +15%',description:'让每一击更重，尤其适合雷电与地雷。'},
    {id:'collector',name:'回收胶囊',icon:'↗',color:'#35f4d2',skill:null,benefit:'能量吸取半径 +65%',cost:'移速 -7%',description:'更轻松地收集战场上的反应能。'},
    {id:'kinetic',name:'轻质反应芯',icon:'»',color:'#b9ff4a',skill:null,benefit:'移速 +20%',cost:'生命上限 -15%',description:'用更灵活的走位换取生存空间。'},
    {id:'cryo',name:'低温凝胶',icon:'❄',color:'#87e8ff',skill:'frost',benefit:'霜冻脉冲半径 +25%',cost:'霜冻冷却 +15%',description:'用更长的蓄能换取更广的减速与冰蚀覆盖。'},
    {id:'guidance',name:'分导镜片',icon:'⌖',color:'#58f3d6',skill:'drone',benefit:'每轮额外发射一枚追踪弹',cost:'追踪弹单枚伤害 -20%',description:'增加追猎覆盖，命中时仍可享受共振制导暴击。'},
    {id:'singularity',name:'坍缩透镜',icon:'●',color:'#b895ff',skill:'well',benefit:'奇点拉力 +40%',cost:'奇点半径 -10%',description:'收紧奇点范围，以更强的引力聚拢敌群。'},
    {id:'prism',name:'棱镜电容',icon:'⬡',color:'#7df2ff',skill:'shield',benefit:'护盾容量增加一层',cost:'补盾间隔 +30%',description:'提高防护储量；装备不立即填充额外护盾。'},
    {id:'comet',name:'陨轨透镜',icon:'☄',color:'#ffc18c',skill:'meteor',benefit:'每轮陨星额外 +2 枚',cost:'陨星落地半径缩小15%，余震仍额外+25',description:'集中轰炸首领，更多陨星换取较小覆盖。'},
    {id:'relay',name:'共振线圈',icon:'⌁',color:'#b8caff',skill:'ion',benefit:'离子跳距 +40%，目标上限 +2',cost:'离子连锁及回流伤害降低10%',description:'把离散敌群串在一起，单次伤害略降。'},
    {id:'refractor',name:'折射匣',icon:'✦',color:'#fff1a8',skill:'turret',benefit:'额外 +2 座星环棱炮',cost:'星环齐射冷却增加15%',description:'更密集的炮台阵列，蓄能稍慢。'},
    {id:'warhead',name:'蜂群弹头',icon:'➤',color:'#ffc7a5',skill:'rocket',benefit:'每轮追踪火箭额外 +2 枚',cost:'主爆炸半径缩小15%，集束仍额外+25',description:'集中火力换取较小覆盖，不改变已发射火箭。'}
  ];
  const BY_CATALYST = Object.fromEntries(CATALYSTS.map(c=>[c.id,c]));
  const BASE_ENEMIES = {
    blob: {r:11,hp:42,speed:54,color:'#b9ff4a',energy:1},
    swift: {r:8,hp:25,speed:96,color:'#35f4d2',energy:1},
    tank: {r:20,hp:145,speed:31,color:'#a575ff',energy:3},
    splitter: {r:15,hp:72,speed:44,color:'#ff7dac',energy:1},
    child: {r:7,hp:18,speed:115,color:'#ff8bb6',energy:1},
    catalyst: {r:13,hp:65,speed:43,color:'#76e7ff',energy:2},
    charger: {r:12,hp:78,speed:54,color:'#ffb56b',energy:2},
    sentinel: {r:13,hp:60,speed:44,color:'#ff79d2',energy:2},
    warden: {r:16,hp:84,speed:39,color:'#80caff',energy:2},
    sporeling: {r:12,hp:50,speed:54,color:'#da8de8',energy:1},
    glacial: {r:17,hp:115,speed:42,color:'#a1e9ff',energy:2},
    phaselet: {r:14,hp:80,speed:60,color:'#c1a3ff',energy:2},
    pylon: {r:18,hp:130,speed:0,color:'#ffb07e',energy:3},
    mender: {r:12,hp:45,speed:40,color:'#ffb0c3',energy:2}
  };
  const ELITE_AFFIXES={frenzy:{name:'狂暴',color:'#ff9b72',hp:1.25,speed:1.35},crystal:{name:'凝晶',color:'#a8eaff',hp:1.85,speed:.8},pulse:{name:'脉冲',color:'#e9a1ff',hp:1.4,speed:1}};
  PLAYER_DAMAGE_NAMES.mender='再生体接触';
  const STAGES = [
    {interval:.75,hp:1,speed:1,cap:60,weights:[.7,.3,0,0,0,0]},
    {interval:.55,hp:1.25,speed:1.05,cap:70,weights:[.5,.3,.2,0,0,0]},
    {interval:.9,hp:1.25,speed:1.05,cap:25,weights:[.8,.2,0,0,0,0]},
    {interval:.32,hp:1.55,speed:1.1,cap:110,weights:[.33,.28,.22,.1,.07,0]},
    {interval:.18,hp:1.85,speed:1.15,cap:160,weights:[.23,.25,.2,.18,.07,.07]},
    {interval:.32,hp:2.1,speed:1.2,cap:100,weights:[.65,.2,0,0,.05,.1]},
    {interval:.16,hp:2.2,speed:1.22,cap:180,weights:[.22,.24,.21,.17,.07,.09]},
    {interval:.14,hp:2.55,speed:1.28,cap:195,weights:[.18,.24,.21,.18,.08,.11]},
    {interval:.26,hp:2.7,speed:1.3,cap:130,weights:[.5,.23,0,.1,.05,.12]}
  ];
  // Read-only presentation metadata; attack timing and hit geometry remain below.
  const BOSS_ATTACK_GUIDE={
    cone:{name:'扇形轰击',hint:'离开正前方扇形，或拉开距离',description:'首领锁定朝向后释放前方扇形攻击。横移越过扇形边缘，别沿着射角逃跑。'},
    dash:{name:'锁向冲锋',hint:'横向离开冲锋线，留意二段追击',description:'蓄力锁向后直线冲刺，本体接触仍危险。第二首领在进阶关卡或狂暴时可接第二段锁向冲锋，不要第一段结束就贴回去。'},
    summon:{name:'召唤增援',hint:'首领即将召小怪，保持走位',description:'召唤受场上小怪数量上限约束；清理增援有助于保留移动空间，炸弹能处理小怪但不能伤害首领。'},
    cross:{name:'十字裂隙',hint:'移入斜向空隙，离开两条交叉带',description:'以首领为中心释放沿锁定朝向的十字攻击，四个斜角空隙更安全；不要把十字中心当作安全内圈。'},
    shockwave:{name:'环形冲击',hint:'进入安全内圈或离开外环，勿贴本体',description:'仅内外边界之间的环带受伤，中心内圈与外侧不受该环击；首领本体接触伤害依然存在。'},
    corePulse:{name:'核心脉冲',hint:'远离首领中心圆区',description:'首领中心近距离圆形爆发，没有环形冲击那样的安全内圈。区分实心圆与环带预警。'},
    stormLances:{name:'雷轨齐射',hint:'移到平行雷轨之间，避开正前方',description:'第六关沿锁定方向生成多条平行雷轨，轨道之间有可躲避间隙；先观察轨道方向再横移。'},
    stormCage:{name:'点名雷笼',hint:'进入锁定点内圈或离开外环',description:'第六关锁定玩家当时的位置形成环形雷笼；内圈和外侧安全，不要一直停在危险环带。'},
    seedRain:{name:'孢子播种',hint:'离开紫色锁定落点，留意后续毒区',description:'第七关在锁定位置附近播种，随后形成有预警的毒区。不要在看见落点后原地绕小圈。'},
    vineSweep:{name:'根须横扫',hint:'横移离开长条根须区域',description:'第七关锁定长条攻击方向。垂直于长条移动更容易脱离，别沿着长条纵向逃跑。'},
    iceFan:{name:'冰扇霜爆',hint:'离开锁定冰圈，避免寒滞',description:'第八关在锁定位置一带铺开多个冰圈，危险区会再次预警后霜爆；护盾或无敌可以阻止伤害与寒滞。'},
    frostWheel:{name:'冰封轮',hint:'进入冰轮内圈或移到外侧',description:'第八关冰轮仅环带危险，圈内与外侧安全；本体接触伤害仍需单独躲避。'},
    riftCross:{name:'交错裂隙',hint:'两条裂隙先后启动，移入斜向空隙',description:'第九关两条正交危险带分时启动，不是同时结束。绿色稳定锚点是友方增益，不是危险圈；可拾取获得短暂输出与移速增幅。'},
    phaseJump:{name:'相位突袭',hint:'让开紫色落点，留意跃迁后的本体',description:'第九关提前标出锁定落点后首领瞬移。标记圆不是全圆爆炸伤害，但落地后的本体接触仍会受伤。'},
    reactorShield:{name:'供能阵',hint:'优先击碎供能柱，解除首领减伤',description:'第十关召唤供能柱保护首领；柱子可被击碎或炸弹清除，自行失效也会解除保护。留意柱子的局部脉冲预警。'},
    solarRain:{name:'太阳雨',hint:'离开中心与环绕落点，找圈间空隙',description:'第十关先锁定位置，再形成中心和环绕落点；落点仍有第二次预警。离开标记圈，不必把整个环绕区域都当作实心危险区。'},
    purge:{name:'熔核净化',hint:'倒计时结束前进入绿色避难区',description:'第十关出现三个绿色避难区，净化结束前进入任意一个可躲过全场净化；安全区不抵挡接触或其它招式。炸弹也可以清除净化威胁。'}
  };
  const PRACTICE_BUILDS = [
    {id:'hunter',name:'射击追猎',description:'贯穿齐射、晶格过载与共振制导；练习移动瞄准和持续对首领输出。',skills:['rate','power','crit','drone','move','heal','shield','frost'],catalyst:'guidance'},
    {id:'control',name:'领域控场',description:'冰蚀反应、导电腐蚀与引力雷暴；练习范围覆盖及聚怪落雷。',skills:['aura','frost','well','lightning','mine','orbit','move','heal'],catalyst:'cryo'},
    {id:'guardian',name:'环绕守护',description:'守护共振、核爆共振与相位穿刺；练习环绕距离和护盾时机。',skills:['shield','orbit','mine','ghost','move','heal','power','rate'],catalyst:'prism'},
    {id:'thrower',name:'投掷游击',description:'炼金投瓶、回旋锯轮与穿心箭阵；练习锁定落点、回收路径和高速走位。',skills:['flask','saw','arrow','power','move','heal','shield','frost'],catalyst:'collector'},
    {id:'cataclysm',name:'天灾爆发',description:'陨星轰炸、离子连锁与星环棱炮；体验新武器群体清场、持续追猎和突破爆发。',skills:['meteor','ion','turret','power','move','ghost','shield','heal'],catalyst:'pressure'},
    {id:'rocketeer',name:'焰尾爆破',description:'焰尾火箭、投瓶、陨星与回响组成连续爆破；体验飞行命中和突破集束。',skills:['rocket','flask','meteor','nova','power','move','shield','heal'],catalyst:'warhead'}
  ];
  const EQUIPMENT_SLOTS={core:'反应核心',shell:'装甲外壳',boots:'移动组件'};
  const EQUIPMENT=[
    {id:'ember',slot:'core',name:'余烬反应堆',icon:'⌬',description:'全技能引用的普攻伤害 +5% / 8% / 12%。',stat:'damage',values:[0,.05,.08,.12]},
    {id:'rhythm',slot:'core',name:'节拍振荡器',icon:'≋',description:'普攻频率 +4% / 7% / 10%，不改变技能冷却。',stat:'rate',values:[0,.04,.07,.1]},
    {id:'focus',slot:'core',name:'聚焦晶芯',icon:'✧',description:'暴击率 +2.5 / 4 / 6 个百分点。',stat:'crit',values:[0,.025,.04,.06]},
    {id:'hull',slot:'shell',name:'复合外壳',icon:'⬡',description:'生命上限 +10 / 16 / 24，开局满血。',stat:'health',values:[0,10,16,24]},
    {id:'plating',slot:'shell',name:'缓冲镀层',icon:'▣',description:'实际受到的伤害降低 4% / 7% / 10%。',stat:'reduction',values:[0,.04,.07,.1]},
    {id:'recovery',slot:'shell',name:'医药增效器',icon:'✚',description:'药丸额外回复 4 / 7 / 10 生命，不超过生命上限。',stat:'pill',values:[0,4,7,10]},
    {id:'swift',slot:'boots',name:'轻型推进器',icon:'»',description:'移动速度 +3% / 5% / 8%。',stat:'speed',values:[0,.03,.05,.08]},
    {id:'collector',slot:'boots',name:'远场拾取器',icon:'◎',description:'能量吸取半径 +15% / 25% / 40%。',stat:'magnet',values:[0,.15,.25,.4]},
    {id:'reserve',slot:'boots',name:'备用方案匣',icon:'↻',description:'每局常规升级重抽额外 +1 / 2 / 3 次。',stat:'rerolls',values:[0,1,2,3]},
    {id:'cataclysm',slot:'core',name:'天灾校准仪',icon:'☄',description:'陨星轰炸、离子连锁、星环棱炮及其合体冷却缩短6% / 10% / 15%，不影响普攻。',stat:'cataclysm',values:[0,.06,.1,.15],since:34},
    {id:'slayer',slot:'core',name:'猎王徽记',icon:'♜',description:'所有技能对首领的有效伤害提高8% / 12% / 18%，不提高对小怪伤害。',stat:'bossDamage',values:[0,.08,.12,.18],since:34},
    {id:'rebirth',slot:'shell',name:'复苏胚核',icon:'❈',description:'每局一次抵消致命结局，恢复生命上限30% / 45% / 60%，获得1.5秒保护；盾/无敌优先，不重复补充次数。',stat:'revive',values:[0,.3,.45,.6],since:34}
  ];
  const BY_EQUIPMENT=Object.fromEntries(EQUIPMENT.map(e=>[e.id,e])),EQUIPMENT_COSTS=[6,10,16];
  function createEquipmentProfile(){return {schema:2,shards:0,levels:Object.fromEntries(EQUIPMENT.map(e=>[e.id,0])),equipped:[],claimed:[]};}
  function validateEquipmentLoadout(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length>EQUIPMENT.length)throw new Error('装备配置异常');
    const legacy=Object.keys(raw).length===3&&Object.keys(EQUIPMENT_SLOTS).every(slot=>Object.hasOwn(raw,slot)),loadout={};
    for(const [key,item]of Object.entries(raw)){
      if(legacy&&item===null)continue;
      if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).length!==2||typeof item.id!=='string'||!Object.hasOwn(BY_EQUIPMENT,item.id)||(legacy?BY_EQUIPMENT[item.id].slot!==key:item.id!==key)||!Number.isInteger(item.level)||item.level<1||item.level>3)throw new Error('装备身份或等级异常');
      loadout[item.id]={id:item.id,level:item.level};
    }return loadout;
  }
  function validateEquipmentProfile(raw){
    const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
    if(!object(raw)||Object.keys(raw).length!==5||![1,2].includes(raw.schema)||!Number.isInteger(raw.shards)||raw.shards<0||raw.shards>1000000||!object(raw.levels)||Object.keys(raw.levels).some(id=>!Object.hasOwn(BY_EQUIPMENT,id))||!Array.isArray(raw.claimed)||raw.claimed.length>CAMPAIGN_LEVELS.length*3)throw new Error('工坊档案格式异常');
    const profile=createEquipmentProfile();profile.shards=raw.shards;
    for(const e of EQUIPMENT){const level=Object.hasOwn(raw.levels,e.id)?raw.levels[e.id]:e.since===34?0:undefined;if(!Number.isInteger(level)||level<0||level>3)throw new Error('工坊装备等级异常');profile.levels[e.id]=level;}
    if(raw.schema===1){
      if(!object(raw.equipped)||Object.keys(raw.equipped).length!==3)throw new Error('旧工坊装配异常');
      for(const slot of Object.keys(EQUIPMENT_SLOTS)){const id=raw.equipped[slot];if(id===null)continue;if(typeof id!=='string'||!Object.hasOwn(BY_EQUIPMENT,id)||BY_EQUIPMENT[id].slot!==slot||!profile.levels[id])throw new Error('旧工坊装配异常');profile.equipped.push(id);}
    }else{
      if(!Array.isArray(raw.equipped)||raw.equipped.length>EQUIPMENT.length||new Set(raw.equipped).size!==raw.equipped.length||raw.equipped.some(id=>typeof id!=='string'||!Object.hasOwn(BY_EQUIPMENT,id)||!profile.levels[id]))throw new Error('工坊装配异常');
      profile.equipped=[...raw.equipped];
    }
    if(new Set(raw.claimed).size!==raw.claimed.length||raw.claimed.some(key=>typeof key!=='string'||!/^\d+:[123]$/.test(key)||!CAMPAIGN_LEVELS.some(level=>level.id===Number(key.split(':')[0]))))throw new Error('首领首胜记录异常');
    profile.claimed=[...raw.claimed];return profile;
  }
  function equipmentLoadout(raw){const profile=validateEquipmentProfile(raw);return Object.fromEntries(profile.equipped.map(id=>[id,{id,level:profile.levels[id]}]));}
  function equipmentBonuses(loadout){const result={damage:0,rate:0,crit:0,health:0,reduction:0,pill:0,speed:0,magnet:0,rerolls:0,cataclysm:0,bossDamage:0,revive:0};for(const item of Object.values(validateEquipmentLoadout(loadout)))if(item){const gear=BY_EQUIPMENT[item.id];result[gear.stat]+=gear.values[item.level];}return result;}
  function upgradeEquipment(raw,id){const profile=validateEquipmentProfile(raw);if(!Object.hasOwn(BY_EQUIPMENT,id))throw new Error('未知工坊装备');const level=profile.levels[id];if(level>=3)throw new Error('已达到装备最高等级');const cost=EQUIPMENT_COSTS[level];if(profile.shards<cost)throw new Error('研究碎片不足');profile.shards-=cost;profile.levels[id]++;return profile;}
  function equipEquipment(raw,id,enabled=true){const profile=validateEquipmentProfile(raw);if(typeof id!=='string'||!Object.hasOwn(BY_EQUIPMENT,id)||!profile.levels[id]||typeof enabled!=='boolean')throw new Error('此装备未解锁或装配参数无效');profile.equipped=profile.equipped.filter(item=>item!==id);if(enabled)profile.equipped.push(id);return profile;}
  function claimEquipmentRewards(raw,game){
    const profile=validateEquipmentProfile(raw);let gained=0;
    if(game.mode!=='normal'||game.practice||game.formal===false||!CAMPAIGN_LEVELS.some(level=>level.id===game.campaignLevel))return {profile,gained};
    for(const boss of BOSS_MILESTONES){const key=`${game.campaignLevel}:${boss.stage}`;if(profile.claimed.includes(key)||game.upgrades<boss.upgrade||!game.bossesDefeated.includes(boss.stage)||!game.stats.bosses.some(row=>row.stage===boss.stage&&row.killed&&row.maxHp>0))continue;const reward=[0,10,15,25][boss.stage];profile.claimed.push(key);profile.shards=Math.min(1000000,profile.shards+reward);gained+=reward;}
    return {profile,gained};
  }
  class Game {
    constructor({width=960,height=640,random=Math.random,campaignLevel=1,equipment={}}={}) {
      if(!Number.isInteger(campaignLevel)||!CAMPAIGN_LEVELS.some(level=>level.id===campaignLevel))throw new Error('未知主线关卡');
      this.width=width;this.height=height;this.random=random;
      this.mode='normal';this.practice=false;this.practiceConfig=null;this.campaignLevel=campaignLevel;
      this.equipment=validateEquipmentLoadout(equipment);
      this.flasks=[];this.acidPools=[];this.sporeZones=[];this.hazards=[];this.meteors=[];this.rockets=[];
      this.arenaClock=8;this.arenaIntent=null;this.arenaIndex=0;this.portalCooldown=0;this.portalBlocked=false;
      this.portals=campaignLevel===4?[{x:width*.2,y:height*.35,r:23},{x:width*.8,y:height*.7,r:23}]:[];
      this.state='playing';this.time=0;this.upgrades=0;this.kills=0;this.combo=1;this.comboTimer=0;
      this.enemies=[];this.bullets=[];this.gems=[];this.items=[];this.mines=[];this.gravityWells=[];this.effects=[];this.events=[];this.enemyShots=[];this.whistle=null;this.saws=[];
      this.seq=0;this.spawnClock=.4;this.auraClock=.1;this.options=[];this.lottery=null;this.lotteryHistory=[];
      this.catalyst=null;this.catalystOptions=[];this.catalystMilestones=[];
      this.firstBossSpawned=false;this.firstBossDefeated=false;this.finalBossSpawned=false;
      this.bossesSpawned=[];this.bossesDefeated=[];
      this.boss=null;this.bossDue=null;this.won=false;this.revision=0;
      this.effectSeq=0;this.rerollsRemaining=2+equipmentBonuses(this.equipment).rerolls;this.novaBursts=0;
      this.stats={damage:Object.fromEntries(Object.keys(DAMAGE_SOURCES).map(id=>[id,{damage:0,bossDamage:0}])),damageTaken:0,blockedDamage:0,bosses:[],recent:[],death:null};
      this.player={x:width/2,y:height/2,r:15,hp:100,maxHp:100,xp:0,build:{},attackBonus:0,invuln:0,
        fireClock:0,ringClock:5,lightningClock:6,mineClock:6,ghostClock:10,ghostRemaining:0,ghostActive:false,ghostEpoch:0,healKills:0,
        frostClock:1.5,droneClock:1.5,wellClock:1.5,beamClock:1.5,arrowClock:1.2,sawClock:1.2,flaskClock:1.2,meteorClock:.9,ionClock:1,turretClock:1.1,turretVolley:0,fluxRemaining:0,chillRemaining:0,blinkClock:0,shieldClock:0,shieldCharges:0,railRounds:0,overloadRemaining:0,overloadCooldown:0,criticalHits:[]};
      this.player.revivalCharges=equipmentBonuses(this.equipment).revive>0?1:0;this.player.revivalUsed=0;
      this.player.rocketClock=1;
      this.recompute();
      this.player.hp=this.player.maxHp;
    }
    randomBetween(a,b){return a+this.random()*(b-a);}
    emit(type,data={}){this.events.push({type,...data});}
    takeEvents(){const e=this.events;this.events=[];return e;}
    get nextXp(){return 8+2*this.upgrades;}
    bossMilestone(stage){const milestone=BOSS_MILESTONES.find(m=>m.stage===stage);return milestone?{...milestone,name:CAMPAIGN_LEVELS[this.campaignLevel-1].bosses[stage-1]}:null;}
    get wave(){
      if(this.mode==='practice')return BOSS_MILESTONES[this.practiceConfig.stage-1].upgrade;
      const milestone=BOSS_MILESTONES.find(m=>this.upgrades===m.upgrade);
      if(milestone&&(!this.isBossDefeated(milestone.stage)||(this.state==='lottery'&&this.lottery?.bossStage===milestone.stage)))return milestone.upgrade;
      return Math.min(RUN_UPGRADES,this.upgrades+1);
    }
    get owned(){return Object.keys(this.player.build);}
    get synergies(){return SYNERGIES.filter(s=>s.requires.every(id=>this.level(id)>0));}
    hasSynergy(id){return this.synergies.some(s=>s.id===id);}
    get equippedCatalyst(){return BY_CATALYST[this.catalyst]||null;}
    isBossSpawned(stage){return this.bossesSpawned.includes(stage)||(stage===1&&this.firstBossSpawned)||(stage===3&&this.finalBossSpawned);}
    isBossDefeated(stage){return this.bossesDefeated.includes(stage)||(stage===1&&this.firstBossDefeated);}
    get upgradeLocked(){return this.mode==='practice'||this.upgrades>=RUN_UPGRADES||BOSS_MILESTONES.some(m=>this.upgrades>=m.upgrade&&!this.isBossDefeated(m.stage));}
    level(id){return this.player.build[id]|| (FUSIONS.some(f=>this.player.build[f.id]&&f.requires.includes(id))?4:0);}
    canFuse(id){const f=FUSIONS.find(f=>f.id===id);return !!f&&!this.player.build[id]&&f.requires.every(component=>this.player.build[component]===4);}
    stage(){
      if(this.mode==='practice')return STAGES[{1:2,2:5,3:8}[this.practiceConfig.stage]];
      if(this.boss){const base=STAGES[{1:2,2:5,3:8}[this.boss.bossStage]];return this.campaignLevel===2?{...base,hp:base.hp*1.12,speed:base.speed*1.07}:base;}
      const index=this.upgrades<5?0:this.upgrades<10||!this.isBossDefeated(1)?1:this.upgrades<15?3:this.upgrades<20||!this.isBossDefeated(2)?4:this.upgrades<25?6:7;
      const base=STAGES[index];if(this.campaignLevel===1)return base;
      if(this.campaignLevel===10)return {...base,hp:base.hp*1.32,speed:base.speed*1.02,interval:base.interval*.96,weights:index===0?[.65,.2,.15,0,0,0]:[.25,.2,.2,.15,.1,.1]};
      if(this.campaignLevel===9)return {...base,hp:base.hp*1.28,speed:base.speed*1.04,interval:base.interval*.96,weights:index===0?[.65,.2,.15,0,0,0]:[.25,.25,.15,.15,.1,.1]};
      if(this.campaignLevel===8)return {...base,hp:base.hp*1.24,speed:base.speed*.96,interval:base.interval*.98,weights:index===0?[.65,.2,.15,0,0,0]:[.25,.15,.25,.15,.1,.1]};
      if(this.campaignLevel===7)return {...base,hp:base.hp*1.2,speed:base.speed,interval:base.interval*.98,weights:index===0?[.65,.2,.15,0,0,0]:[.3,.2,.1,.15,.1,.15]};
      if(this.campaignLevel===6)return {...base,hp:base.hp*1.18,speed:base.speed*1.03,interval:base.interval*.98,weights:index===0?[.65,.25,.1,0,0,0]:[.25,.2,.15,.15,.1,.15]};
      if(this.campaignLevel===5)return {...base,hp:base.hp*1.2,speed:base.speed*1.02,interval:base.interval*.98,weights:index===0?[.65,.2,.15,0,0,0]:[.25,.2,.2,.15,.1,.1]};
      if(this.campaignLevel===4)return {...base,hp:base.hp*1.18,speed:base.speed*1.1,interval:base.interval*.9,weights:index===0?[.5,.35,.15,0,0,0]:[.2,.25,.15,.15,.05,.2]};
      if(this.campaignLevel===3)return {...base,hp:base.hp*1.25,speed:base.speed*.97,weights:index===0?[.5,.2,.3,0,0,0]:[.15,.1,.3,.2,.15,.1]};
      const weights=[...base.weights];if(index===0){weights[0]=.5;weights[1]=.35;weights[2]=.15;}else if(index>=3){weights[0]=Math.max(0,weights[0]-.07);weights[1]+=.03;weights[5]+=.04;}
      return {...base,interval:base.interval*.92,hp:base.hp*1.12,speed:base.speed*1.07,weights};
    }
    recompute(){
      const p=this.player,l=id=>this.level(id);
      p.fireRate=.62*[1,.82,.67,.55,.32][l('rate')];
      p.damage=18*(1+p.attackBonus)*[1,1.35,1.7,2.05,3.2][l('power')];
      p.knock=25+[0,18,36,54,100][l('power')];p.pierce=[0,0,1,1,2][l('power')];p.bounce=l('power')===4;
      p.speed=235*[1,1.16,1.32,1.48,1.8][l('move')];p.magnet=80*[1,1.2,1.4,1.6,2][l('move')];
      p.crit=[.06,.18,.3,.42,.66][l('crit')];p.critDamage=l('crit')===4?3.5:2.4;
      p.orbits=[0,1,2,3,6][l('orbit')];p.orbitSpeed=l('orbit')===4?2.7:1.8;
      p.orbitRadius=48+p.orbits*4;p.orbitDamageMultiplier=1;
      p.auraRadius=[0,125,150,175,230][l('aura')];p.auraDamage=[0,14,22,34,68][l('aura')];
      p.lightningInterval=[0,6,5,4,3][l('lightning')];p.lightningTargets=[0,1,2,3,4][l('lightning')];
      p.lightningRadius=[0,55,70,90,120][l('lightning')];p.lightningDamageMultiplier=[0,3,3.5,4,5.5][l('lightning')];
      p.lightningStun=[0,.25,.35,.45,.6][l('lightning')];
      p.mineInterval=[0,6,5,4,3][l('mine')];p.mineBlast=[0,70,95,125,165][l('mine')];
      p.mineDamageMultiplier=[0,4,5,6.5,9][l('mine')];p.mineTrigger=[0,28,32,36,42][l('mine')];p.mineArmTime=.3;
      p.frostInterval=[0,6,5,4,3][l('frost')];p.frostRadius=[0,160,185,215,250][l('frost')];p.frostDamageMultiplier=[0,1,1.2,1.5,2][l('frost')];
      p.droneInterval=[0,2.2,1.8,1.4,1][l('drone')];p.droneShots=[0,1,2,2,3][l('drone')];p.droneDamageMultiplier=[0,.8,1,1.2,1.5][l('drone')];
      p.wellInterval=[0,8,7,6,5][l('well')];p.wellRadius=[0,120,145,170,210][l('well')];p.wellDuration=[0,3,3.5,4,4][l('well')];
      p.wellDamageMultiplier=[0,.3,.45,.6,.9][l('well')];p.wellPull=[0,90,110,135,165][l('well')];
      p.novaRadius=[0,85,105,125,155][l('nova')];p.novaMultiplier=[0,.8,1.1,1.5,2.2][l('nova')];
      p.beamInterval=[0,5.5,4.5,3.5,2.5][l('beam')];p.beamRange=[0,450,520,600,720][l('beam')];p.beamHalfWidth=[0,14,18,22,28][l('beam')];p.beamMultiplier=[0,2.6,3.5,4.6,6][l('beam')];
      p.arrowInterval=[0,3,2.4,1.8,0][l('arrow')];p.arrowShots=[0,2,3,5,0][l('arrow')];p.arrowDamageMultiplier=[0,2.8,3.5,4.5,5][l('arrow')];
      p.sawInterval=[0,3.2,2.6,2,1.4][l('saw')];p.sawShots=[0,2,3,4,6][l('saw')];p.sawMultiplier=[0,2.2,3,4,5.5][l('saw')];
      p.flaskInterval=[0,3.8,3,2.4,1.8][l('flask')];p.flaskShots=[0,2,3,4,5][l('flask')];p.flaskRadius=[0,90,105,120,145][l('flask')];p.flaskMultiplier=[0,4.5,6,7.5,10][l('flask')];
      p.meteorInterval=[0,4.5,3.6,2.8,1.8][l('meteor')];p.meteorShots=[0,2,3,4,7][l('meteor')];p.meteorRadius=[0,80,95,110,135][l('meteor')];p.meteorMultiplier=[0,4,5.5,7,10][l('meteor')];
      p.ionInterval=[0,3.6,3,2.4,1.6][l('ion')];p.ionTargets=[0,4,6,9,14][l('ion')];p.ionRange=[0,210,260,310,400][l('ion')];p.ionMultiplier=[0,3,4,5,7][l('ion')];
      p.turretInterval=[0,2.1,1.7,1.3,.9][l('turret')];p.turretCount=[0,2,3,4,6][l('turret')];p.turretRange=[0,500,600,700,850][l('turret')];p.turretMultiplier=[0,2.5,3.5,5,7.5][l('turret')];
      p.rocketInterval=[0,3,2.4,1.8,1.2][l('rocket')];p.rocketShots=[0,1,2,3,5][l('rocket')];p.rocketRadius=[0,70,85,100,130][l('rocket')];p.rocketMultiplier=[0,4,5,6,8][l('rocket')];
      p.shieldMaxCharges=[0,1,1,2,3][l('shield')];p.shieldInterval=[0,18,14,12,8][l('shield')];
      p.maxHp=[100,110,125,145,200][l('heal')];
      if(this.catalyst==='diffuser'){p.auraRadius*=1.4;p.auraDamage*=.9;}
      if(this.catalyst==='conductor'&&l('lightning')){p.lightningTargets++;p.lightningInterval*=1.2;}
      if(this.catalyst==='fuse'){p.mineBlast*=1.5;p.mineArmTime=.9;}
      if(this.catalyst==='bearing'){p.orbitRadius*=1.3;p.orbitDamageMultiplier=.9;}
      if(this.catalyst==='pressure'){p.damage*=1.3;p.fireRate*=1.15;}
      if(this.catalyst==='collector'){p.magnet*=1.65;p.speed*=.93;}
      if(this.catalyst==='kinetic'){p.speed*=1.2;p.maxHp=Math.round(p.maxHp*.85);}
      if(this.catalyst==='cryo'&&l('frost')){p.frostRadius*=1.25;p.frostInterval*=1.15;}
      if(this.catalyst==='guidance'&&l('drone')){p.droneShots++;p.droneDamageMultiplier*=.8;}
      if(this.catalyst==='singularity'&&l('well')){p.wellPull*=1.4;p.wellRadius*=.9;}
      if(this.catalyst==='prism'&&l('shield')){p.shieldMaxCharges++;p.shieldInterval*=1.3;}
      if(this.catalyst==='comet'&&l('meteor')){p.meteorShots+=2;p.meteorRadius*=.85;}
      if(this.catalyst==='relay'&&l('ion')){p.ionRange*=1.4;p.ionTargets+=2;p.ionMultiplier*=.9;}
      if(this.catalyst==='refractor'&&l('turret')){p.turretCount+=2;p.turretInterval*=1.15;}
      if(this.catalyst==='warhead'&&l('rocket')){p.rocketShots+=2;p.rocketRadius*=.85;}
      if(l('prismEcho')){p.novaMultiplier*=.85;p.beamMultiplier*=.85;}
      if(l('stormfield')){p.lightningDamageMultiplier*=.85;p.mineDamageMultiplier*=.85;}
      if(l('glacierWell')){p.frostDamageMultiplier*=.85;p.wellDamageMultiplier*=.85;}
      if(l('blackholeKing')){p.mineDamageMultiplier*=.85;p.wellDamageMultiplier*=.85;p.wellRadius*=1.1;p.wellPull*=1.2;p.wellDuration+=1;}
      if(l('bladeWing')){p.sawMultiplier*=.85;p.arrowDamageMultiplier*=.85;}
      if(l('goldenDomain')){p.flaskMultiplier*=.85;p.auraDamage*=.85;}
      if(l('starfire')){p.meteorMultiplier*=.85;p.flaskMultiplier*=.85;}
      if(l('ionCitadel')){p.ionMultiplier*=.85;p.turretMultiplier*=.85;}
      if(l('skyHunter')){p.rocketMultiplier*=.85;p.droneDamageMultiplier*=.85;}
      const gear=equipmentBonuses(this.equipment);p.damage*=1+gear.damage;p.fireRate/=1+gear.rate;p.crit=Math.min(1,p.crit+gear.crit);p.maxHp+=gear.health;p.speed*=1+gear.speed;p.magnet*=1+gear.magnet;p.damageReduction=gear.reduction;p.pillBonus=gear.pill;
      p.bossDamageBonus=gear.bossDamage;p.revivalHeal=gear.revive;for(const name of ['meteor','ion','turret'])p[name+'Interval']*=1-gear.cataclysm;
      if(p.fluxRemaining>0){p.damage*=1.35;p.speed*=1.15;}
      p.hp=Math.min(p.hp,p.maxHp);
      p.shieldCharges=clamp(p.shieldCharges,0,p.shieldMaxCharges);
      this.revision++;
    }
    candidates(){const full=this.owned.length>=MAX_SLOTS;return SKILLS.filter(s=>s.fusion?this.canFuse(s.id):this.level(s.id)<4&&(!full||this.level(s.id)>0)).map(s=>s.id);}
    skillPreview(id){
      if(id==='attack'||!BY_ID[id])return [];
      return SYNERGIES.filter(s=>s.requires.includes(id)).map(s=>{
        const missing=s.requires.filter(required=>required!==id&&!this.level(required)).map(required=>BY_ID[required].name);
        return {id:s.id,name:s.name,status:this.hasSynergy(s.id)?'active':missing.length?'missing':'activate',missing};
      });
    }
    shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
    upgradeOptions(exclude=[]){
      const fusion=FUSIONS.find(f=>this.canFuse(f.id));if(fusion){const pool=this.shuffle(this.candidates().filter(id=>id!==fusion.id));return [fusion.id,...pool.slice(0,2)];}
      const candidates=this.candidates();if(!candidates.length)return ['attack'];
      const excluded=new Set(exclude),fresh=candidates.filter(id=>!excluded.has(id)),count=Math.min(3,candidates.length);
      const pool=this.shuffle(fresh),owned=pool.find(id=>this.level(id)>0),options=[];
      if(owned)options.push(owned);
      for(const id of pool)if(options.length<count&&!options.includes(id))options.push(id);
      const existing=candidates.filter(id=>this.level(id)>0);
      if(!options.some(id=>this.level(id)>0)&&existing.length){
        const reinforcement=this.shuffle(existing)[0];
        if(options.length===count)options.pop();options.push(reinforcement);
      }
      for(const id of this.shuffle(candidates))if(options.length<count&&!options.includes(id))options.push(id);
      return this.shuffle(options);
    }
    reroll(){
      if(this.state!=='upgrade'||this.rerollsRemaining<=0)throw new Error('当前不能重抽升级');
      const old=[...this.options],next=this.upgradeOptions(old);
      if(next.length===old.length&&next.every(id=>old.includes(id)))throw new Error('没有不同的升级选项');
      this.options=next;this.rerollsRemaining--;this.revision++;this.emit('reroll',{remaining:this.rerollsRemaining});return [...next];
    }
    advanceSkill(id){
      const p=this.player;
      const fusion=FUSIONS.find(f=>f.id===id);if(fusion){if(!this.canFuse(id))throw new Error('合体需要两项技能均已突破');for(const component of fusion.requires)delete p.build[component];p.build[id]=4;this.recompute();this.emit('fusion',{name:fusion.name});return {id,name:fusion.name,level:4};}
      if(id==='attack'){p.attackBonus+=.15;this.recompute();return {id,name:'普攻强化',level:0,bonus:p.attackBonus};}
      if(!BY_ID[id])throw new Error('未知技能');
      if(this.level(id)>=4)throw new Error('技能已突破');
      if(!this.level(id)&&this.owned.length>=MAX_SLOTS)throw new Error('八个技能槽已满');
      const previous=this.level(id),before=new Set(this.synergies.map(s=>s.id)),oldShieldMax=p.shieldMaxCharges;p.build[id]=previous+1;
      this.recompute();
      for(const synergy of this.synergies)if(!before.has(synergy.id))this.emit('synergy',{id:synergy.id,name:synergy.name});
      if(id==='heal'){const lv=this.level(id);p.hp=lv===4?p.maxHp:Math.min(p.maxHp,p.hp+[0,35,50,70][lv]);if(!previous)p.healKills=0;}
      if(id==='lightning')p.lightningClock=Math.min(p.lightningClock,previous?p.lightningInterval:1.2);
      if(id==='mine')p.mineClock=Math.min(p.mineClock,previous?p.mineInterval:.8);
      if(id==='ghost')p.ghostClock=Math.min(p.ghostClock,this.level(id)===4?8:10);
      for(const skillId of ['frost','drone','well','beam','arrow','saw','flask','meteor','ion','turret','rocket'])if(id===skillId)p[skillId+'Clock']=Math.min(p[skillId+'Clock'],previous?p[skillId+'Interval']:1.5);
      if(id==='shield'){
        p.shieldCharges=Math.min(p.shieldMaxCharges,p.shieldCharges+Math.max(0,p.shieldMaxCharges-oldShieldMax));
        p.shieldClock=previous?Math.min(p.shieldClock,p.shieldInterval):p.shieldInterval;
      }
      return {id,name:BY_ID[id].name,level:this.level(id)};
    }
    maybeUpgrade(){
      if(this.state!=='playing'||this.upgradeLocked||this.player.xp<this.nextXp)return false;
      this.options=this.upgradeOptions();
      this.state='upgrade';this.emit('upgrade');return true;
    }
    choose(index){
      if(this.state!=='upgrade'||!Number.isInteger(index)||index<0||index>=this.options.length)throw new Error('当前升级选择无效');
      const selected=this.options[index];if(BY_ID[selected]?.fusion&&!this.canFuse(selected))throw new Error('合体条件尚未满足');this.player.xp-=this.nextXp;
      const result=this.advanceSkill(selected);this.upgrades++;this.options=[];this.revision++;
      this.emit('chosen',result);
      this.afterUpgrade();
      return result;
    }
    openLottery(bossStage){
      if(!BOSS_MILESTONES.some(m=>m.stage===bossStage))throw new Error('只有击败 Boss 后才能抽奖');
      const roll=this.random(),count=roll<1/3?0:roll<2/3?1:3,results=[];
      for(let i=0;i<count;i++){
        const choices=this.owned.filter(id=>this.level(id)<4);
        const id=choices.length?choices[Math.floor(this.random()*choices.length)]:'attack';
        results.push(this.advanceSkill(id));
      }
      this.lottery={at:this.upgrades,bossStage,count,results};this.lotteryHistory.push(this.lottery);this.state='lottery';this.emit('lottery',this.lottery);
    }
    acknowledgeLottery(){if(this.state!=='lottery')throw new Error('当前没有抽奖结果');if(this.lottery.bossStage===BOSS_MILESTONES[BOSS_MILESTONES.length-1].stage)this.finish(true);else this.afterUpgrade();}
    openCatalyst(){
      const eligible=CATALYSTS.filter(c=>c.id!==this.catalyst&&(!c.skill||this.level(c.skill)>0));
      const specialized=this.shuffle(eligible.filter(c=>c.skill)),general=this.shuffle(eligible.filter(c=>!c.skill));
      this.catalystOptions=this.shuffle([...specialized.slice(0,2),...general].slice(0,3)).map(c=>c.id);
      this.state='catalyst';this.emit('catalystChoice',{at:this.upgrades});
    }
    equipCatalyst(id){
      const c=BY_CATALYST[id];if(!c||c.skill&&!this.level(c.skill))throw new Error('催化道具不适用于当前技能');
      this.catalyst=id;this.recompute();
      if(this.level('lightning'))this.player.lightningClock=Math.min(this.player.lightningClock,this.player.lightningInterval);
      if(this.level('mine'))this.player.mineClock=Math.min(this.player.mineClock,this.player.mineInterval);
      for(const id of ['frost','drone','well','beam','shield','arrow','saw','flask','meteor','ion','turret','rocket'])if(this.level(id))this.player[id+'Clock']=Math.min(this.player[id+'Clock'],this.player[id+'Interval']);
      this.emit('catalystEquipped',{id,name:c.name});return c;
    }
    chooseCatalyst(index){
      if(this.state!=='catalyst'||!Number.isInteger(index)||index<0||index>=this.catalystOptions.length)throw new Error('当前催化选择无效');
      const result=this.equipCatalyst(this.catalystOptions[index]);this.catalystOptions=[];this.afterUpgrade();return result;
    }
    keepCatalyst(){if(this.state!=='catalyst')throw new Error('当前没有催化选择');this.catalystOptions=[];this.afterUpgrade();}
    afterUpgrade(){
      if([6,14,24].includes(this.upgrades)&&!this.catalystMilestones.includes(this.upgrades)){
        this.catalystMilestones.push(this.upgrades);this.openCatalyst();return;
      }
      const milestone=BOSS_MILESTONES.find(m=>this.upgrades===m.upgrade&&!this.isBossDefeated(m.stage)&&!this.isBossSpawned(m.stage));
      if(milestone&&!this.bossDue&&!this.boss){
        const boss=this.bossMilestone(milestone.stage);this.bossDue={...boss,at:this.time+boss.warning};this.emit('bossWarning',{stage:boss.stage,name:boss.name,seconds:boss.warning,upgrade:boss.upgrade});
      }
      this.state='playing';this.maybeUpgrade();
    }
    pause(){if(this.state==='playing')this.state='paused';}
    resume(){if(this.state==='paused')this.state='playing';}
    addEnergy(value){if(!Number.isFinite(value)||value<0)throw new Error('能量值无效');if(this.mode!=='practice')this.player.xp+=value;}
    inView(e){return e.x>=0&&e.x<=this.width&&e.y>=0&&e.y<=this.height;}
    minorCount(){return this.enemies.filter(e=>!e.dead&&e.type!=='boss').length;}
    sentinelCap(){return this.wave<=20?10:15;}
    createEnemy(type,x,y,stage=this.stage()){
      const data=BASE_ENEMIES[type];if(!data)throw new Error('未知敌人');
      const e={...data,type,x,y,hp:data.hp*stage.hp,maxHp:data.hp*stage.hp,speed:data.speed*stage.speed,id:++this.seq,dead:false,phase:this.random()*TAU,hit:0,orbitHit:-Infinity,auraLabel:-Infinity,
        chargeClock:type==='charger'?this.randomBetween(2.2,3.8):0,chargeWindup:0,chargeDash:0,chargeAngle:0,ghostHitEpoch:-1};
      if(type==='sentinel'){e.shotClock=2.4;e.shotIntent=null;}
      if(type==='warden'){e.guardClock=3;e.guardRemaining=0;}
      if(type==='glacial'){e.frostClock=3.2;e.frostIntent=null;}
      if(type==='phaselet'){e.phaseClock=3;e.phaseIntent=null;}
      if(type==='pylon'){e.pylonLife=12;e.pylonClock=3;e.pylonIntent=null;}
      if(type==='mender'){e.menderClock=3;e.menderIntent=null;}
      this.enemies.push(e);return e;
    }
    edgePosition(){
      const side=Math.floor(this.random()*4),pad=45;
      if(side===0)return {x:this.randomBetween(0,this.width),y:-pad};
      if(side===1)return {x:this.width+pad,y:this.randomBetween(0,this.height)};
      if(side===2)return {x:this.randomBetween(0,this.width),y:this.height+pad};
      return {x:-pad,y:this.randomBetween(0,this.height)};
    }
    spawnEnemy(){
      const stage=this.stage();if(this.minorCount()>=stage.cap)return;
      if(this.mode==='normal'&&this.menderCap()>0&&this.enemies.filter(e=>!e.dead&&e.type==='mender').length<this.menderCap()&&this.random()<.04){const pos=this.edgePosition();return this.createEnemy('mender',pos.x,pos.y,stage);}
      if(this.campaignLevel===10&&this.upgrades>=10&&this.enemies.filter(e=>!e.dead&&e.type==='pylon').length<(this.wave<=20?4:6)&&this.random()<.12){this.spawnPylons(1);return;}
      if(this.campaignLevel===9&&this.enemies.filter(e=>!e.dead&&e.type==='phaselet').length<(this.wave<=20?12:18)&&this.random()<(this.upgrades<10?.18:.3)){const pos=this.edgePosition();this.createEnemy('phaselet',pos.x,pos.y,stage);return;}
      if(this.campaignLevel===8&&this.enemies.filter(e=>!e.dead&&e.type==='glacial').length<(this.wave<=20?10:14)&&this.random()<(this.upgrades<10?.18:.3)){const pos=this.edgePosition();this.createEnemy('glacial',pos.x,pos.y,stage);return;}
      if(this.campaignLevel===7&&this.enemies.filter(e=>!e.dead&&e.type==='sporeling').length<(this.wave<=20?12:18)&&this.random()<(this.upgrades<10?.2:.3)){const pos=this.edgePosition();this.createEnemy('sporeling',pos.x,pos.y,stage);return;}
      if(this.campaignLevel===6&&this.enemies.filter(e=>!e.dead&&e.type==='warden').length<(this.wave<=20?12:18)&&this.random()<(this.upgrades<10?.2:.35)){const pos=this.edgePosition();this.createEnemy('warden',pos.x,pos.y,stage);return;}
      if(this.campaignLevel===5&&this.enemies.filter(e=>!e.dead&&e.type==='sentinel').length<this.sentinelCap()&&this.random()<(this.upgrades<10?.15:.3)){const pos=this.edgePosition();this.createEnemy('sentinel',pos.x,pos.y,stage);return;}
      let r=this.random(),i=0;for(;i<stage.weights.length-1;i++){if(r<stage.weights[i])break;r-=stage.weights[i];}
      const pos=this.edgePosition(),enemy=this.createEnemy(['blob','swift','tank','splitter','catalyst','charger'][i],pos.x,pos.y,stage);
      if(this.wave>20&&this.mode==='normal'&&['blob','swift','tank'].includes(enemy.type)&&this.random()<.08)this.promoteElite(enemy,['frenzy','crystal','pulse'][Math.floor(this.random()*3)]);
      return enemy;
    }
    menderCap(){return this.wave<=20?0:this.wave<=30?3:5;}
    menderTargets(mender){return this.enemies.filter(e=>!e.dead&&e.hp>0&&e!==mender&&!['boss','pylon','mender'].includes(e.type)&&e.hp<e.maxHp&&distance(e,mender)<=120+e.r).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||distance(a,mender)-distance(b,mender)).slice(0,6);}
    eliteCap(){return this.wave<=20?0:this.wave<=30?4:6;}
    promoteElite(enemy,affix){
      if(this.mode!=='normal'||!enemy||enemy.dead||enemy.elite||!['blob','swift','tank'].includes(enemy.type)||!Object.hasOwn(ELITE_AFFIXES,affix)||this.enemies.filter(e=>!e.dead&&e.elite).length>=this.eliteCap())return false;
      const data=ELITE_AFFIXES[affix];enemy.elite=affix;enemy.hp*=data.hp;enemy.maxHp*=data.hp;enemy.speed*=data.speed;enemy.energy+=2;enemy.eliteClock=4;enemy.eliteIntent=null;return true;
    }
    updateElite(enemy,dt){
      if(enemy.elite!=='pulse'||!this.inView(enemy))return false;
      if(enemy.eliteIntent){enemy.eliteIntent.remaining-=dt;if(enemy.eliteIntent.remaining<=0){enemy.eliteIntent=null;enemy.eliteClock=5;this.addEffect('elitePulse',enemy.x,enemy.y,85,'#e9a1ff',.4);if(distance(this.player,enemy)<=85)this.damagePlayer(14,'elitePulse');}return true;}
      enemy.eliteClock-=dt;if(enemy.eliteClock<=0){enemy.eliteClock=0;enemy.eliteIntent={remaining:1,total:1,radius:85};return true;}return false;
    }
    spawnBoss(stage){
      const milestone=this.bossMilestone(stage);if(!milestone)throw new Error('未知 Boss 阶段');
      if(this.boss||this.isBossSpawned(stage)||this.isBossDefeated(stage))return;
      const pos=this.edgePosition(),hp=Math.round([0,1200,4000,8500][stage]*(this.campaignLevel===10?2:this.campaignLevel===9?1.8:this.campaignLevel===8?1.7:this.campaignLevel===7?1.6:this.campaignLevel===6?1.55:this.campaignLevel===5?1.5:this.campaignLevel===4?1.45:this.campaignLevel===3?1.35:this.campaignLevel===2?1.25:1));
      this.boss={...pos,type:'boss',bossStage:stage,name:milestone.name,r:[0,44,55,64][stage],hp,maxHp:hp,speed:[0,28,36,42][stage]*(this.campaignLevel>=4?1.05:this.campaignLevel===3?.95:this.campaignLevel===2?1.08:1),color:['','#ff537a','#ffad54','#ff65d8'][stage],id:++this.seq,dead:false,phase:0,hit:0,orbitHit:-Infinity,auraLabel:-Infinity,
        attackClock:[0,4,3.5,3.2][stage],attackIndex:0,intent:null,dashRemaining:0,dashFrame:false,dashVx:0,dashVy:0,dashFollowup:false,dashQueued:false,enraged:false};
      this.enemies.push(this.boss);this.bossDue=null;
      this.bossesSpawned.push(stage);if(stage===1)this.firstBossSpawned=true;if(stage===3)this.finalBossSpawned=true;
      this.stats.bosses.push({stage,name:milestone.name,hp,maxHp:hp,startedAt:this.time,duration:null,killed:false});
      this.emit('boss',{stage,name:milestone.name,hp});return this.boss;
    }
    fireBullet(angle){
      const p=this.player;
      this.bullets.push({x:p.x,y:p.y,prevX:p.x,prevY:p.y,vx:Math.cos(angle)*520,vy:Math.sin(angle)*520,r:5,life:p.bounce?3:1.8,damage:p.damage,pierce:p.pierce,bounce:p.bounce,hits:new Set(),kind:'bullet',source:'bullet'});
    }
    shoot(){
      const p=this.player;let target=null,best=Infinity;
      for(const e of this.enemies){if(e.dead)continue;const d=distance(p,e);if(d<best){best=d;target=e;}}
      if(!target){p.fireClock=.08;return;}
      const level=this.level('rate'),roll=this.random();let count=1;
      if(level===2&&roll<.2)count=2;
      if(level===3)count=roll<.2?3:roll<.5?2:1;
      if(level===4)count=3;
      const angle=Math.atan2(target.y-p.y,target.x-p.x);
      for(let i=0;i<count;i++)this.fireBullet(angle+(i-(count-1)/2)*.085);
      if(this.hasSynergy('rail')&&++p.railRounds>=6){p.railRounds=0;this.fireRail(angle);}
      p.fireClock=p.fireRate*(p.overloadRemaining>0?.7:1);this.emit('shot',{x:p.x,y:p.y,angle,count});
    }
    ringShot(){for(let i=0;i<16;i++)this.fireBullet(i/16*TAU);this.emit('ringShot');}
    effectSeed(){return (++this.effectSeq*.61803398875)%1;}
    addEffect(kind,x,y,r,color,life=.5,extra={}){const effect={kind,x,y,r,color,life,total:life,seed:this.effectSeed(),...extra};this.effects.push(effect);return effect;}
    fireRail(angle){
      const p=this.player;
      this.bullets.push({x:p.x,y:p.y,prevX:p.x,prevY:p.y,vx:Math.cos(angle)*740,vy:Math.sin(angle)*740,r:9,life:1.5,damage:p.damage*2.5,pierce:7,bounce:false,hits:new Set(),kind:'rail',source:'rail'});
      this.addEffect('rail',p.x,p.y,34,'#ffc573',.22,{angle});this.emit('rail',{x:p.x,y:p.y,angle});
    }
    fireBeam(){
      const p=this.player;if(!this.level('beam')||this.state!=='playing')return;
      const targets=this.enemies.filter(e=>!e.dead&&this.inView(e)&&distance(e,p)<=p.beamRange+e.r).sort((a,b)=>distance(a,p)-distance(b,p));
      if(!targets.length){p.beamClock=.25;return;}
      const angle=Math.atan2(targets[0].y-p.y,targets[0].x-p.x),dx=Math.cos(angle),dy=Math.sin(angle);
      p.beamClock=p.beamInterval;this.addEffect('beam',p.x,p.y,p.beamRange,'#a8eaff',.36,{angle,halfWidth:p.beamHalfWidth});this.emit('beam',{x:p.x,y:p.y,angle,range:p.beamRange});
      for(const e of [...this.enemies]){
        if(e.dead)continue;const forward=(e.x-p.x)*dx+(e.y-p.y)*dy,side=Math.abs((e.x-p.x)*dy-(e.y-p.y)*dx);
        if(forward>=-e.r&&forward<=p.beamRange+e.r&&side<=p.beamHalfWidth+e.r){this.hurt(e,p.damage*p.beamMultiplier,{source:'beam'});if(this.state!=='playing')return;}
      }
    }
    recordCriticalHit(){
      const p=this.player;if(!this.hasSynergy('overload')||p.overloadCooldown>0||p.overloadRemaining>0)return;
      p.criticalHits=p.criticalHits.filter(at=>this.time-at<=2);p.criticalHits.push(this.time);
      if(p.criticalHits.length<4)return;
      p.criticalHits=[];p.overloadRemaining=2.5;p.overloadCooldown=6;p.fireClock=Math.min(p.fireClock,p.fireRate*.7);
      this.addEffect('overload',p.x,p.y,50,'#ff85c6',.6);this.emit('overloadStart',{x:p.x,y:p.y,duration:2.5});
    }
    hurt(e,amount,{angle=0,knock=false,critical=false,label=true,source='bullet',bomb=false}={}){
      if(!e||e.dead||!Number.isFinite(amount)||amount<=0||!Number.isFinite(e.hp)||e.hp<=0)return 0;
      const id=Object.prototype.hasOwnProperty.call(DAMAGE_SOURCES,source)?source:'bullet',record=this.stats.damage[id];
      if(id==='aura'&&e.slowRemaining>0&&this.hasSynergy('icebite'))amount*=1.3;
      if(id==='lightning'&&this.hasSynergy('gravityStorm')&&this.inGravityWell(e))amount*=1.25;
      if(id==='orbit'&&this.player.shieldCharges>0&&this.hasSynergy('guardian'))amount*=1.2;
      if(e.type==='warden'&&e.guardRemaining>0&&!bomb&&id!=='bomb')amount*=.5;
      if(e.type==='boss')amount*=1+this.player.bossDamageBonus;
      if(e.type==='boss'&&this.campaignLevel===10)amount*=1-this.reactorShieldReduction();
      const effective=Math.min(amount,e.hp);
      record.damage+=effective;if(e.type==='boss')record.bossDamage+=effective;
      e.hp=Math.max(0,e.hp-amount);e.hit=.08;
      if(knock){const strength=this.player.knock*.12*(e.type==='boss'?.2:1);e.x+=Math.cos(angle)*strength;e.y+=Math.sin(angle)*strength;}
      if(label)this.emit('damage',{x:e.x,y:e.y-8,amount:effective,critical,color:e.color,source:id});
      if(critical&&id==='bullet')this.recordCriticalHit();
      if(e.hp<=0)this.kill(e,{bomb,source:id});return effective;
    }
    inGravityWell(e){return this.gravityWells.some(well=>well.life>0&&distance(e,well)<=well.r+(e.r||0));}
    kill(e,{bomb=false,source=null}={}){
      if(e.dead)return;e.dead=true;this.kills++;this.combo=Math.min(9.9,this.combo+.08);this.comboTimer=2.2;
      const p=this.player;
      if(this.level('heal')){p.healKills++;if(p.healKills>=10){p.healKills-=10;const amount=[0,1,2,3,5][this.level('heal')];p.hp=Math.min(p.maxHp,p.hp+amount);this.emit('healed',{amount});}}
      const energy=this.mode==='practice'?0:e.type==='boss'?[0,30,45,0][e.bossStage]:e.energy;
      for(let i=0;i<energy;i++)this.gems.push(this.clampPickup({x:e.x+this.randomBetween(-8,8),y:e.y+this.randomBetween(-8,8),r:4,value:1,id:++this.seq,vx:this.randomBetween(-40,40),vy:this.randomBetween(-40,40),magnetized:false,dead:false}));
      if(this.mode!=='practice'&&!bomb)this.dropItem(e);
      if(!bomb&&e.type==='sporeling'&&this.campaignLevel===7&&this.inView(e))this.addSporeZone(e.x,e.y,40,1.2,3);
      if(!bomb&&e.type==='splitter')for(let i=0;i<2;i++){if(this.minorCount()>=this.stage().cap)break;this.createEnemy('child',e.x+this.randomBetween(-10,10),e.y+this.randomBetween(-10,10));}
      this.emit('kill',{x:e.x,y:e.y,color:e.color,boss:e.type==='boss'});
      if(e.type!=='boss'&&!bomb&&source!=='nova'&&this.level('nova')&&this.state==='playing'&&this.novaBursts<12){
        this.novaBursts++;const radius=p.novaRadius,damage=p.damage*p.novaMultiplier;
        this.addEffect('nova',e.x,e.y,radius,'#ff9c77',.38);this.emit('nova',{x:e.x,y:e.y,radius});
        for(const other of [...this.enemies])if(!other.dead&&distance(other,e)<=radius+other.r){this.hurt(other,damage,{source:'nova'});if(this.state!=='playing')break;}
      }
      if(e.type==='boss'){
        const record=this.stats.bosses.find(b=>b.stage===e.bossStage&&!b.killed);
        if(record){record.duration=Math.max(0,this.time-record.startedAt);record.killed=true;record.hp=0;}
        this.boss=null;if(!this.bossesDefeated.includes(e.bossStage))this.bossesDefeated.push(e.bossStage);
        if(e.bossStage===1)this.firstBossDefeated=true;this.emit('bossDefeated',{stage:e.bossStage,name:e.name});
        if(this.mode==='practice')this.finish(true);else this.openLottery(e.bossStage);
      }
    }
    clampPickup(pickup){
      // Match the player's walkable bounds, not the full canvas hidden behind HUDs.
      // Include small death-scatter spill, but never teleport distant off-screen loot in.
      if(pickup.x<-12||pickup.x>this.width+12||pickup.y<-12||pickup.y>this.height+12)return pickup;
      const p=this.player;pickup.x=clamp(pickup.x,p.r+8,this.width-p.r-8);pickup.y=clamp(pickup.y,p.r+56,this.height-p.r-50);return pickup;
    }
    dropItem(e){
      if(this.items.filter(i=>!i.dead).length>=6)return;
      const chance=e.type==='boss'||e.type==='child'?0:e.type==='tank'||e.type==='splitter'?.04:.02,roll=this.random();
      if(roll>=chance+.02)return;
      this.items.push(this.clampPickup({type:roll<chance/2?'bomb':roll<chance?'magnet':'pill',x:e.x,y:e.y,r:6,life:30,dead:false,id:++this.seq}));
    }
    useItem(item){
      if(item.dead)return;item.dead=true;
      if(item.type==='bomb'){
        this.hazards=this.hazards.filter(hazard=>['anchor','shelter'].includes(hazard.kind)||!this.inView(hazard));
        this.sporeZones=this.sporeZones.filter(zone=>!this.inView(zone));
        this.enemyShots=this.enemyShots.filter(shot=>!this.inView(shot));
        for(const e of [...this.enemies])if(!e.dead&&e.type!=='boss'&&this.inView(e))this.hurt(e,e.hp,{source:'bomb',bomb:true,label:false});
        this.addEffect('bomb',item.x,item.y,Math.hypot(this.width,this.height),'#ffad54',.6);this.emit('bomb');
      }else if(item.type==='pill'){
        const amount=Math.min(20+this.player.pillBonus,this.player.maxHp-this.player.hp);this.player.hp+=amount;
        this.addEffect('pill',item.x,item.y,42,'#ff82ba',.5);this.emit('healed',{amount});this.emit('pill',{amount});
      }else{
        for(const g of this.gems)if(!g.dead&&this.inView(g))g.magnetized=true;
        this.addEffect('magnet',item.x,item.y,Math.hypot(this.width,this.height),'#35f4d2',.7);this.emit('magnet');
      }
    }
    lightning(){
      const p=this.player,lv=this.level('lightning');if(!lv)return;
      const available=this.shuffle(this.enemies.filter(e=>!e.dead&&this.inView(e))),count=p.lightningTargets,radius=p.lightningRadius;
      if(!available.length){this.player.lightningClock=.25;return;}
      const scores=new Map(available.map(e=>[e.id,available.filter(other=>distance(e,other)<=radius+other.r).length]));
      available.sort((a,b)=>scores.get(b.id)-scores.get(a.id));
      const selected=[];
      for(const e of available)if(selected.length<count&&selected.every(other=>distance(e,other)>radius*1.2))selected.push(e);
      for(const e of available)if(selected.length<count&&!selected.includes(e))selected.push(e);
      const centers=selected.map(e=>({x:e.x,y:e.y}));
      for(const center of centers){
        const gravityStorm=this.hasSynergy('gravityStorm')&&this.enemies.some(e=>!e.dead&&distance(center,e)<=radius+e.r&&this.inGravityWell(e));
        this.addEffect('lightning',center.x,center.y,radius,'#67a8ff',.7,{level:lv,gravityStorm});
        for(const e of [...this.enemies])if(!e.dead&&distance(center,e)<=radius+e.r){
          if(e.type!=='boss')e.stun=Math.max(e.stun||0,p.lightningStun);
          this.hurt(e,p.damage*p.lightningDamageMultiplier,{source:'lightning'});if(this.state!=='playing')break;
        }
        if(this.state!=='playing')break;
        if(this.hasSynergy('conductive')&&distance(center,p)<=p.auraRadius){
          const chained=this.enemies.filter(e=>!e.dead&&distance(center,e)>radius+e.r&&distance(center,e)<=radius+110&&distance(p,e)<=p.auraRadius)
            .sort((a,b)=>distance(center,a)-distance(center,b)).slice(0,2);
          for(const e of chained){this.addEffect('chain',e.x,e.y,22,'#58eeaa',.45,{fromX:center.x,fromY:center.y,gravityStorm:this.hasSynergy('gravityStorm')&&this.inGravityWell(e)});if(e.type!=='boss')e.stun=Math.max(e.stun||0,.2);this.hurt(e,p.damage*1.25,{source:'lightning'});if(this.state!=='playing')break;}
        }
        if(this.state!=='playing')break;
      }
      p.lightningClock=p.lightningInterval;this.emit('lightning',{count:centers.length,radius});
    }
    layMine(){
      const p=this.player,lv=this.level('mine');if(!lv)return;
      if(this.mines.length>=12)this.mines.shift();
      this.mines.push({x:p.x,y:p.y,r:10,life:30,armed:p.mineArmTime,armTime:p.mineArmTime,blackHole:lv===4,blast:p.mineBlast,trigger:p.mineTrigger,
        pullRadius:lv===4?(this.level('blackholeKing')?230:170):0,royal:!!this.level('blackholeKing'),damage:p.damage*p.mineDamageMultiplier,id:++this.seq});
      p.mineClock=p.mineInterval;this.emit('mine');
    }
    frostPulse(){
      const p=this.player,lv=this.level('frost');if(!lv||this.state!=='playing')return;
      this.addEffect('frost',p.x,p.y,p.frostRadius,'#87e8ff',.75,{level:lv});
      this.emit('frost',{x:p.x,y:p.y,radius:p.frostRadius,level:lv});p.frostClock=p.frostInterval;
      for(const e of [...this.enemies])if(!e.dead&&distance(e,p)<=p.frostRadius+e.r){
        e.slowRemaining=2.5;e.slowFactor=e.type==='boss'?.8:.6;
        if(lv===4&&e.type!=='boss')e.stun=Math.max(e.stun||0,.7);
        this.hurt(e,p.damage*p.frostDamageMultiplier,{source:'frost'});if(this.state!=='playing')return;
      }
    }
    droneTargets(){return this.enemies.filter(e=>!e.dead&&this.inView(e)).sort((a,b)=>(b.type==='boss')-(a.type==='boss')||distance(a,this.player)-distance(b,this.player));}
    fireDrones(){
      const p=this.player;if(!this.level('drone')||this.state!=='playing')return;
      const targets=this.droneTargets();if(!targets.length){p.droneClock=.25;return;}
      for(let i=0;i<p.droneShots;i++){
        const target=targets[i%targets.length],angle=Math.atan2(target.y-p.y,target.x-p.x),offset=(i-(p.droneShots-1)/2)*.35;
        const x=p.x+Math.cos(angle+offset)*24,y=p.y+Math.sin(angle+offset)*24;
        this.bullets.push({x,y,prevX:x,prevY:y,vx:Math.cos(angle+offset)*440,vy:Math.sin(angle+offset)*440,r:4.5,life:2.6,damage:p.damage*p.droneDamageMultiplier,pierce:0,bounce:false,hits:new Set(),kind:'drone',source:'drone',targetId:target.id,canCrit:this.hasSynergy('seeker')});
      }
      p.droneClock=p.droneInterval;this.emit('drone',{x:p.x,y:p.y,count:p.droneShots});
    }
    spawnWell(){
      const p=this.player,lv=this.level('well');if(!lv||this.state!=='playing')return;
      const available=this.shuffle(this.enemies.filter(e=>!e.dead&&this.inView(e)));
      if(!available.length){p.wellClock=.25;return;}
      const scores=new Map(available.map(e=>[e.id,available.filter(other=>distance(e,other)<=p.wellRadius+other.r).length]));
      available.sort((a,b)=>scores.get(b.id)-scores.get(a.id));const center=available[0];
      if(this.gravityWells.length>=3)this.gravityWells.shift();
      const well={kind:'well',x:center.x,y:center.y,r:p.wellRadius,life:p.wellDuration,total:p.wellDuration,seed:this.effectSeed(),damage:p.damage*p.wellDamageMultiplier,pull:p.wellPull,tickClock:.1,id:++this.seq,level:lv,royal:!!this.level('blackholeKing')};
      this.gravityWells.push(well);p.wellClock=p.wellInterval;
      this.addEffect('well',well.x,well.y,well.r,'#b895ff',.65,{level:lv});this.emit('well',{x:well.x,y:well.y,radius:well.r,level:lv});
    }
    updateWells(dt){
      if(this.state!=='playing')return;
      for(const well of this.gravityWells){
        const activeDt=Math.min(dt,Math.max(0,well.life));well.life-=dt;if(!activeDt)continue;
        for(const e of this.enemies){
          const d=distance(e,well);if(e.dead||d<=.01||d>well.r+e.r)continue;
          const pull=Math.min(d,well.pull*activeDt*(e.type==='boss'?.25:1));e.x+=(well.x-e.x)/d*pull;e.y+=(well.y-e.y)/d*pull;
        }
        well.tickClock-=activeDt;
        while(well.tickClock<=1e-8){
          well.tickClock+=.1;
          for(const e of [...this.enemies])if(!e.dead&&distance(e,well)<=well.r+e.r){
            const damage=this.hurt(e,well.damage*.1,{source:'well',label:false});
            e.wellPendingDamage=(e.wellPendingDamage||0)+damage;
            if(e.dead||this.time-(e.wellLabel??-Infinity)>=.5){
              this.emit('damage',{x:e.x,y:e.y-8,amount:e.wellPendingDamage,color:'#b895ff',critical:false,source:'well'});e.wellPendingDamage=0;e.wellLabel=this.time;
            }
            if(this.state!=='playing')return;
          }
        }
      }
      this.gravityWells=this.gravityWells.filter(well=>well.life>0);
    }
    updateShield(dt){
      const p=this.player;if(this.state!=='playing'||!this.level('shield'))return;
      if(p.shieldCharges>=p.shieldMaxCharges){p.shieldClock=p.shieldInterval;return;}
      p.shieldClock-=dt;
      if(p.shieldClock<=0){p.shieldCharges=Math.min(p.shieldMaxCharges,p.shieldCharges+1);p.shieldClock=p.shieldInterval;this.emit('shieldCharge',{x:p.x,y:p.y,charges:p.shieldCharges});}
    }
    updateGhost(dt){
      const p=this.player,lv=this.level('ghost');if(!lv)return;
      if(p.ghostActive){
        p.ghostRemaining-=dt;
        if(p.ghostRemaining<=0&&!this.enemies.some(e=>!e.dead&&distance(e,p)<e.r+p.r)){p.ghostActive=false;this.emit('ghostEnd');}
      }
      p.ghostClock-=dt;
      if(p.ghostClock<=0&&!p.ghostActive){p.ghostActive=true;p.ghostEpoch++;p.ghostRemaining=[0,2,3,4,4][lv];p.ghostClock=lv===4?8:10;this.emit('ghostStart');}
    }
    detonateMine(m,amplify=false){
      if(m.life<=0)return;m.life=0;const radius=m.blast*(amplify?1.35:1),damage=m.damage*(amplify?1.35:1);
      const color=amplify?'#c7a2ff':m.blackHole?'#b28aff':'#ffbf65';
      this.addEffect('mine',m.x,m.y,radius,color,.85,{blackHole:m.blackHole,amplify});
      for(const e of [...this.enemies])if(!e.dead&&distance(e,m)<=radius+e.r){
        this.hurt(e,damage,{source:'mine'});if(this.state!=='playing')break;
        if(!e.dead&&e.type!=='boss'){const angle=Math.atan2(e.y-m.y,e.x-m.x);e.x+=Math.cos(angle)*26;e.y+=Math.sin(angle)*26;}
      }
      this.emit('explosion',{x:m.x,y:m.y,radius,color,resonance:amplify});
    }
    updateMines(dt){
      for(const m of this.mines){
        m.life-=dt;m.armed-=dt;if(m.life<=0||m.armed>0)continue;
        if(m.blackHole)for(const e of this.enemies){const d=distance(m,e);if(e.dead||d<=m.r||d>m.pullRadius)continue;const pull=Math.min(d,(m.royal?165:120)*dt*(e.type==='boss'?.25:1));e.x+=(m.x-e.x)/d*pull;e.y+=(m.y-e.y)/d*pull;}
        if(this.enemies.some(e=>!e.dead&&distance(e,m)<=e.r+m.trigger))this.detonateMine(m);
        if(this.state!=='playing')break;
      }this.mines=this.mines.filter(m=>m.life>0);
    }
    phaseTrace(x1,y1,x2,y2){
      if(!this.player.ghostActive||!this.hasSynergy('phase'))return;
      const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy;
      if(length<.01)return;
      for(const e of [...this.enemies]){
        if(e.dead||e.ghostHitEpoch===this.player.ghostEpoch)continue;
        const t=length?clamp(((e.x-x1)*dx+(e.y-y1)*dy)/length,0,1):0;
        if(Math.hypot(e.x-(x1+t*dx),e.y-(y1+t*dy))>e.r+this.player.r)continue;
        e.ghostHitEpoch=this.player.ghostEpoch;this.addEffect('phase',e.x,e.y,e.r+18,'#a7e8ff',.35);this.hurt(e,this.player.damage*1.5,{source:'phase'});
        if(this.state!=='playing')break;
      }
    }
    updateOrbits(){
      const p=this.player;
      for(let i=0;i<p.orbits;i++){
        const a=this.time*p.orbitSpeed+i/p.orbits*TAU,orb={x:p.x+Math.cos(a)*p.orbitRadius,y:p.y+Math.sin(a)*p.orbitRadius};
        for(const e of [...this.enemies])if(!e.dead&&distance(e,orb)<e.r+10&&this.time-e.orbitHit>=.28){e.orbitHit=this.time;this.hurt(e,(8+p.damage*.3)*(this.level('orbit')===4?2:1)*p.orbitDamageMultiplier,{source:'orbit'});if(this.state!=='playing')return;}
        if(this.hasSynergy('resonance'))for(const m of this.mines)if(m.life>0&&m.armed<=0&&distance(m,orb)<m.r+10){this.detonateMine(m,true);if(this.state!=='playing')return;}
      }
      this.mines=this.mines.filter(m=>m.life>0);
    }
    damagePlayer(amount,source='contact'){
      const p=this.player;if(this.state!=='playing'||p.invuln>0||p.ghostActive||!Number.isFinite(amount)||amount<=0)return false;
      const name=PLAYER_DAMAGE_NAMES[source]||'未知伤害';
      if(p.shieldCharges>0){
        p.shieldCharges--;p.invuln=.72;this.stats.blockedDamage+=amount;
        this.addEffect('shield',p.x,p.y,p.r+35,'#7df2ff',.55);this.emit('shieldBlock',{x:p.x,y:p.y,amount,charges:p.shieldCharges,source,name});return false;
      }
      amount*=1-p.damageReduction;
      const effective=Math.min(p.hp,amount);p.hp=Math.max(0,p.hp-amount);p.invuln=.72;this.stats.damageTaken+=effective;
      this.stats.recent=this.stats.recent.filter(hit=>this.time-hit.at<=5);this.stats.recent.push({source,name,amount:effective,at:this.time});
      this.emit('playerHurt',{x:p.x,y:p.y,amount:effective,source,name});
      if(p.hp<=0&&p.revivalCharges>0&&p.revivalHeal>0){p.revivalCharges=0;p.revivalUsed=1;p.hp=Math.max(1,p.maxHp*p.revivalHeal);p.invuln=1.5;this.addEffect('pill',p.x,p.y,80,'#96ffcb',.8);this.emit('revived',{x:p.x,y:p.y,amount:p.hp});return true;}
      if(p.hp<=0)this.stats.death={source,name,amount:effective,recent:this.stats.recent.map(({source,name,amount})=>({source,name,amount}))};
      if(p.hp<=0)this.finish(false);return true;
    }
    updateBossAttack(dt){
      const b=this.boss;if(!b||b.dead||this.state!=='playing')return;b.dashFrame=false;
      if(!b.enraged&&b.hp<b.maxHp*.5){
        b.enraged=true;b.attackClock=Math.min(b.attackClock,3.5);
        this.addEffect('bossEnrage',b.x,b.y,b.r+45,b.color,.8);this.emit('bossEnrage',{stage:b.bossStage,name:b.name,x:b.x,y:b.y});
      }
      if(b.dashRemaining>0){const slow=b.slowRemaining>0?b.slowFactor:1;b.dashFrame=true;b.x+=b.dashVx*dt*slow;b.y+=b.dashVy*dt*slow;b.dashRemaining=Math.max(0,b.dashRemaining-dt);
        if(b.dashRemaining===0&&b.dashQueued){b.dashFrame=false;b.dashQueued=false;b.dashFollowup=true;b.intent={kind:'dash',angle:Math.atan2(this.player.y-b.y,this.player.x-b.x),remaining:.7,total:.7,radius:210,innerRadius:0};this.emit('bossWindup',{kind:'dash',stage:b.bossStage,x:b.x,y:b.y,duration:.7});}
        return;}
      if(b.intent){
        b.intent.remaining-=dt;if(b.intent.remaining>0)return;
        const intent=b.intent,{kind,angle}=intent;b.intent=null;b.attackClock=(b.bossStage===1?(b.enraged?4.6:5.8):b.bossStage===2?(b.enraged?4.2:4.8):b.enraged?3.5:4.2)*(this.campaignLevel===2?.85:1);
        if(kind==='cone'){
          this.addEffect('bossCone',b.x,b.y,210,b.color,.4,{angle});
          const relative=Math.atan2(this.player.y-b.y,this.player.x-b.x),delta=Math.atan2(Math.sin(relative-angle),Math.cos(relative-angle));
          if(distance(this.player,b)<=210&&Math.abs(delta)<=.57)this.damagePlayer(22,'bossCone');
        }else if(kind==='dash'){
          const speed=b.bossStage===3?(b.enraged?520:480):440;
          b.dashRemaining=b.bossStage===3?.75:.72;b.dashVx=Math.cos(angle)*speed;b.dashVy=Math.sin(angle)*speed;
          if(b.bossStage===2){b.dashQueued=(b.enraged||this.campaignLevel>=2)&&!b.dashFollowup;b.dashFollowup=false;}
          this.addEffect('dash',b.x,b.y,b.r,b.color,.5);
        }else if(kind==='cross'){
          this.addEffect('bossCross',b.x,b.y,240,b.color,.55,{angle});
          const dx=this.player.x-b.x,dy=this.player.y-b.y,forward=dx*Math.cos(angle)+dy*Math.sin(angle),side=-dx*Math.sin(angle)+dy*Math.cos(angle);
          if(Math.abs(forward)<=240&&Math.abs(side)<=27||Math.abs(side)<=240&&Math.abs(forward)<=27)this.damagePlayer(20,'bossCross');
        }else if(kind==='corePulse'){
          this.addEffect('bossCorePulse',b.x,b.y,150,b.color,.55);
          if(distance(this.player,b)<=150)this.damagePlayer(24,'bossCorePulse');
        }else if(kind==='shockwave'){
          this.addEffect('bossShockwave',b.x,b.y,260,b.color,.65,{innerRadius:120});
          const d=distance(this.player,b);if(d>120&&d<=260)this.damagePlayer(24,'bossShockwave');
        }else if(kind==='stormLances'){
          this.addEffect('stormLances',b.x,b.y,560,'#a6ddff',.45,{angle,lanes:intent.lanes});
          const dx=this.player.x-b.x,dy=this.player.y-b.y,forward=dx*Math.cos(angle)+dy*Math.sin(angle),side=-dx*Math.sin(angle)+dy*Math.cos(angle);
          if(forward>=0&&forward<=560&&Array.from({length:intent.lanes},(_,i)=>(i-(intent.lanes-1)/2)*80).some(offset=>Math.abs(side-offset)<=18))this.damagePlayer(20,'bossStormLances');
        }else if(kind==='stormCage'){
          this.addEffect('stormCage',intent.x,intent.y,155,'#8fcfff',.55,{innerRadius:60});
          const d=distance(this.player,intent);if(d>60&&d<=155)this.damagePlayer(20,'bossStormCage');
        }else if(kind==='reactorShield'){
          this.spawnPylons(b.bossStage===3?4:3);
        }else if(kind==='solarRain'){
          this.addHazard({kind:'reactor',shape:'circle',x:intent.x,y:intent.y,r:75,warning:1.25,life:.55,damage:22});for(let i=0;i<b.bossStage*2+1;i++){const a=i/(b.bossStage*2+1)*TAU;this.addHazard({kind:'reactor',shape:'circle',x:clamp(intent.x+Math.cos(a)*150,75,this.width-75),y:clamp(intent.y+Math.sin(a)*150,75,this.height-75),r:75,warning:1.25,life:.55,damage:22});}
        }else if(kind==='purge'){
          this.spawnPurge(2.6);
        }else if(kind==='riftCross'){
          for(let i=0;i<2;i++)this.addHazard({kind:'rift',shape:'strip',x:intent.x,y:intent.y,r:18,length:Math.max(this.width,this.height)*1.2,angle:angle+i*Math.PI/2,warning:1+i*.6,life:.65,damage:18});this.spawnAnchor();
        }else if(kind==='phaseJump'){
          const fromX=b.x,fromY=b.y;b.x=intent.x;b.y=intent.y;this.addEffect('phaseWarp',fromX,fromY,60,'#c8adff',.5);this.addEffect('phaseWarp',b.x,b.y,95,'#c8adff',.5);
        }else if(kind==='iceFan'||kind==='frostWheel'){
          if(kind==='iceFan'){for(let i=0;i<b.bossStage*2+1;i++)this.addHazard({kind:'ice',shape:'circle',x:clamp(intent.x+(i-b.bossStage)*85,55,this.width-55),y:intent.y,r:55,warning:1.2,life:.65,damage:18,chill:1.8});}
          else this.addHazard({kind:'ice',shape:'ring',x:intent.x,y:intent.y,r:210,inner:100,warning:1.5,life:.65,damage:22,chill:1.8});
        }else if(kind==='seedRain'){
          const count=b.bossStage+2;this.addSporeZone(intent.x,intent.y,44,1.2,3);
          for(let i=0;i<count;i++){const a=i/count*TAU;this.addSporeZone(intent.x+Math.cos(a)*135,intent.y+Math.sin(a)*135,44,1.2,3);}
        }else if(kind==='vineSweep'){
          this.addEffect('vineSweep',b.x,b.y,650,'#c791ee',.45,{angle});const dx=this.player.x-b.x,dy=this.player.y-b.y,forward=dx*Math.cos(angle)+dy*Math.sin(angle),side=-dx*Math.sin(angle)+dy*Math.cos(angle);
          if(forward>=0&&forward<=650&&Math.abs(side)<=24)this.damagePlayer(24,'bossVine');
        }else if(kind==='summon'){
          const count=b.bossStage===3?5:3,cap=this.stage().cap+(b.bossStage===3?0:3),radius=b.bossStage===3?90:70;
          for(let i=0;i<count&&this.minorCount()<cap;i++){
            const a=i/count*TAU,type=b.bossStage===3&&i%2===1?'charger':'swift';this.createEnemy(type,b.x+Math.cos(a)*radius,b.y+Math.sin(a)*radius);
          }
          this.addEffect('summon',b.x,b.y,95,b.color,.6);
        }
        this.emit('bossAttack',{kind,stage:b.bossStage,x:b.x,y:b.y});return;
      }
      b.attackClock-=dt;if(b.attackClock<=0){
        if(this.campaignLevel===10){const patterns=b.bossStage===1?['reactorShield','solarRain','cone']:b.bossStage===2?['solarRain','reactorShield','purge','dash']:['reactorShield','solarRain','purge','corePulse','summon'],kind=patterns[b.attackIndex++%patterns.length],duration=kind==='reactorShield'?1.2:kind==='solarRain'?1:kind==='purge'?1:kind==='corePulse'?1.2:1.1;b.intent={kind,angle:Math.atan2(this.player.y-b.y,this.player.x-b.x),remaining:duration,total:duration,radius:kind==='solarRain'?225:kind==='purge'?95:kind==='corePulse'?150:210,x:this.player.x,y:this.player.y};this.emit('bossWindup',{kind,stage:b.bossStage,x:b.x,y:b.y,duration});return;}
        if(this.campaignLevel===9){const patterns=b.bossStage===1?['riftCross','cone']:b.bossStage===2?['riftCross','phaseJump','dash']:['phaseJump','riftCross','summon','corePulse'],kind=patterns[b.attackIndex++%patterns.length],duration=kind==='phaseJump'?.9:kind==='riftCross'?.8:kind==='corePulse'?1.2:1.1,angle=Math.atan2(this.player.y-b.y,this.player.x-b.x);b.intent={kind,angle,remaining:duration,total:duration,radius:kind==='phaseJump'?95:kind==='riftCross'?18:kind==='corePulse'?150:210,x:kind==='phaseJump'?clamp(this.player.x+Math.cos(angle)*130,60,this.width-60):this.player.x,y:kind==='phaseJump'?clamp(this.player.y+Math.sin(angle)*130,85,this.height-70):this.player.y};this.emit('bossWindup',{kind,stage:b.bossStage,x:b.x,y:b.y,duration});return;}
        if(this.campaignLevel===8){
          const patterns=b.bossStage===1?['iceFan','cone']:b.bossStage===2?['iceFan','dash','frostWheel']:['iceFan','frostWheel','summon','corePulse'],kind=patterns[b.attackIndex++%patterns.length],duration=['iceFan','frostWheel'].includes(kind)?.8:kind==='corePulse'?1.2:1.1;
          b.intent={kind,angle:Math.atan2(this.player.y-b.y,this.player.x-b.x),remaining:duration,total:duration,radius:({iceFan:55,frostWheel:210,cone:210,dash:210,summon:90,corePulse:150})[kind],x:this.player.x,y:this.player.y};this.emit('bossWindup',{kind,stage:b.bossStage,x:b.x,y:b.y,duration});return;
        }
        if(this.campaignLevel===7){
          const patterns=b.bossStage===1?['seedRain','cone']:b.bossStage===2?['seedRain','dash','vineSweep']:['seedRain','vineSweep','summon','corePulse'],kind=patterns[b.attackIndex++%patterns.length],duration=kind==='seedRain'?1:kind==='vineSweep'?1.5:kind==='corePulse'?1.2:1.1;
          b.intent={kind,angle:Math.atan2(this.player.y-b.y,this.player.x-b.x),remaining:duration,total:duration,radius:({seedRain:179,vineSweep:650,cone:210,dash:210,summon:90,corePulse:150})[kind],x:this.player.x,y:this.player.y};this.emit('bossWindup',{kind,stage:b.bossStage,x:b.x,y:b.y,duration});return;
        }
        if(this.campaignLevel===6){
          const patterns=b.bossStage===1?['stormLances','cone']:b.bossStage===2?['stormLances','dash','stormCage']:['stormCage','stormLances','summon','corePulse'];
          const kind=patterns[b.attackIndex++%patterns.length],duration=kind==='stormCage'?1.6:kind==='stormLances'?1.4:kind==='corePulse'?1.2:1.1;
          b.intent={kind,angle:Math.atan2(this.player.y-b.y,this.player.x-b.x),remaining:duration,total:duration,radius:({stormCage:155,stormLances:560,corePulse:150,cone:210,dash:210,summon:90})[kind],lanes:b.bossStage===1?3:5,x:this.player.x,y:this.player.y};
          this.emit('bossWindup',{kind,stage:b.bossStage,x:b.x,y:b.y,duration});return;
        }
        const kind=b.bossStage===1?(b.enraged||this.campaignLevel>=2?['cone','cross'][b.attackIndex++%2]:'cone'):b.bossStage===2?(b.attackIndex++%2===0?'dash':'summon'):(b.enraged||this.campaignLevel>=2?['cone','dash','summon','shockwave','corePulse'][b.attackIndex++%5]:['cone','dash','summon','shockwave'][b.attackIndex++%4]);
        const duration=kind==='shockwave'||kind==='corePulse'?1.2:kind==='cross'?1.25:kind==='cone'?1.1:.9;
        b.intent={kind,angle:Math.atan2(this.player.y-b.y,this.player.x-b.x),remaining:duration,total:duration,radius:kind==='shockwave'?260:kind==='corePulse'?150:kind==='cross'?240:210,innerRadius:kind==='shockwave'?120:0};
        this.emit('bossWindup',{kind,stage:b.bossStage,x:b.x,y:b.y,duration});
      }
    }
    updateArena(dt){
      if(this.campaignLevel===10&&this.mode!=='practice'&&this.upgrades>=5){this.arenaClock-=dt;if(this.arenaClock<=0){this.spawnPurge(3);this.arenaIndex++;this.arenaClock=this.upgrades>=20?12:15;}return;}
      if(this.campaignLevel===9&&this.mode!=='practice'&&this.upgrades>=5){this.arenaClock-=dt;if(this.arenaClock<=0){const angle=this.arenaIndex++*.37;for(let i=0;i<2;i++)this.addHazard({kind:'rift',shape:'strip',x:this.player.x,y:this.player.y,r:18,length:Math.max(this.width,this.height)*1.2,angle:angle+i*Math.PI/2,warning:1.6+i*.6,life:.65,damage:18});this.spawnAnchor();this.arenaClock=this.upgrades>=20?11:14;}return;}
      if(this.campaignLevel===8&&this.mode!=='practice'&&this.upgrades>=5){this.arenaClock-=dt;if(this.arenaClock<=0){const angle=this.arenaIndex++%2?0:Math.PI/2;for(let i=0;i<(this.upgrades>=20?2:1);i++)this.addHazard({kind:'ice',shape:'strip',x:this.player.x,y:this.player.y,r:24,length:Math.max(this.width,this.height)*1.2,angle:angle+i*Math.PI/2,warning:1.8,life:1.1,damage:12,chill:1.6});this.arenaClock=this.upgrades>=20?10:13;}return;}
      if(this.campaignLevel===7&&this.mode!=='practice'&&this.upgrades>=5){this.arenaClock-=dt;if(this.arenaClock<=0){for(let i=0;i<3;i++){const a=this.arenaIndex*.8+i/3*TAU;this.addSporeZone(this.player.x+Math.cos(a)*145,this.player.y+Math.sin(a)*145,40,1.2,3);}this.arenaIndex++;this.arenaClock=this.upgrades>=20?12:15;}return;}
      if(this.campaignLevel===6&&this.mode!=='practice'&&this.upgrades>=5){
        if(this.arenaIntent){const m=this.arenaIntent;m.remaining-=dt;if(m.remaining>0)return;this.arenaIntent=null;
          if(distance(this.player,m)>m.radius)this.damagePlayer(18,'arenaStorm');else{const p=this.player,amount=Math.min(6,p.maxHp-p.hp);p.hp+=amount;if(amount>0)this.emit('healed',{amount});}
          this.addEffect('stormEye',m.x,m.y,m.radius,'#86ffd7',.6);return;
        }
        this.arenaClock-=dt;if(this.arenaClock<=0){const right=this.arenaIndex++%2;this.arenaIntent={kind:'storm',x:this.width*(right?.7:.3),y:clamp(this.height*(right?.65:.35),100,this.height-90),radius:130,remaining:2.6,total:2.6};this.arenaClock=this.upgrades>=20?10:12;this.emit('stormEye');}return;
      }
      if(this.campaignLevel>=4)return;
      if(this.mode==='practice'||this.campaignLevel===1||this.upgrades<5)return;
      if(this.campaignLevel===3){
        if(this.arenaIntent){const mark=this.arenaIntent;mark.remaining-=dt;if(mark.remaining>0)return;this.arenaIntent=null;
          if((mark.axis!=='horizontal'&&Math.abs(this.player.x-mark.x)<=mark.radius)||(mark.axis!=='vertical'&&Math.abs(this.player.y-mark.y)<=mark.radius))this.damagePlayer(20,'arenaMirror');
          this.addEffect('mirror',mark.x,mark.y,mark.radius,'#a8eaff',.45,{axis:mark.axis});return;}
        this.arenaClock-=dt;if(this.arenaClock<=0){this.arenaIntent={kind:'mirror',axis:this.upgrades>=20?'cross':this.arenaIndex++%2?'horizontal':'vertical',x:this.player.x,y:this.player.y,radius:42,remaining:1.8,total:1.8};this.arenaClock=this.upgrades>=20?8:10;}return;
      }
      if(this.arenaIntent){
        this.arenaIntent.remaining-=dt;if(this.arenaIntent.remaining>0)return;
        const mark=this.arenaIntent;this.arenaIntent=null;this.addEffect('arenaEruption',mark.x,mark.y,mark.radius,'#ff795d',.6);
        if(distance(this.player,mark)<=mark.radius)this.damagePlayer(18,'arenaEruption');
        this.emit('arenaBurst',{x:mark.x,y:mark.y});return;
      }
      this.arenaClock-=dt;if(this.arenaClock<=0){this.arenaIntent={x:this.player.x,y:this.player.y,radius:95,remaining:1.5,total:1.5};this.arenaClock=this.upgrades>=20?7:9;this.emit('arenaWindup',{x:this.player.x,y:this.player.y,duration:1.5});}
    }
    updatePortals(dt){
      this.portalCooldown=Math.max(0,this.portalCooldown-dt);if(this.campaignLevel!==4||this.portals.length!==2)return;
      const index=this.portals.findIndex(gate=>distance(this.player,gate)<=gate.r+this.player.r);
      if(index<0){this.portalBlocked=false;return;}if(this.portalCooldown>0||this.portalBlocked)return;const target=this.portals[1-index],p=this.player;const fromX=p.x,fromY=p.y;
      p.x=target.x;p.y=target.y;p.invuln=Math.max(p.invuln,.8);this.portalCooldown=3;this.portalBlocked=true;
      this.addEffect('portal',fromX,fromY,65,'#bc8aff',.45);this.addEffect('portal',p.x,p.y,65,'#8aeaff',.45);this.emit('portal');
    }
    moveEnemy(e,dt,catalysts){
      const p=this.player;
      const slow=e.slowRemaining>0?e.slowFactor:1;e.slowRemaining=Math.max(0,(e.slowRemaining||0)-dt);
      if(e.stun>0){e.stun=Math.max(0,e.stun-dt);return;}
      if(e.type==='mender'&&this.inView(e)){
        if(e.menderIntent){e.menderIntent.remaining-=dt;if(e.menderIntent.remaining<=1e-9){e.menderIntent=null;e.menderClock=5;for(const target of this.menderTargets(e)){const amount=Math.min(45,target.maxHp*.15,target.maxHp-target.hp);target.hp+=amount;this.addEffect('ionLink',target.x,target.y,6,'#ffb0c3',.35,{fromX:e.x,fromY:e.y});this.emit('enemyHeal',{x:target.x,y:target.y,amount});}}return;}
        e.menderClock=Math.max(0,e.menderClock-dt);if(e.menderClock<=0&&this.menderTargets(e).length){e.menderIntent={remaining:.9,total:.9,radius:120};return;}
      }
      if(e.type==='pylon'){
        e.pylonLife=Math.max(0,e.pylonLife-dt);if(e.pylonLife<=0){e.dead=true;this.addEffect('pylonFade',e.x,e.y,35,'#ffc08a',.3);return;}
        if(e.pylonIntent){e.pylonIntent.remaining-=dt;if(e.pylonIntent.remaining<=0){e.pylonIntent=null;e.pylonClock=5;this.addHazard({kind:'reactor',shape:'circle',x:e.x,y:e.y,r:100,life:.45,damage:16});}return;}
        e.pylonClock=Math.max(0,e.pylonClock-dt);if(e.pylonClock<=0&&this.inView(e)){e.pylonIntent={remaining:1,total:1};return;}return;
      }
      if(e.type==='phaselet'&&this.inView(e)){
        if(e.phaseIntent){e.phaseIntent.remaining-=dt;if(e.phaseIntent.remaining<=0){const mark=e.phaseIntent;this.addEffect('phaseWarp',e.x,e.y,32,'#c1a3ff',.35);e.x=mark.x;e.y=mark.y;e.phaseIntent=null;e.phaseClock=4.5;e.stun=.65;this.addEffect('phaseWarp',e.x,e.y,38,'#c1a3ff',.35);}return;}
        e.phaseClock=Math.max(0,e.phaseClock-dt);if(e.phaseClock<=0){e.phaseIntent={x:clamp(p.x+(e.id%2?120:-120),35,this.width-35),y:clamp(p.y+(e.id%3?80:-80),75,this.height-65),remaining:.9,total:.9};return;}
      }
      if(e.type==='glacial'&&this.inView(e)){
        if(e.frostIntent){e.frostIntent.remaining-=dt;if(e.frostIntent.remaining<=0){e.frostIntent=null;e.frostClock=5;this.addHazard({kind:'ice',shape:'circle',x:e.x,y:e.y,r:95,warning:0,life:.45,damage:12,chill:2.2});}return;}
        e.frostClock=Math.max(0,e.frostClock-dt);if(e.frostClock<=0&&distance(p,e)<=150){e.frostIntent={remaining:.9,total:.9};return;}
      }
      if(e.elite&&this.updateElite(e,dt))return;
      if(e.type==='warden'){e.guardRemaining=Math.max(0,e.guardRemaining-dt);e.guardClock-=dt;if(e.guardClock<=0){e.guardRemaining=1.4;e.guardClock=4.8;}}
      if(e.type==='sentinel'){this.updateSentinel(e,dt,slow);return;}
      if(e.type==='boss'&&(e.intent||e.dashFrame))return;
      if(e.type==='charger'){
        if(e.chargeDash>0){e.x+=Math.cos(e.chargeAngle)*390*dt*slow;e.y+=Math.sin(e.chargeAngle)*390*dt*slow;e.chargeDash=Math.max(0,e.chargeDash-dt);return;}
        if(e.chargeWindup>0){e.chargeWindup-=dt;if(e.chargeWindup<=0)e.chargeDash=.55;return;}
        e.chargeClock-=dt;if(e.chargeClock<=0){e.chargeAngle=Math.atan2(p.y-e.y,p.x-e.x);e.chargeWindup=.75;e.chargeClock=3.6;this.emit('chargerWindup',{x:e.x,y:e.y});return;}
      }
      const d=distance(p,e),boost=e.type!=='boss'&&e.type!=='catalyst'&&catalysts.some(c=>c!==e&&distance(c,e)<=110)?1.25:1;
      const rage=e.type==='boss'&&e.enraged?1.12:1;
      if(d>0){e.x+=(p.x-e.x)/d*e.speed*boost*slow*rage*dt;e.y+=(p.y-e.y)/d*e.speed*boost*slow*rage*dt;}
    }
    segmentHit(x1,y1,x2,y2,target,r){const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy,t=length?clamp(((target.x-x1)*dx+(target.y-y1)*dy)/length,0,1):0;return Math.hypot(target.x-x1-t*dx,target.y-y1-t*dy)<=target.r+r;}
    fireArrows(){
      const p=this.player;if(this.state!=='playing'||!this.level('arrow')||this.level('arrow')===4)return;
      const targets=this.enemies.filter(e=>!e.dead&&this.inView(e)).sort((a,b)=>distance(p,a)-distance(p,b));
      if(!targets.length){p.arrowClock=.25;return;}
      for(let i=0;i<p.arrowShots;i++){const target=targets[i%targets.length],angle=Math.atan2(target.y-p.y,target.x-p.x)+(targets.length===1?(i-(p.arrowShots-1)/2)*.12:0);
        this.bullets.push({x:p.x,y:p.y,prevX:p.x,prevY:p.y,vx:Math.cos(angle)*900,vy:Math.sin(angle)*900,r:4,life:1.5,damage:p.damage*p.arrowDamageMultiplier,pierce:5,bounce:false,hits:new Set(),kind:'arrow',source:'arrow'});}
      p.arrowClock=p.arrowInterval;this.emit('arrows');
    }
    updateWhistle(dt){
      if(this.state!=='playing'||this.level('arrow')!==4)return;const p=this.player;
      if(!this.whistle)this.whistle={x:p.x,y:p.y,r:5,vx:1300,vy:0,goalX:p.x,goalY:p.y,goalActive:false,trail:[]};
      const a=this.whistle,oldX=a.x,oldY=a.y;
      if(!a.goalActive){const target=this.enemies.filter(e=>!e.dead&&this.inView(e)).sort((a,b)=>distance(this.whistle,a)-distance(this.whistle,b))[0];
        if(target){let angle=Math.atan2(target.y-a.y,target.x-a.x);a.goalX=clamp(target.x+Math.cos(angle)*80,10,this.width-10);a.goalY=clamp(target.y+Math.sin(angle)*80,60,this.height-50);if(Math.hypot(a.goalX-a.x,a.goalY-a.y)<1){angle+=Math.PI;a.goalX=clamp(target.x+Math.cos(angle)*80,10,this.width-10);a.goalY=clamp(target.y+Math.sin(angle)*80,60,this.height-50);}a.goalActive=true;}
      }
      if(a.goalActive){const d=Math.hypot(a.goalX-a.x,a.goalY-a.y),move=Math.min(d,1300*dt);if(d>0){a.x+=(a.goalX-a.x)/d*move;a.y+=(a.goalY-a.y)/d*move;}if(d<=move+.001)a.goalActive=false;}
      else{a.x=clamp(p.x+Math.cos(this.time*3)*65,10,this.width-10);a.y=clamp(p.y+Math.sin(this.time*3)*65,60,this.height-50);}
      a.vx=(a.x-oldX)/Math.max(dt,.001);a.vy=(a.y-oldY)/Math.max(dt,.001);a.trail.push({x:a.x,y:a.y});if(a.trail.length>16)a.trail.shift();
      for(const e of [...this.enemies])if(!e.dead&&this.time-(e.whistleHitAt??-Infinity)>=.25&&this.segmentHit(oldX,oldY,a.x,a.y,e,a.r)){e.whistleHitAt=this.time;this.hurt(e,p.damage*p.arrowDamageMultiplier,{source:'arrow'});if(this.state!=='playing')return;}
    }
    fireSaws(){
      if(this.state!=='playing'||!this.level('saw'))return;const p=this.player,targets=this.enemies.filter(e=>!e.dead&&this.inView(e)).sort((a,b)=>Number(b.type==='boss')-Number(a.type==='boss')||distance(p,a)-distance(p,b));
      if(!targets.length){p.sawClock=.25;return;}
      for(let i=0;i<p.sawShots&&this.saws.length<18;i++){const target=targets[i%targets.length],angle=Math.atan2(target.y-p.y,target.x-p.x)+(targets.length===1?(i-(p.sawShots-1)/2)*.12:0);
        this.saws.push({x:p.x,y:p.y,r:10,vx:Math.cos(angle)*620,vy:Math.sin(angle)*620,age:0,life:2.5,returning:false,burst:this.level('saw')===4,damage:p.damage*p.sawMultiplier,pulseRadius:105,pulseMultiplier:1,hits:new Set()});}
      p.sawClock=p.sawInterval;this.emit('saws');
    }
    updateSaws(dt){
      if(this.state!=='playing')return;const p=this.player;for(const saw of this.saws){if(saw.life<=0)continue;saw.age+=dt;saw.life-=dt;if(saw.life<=0)continue;const oldX=saw.x,oldY=saw.y;
        if(!saw.returning&&saw.age>=(saw.pulseRadius===undefined?.45:.55)){saw.returning=true;saw.hits.clear();}
        if(saw.returning){const speed=Math.max(900,p.speed*(p.ghostActive&&this.level('ghost')===4?2:1)*2.8),d=distance(p,saw),move=Math.min(d,speed*dt);saw.vx=d?(p.x-saw.x)/d*speed:0;saw.vy=d?(p.y-saw.y)/d*speed:0;saw.x+=d?(p.x-saw.x)/d*move:0;saw.y+=d?(p.y-saw.y)/d*move:0;}
        else{saw.x+=saw.vx*dt;saw.y+=saw.vy*dt;}
        for(const e of [...this.enemies])if(!e.dead&&!saw.hits.has(e.id)&&this.segmentHit(oldX,oldY,saw.x,saw.y,e,saw.r)){saw.hits.add(e.id);this.hurt(e,saw.damage,{source:'saw'});if(this.state!=='playing')return;}
        if(saw.returning&&distance(p,saw)<=p.r+saw.r){saw.life=0;if(saw.burst){const radius=saw.pulseRadius??75;this.addEffect('sawPulse',p.x,p.y,radius,'#f2df86',.35);for(const e of [...this.enemies])if(!e.dead&&distance(p,e)<=radius+e.r){this.hurt(e,saw.damage*(saw.pulseMultiplier??.6),{source:'saw'});if(this.state!=='playing')return;}}}
      }
      this.saws=this.saws.filter(s=>s.life>0);
    }
    addSporeZone(x,y,r=40,warning=1.2,life=3){
      if(this.sporeZones.length>=16)return;
      this.sporeZones.push({x:clamp(x,r,this.width-r),y:clamp(y,r,this.height-r),r,warning,life,tickClock:0});
    }
    updateSporeZones(dt){
      if(this.state!=='playing')return;
      for(const zone of this.sporeZones){if(zone.warning>0){zone.warning=Math.max(0,zone.warning-dt);continue;}zone.life-=dt;if(zone.life<=0)continue;zone.tickClock-=dt;if(zone.tickClock<=0){zone.tickClock=.2;if(distance(this.player,zone)<=zone.r)this.damagePlayer(9,'arenaSpores');if(this.state!=='playing')return;}}
      this.sporeZones=this.sporeZones.filter(zone=>zone.life>0);
    }
    throwFlasks(){
      if(this.state!=='playing'||!this.level('flask'))return;const p=this.player,targets=this.enemies.filter(e=>!e.dead&&this.inView(e)).sort((a,b)=>Number(b.type==='boss')-Number(a.type==='boss')||distance(p,a)-distance(p,b));if(!targets.length){p.flaskClock=.25;return;}
      for(let i=0;i<p.flaskShots&&this.flasks.length<15;i++){const target=targets[i%targets.length],offset=targets.length===1?(i-(p.flaskShots-1)/2)*28:0;this.flasks.push({x:p.x,y:p.y,r:7,startX:p.x,startY:p.y,goalX:clamp(target.x+offset,15,this.width-15),goalY:clamp(target.y,15,this.height-15),age:0,flight:.45,damage:p.damage*p.flaskMultiplier,blast:p.flaskRadius,acid:this.level('flask')===4,acidDamage:p.damage*1.8*(this.level('goldenDomain')||this.level('starfire')?.85:1),acidRadius:90,acidLife:4.5});}
      p.flaskClock=p.flaskInterval;this.emit('flasks');
    }
    updateFlasks(dt){
      if(this.state!=='playing')return;
      for(const flask of this.flasks){if(flask.age>=flask.flight)continue;flask.age=Math.min(flask.flight,flask.age+dt);const t=flask.age/flask.flight;flask.x=flask.startX+(flask.goalX-flask.startX)*t;flask.y=flask.startY+(flask.goalY-flask.startY)*t;if(t<1)continue;
        this.addEffect('flaskBurst',flask.x,flask.y,flask.blast,'#f7ca73',.4);if(flask.acid){if(this.acidPools.length>=12)this.acidPools.shift();this.acidPools.push({x:flask.x,y:flask.y,r:flask.acidRadius??65,life:flask.acidLife??3,tickClock:.2,damage:flask.acidDamage});}
        for(const enemy of [...this.enemies])if(!enemy.dead&&distance(enemy,flask)<=flask.blast+enemy.r){this.hurt(enemy,flask.damage,{source:'flask'});if(this.state!=='playing')return;}
      }this.flasks=this.flasks.filter(flask=>flask.age<flask.flight);
    }
    updateAcidPools(dt){
      if(this.state!=='playing')return;
      for(const pool of this.acidPools){pool.life-=dt;if(pool.life<=0)continue;pool.tickClock-=dt;if(pool.tickClock<=0){pool.tickClock+=.2;for(const enemy of [...this.enemies])if(!enemy.dead&&distance(enemy,pool)<=pool.r+enemy.r){this.hurt(enemy,pool.damage*.2,{source:'flask',label:false});if(this.state!=='playing')return;}}}this.acidPools=this.acidPools.filter(pool=>pool.life>0);
    }
    reactorShieldReduction(){return Math.min(.5,this.enemies.filter(e=>!e.dead&&e.type==='pylon'&&e.pylonLife>0).length*.15);}
    spawnPylons(count){
      for(let i=0;i<count&&this.minorCount()<this.stage().cap;i++){
        if(this.enemies.filter(e=>!e.dead&&e.type==='pylon').length>=(this.wave<=20?4:6))break;
        let x=this.width*(this.seq%2?.2:.8),y=this.height*(Math.floor(this.seq/2)%2?.3:.7);if(Math.hypot(x-this.player.x,y-this.player.y)<120){x=this.width-x;y=this.height-y;}this.createEnemy('pylon',x,y);
      }
    }
    spawnPurge(warning=3){
      if(this.hazards.length>20)return;
      for(let i=0;i<3;i++)this.addHazard({kind:'shelter',shape:'circle',x:this.width*(.25+i*.25),y:this.height*((this.arenaIndex+i)%2?.35:.65),r:95,life:warning+1.4});
      this.addHazard({kind:'purge',shape:'circle',x:this.width/2,y:this.height/2,r:Math.hypot(this.width,this.height),warning,life:.6,damage:28});
    }
    turretPosition(index){const p=this.player,a=this.time*.9+index/Math.max(1,p.turretCount)*TAU;return {x:p.x+Math.cos(a)*58,y:p.y+Math.sin(a)*58};}
    fireTurrets(){
      if(this.state!=='playing'||!this.level('turret'))return;const p=this.player,visible=this.enemies.filter(e=>!e.dead&&this.inView(e)),positions=Array.from({length:p.turretCount},(_,i)=>this.turretPosition(i));if(!positions.some(from=>visible.some(e=>distance(from,e)<=p.turretRange+e.r))){p.turretClock=.25;return;}
      p.turretClock=p.turretInterval;p.turretVolley=(p.turretVolley+1)%3;const piercing=this.level('turret')===4&&p.turretVolley===0;
      for(let i=0;i<p.turretCount;i++){const from=positions[i],target=visible.filter(e=>!e.dead&&distance(from,e)<=p.turretRange+e.r).sort((a,b)=>Number(b.type==='boss')-Number(a.type==='boss')||distance(from,a)-distance(from,b))[0];if(!target)continue;const angle=Math.atan2(target.y-from.y,target.x-from.x),dx=Math.cos(angle),dy=Math.sin(angle),damage=p.damage*p.turretMultiplier*(piercing?1.25:1);
        this.addEffect('turretLaser',piercing?from.x+dx*p.turretRange:target.x,piercing?from.y+dy*p.turretRange:target.y,piercing?10:4,'#fff1a8',.22,{fromX:from.x,fromY:from.y,piercing});
        if(piercing){for(const e of [...this.enemies]){if(e.dead)continue;const forward=(e.x-from.x)*dx+(e.y-from.y)*dy,side=Math.abs(-(e.x-from.x)*dy+(e.y-from.y)*dx);if(forward>=-e.r&&forward<=p.turretRange+e.r&&side<=10+e.r){this.hurt(e,damage,{source:'turret'});if(this.state!=='playing')return;}}}
        else{this.hurt(target,damage,{source:'turret'});if(this.state!=='playing')return;}
      }this.emit('turretFire');
    }
    spawnAnchor(){this.addHazard({kind:'anchor',shape:'circle',x:this.width*(this.arenaIndex%2?.25:.75),y:this.height*(this.arenaIndex%2?.4:.65),r:70,life:6});}
    castIon(){
      if(this.state!=='playing'||!this.level('ion'))return;const p=this.player,available=this.enemies.filter(e=>!e.dead&&this.inView(e)),hit=[],seen=new Set();let from=p;p.ionClock=p.ionInterval;
      for(let i=0;i<p.ionTargets;i++){const options=available.filter(e=>!e.dead&&!seen.has(e.id)&&(i===0?distance(p,e)<=600+e.r:distance(from,e)<=p.ionRange+e.r)).sort((a,b)=>(i===0?Number(b.type==='boss')-Number(a.type==='boss'):0)||distance(from,a)-distance(from,b)),target=options[0];if(!target)break;seen.add(target.id);hit.push(target);this.addEffect('ionLink',target.x,target.y,8,'#afc7ff',.3,{fromX:from.x,fromY:from.y});this.hurt(target,p.damage*p.ionMultiplier,{source:'ion'});if(this.state!=='playing')return;from=target;}
      p.ionClock=hit.length?p.ionInterval:.25;if(this.level('ion')===4)for(const target of hit)if(!target.dead){this.addEffect('ionLink',target.x,target.y,8,'#ede5ff',.35,{fromX:p.x,fromY:p.y});this.hurt(target,p.damage*p.ionMultiplier*.65,{source:'ion'});if(this.state!=='playing')return;}if(hit.length)this.emit('ionCast');
    }
    addHazard({kind,shape,x,y,r,inner=0,length=0,angle=0,warning=0,life=1,damage=0,chill=0}){
      if(this.hazards.length>=24)return;
      this.hazards.push({kind,shape,x,y,r,inner,length,angle,warning,total:warning,life,maxLife:life,damage,chill,tickClock:0});
    }
    hazardContains(hazard,point){
      const d=distance(hazard,point);if(hazard.shape==='circle')return d<=hazard.r;
      if(hazard.shape==='ring')return d>hazard.inner&&d<=hazard.r;
      const dx=point.x-hazard.x,dy=point.y-hazard.y;return Math.abs(dx*Math.cos(hazard.angle)+dy*Math.sin(hazard.angle))<=hazard.length&&Math.abs(-dx*Math.sin(hazard.angle)+dy*Math.cos(hazard.angle))<=hazard.r;
    }
    updateHazards(dt){
      if(this.state!=='playing')return;
      for(const hazard of this.hazards){
        if(hazard.kind==='shelter'){hazard.life-=dt;continue;}
        if(hazard.kind==='anchor'){hazard.life-=dt;if(hazard.life>0&&this.hazardContains(hazard,this.player)){hazard.life=0;this.player.fluxRemaining=5;this.recompute();this.emit('fluxBoost');}continue;}
        if(hazard.warning>0){hazard.warning=Math.max(0,hazard.warning-dt);continue;}
        const active=Math.min(dt,hazard.life);hazard.life-=dt;if(active<=0)continue;
        hazard.tickClock-=active;if(hazard.tickClock<=0){hazard.tickClock=.3;const sheltered=hazard.kind==='purge'&&this.hazards.some(h=>h.kind==='shelter'&&h.life>0&&this.hazardContains(h,this.player));if(!sheltered&&this.hazardContains(hazard,this.player)){const source=hazard.kind==='ice'?'iceHazard':hazard.kind==='rift'?'riftHazard':hazard.kind==='purge'?'reactorPurge':'reactorHazard',hit=this.damagePlayer(hazard.damage,source);if(hit&&hazard.chill)this.player.chillRemaining=Math.max(this.player.chillRemaining,hazard.chill);if(this.state!=='playing')return;}}
      }
      this.hazards=this.hazards.filter(hazard=>hazard.life>0);
    }
    fireRockets(){
      if(this.state!=='playing'||!this.level('rocket'))return;const p=this.player,targets=this.enemies.filter(e=>!e.dead&&this.inView(e)).sort((a,b)=>Number(b.type==='boss')-Number(a.type==='boss')||distance(p,a)-distance(p,b));
      if(!targets.length){p.rocketClock=.25;return;}
      p.rocketClock=p.rocketInterval;
      for(let i=0;i<p.rocketShots&&this.rockets.length<20;i++){const target=targets[i%targets.length],angle=Math.atan2(target.y-p.y,target.x-p.x)+(i-(p.rocketShots-1)/2)*.14;this.rockets.push({x:p.x,y:p.y,r:6,vx:Math.cos(angle)*680,vy:Math.sin(angle)*680,life:3,targetId:target.id,damage:p.damage*p.rocketMultiplier,blast:p.rocketRadius,echo:this.level('rocket')===4,phase:0,delay:0,trail:[]});}
      this.emit('rockets');
    }
    rocketBlast(rocket,echo=false){
      const radius=rocket.blast+(echo?25:0);this.addEffect('meteorEcho',rocket.x,rocket.y,radius,echo?'#ffe4c7':'#ff9c6b',echo?.35:.5);this.emit('rocketImpact',{x:rocket.x,y:rocket.y,echo});
      for(const e of [...this.enemies])if(!e.dead&&distance(e,rocket)<=radius+e.r){this.hurt(e,rocket.damage*(echo?.6:1),{source:'rocket'});if(this.state!=='playing')return;}
    }
    updateRockets(dt){
      if(this.state!=='playing')return;
      for(const rocket of this.rockets){if(rocket.phase===2)continue;rocket.life=Math.max(0,rocket.life-dt);if(rocket.life<=0){rocket.phase=2;continue;}
        if(rocket.phase===1){rocket.delay=Math.max(0,rocket.delay-dt);if(rocket.delay<=0){rocket.phase=2;this.rocketBlast(rocket,true);if(this.state!=='playing')return;}continue;}
        let target=this.enemies.find(e=>e.id===rocket.targetId&&!e.dead&&this.inView(e));if(!target){target=this.enemies.filter(e=>!e.dead&&this.inView(e)).sort((a,b)=>Number(b.type==='boss')-Number(a.type==='boss')||distance(rocket,a)-distance(rocket,b))[0];rocket.targetId=target?.id||0;}
        if(target){const angle=Math.atan2(rocket.vy,rocket.vx),goal=Math.atan2(target.y-rocket.y,target.x-rocket.x),next=angle+Math.atan2(Math.sin(goal-angle),Math.cos(goal-angle))*Math.min(1,dt*9);rocket.vx=Math.cos(next)*680;rocket.vy=Math.sin(next)*680;}
        const oldX=rocket.x,oldY=rocket.y,dx=rocket.vx*dt,dy=rocket.vy*dt,A=dx*dx+dy*dy;let first=2;
        for(const e of this.enemies){if(e.dead)continue;const ox=oldX-e.x,oy=oldY-e.y,B=2*(ox*dx+oy*dy),C=ox*ox+oy*oy-(e.r+rocket.r)**2,discriminant=B*B-4*A*C;const t=C<=0?0:A>0&&discriminant>=0?(-B-Math.sqrt(discriminant))/(2*A):2;if(t>=0&&t<=1&&t<first)first=t;}
        rocket.x=oldX+dx*Math.min(first,1);rocket.y=oldY+dy*Math.min(first,1);rocket.trail.push({x:rocket.x,y:rocket.y});if(rocket.trail.length>8)rocket.trail.shift();
        if(first<=1){rocket.phase=rocket.echo?1:2;rocket.delay=rocket.echo?.15:0;rocket.life=Math.max(rocket.life,.16);rocket.vx=rocket.vy=0;this.rocketBlast(rocket);if(this.state!=='playing')return;}
      }this.rockets=this.rockets.filter(rocket=>rocket.phase<2);
    }
    dropMeteors(){
      if(this.state!=='playing'||!this.level('meteor'))return;const p=this.player,targets=this.enemies.filter(e=>!e.dead&&this.inView(e)).sort((a,b)=>Number(b.type==='boss')-Number(a.type==='boss')||distance(p,a)-distance(p,b));
      if(!targets.length){p.meteorClock=.25;return;}
      for(let i=0;i<p.meteorShots&&this.meteors.length<21;i++){const target=targets[i%targets.length],offset=targets.length===1?(i-(p.meteorShots-1)/2)*32:0;this.meteors.push({x:clamp(target.x+offset,15,this.width-15),y:clamp(target.y,15,this.height-15),r:p.meteorRadius,age:0,delay:.65,phase:0,damage:p.damage*p.meteorMultiplier,echo:this.level('meteor')===4});}
      p.meteorClock=p.meteorInterval;this.emit('meteors');
    }
    updateMeteors(dt){
      if(this.state!=='playing')return;
      for(const meteor of this.meteors){meteor.age+=dt;
        if(meteor.phase===0&&meteor.age>=meteor.delay){meteor.phase=meteor.echo?1:2;this.addEffect('meteor',meteor.x,meteor.y,meteor.r,'#ffad78',.55);this.emit('meteorImpact',{x:meteor.x,y:meteor.y});for(const e of [...this.enemies])if(!e.dead&&distance(e,meteor)<=meteor.r+e.r){this.hurt(e,meteor.damage,{source:'meteor'});if(this.state!=='playing')return;}}
        if(meteor.phase===1&&meteor.age>=meteor.delay+.25){meteor.phase=2;this.addEffect('meteorEcho',meteor.x,meteor.y,meteor.r+25,'#ffe0ad',.4);for(const e of [...this.enemies])if(!e.dead&&distance(e,meteor)<=meteor.r+25+e.r){this.hurt(e,meteor.damage*.6,{source:'meteor'});if(this.state!=='playing')return;}}
      }
      this.meteors=this.meteors.filter(meteor=>meteor.phase<2);
    }
    tryBlink(dx,dy){
      const p=this.player;
      if(this.state!=='playing'||!this.level('blackholeKing')||p.blinkClock>0||!Number.isInteger(dx)||!Number.isInteger(dy)||Math.abs(dx)+Math.abs(dy)!==1)return false;
      const fromX=p.x,fromY=p.y,range=p.r*10;
      const x=clamp(p.x+dx*range,p.r+8,this.width-p.r-8),y=clamp(p.y+dy*range,p.r+56,this.height-p.r-50);
      if(Math.hypot(x-fromX,y-fromY)<.001)return false;
      p.x=x;p.y=y;p.blinkClock=2;p.invuln=Math.max(p.invuln,.2);
      this.addEffect('blink',x,y,24,'#d6a6ff',.55,{fromX,fromY});this.emit('blink');return true;
    }
    updateSentinel(e,dt,slow){
      const p=this.player,d=distance(e,p);if(!this.inView(e)){if(d){e.x+=(p.x-e.x)/d*e.speed*slow*dt;e.y+=(p.y-e.y)/d*e.speed*slow*dt;}return;}
      if(e.shotIntent){e.shotIntent.remaining-=dt;if(e.shotIntent.remaining>0)return;const angle=e.shotIntent.angle;e.shotIntent=null;e.shotClock=3.2;
        if(this.enemyShots.length<100)this.enemyShots.push({x:e.x,y:e.y,prevX:e.x,prevY:e.y,vx:Math.cos(angle)*220,vy:Math.sin(angle)*220,r:5,life:6,damage:14});return;}
      e.shotClock-=dt;if(e.shotClock<=0){e.shotIntent={angle:Math.atan2(p.y-e.y,p.x-e.x),remaining:1,total:1};return;}
      const direction=d>280?1:d<180?-1:0;if(d){e.x+=(p.x-e.x)/d*e.speed*slow*dt*direction;e.y+=(p.y-e.y)/d*e.speed*slow*dt*direction;}
    }
    updateEnemyShots(dt){
      for(const shot of this.enemyShots){shot.prevX=shot.x;shot.prevY=shot.y;shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;shot.life-=dt;
        if(this.segmentHit(shot.prevX,shot.prevY,shot.x,shot.y,this.player,shot.r)){shot.life=0;this.damagePlayer(shot.damage,'sentinelBolt');if(this.state!=='playing')return;}}
      this.enemyShots=this.enemyShots.filter(s=>s.life>0&&s.x>-30&&s.x<this.width+30&&s.y>-30&&s.y<this.height+30);
    }
    updateBullets(dt){
      for(const b of this.bullets){
        if(b.kind==='drone'){
          b.canCrit=this.hasSynergy('seeker');
          let target=this.enemies.find(e=>!e.dead&&e.id===b.targetId&&this.inView(e));
          if(!target){target=this.droneTargets()[0];if(target)b.targetId=target.id;}
          if(target){const angle=Math.atan2(target.y-b.y,target.x-b.x);b.vx=Math.cos(angle)*440;b.vy=Math.sin(angle)*440;}
        }
        b.prevX=b.x;b.prevY=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
        if(b.bounce){if(b.x<b.r||b.x>this.width-b.r){b.vx*=-1;b.x=clamp(b.x,b.r,this.width-b.r);b.prevX=b.x;}if(b.y<b.r||b.y>this.height-b.r){b.vy*=-1;b.y=clamp(b.y,b.r,this.height-b.r);b.prevY=b.y;}}
        const dx=b.x-b.prevX,dy=b.y-b.prevY,length=dx*dx+dy*dy;
        const collisions=[];
        for(const e of this.enemies){if(e.dead||!Number.isFinite(e.hp)||e.hp<=0||b.hits.has(e.id))continue;const t=length?clamp(((e.x-b.prevX)*dx+(e.y-b.prevY)*dy)/length,0,1):0;if(Math.hypot(e.x-(b.prevX+t*dx),e.y-(b.prevY+t*dy))<=b.r+e.r)collisions.push({e,t});}
        collisions.sort((a,c)=>a.t-c.t);
        for(const {e} of collisions){if(e.dead||e.hp<=0)continue;b.hits.add(e.id);const source=b.source||'bullet',canCrit=source==='bullet'||(source==='drone'&&this.hasSynergy('seeker')),critical=canCrit&&this.random()<this.player.crit;this.hurt(e,b.damage*(critical?this.player.critDamage:1),{angle:Math.atan2(b.vy,b.vx),knock:source!=='drone',critical,source});if(this.state!=='playing')return;if(b.hits.size>b.pierce){b.life=0;break;}}
      }
      this.bullets=this.bullets.filter(b=>b.life>0&&b.x>-60&&b.x<this.width+60&&b.y>-60&&b.y<this.height+60);
    }
    updateAura(dt){
      if(!this.player.auraRadius)return;this.auraClock-=dt;
      while(this.auraClock<=0){this.auraClock+=.1;for(const e of [...this.enemies]){
        const d=distance(this.player,e);if(e.dead||d>this.player.auraRadius)continue;
        const label=this.time-e.auraLabel>=.5;if(label)e.auraLabel=this.time;
        this.hurt(e,this.player.auraDamage*(1-.75*d/this.player.auraRadius)*.1,{label:false,source:'aura'});
        if(this.state!=='playing')return;
        if(label)this.emit('auraDamage',{x:e.x,y:e.y-8});
      }}
    }
    updateGems(dt){
      const p=this.player,moveSpeed=p.speed*(p.ghostActive&&this.level('ghost')===4?2:1);
      for(const g of this.gems){
        if(g.dead)continue;
        g.vx*=Math.exp(-5*dt);g.vy*=Math.exp(-5*dt);g.x+=g.vx*dt;g.y+=g.vy*dt;if(!g.attracted&&!g.magnetized)this.clampPickup(g);
        const d=distance(g,p);
        if(d<p.magnet)g.attracted=true;
        if(g.attracted||g.magnetized){const speed=g.magnetized?Math.max(900,moveSpeed*1.5,d*4):Math.max(moveSpeed*1.35,460*(1-d/p.magnet+.25)),step=Math.min(d,speed*dt);if(d>0){g.x+=(p.x-g.x)/d*step;g.y+=(p.y-g.y)/d*step;}}
        if(distance(g,p)<p.r+g.r+4){g.dead=true;this.addEnergy(g.value);this.emit('energy');if(this.maybeUpgrade())break;}
      }this.gems=this.gems.filter(g=>!g.dead);
    }
    step(dt,input={x:0,y:0}){
      if(this.state!=='playing')return;dt=clamp(dt,0,.1);if(!dt)return;
      if(this.maybeUpgrade())return;
      this.novaBursts=0;
      this.time+=dt;
      if(this.bossDue&&this.time>=this.bossDue.at)this.spawnBoss(this.bossDue.stage);
      const p=this.player;this.updateGhost(dt);
      if(p.fluxRemaining>0){p.fluxRemaining=Math.max(0,p.fluxRemaining-dt);if(p.fluxRemaining===0)this.recompute();}
      p.overloadRemaining=Math.max(0,p.overloadRemaining-dt);p.overloadCooldown=Math.max(0,p.overloadCooldown-dt);p.blinkClock=Math.max(0,p.blinkClock-dt);p.chillRemaining=Math.max(0,p.chillRemaining-dt);
      p.criticalHits=p.criticalHits.filter(at=>this.time-at<=2);this.updateShield(dt);
      const x=Number.isFinite(input.x)?input.x:0,y=Number.isFinite(input.y)?input.y:0,magnitude=Math.max(1,Math.hypot(x,y));
      const speed=p.speed*(p.ghostActive&&this.level('ghost')===4?2:1)*(p.chillRemaining>0?.75:1);
      const oldX=p.x,oldY=p.y;
      p.x=clamp(p.x+x/magnitude*speed*dt,p.r+8,this.width-p.r-8);p.y=clamp(p.y+y/magnitude*speed*dt,p.r+56,this.height-p.r-50);p.invuln=Math.max(0,p.invuln-dt);
      this.phaseTrace(oldX,oldY,p.x,p.y);if(this.state!=='playing')return;
      this.updatePortals(dt);
      if(this.mode!=='practice'){this.spawnClock-=dt;if(this.spawnClock<=0){this.spawnEnemy();this.spawnClock=this.stage().interval;}}
      p.fireClock-=dt;if(p.fireClock<=0)this.shoot();
      if(this.level('rate')===4){p.ringClock-=dt;if(p.ringClock<=0){this.ringShot();p.ringClock+=5;}}
      if(this.level('lightning')){p.lightningClock-=dt;if(p.lightningClock<=0)this.lightning();}
      if(this.state!=='playing')return;
      if(this.level('mine')){p.mineClock-=dt;if(p.mineClock<=0)this.layMine();}
      if(this.level('frost')){p.frostClock-=dt;if(p.frostClock<=0)this.frostPulse();}if(this.state!=='playing')return;
      if(this.level('drone')){p.droneClock-=dt;if(p.droneClock<=0)this.fireDrones();}
      if(this.level('well')){p.wellClock-=dt;if(p.wellClock<=0)this.spawnWell();}
      if(this.level('beam')){p.beamClock-=dt;if(p.beamClock<=0)this.fireBeam();}if(this.state!=='playing')return;
      if(this.level('arrow')&&this.level('arrow')<4){p.arrowClock-=dt;if(p.arrowClock<=0)this.fireArrows();}
      if(this.level('saw')){p.sawClock-=dt;if(p.sawClock<=0)this.fireSaws();}
      this.updateSaws(dt);if(this.state!=='playing')return;
      if(this.level('flask')){p.flaskClock-=dt;if(p.flaskClock<=0)this.throwFlasks();}
      this.updateFlasks(dt);if(this.state!=='playing')return;
      this.updateAcidPools(dt);if(this.state!=='playing')return;
      if(this.level('meteor')){p.meteorClock-=dt;if(p.meteorClock<=0)this.dropMeteors();}
      this.updateMeteors(dt);if(this.state!=='playing')return;
      if(this.level('ion')){p.ionClock-=dt;if(p.ionClock<=0)this.castIon();}if(this.state!=='playing')return;
      if(this.level('turret')){p.turretClock-=dt;if(p.turretClock<=0)this.fireTurrets();}if(this.state!=='playing')return;
      if(this.level('rocket')){p.rocketClock-=dt;if(p.rocketClock<=0)this.fireRockets();}this.updateRockets(dt);if(this.state!=='playing')return;
      this.updateWhistle(dt);if(this.state!=='playing')return;
      this.updateBullets(dt);if(this.state!=='playing')return;
      this.updateAura(dt);if(this.state!=='playing')return;
      this.updateMines(dt);if(this.state!=='playing')return;
      this.updateWells(dt);if(this.state!=='playing')return;
      this.updateBossAttack(dt);if(this.state!=='playing')return;
      this.updateArena(dt);if(this.state!=='playing')return;
      this.updateSporeZones(dt);if(this.state!=='playing')return;
      this.updateHazards(dt);if(this.state!=='playing')return;
      const catalysts=this.enemies.filter(e=>!e.dead&&e.type==='catalyst');
      for(const e of this.enemies){
        if(e.dead)continue;e.phase+=dt*2;e.hit=Math.max(0,e.hit-dt);
        this.moveEnemy(e,dt,catalysts);
        if(e.dead)continue;
        if(distance(p,e)<p.r+e.r)this.damagePlayer(e.type==='boss'?28:e.type==='tank'?19:12,e.type==='boss'?(e.dashFrame?'bossDash':'bossContact'):e.type);
        if(this.state!=='playing')return;
      }
      this.updateEnemyShots(dt);if(this.state!=='playing')return;
      this.updateOrbits();
      if(this.state!=='playing')return;
      this.enemies=this.enemies.filter(e=>!e.dead);
      for(const item of this.items){item.life-=dt;if(!item.dead&&item.life>0){this.clampPickup(item);if(distance(item,p)<=item.r+p.r)this.useItem(item);}}
      this.items=this.items.filter(i=>!i.dead&&i.life>0);
      this.updateGems(dt);if(this.state!=='playing')return;
      for(const e of this.effects)e.life-=dt;this.effects=this.effects.filter(e=>e.life>0);
      this.comboTimer-=dt;if(this.comboTimer<=0)this.combo=Math.max(1,this.combo-dt*2);
    }
    finish(won){if(this.state==='ended')return;for(const b of this.stats.bosses)if(b.duration===null)b.duration=Math.max(0,this.time-b.startedAt);this.won=won;this.state='ended';this.emit('end',{won});}
    report(){
      const records=Object.entries(this.stats.damage),totalDamage=records.reduce((sum,[,value])=>sum+value.damage,0),bossDamage=records.reduce((sum,[,value])=>sum+value.bossDamage,0);
      return {totalDamage,bossDamage,damageTaken:this.stats.damageTaken,blockedDamage:this.stats.blockedDamage,revivals:this.player.revivalUsed,
        damage:records.filter(([,value])=>value.damage>0).map(([id,value])=>({id,name:DAMAGE_SOURCES[id],damage:value.damage,bossDamage:value.bossDamage,share:totalDamage?value.damage/totalDamage:0})).sort((a,b)=>b.damage-a.damage),
        bosses:this.stats.bosses.map(b=>({stage:b.stage,name:b.name,hp:this.boss?.bossStage===b.stage?this.boss.hp:b.hp,maxHp:b.maxHp,duration:b.duration===null?Math.max(0,this.time-b.startedAt):b.duration,killed:b.killed})),
        death:this.stats.death?{...this.stats.death,recent:this.stats.death.recent.map(hit=>({...hit}))}:null};
    }
    snapshot(){return {state:this.state,mode:this.mode,practiceConfig:practiceConfigSnapshot(this.practiceConfig),upgrades:this.upgrades,level:this.upgrades,wave:this.wave,maxLevel:RUN_UPGRADES,time:this.time,kills:this.kills,hp:this.player.hp,maxHp:this.player.maxHp,xp:this.player.xp,nextXp:this.nextXp,slots:this.owned.length,maxSlots:MAX_SLOTS,rerollsRemaining:this.rerollsRemaining,blinkCooldown:this.player.blinkClock,shieldCharges:this.player.shieldCharges,overloadRemaining:this.player.overloadRemaining,report:this.report(),build:{...this.player.build},synergies:this.synergies.map(s=>s.id),catalyst:this.catalyst,catalystOptions:[...this.catalystOptions],attackBonus:this.player.attackBonus,bossesSpawned:[...this.bossesSpawned],bossesDefeated:[...this.bossesDefeated],boss:this.boss?{stage:this.boss.bossStage,name:this.boss.name,hp:this.boss.hp,maxHp:this.boss.maxHp,enraged:this.boss.enraged,intent:this.boss.intent?.kind||null}:null,bossDue:this.bossDue?{stage:this.bossDue.stage,name:this.bossDue.name||BOSS_MILESTONES.find(m=>m.stage===this.bossDue.stage)?.name,seconds:Math.max(0,this.bossDue.at-this.time)}:null,options:[...this.options],lottery:this.lottery};}
  }
  function practiceConfigSnapshot(config){return config?{...config,...(config.customSkills?{customSkills:[...config.customSkills]}:{})}:null;}
  function createPracticeGame({stage=1,buildId='hunter',customSkills,customCatalyst=null,customFusion=null,width=960,height=640,random=Math.random,campaignLevel=1}={}){
    const milestone=BOSS_MILESTONES.find(b=>b.stage===stage);
    let build=PRACTICE_BUILDS.find(b=>b.id===buildId);
    if(buildId==='custom'){
      if(!Array.isArray(customSkills)||customSkills.length<1||customSkills.length>MAX_SLOTS||new Set(customSkills).size!==customSkills.length||customSkills.some(id=>typeof id!=='string'||!Object.hasOwn(BY_ID,id)||BY_ID[id].fusion))throw new Error('自选练习需1至8种不同基础技能');
      if(customCatalyst!==null&&(typeof customCatalyst!=='string'||!Object.hasOwn(BY_CATALYST,customCatalyst)||BY_CATALYST[customCatalyst].skill&&!customSkills.includes(BY_CATALYST[customCatalyst].skill)))throw new Error('自选催化不适用于当前技能');
      if(customFusion!==null){const recipe=FUSIONS.find(f=>f.id===customFusion);if(stage!==3||!recipe||recipe.requires.some(id=>!customSkills.includes(id)))throw new Error('练习合体需最终首领及两项组成技能');}
      build={skills:[...customSkills],catalyst:customCatalyst};
    }
    if(!milestone||!Number.isInteger(stage)||!build||!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0||typeof random!=='function')throw new Error('首领练习配置无效');
    const game=new Game({width,height,random,campaignLevel}),tier=stage+1;
    game.mode='practice';game.practice=true;game.practiceConfig={stage,buildId,tier,...(buildId==='custom'?{customSkills:[...build.skills],customCatalyst,customFusion}:{})};game.upgrades=milestone.upgrade;game.rerollsRemaining=0;
    for(const id of build.skills)for(let level=0;level<tier;level++)game.advanceSkill(id);
    if(customFusion&&buildId==='custom')game.advanceSkill(customFusion);
    if(build.catalyst)game.equipCatalyst(build.catalyst);game.player.hp=game.player.maxHp;
    game.player.shieldCharges=game.player.shieldMaxCharges;game.player.shieldClock=game.player.shieldInterval;
    const selectedMilestone=game.bossMilestone(stage);game.events=[];game.bossDue={...selectedMilestone,warning:3,at:3};
    game.emit('bossWarning',{stage,name:selectedMilestone.name,seconds:3,upgrade:milestone.upgrade});
    return game;
  }
  const RUN_HISTORY_LIMIT=10;
  const HISTORY_SCAN_LIMIT=40;
  const HISTORY_JSON_LIMIT=131072;
  const HISTORY_SYNERGIES=Object.fromEntries(SYNERGIES.map(s=>[s.id,true]));
  const HISTORY_BOSSES=Object.fromEntries(BOSS_MILESTONES.map(b=>[b.stage,true]));
  const historyRecordIds=new WeakMap();
  let historySequence=0;
  const ownId=(table,id)=>typeof id==='string'&&Object.hasOwn(table,id);
  const historyNumber=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const historyInteger=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
  const historyObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  function sanitizeRunRecord(raw){
    try{
      if(!historyObject(raw)||typeof raw.id!=='string'||!/^run-\d{1,15}-\d{1,12}$/.test(raw.id)||!historyInteger(raw.at,0,253402300799999)||typeof raw.version!=='string'||!/^v\d{1,4}$/.test(raw.version)||typeof raw.won!=='boolean')return null;
      if(raw.campaignLevel!==undefined&&!historyInteger(raw.campaignLevel,1,CAMPAIGN_LEVELS.length))return null;
      if(!historyInteger(raw.level,0,RUN_UPGRADES)||!historyInteger(raw.wave,1,RUN_UPGRADES)||!historyInteger(raw.kills,0,Number.MAX_SAFE_INTEGER))return null;
      for(const key of ['time','totalDamage','bossDamage','damageTaken','blockedDamage'])if(!historyNumber(raw[key]))return null;
      if(raw.bossDamage>raw.totalDamage)return null;
      if(!Array.isArray(raw.skills)||raw.skills.length>MAX_SLOTS||!Array.isArray(raw.synergies)||raw.synergies.length>SYNERGIES.length||!Array.isArray(raw.damage)||raw.damage.length>Object.keys(DAMAGE_SOURCES).length||!Array.isArray(raw.bosses)||raw.bosses.length>BOSS_MILESTONES.length)return null;
      const skills=[],skillIds=new Set();
      for(const row of raw.skills){
        if(!historyObject(row)||!ownId(BY_ID,row.id)||!historyInteger(row.level,1,4)||skillIds.has(row.id))return null;
        skills.push({id:row.id,level:row.level});skillIds.add(row.id);
      }
      if(raw.catalyst!==null&&!ownId(BY_CATALYST,raw.catalyst))return null;
      const synergies=[],synergyIds=new Set();
      for(const id of raw.synergies){if(!ownId(HISTORY_SYNERGIES,id)||synergyIds.has(id))return null;synergies.push(id);synergyIds.add(id);}
      const damage=[],damageIds=new Set();
      for(const row of raw.damage){
        if(!historyObject(row)||!ownId(DAMAGE_SOURCES,row.id)||!historyNumber(row.damage)||!historyNumber(row.bossDamage)||row.bossDamage>row.damage||damageIds.has(row.id))return null;
        damage.push({id:row.id,damage:row.damage,bossDamage:row.bossDamage});damageIds.add(row.id);
      }
      const bosses=[],bossIds=new Set();
      for(const row of raw.bosses){
        if(!historyObject(row)||!historyInteger(row.stage,1,BOSS_MILESTONES.length)||!Object.hasOwn(HISTORY_BOSSES,row.stage)||!historyNumber(row.hp)||!historyNumber(row.maxHp)||row.maxHp===0||row.hp>row.maxHp||!historyNumber(row.duration)||typeof row.killed!=='boolean'||bossIds.has(row.stage))return null;
        bosses.push({stage:row.stage,hp:row.hp,maxHp:row.maxHp,duration:row.duration,killed:row.killed});bossIds.add(row.stage);
      }
      if(raw.deathSource!==null&&!ownId(PLAYER_DAMAGE_NAMES,raw.deathSource))return null;
      const equipment=raw.equipment===undefined?undefined:validateEquipmentLoadout(raw.equipment);
      return {id:raw.id,at:raw.at,version:raw.version,won:raw.won,...(raw.campaignLevel===undefined?{}:{campaignLevel:raw.campaignLevel}),...(equipment===undefined?{}:{equipment}),level:raw.level,wave:raw.wave,time:raw.time,kills:raw.kills,totalDamage:raw.totalDamage,bossDamage:raw.bossDamage,damageTaken:raw.damageTaken,blockedDamage:raw.blockedDamage,skills,catalyst:raw.catalyst,synergies,damage,bosses,deathSource:raw.deathSource};
    }catch{return null;}
  }
  function sanitizeRunHistory(raw){
    const empty=()=>({schema:1,records:[]});
    try{
      if(typeof raw==='string'){if(raw.length>HISTORY_JSON_LIMIT)return empty();raw=JSON.parse(raw);}
      if(!historyObject(raw)||raw.schema!==1||!Array.isArray(raw.records)||raw.records.length>HISTORY_SCAN_LIMIT)return empty();
      const records=[],ids=new Set();
      for(let i=0;i<raw.records.length;i++){
        const record=sanitizeRunRecord(raw.records[i]);if(!record||ids.has(record.id))continue;
        records.push({record,index:i});ids.add(record.id);
      }
      records.sort((a,b)=>b.record.at-a.record.at||a.index-b.index);
      return {schema:1,records:records.slice(0,RUN_HISTORY_LIMIT).map(entry=>entry.record)};
    }catch{return empty();}
  }
  function createRunRecord(game,{at,version}={}){
    try{
      if(!game||game.state!=='ended'||(game.mode!==undefined&&game.mode!=='normal')||typeof game.won!=='boolean')return null;
      if(!historyInteger(at,0,253402300799999)||typeof version!=='string'||!/^v\d{1,4}$/.test(version))return null;
      const snapshot=game.snapshot(),report=game.report(),build=Object.entries(snapshot.build);
      if(build.length>MAX_SLOTS)return null;
      const id=historyRecordIds.get(game)||`run-${at}-${historySequence+1}`;
      const record=sanitizeRunRecord({id,at,version,won:game.won,campaignLevel:game.campaignLevel||1,level:snapshot.level,wave:snapshot.wave,time:snapshot.time,kills:snapshot.kills,totalDamage:report.totalDamage,bossDamage:report.bossDamage,damageTaken:report.damageTaken,blockedDamage:report.blockedDamage,
        ...(game.equipment?{equipment:game.equipment}:{}),skills:build.map(([id,level])=>({id,level})),catalyst:snapshot.catalyst,synergies:snapshot.synergies,damage:report.damage,bosses:report.bosses,deathSource:report.death?.source||null});
      if(record&&!historyRecordIds.has(game)){historySequence++;historyRecordIds.set(game,id);}
      return record;
    }catch{return null;}
  }
  function appendRunHistory(records,record){
    const current=sanitizeRunHistory({schema:1,records}).records,next=sanitizeRunRecord(record);
    if(!next||current.some(item=>item.id===next.id))return current;
    return sanitizeRunHistory({schema:1,records:[next,...current]}).records;
  }
  function summarizeRunHistory(records){
    const current=sanitizeRunHistory({schema:1,records}).records;
    let wins=0,highestCompletedWave=0,fastestWin=null,highestDamage=0;
    for(const record of current){
      highestCompletedWave=Math.max(highestCompletedWave,record.level);highestDamage=Math.max(highestDamage,record.totalDamage);
      if(record.won){wins++;fastestWin=fastestWin===null?record.time:Math.min(fastestWin,record.time);}
    }
    return {count:current.length,wins,highestCompletedWave,fastestWin,highestDamage};
  }
  const api={Game,SKILLS,BY_ID,SYNERGIES,CATALYSTS,BY_CATALYST,DAMAGE_SOURCES,PLAYER_DAMAGE_NAMES,MAX_SLOTS,RUN_UPGRADES,BOSS_MILESTONES,CAMPAIGN_LEVELS,STAGES,BASE_ENEMIES,distance,RUN_HISTORY_LIMIT,createRunRecord,sanitizeRunHistory,appendRunHistory,summarizeRunHistory,PRACTICE_BUILDS,createPracticeGame,EQUIPMENT_SLOTS,EQUIPMENT,BY_EQUIPMENT,EQUIPMENT_COSTS,createEquipmentProfile,validateEquipmentProfile,equipmentLoadout,equipmentBonuses,upgradeEquipment,equipEquipment,claimEquipmentRewards};
  const SAVE_OMIT=new Set(['random','effects','events','boss','revision']);
  function portableHistory(raw){
    if(!raw||raw.schema!==1||!Array.isArray(raw.records)||raw.records.length>RUN_HISTORY_LIMIT)throw new Error('存档结算档案异常');
    const history=sanitizeRunHistory(raw);if(history.records.length!==raw.records.length)throw new Error('存档含损坏或重复的结算记录');return history;
  }
  function parseSaveText(text){
    if(typeof text!=='string'||text.length>2000000)throw new Error('存档过大或格式不正确');
    let nodes=0;const validate=(value,depth=0,inHistory=false)=>{if(++nodes>150000||depth>20)throw new Error('存档结构过于复杂');if(typeof value==='number'&&(!Number.isFinite(value)||Math.abs(value)>(inHistory?253402300799999:1e12)))throw new Error('存档数值异常');if(typeof value==='string'&&value.length>1000)throw new Error('存档文本异常');if(value&&typeof value==='object'){if(Array.isArray(value)&&value.length>10000)throw new Error('存档对象过多');for(const [key,item]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw new Error('存档字段异常');validate(item,depth+1,inHistory||depth===0&&key==='history');}}};
    const raw=JSON.parse(text);validate(raw);return raw;
  }
  function exportProgressSave({unlocked,profile,history={schema:1,records:[]},selected=unlocked}){
    if(!Number.isInteger(unlocked)||unlocked<1||unlocked>CAMPAIGN_LEVELS.length||!Number.isInteger(selected)||selected<1||selected>unlocked)throw new Error('全局关卡进度异常');
    return JSON.stringify({format:'neon-progress',schema:1,unlocked,selected,profile:validateEquipmentProfile(profile),history:portableHistory(history)},null,2);
  }
  function importGameSave(text,options={}){
    const raw=parseSaveText(text);if(raw?.format==='neon-run')return {...importRunSave(text,options),kind:'run'};
    if(!raw||raw.format!=='neon-progress'||raw.schema!==1||Object.keys(raw).length!==6||!Number.isInteger(raw.unlocked)||raw.unlocked<1||raw.unlocked>CAMPAIGN_LEVELS.length||!Number.isInteger(raw.selected)||raw.selected<1||raw.selected>raw.unlocked)throw new Error('不支持此全局存档');
    const profile=validateEquipmentProfile(raw.profile),history=portableHistory(raw.history);
    return {kind:'progress',game:null,unlocked:raw.unlocked,selected:raw.selected,profile,history};
  }
  function exportRunSave(game,unlocked=game.campaignLevel,profile=null,history=null){
    if(game.mode!=='normal'||!['playing','paused','upgrade','catalyst','lottery'].includes(game.state))throw new Error('只能保存尚未结束的正式实验');
    const data=Object.fromEntries(Object.entries(game).filter(([key])=>!SAVE_OMIT.has(key)));
    return JSON.stringify({format:'neon-run',schema:1,runUpgrades:RUN_UPGRADES,unlocked,...(profile?{profile:validateEquipmentProfile(profile)}:{}),...(history?{history:portableHistory(history)}:{}),data,bossId:game.boss?.id||null},(key,value)=>value instanceof Set?{savedHits:[...value]}:value===-Infinity?{negativeInfinity:true}:value,2);
  }
  function importRunSave(text,{random=Math.random}={}){
    const raw=parseSaveText(text),d=raw.data;
    if(raw.format!=='neon-run'||raw.schema!==1||!d||d.mode!=='normal'||d.practice||!['playing','paused','upgrade','catalyst','lottery'].includes(d.state)||!Number.isInteger(raw.unlocked)||raw.unlocked<d.campaignLevel||raw.unlocked>CAMPAIGN_LEVELS.length)throw new Error('不支持此存档');
    if(raw.runUpgrades!==undefined&&raw.runUpgrades!==RUN_UPGRADES)throw new Error('存档升级上限不兼容');
    // v17 and earlier saves have no runUpgrades marker. Preserve early progress, but
    // never reinterpret an already-started LV.30 final battle as a LV.40 victory.
    if(raw.runUpgrades===undefined){
      if(d.bossesSpawned?.includes(3)||d.bossesDefeated?.includes(3)||d.finalBossSpawned||d.lottery?.bossStage===3)throw new Error('旧版最终战存档请用原版离线包继续；新版最终战在LV.40，未覆盖当前进度');
      if(d.bossDue?.stage===3)d.bossDue=null;
    }
    const game=new Game({width:d.width,height:d.height,campaignLevel:d.campaignLevel,random});
    for(const key of ['flasks','acidPools','sporeZones','hazards','meteors'])if(d[key]===undefined)d[key]=[];
    if(d.rockets===undefined)d.rockets=[];for(const key of ['rocketClock','rocketInterval','rocketShots','rocketRadius','rocketMultiplier'])if(d.player&&d.player[key]===undefined)d.player[key]=game.player[key];if(d.stats?.damage&&!Object.hasOwn(d.stats.damage,'rocket'))d.stats.damage.rocket={damage:0,bossDamage:0};
    for(const key of ['meteorClock','meteorInterval','meteorShots','meteorRadius','meteorMultiplier','chillRemaining'])if(d.player&&d.player[key]===undefined)d.player[key]=game.player[key];
    for(const key of ['ionClock','ionInterval','ionTargets','ionRange','ionMultiplier','fluxRemaining'])if(d.player&&d.player[key]===undefined)d.player[key]=game.player[key];
    for(const key of ['turretClock','turretInterval','turretCount','turretRange','turretMultiplier','turretVolley'])if(d.player&&d.player[key]===undefined)d.player[key]=game.player[key];
    if(d.stats?.damage&&!Object.hasOwn(d.stats.damage,'turret'))d.stats.damage.turret={damage:0,bossDamage:0};
    if(d.stats?.damage&&!Object.hasOwn(d.stats.damage,'ion'))d.stats.damage.ion={damage:0,bossDamage:0};
    if(d.stats?.damage&&!Object.hasOwn(d.stats.damage,'meteor'))d.stats.damage.meteor={damage:0,bossDamage:0};
    for(const key of ['flaskClock','flaskInterval','flaskShots','flaskRadius','flaskMultiplier'])if(d.player&&d.player[key]===undefined)d.player[key]=game.player[key];
    if(d.stats?.damage&&!Object.hasOwn(d.stats.damage,'flask'))d.stats.damage.flask={damage:0,bossDamage:0};
    const profile=raw.profile===undefined?null:validateEquipmentProfile(raw.profile);
    const history=raw.history===undefined?null:portableHistory(raw.history);
    if(d.equipment===undefined)d.equipment={};else d.equipment=validateEquipmentLoadout(d.equipment);
    for(const key of ['damageReduction','pillBonus'])if(d.player&&d.player[key]===undefined)d.player[key]=game.player[key];
    for(const key of ['bossDamageBonus','revivalHeal','revivalCharges','revivalUsed'])if(d.player&&d.player[key]===undefined)d.player[key]=0;
    if(d.enemyShots===undefined)d.enemyShots=[];if(d.whistle===undefined)d.whistle=null;
    if(d.saws===undefined)d.saws=[];
    for(const key of ['sawClock','sawInterval','sawShots','sawMultiplier'])if(d.player&&d.player[key]===undefined)d.player[key]=game.player[key];
    if(d.stats?.damage&&!Object.hasOwn(d.stats.damage,'saw'))d.stats.damage.saw={damage:0,bossDamage:0};
    for(const key of ['arrowClock','arrowInterval','arrowShots','arrowDamageMultiplier','blinkClock'])if(d.player&&d.player[key]===undefined)d.player[key]=game.player[key];
    if(d.stats?.damage&&!Object.hasOwn(d.stats.damage,'arrow'))d.stats.damage.arrow={damage:0,bossDamage:0};
    if(d.portals===undefined)d.portals=game.portals;if(d.portalCooldown===undefined)d.portalCooldown=0;if(d.portalBlocked===undefined)d.portalBlocked=false;
    for(const key of Object.keys(d))if(!Object.hasOwn(game,key)||SAVE_OMIT.has(key))throw new Error('未知存档字段');
    if(!Number.isFinite(d.width)||d.width<100||d.width>10000||!Number.isFinite(d.height)||d.height<100||d.height>10000||!Number.isInteger(d.upgrades)||d.upgrades<0||d.upgrades>RUN_UPGRADES||!d.player||typeof d.player.build!=='object'||Array.isArray(d.player.build)||Object.keys(d.player.build).length>MAX_SLOTS)throw new Error('存档进度异常');
    if(!Number.isSafeInteger(d.seq)||d.seq<0||!Number.isSafeInteger(d.kills)||d.kills<0||!Number.isFinite(d.time)||d.time<0||!Number.isInteger(d.rerollsRemaining)||d.rerollsRemaining<0||d.rerollsRemaining>2+equipmentBonuses(d.equipment).rerolls)throw new Error('实验计数或重抽次数异常');
    if(d.player.blinkClock<0||d.player.blinkClock>2)throw new Error('瞬移冷却异常');
    if(![0,1].includes(d.player.revivalCharges)||![0,1].includes(d.player.revivalUsed)||d.player.revivalCharges+d.player.revivalUsed>1||(d.player.revivalCharges||d.player.revivalUsed)&&!equipmentBonuses(d.equipment).revive)throw new Error('复苏次数异常');
    for(const [id,level]of Object.entries(d.player.build))if(!Object.hasOwn(BY_ID,id)||!Number.isInteger(level)||level<1||level>4)throw new Error('存档技能异常');
    for(const fusion of FUSIONS)if(d.player.build[fusion.id]&&(d.player.build[fusion.id]!==4||fusion.requires.some(id=>d.player.build[id])))throw new Error('合体构筑异常');
    const components=FUSIONS.filter(f=>d.player.build[f.id]).flatMap(f=>f.requires);if(new Set(components).size!==components.length)throw new Error('合体配方冲突');
    if(d.portalCooldown<0||d.portalCooldown>3||d.portals.length!==(d.campaignLevel===4?2:0)||d.portals.some(g=>!g||typeof g.x!=='number'||typeof g.y!=='number'||g.r!==23))throw new Error('传送门状态异常');
    for(const key of Object.keys(d.player))if(!Object.hasOwn(game.player,key))throw new Error('未知角色字段');
    for(const key of Object.keys(game)){if(SAVE_OMIT.has(key))continue;if(!Object.hasOwn(d,key)||(key!=='catalyst'&&typeof d[key]!==typeof game[key])||Array.isArray(game[key])&&!Array.isArray(d[key]))throw new Error('存档字段缺失');}
    for(const key of Object.keys(game.player))if(!Object.hasOwn(d.player,key)||typeof d.player[key]!==typeof game.player[key])throw new Error('角色字段缺失');
    for(const list of ['enemies','bullets','gems','items','mines','gravityWells'])for(const e of d[list])if(!e||typeof e.x!=='number'||typeof e.y!=='number'||typeof e.r!=='number'||e.r<0)throw new Error('战场对象异常');
    for(const e of d.enemies)if(e.type!=='boss'&&!Object.hasOwn(BASE_ENEMIES,e.type)||e.type==='boss'&&![1,2,3].includes(e.bossStage))throw new Error('未知敌人');
    const numbers=(object,keys)=>{for(const key of keys)if(!Number.isFinite(object[key]))throw new Error('战场数值缺失或非有限');};
    if(!Number.isFinite(d.player.chillRemaining)||d.player.chillRemaining<0||d.player.chillRemaining>2.2||!Number.isFinite(d.player.fluxRemaining)||d.player.fluxRemaining<0||d.player.fluxRemaining>5||!Number.isInteger(d.player.turretVolley)||d.player.turretVolley<0||d.player.turretVolley>2)throw new Error('寒滞、相位增幅或炮台轮次异常');
    if(!Array.isArray(d.hazards)||d.hazards.length>24||!Array.isArray(d.meteors)||d.meteors.length>21)throw new Error('断层或陨星数量异常');
    for(const h of d.hazards){numbers(h,['x','y','r','inner','length','angle','warning','total','life','maxLife','damage','chill','tickClock']);if(!['circle','ring','strip'].includes(h.shape)||h.r<=0||h.r>(h.kind==='purge'?15000:210)||h.inner<0||h.inner>=h.r||h.length<0||h.length>15000||h.warning<0||h.warning>h.total||h.total<0||h.total>3||h.life<0||h.life>h.maxLife||h.maxLife<=0||h.maxLife>6||h.chill<0||h.chill>2.2||h.tickClock<0||h.tickClock>.3)throw new Error('危险区几何或时间异常');
      if(h.kind==='ice'){if(d.campaignLevel!==8||h.maxLife>2||![12,18,22].includes(h.damage))throw new Error('冰裂危险区异常');}
      else if(h.kind==='rift'){if(d.campaignLevel!==9||h.shape!=='strip'||h.r!==18||h.inner!==0||h.maxLife!==.65||h.damage!==18||h.chill!==0)throw new Error('裂隙危险区异常');}
      else if(h.kind==='anchor'){if(d.campaignLevel!==9||h.shape!=='circle'||h.r!==70||h.warning!==0||h.total!==0||h.maxLife!==6||h.damage!==0||h.chill!==0)throw new Error('稳定锚点异常');}
      else if(h.kind==='reactor'){if(d.campaignLevel!==10||h.shape!=='circle'||!([75,100].includes(h.r))||h.inner!==0||h.chill!==0||!(h.r===75&&h.maxLife===.55&&h.damage===22||h.r===100&&h.maxLife===.45&&h.damage===16))throw new Error('熔核攻击异常');}
      else if(h.kind==='shelter'){if(d.campaignLevel!==10||h.shape!=='circle'||h.r!==95||h.warning!==0||h.total!==0||h.maxLife<4||h.maxLife>4.4||h.damage!==0||h.chill!==0)throw new Error('避难区异常');}
      else if(h.kind==='purge'){if(d.campaignLevel!==10||h.shape!=='circle'||h.r!==Math.hypot(d.width,d.height)||h.maxLife!==.6||![2.6,3].includes(h.total)||h.damage!==28||h.chill!==0)throw new Error('熔核净化异常');}
      else throw new Error('未知危险区');
    }
    if(d.hazards.some(h=>h.kind==='purge')&&!d.hazards.some(h=>h.kind==='shelter'&&h.life>0))throw new Error('净化存档缺少避难区');
    for(const m of d.meteors){numbers(m,['x','y','r','age','delay','phase','damage']);if(![80,95,110,135,...[80,95,110,135].map(r=>r*.85)].includes(m.r)||m.delay!==.65||m.age<0||m.age>1||![0,1,2].includes(m.phase)||m.damage<0||typeof m.echo!=='boolean'||m.phase===1&&!m.echo)throw new Error('陨星状态异常');}
    if(!Array.isArray(d.rockets)||d.rockets.length>20)throw new Error('火箭数量异常');for(const r of d.rockets){numbers(r,['x','y','r','vx','vy','life','targetId','damage','blast','phase','delay']);if(r.r!==6||Math.hypot(r.vx,r.vy)>681||r.life<0||r.life>3||!Number.isSafeInteger(r.targetId)||r.targetId<0||r.damage<0||![70,85,100,130,...[70,85,100,130].map(n=>n*.85)].includes(r.blast)||typeof r.echo!=='boolean'||![0,1,2].includes(r.phase)||r.delay<0||r.delay>.15||r.phase===1&&(!r.echo||r.vx!==0||r.vy!==0)||!Array.isArray(r.trail)||r.trail.length>8)throw new Error('火箭状态异常');for(const point of r.trail)numbers(point,['x','y']);}
    for(const e of d.enemies)if(e.type==='glacial'){numbers(e,['frostClock']);if(e.frostClock<0||e.frostClock>5)throw new Error('冰脊兽冷却异常');if(e.frostIntent){numbers(e.frostIntent,['remaining','total']);if(e.frostIntent.total!==.9||e.frostIntent.remaining<0||e.frostIntent.remaining>.9)throw new Error('霜爆预警异常');}}
    for(const e of d.enemies)if(e.type==='phaselet'){numbers(e,['phaseClock']);if(e.phaseClock<0||e.phaseClock>4.5)throw new Error('相位猎手冷却异常');if(e.phaseIntent){numbers(e.phaseIntent,['x','y','remaining','total']);if(e.phaseIntent.total!==.9||e.phaseIntent.remaining<0||e.phaseIntent.remaining>.9)throw new Error('相位跃迁预警异常');}}
    for(const e of d.enemies)if(e.type==='pylon'){numbers(e,['pylonLife','pylonClock']);if(d.campaignLevel!==10||e.pylonLife<0||e.pylonLife>12||e.pylonClock<0||e.pylonClock>5)throw new Error('供能柱计时异常');if(e.pylonIntent){numbers(e.pylonIntent,['remaining','total']);if(e.pylonIntent.total!==1||e.pylonIntent.remaining<0||e.pylonIntent.remaining>1)throw new Error('供能脉冲预警异常');}}
    for(const e of d.enemies)if(e.type==='mender'){numbers(e,['menderClock']);if(e.menderClock<0||e.menderClock>5)throw new Error('再生体冷却异常');if(e.menderIntent){numbers(e.menderIntent,['remaining','total','radius']);if(e.menderIntent.total!==.9||e.menderIntent.remaining<0||e.menderIntent.remaining>.9||e.menderIntent.radius!==120)throw new Error('敌方修复蓄力异常');}}
    if(!Array.isArray(d.flasks)||d.flasks.length>15||!Array.isArray(d.acidPools)||d.acidPools.length>12||!Array.isArray(d.sporeZones)||d.sporeZones.length>16)throw new Error('投瓶或孢子数量异常');
    for(const flask of d.flasks){numbers(flask,['x','y','r','startX','startY','goalX','goalY','age','flight','damage','blast','acidDamage']);if(flask.r!==7||![.45,.6].includes(flask.flight)||flask.age<0||flask.age>flask.flight||flask.damage<0||flask.acidDamage<0||![75,85,95,115,90,105,120,145].includes(flask.blast)||typeof flask.acid!=='boolean'||flask.acidRadius!==undefined&&flask.acidRadius!==90||flask.acidLife!==undefined&&flask.acidLife!==4.5)throw new Error('投瓶状态异常');}
    for(const pool of d.acidPools){numbers(pool,['x','y','r','life','tickClock','damage']);if(![65,90].includes(pool.r)||pool.life<0||pool.life>(pool.r===65?3:4.5)||pool.tickClock<0||pool.tickClock>.2||pool.damage<0)throw new Error('酸池状态异常');}
    for(const zone of d.sporeZones){numbers(zone,['x','y','r','warning','life','tickClock']);if(d.campaignLevel!==7||![40,44].includes(zone.r)||zone.warning<0||zone.warning>1.2||zone.life<0||zone.life>3||zone.tickClock<0||zone.tickClock>.2)throw new Error('孢子状态异常');}
    if(!Array.isArray(d.saws)||d.saws.length>18)throw new Error('锯轮数量异常');
    for(const saw of d.saws){numbers(saw,['x','y','r','vx','vy','age','life','damage']);if(![8,10].includes(saw.r)||saw.life<0||saw.life>2.5||saw.age<0||saw.age>2.5||saw.damage<0||typeof saw.returning!=='boolean'||typeof saw.burst!=='boolean'||saw.pulseRadius!==undefined&&saw.pulseRadius!==105||saw.pulseMultiplier!==undefined&&saw.pulseMultiplier!==1||!saw.hits||!Array.isArray(saw.hits.savedHits)||saw.hits.savedHits.some(id=>!Number.isInteger(id)))throw new Error('锯轮状态异常');}
    for(const e of d.enemies)if(e.type==='warden'){numbers(e,['guardClock','guardRemaining']);if(e.guardClock<0||e.guardClock>4.8||e.guardRemaining<0||e.guardRemaining>1.4)throw new Error('卫士护甲异常');}
    if(!Array.isArray(d.enemyShots)||d.enemyShots.length>100)throw new Error('敌方弹道异常');for(const e of d.enemyShots){numbers(e,['x','y','prevX','prevY','vx','vy','r','life','damage']);if(e.r!==5||e.life<0||e.life>6||e.damage!==14)throw new Error('敌方弹道数值异常');}
    if(d.whistle){numbers(d.whistle,['x','y','r','vx','vy','goalX','goalY']);const hasArrow=d.player.build.arrow===4||FUSIONS.some(f=>d.player.build[f.id]===4&&f.requires.includes('arrow'));if(d.whistle.r!==5||!hasArrow||typeof d.whistle.goalActive!=='boolean'||!Array.isArray(d.whistle.trail)||d.whistle.trail.length>16)throw new Error('哨箭状态异常');for(const p of d.whistle.trail)numbers(p,['x','y']);}
    for(const e of d.enemies)if(e.type==='sentinel'){numbers(e,['shotClock']);if(e.shotIntent){numbers(e.shotIntent,['angle','remaining','total']);if(e.shotIntent.total<=0)throw new Error('哨兵预警异常');}}
    for(const e of d.enemies)numbers(e,['id','hp','maxHp','speed','phase']);
    const enemyIds=new Set();for(const e of d.enemies){if(!Number.isSafeInteger(e.id)||e.id<1||e.id>d.seq||enemyIds.has(e.id)||typeof e.dead!=='boolean'||e.maxHp<=0||e.hp>e.maxHp||e.speed<0||e.r<=0||e.r>100)throw new Error('敌人身份或属性异常');enemyIds.add(e.id);}
    for(const e of d.enemies)if(e.elite!==undefined){if(!Object.hasOwn(ELITE_AFFIXES,e.elite)||!['blob','swift','tank'].includes(e.type)||e.energy!==BASE_ENEMIES[e.type].energy+2)throw new Error('精英词缀异常');numbers(e,['eliteClock']);if(e.eliteClock<0||e.eliteClock>5)throw new Error('精英冷却异常');if(e.eliteIntent!==null){const intent=e.eliteIntent;if(e.elite!=='pulse'||!intent||intent.total!==1||intent.radius!==85||typeof intent.remaining!=='number'||intent.remaining<0||intent.remaining>1)throw new Error('精英预警异常');}}
    for(const e of d.bullets){numbers(e,['vx','vy','prevX','prevY','life','damage','pierce']);if(!e.hits||!Array.isArray(e.hits.savedHits)||e.hits.savedHits.some(id=>!Number.isInteger(id)))throw new Error('弹道命中记录异常');}
    for(const e of d.gems)numbers(e,['vx','vy','value']);
    for(const e of d.items){numbers(e,['life']);if(!['bomb','magnet','pill'].includes(e.type))throw new Error('未知掉落');}
    for(const e of d.mines)numbers(e,['life','armed','blast','damage']);
    for(const e of d.gravityWells)numbers(e,['life','damage','pull','tickClock']);
    if(d.catalyst!==null&&(typeof d.catalyst!=='string'||!Object.hasOwn(BY_CATALYST,d.catalyst))||d.options.some(id=>id!=='attack'&&!Object.hasOwn(BY_ID,id))||d.catalystOptions.some(id=>!Object.hasOwn(BY_CATALYST,id)))throw new Error('存档选项异常');
    const revive=value=>{if(!value||typeof value!=='object')return value;if(value.negativeInfinity===true&&Object.keys(value).length===1)return -Infinity;if(Array.isArray(value.savedHits)&&Object.keys(value).length===1)return new Set(value.savedHits);for(const key of Object.keys(value))value[key]=revive(value[key]);return value;};
    Object.assign(game,revive(d));game.random=random;game.boss=raw.bossId===null?null:game.enemies.find(e=>e.id===raw.bossId&&e.type==='boss'&&!e.dead);if(raw.bossId!==null&&!game.boss)throw new Error('首领状态异常');
    if(game.boss?.intent){const intent=game.boss.intent;if(!['cone','dash','summon','shockwave','cross','corePulse','stormLances','stormCage','seedRain','vineSweep','iceFan','frostWheel','riftCross','phaseJump','reactorShield','solarRain','purge'].includes(intent.kind))throw new Error('未知首领招式');numbers(intent,['angle','remaining','total','radius']);if(intent.total<=0||intent.remaining<0||intent.remaining>intent.total||intent.radius<=0)throw new Error('首领预警时间或范围异常');}
    if(game.boss?.intent&&['reactorShield','solarRain','purge'].includes(game.boss.intent.kind)){const intent=game.boss.intent;numbers(intent,['x','y']);if(game.campaignLevel!==10||intent.radius!==({reactorShield:210,solarRain:225,purge:95})[intent.kind])throw new Error('熔核首领预警异常');}
    if(game.boss?.intent&&['riftCross','phaseJump'].includes(game.boss.intent.kind)){const intent=game.boss.intent;numbers(intent,['x','y']);if(game.campaignLevel!==9||intent.radius!==(intent.kind==='riftCross'?18:95))throw new Error('虚空首领预警异常');}
    if(game.boss?.intent&&['iceFan','frostWheel'].includes(game.boss.intent.kind)){const intent=game.boss.intent;numbers(intent,['x','y']);if(game.campaignLevel!==8||intent.radius!==(intent.kind==='iceFan'?55:210))throw new Error('冰封首领预警异常');}
    if(game.boss?.intent&&['seedRain','vineSweep'].includes(game.boss.intent.kind)){const intent=game.boss.intent;numbers(intent,['angle','remaining','total','radius','x','y']);if(game.campaignLevel!==7||intent.total<=0||intent.remaining<0||intent.remaining>intent.total||intent.radius!==(intent.kind==='seedRain'?179:650))throw new Error('花园首领预警异常');}
    if(game.options.some(id=>BY_ID[id]?.fusion&&!game.canFuse(id)))throw new Error('存档合体选项异常');
    game.recompute();if(!(game.player.hp>0&&game.player.hp<=game.player.maxHp)||game.player.xp<0)throw new Error('角色生命或经验异常');
    for(const list of [game.bossesSpawned,game.bossesDefeated])if(list.some(stage=>![1,2,3].includes(stage))||new Set(list).size!==list.length)throw new Error('首领进度异常');
    if(game.bossDue&&(![1,2,3].includes(game.bossDue.stage)||typeof game.bossDue.at!=='number'))throw new Error('首领预警异常');
    if(game.arenaIntent){const intent=game.arenaIntent;numbers(intent,['x','y','radius','remaining','total']);if(!['mirror','storm',undefined].includes(intent.kind)||intent.total<=0||intent.remaining<0||intent.remaining>intent.total||intent.radius<=0)throw new Error('战场预警异常');if(intent.kind==='mirror'&&(game.campaignLevel!==3||!['vertical','horizontal','cross'].includes(intent.axis)||intent.radius!==42))throw new Error('镜界预警异常');if(intent.kind===undefined&&(game.campaignLevel!==2||intent.radius!==95))throw new Error('赤潮预警异常');}
    if(game.arenaIntent?.kind==='storm'&&(game.campaignLevel!==6||typeof game.arenaIntent.x!=='number'||typeof game.arenaIntent.y!=='number'||game.arenaIntent.radius!==130))throw new Error('风眼预警异常');
    if(game.boss?.intent&&['stormLances','stormCage'].includes(game.boss.intent.kind)){const intent=game.boss.intent;if(game.campaignLevel!==6||typeof intent.angle!=='number'||typeof intent.remaining!=='number'||typeof intent.total!=='number'||![3,5].includes(intent.lanes)||typeof intent.x!=='number'||typeof intent.y!=='number')throw new Error('风暴首领预警异常');}
    if(game.lottery&&(![1,2,3].includes(game.lottery.bossStage)||!Array.isArray(game.lottery.results)))throw new Error('抽奖状态异常');
    if(game.state==='lottery'&&!game.lottery||game.state==='upgrade'&&!game.options.length||game.state==='catalyst'&&!game.catalystOptions.length)throw new Error('奖励选择状态异常');
    for(const id of Object.keys(DAMAGE_SOURCES))if(!Object.hasOwn(game.stats.damage,id))throw new Error('伤害记录缺失');
    for(const [id,row]of Object.entries(game.stats.damage))if(!Object.hasOwn(DAMAGE_SOURCES,id)||!row||typeof row.damage!=='number'||row.damage<0||typeof row.bossDamage!=='number'||row.bossDamage<0)throw new Error('战报异常');
    if(!Array.isArray(game.stats.bosses)||!Array.isArray(game.stats.recent)||!Number.isFinite(game.stats.damageTaken)||game.stats.damageTaken<0||!Number.isFinite(game.stats.blockedDamage)||game.stats.blockedDamage<0)throw new Error('战报字段异常');
    if(game.stats.death!==null)throw new Error('存档实验已经结束');
    for(const hit of game.stats.recent){numbers(hit,['amount','at']);if(!Object.hasOwn(PLAYER_DAMAGE_NAMES,hit.source)||hit.amount<0||hit.at<0)throw new Error('受击记录异常');hit.name=PLAYER_DAMAGE_NAMES[hit.source];}
    for(const boss of game.stats.bosses){if(![1,2,3].includes(boss.stage)||typeof boss.killed!=='boolean')throw new Error('首领战报异常');numbers(boss,['hp','maxHp','startedAt']);if(boss.hp<0||boss.maxHp<=0||boss.hp>boss.maxHp||boss.startedAt<0||boss.duration!==null&&(!Number.isFinite(boss.duration)||boss.duration<0))throw new Error('首领时间或生命异常');boss.name=game.bossMilestone(boss.stage).name;}
    for(const lottery of [game.lottery,...game.lotteryHistory].filter(Boolean)){if(!Array.isArray(lottery.results)||![0,1,3].includes(lottery.count))throw new Error('抽奖结果异常');for(const result of lottery.results){if(result.id==='attack'){numbers(result,['bonus']);result.name='普攻强化';}else{if(!Object.hasOwn(BY_ID,result.id)||!Number.isInteger(result.level)||result.level<1||result.level>4)throw new Error('抽奖技能异常');result.name=BY_ID[result.id].name;}}}
    if(game.state==='playing')game.state='paused';game.effects=[];game.events=[];game.revision++;return {game,unlocked:raw.unlocked,profile,history};
  }
  api.exportRunSave=exportRunSave;api.importRunSave=importRunSave;api.exportProgressSave=exportProgressSave;api.importGameSave=importGameSave;api.FUSIONS=FUSIONS;api.ELITE_AFFIXES=ELITE_AFFIXES;api.BOSS_ATTACK_GUIDE=BOSS_ATTACK_GUIDE;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.NeonCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
