/* Shared filter dictionary. Coverage and matching use the same usable-value rule. */
(() => {
  const number=v=>v===null||v===undefined||v===''||typeof v==='boolean'?null:(Number.isFinite(Number(v))?Number(v):null);
  const text=v=>typeof v==='string'&&!/^(未知|未披露|未分类|其他|待细分|--|—|不限)$/.test(v.trim())?v.trim()||null:null;
  const metric=(r,k)=>number(r.metrics?.[({max_drawdown_1y:'drawdown_1y',return_since_inception:'return_since'})[k]||k]?.value);
  const profile=r=>r.filterProfile||r.governance||{};
  const fields=[
    {id:'strategy',label:'投资策略',group:'投资策略',get:r=>text(profile(r).classification?.strategy1)||text(r.strategy1)},
    {id:'subStrategy',label:'细分策略',group:'投资策略',get:r=>text(profile(r).classification?.strategy2)||text(r.strategy2)},
    {id:'age',label:'成立 / 历史年限',group:'更多信息',unit:'年',get:(r,asOf)=>{const d=Date.parse(r.inceptionDate||profile(r).inceptionDate||r.filterFacts?.firstDate||'');const end=Date.parse(asOf);return Number.isFinite(d)&&d<=end?(end-d)/86400000/365.2425:null;},bands:[[0,1],[1,3],[3,5],[5,10],[10,null]]},
    {id:'risk',label:'风险等级',group:'更多信息',get:r=>{const v=profile(r).riskLevel||r.riskLevel;return /^R[1-5]$/.test(v||'')?v:null;},note:'渠道原始风险评级的标准化代码，不代表跨渠道评级完全等价。'},
    {id:'scale',label:'所属公司规模',group:'更多信息',get:r=>{const s=profile(r).companyScale;return s&&s.unit==='亿元'?text(s.raw):null;},note:'管理机构规模，非产品规模；仅使用单位和区间已确认的原始披露。'},
    {id:'institution',label:'机构类型',group:'更多信息',get:r=>text(profile(r).companyTypeRaw)},
    {id:'region',label:'所在地区',group:'更多信息',get:r=>text(profile(r).registeredCity)},
    {id:'currency',label:'币种',group:'更多信息',get:r=>text(profile(r).currency)||text(r.currency)},
    ...[['return_1m','近1月收益率'],['return_3m','近3月收益率'],['return_6m','近半年收益率'],['return_ytd','今年以来收益率'],['return_1y','近一年收益率'],['return_2y','近两年收益率'],['return_3y','近三年收益率'],['return_5y','近五年收益率'],['return_since_inception','成立以来收益率'],['annual_return_since','成立以来年化收益'],['max_drawdown_1y','近一年最大回撤'],['volatility_since','成立以来年化波动率'],['sharpe_since','成立以来夏普比率']].map(([id,label])=>({id,label,group:'指标筛选',get:r=>metric(r,id),unit:id.startsWith('sharpe')?'倍':'%',bands:id.startsWith('max_drawdown')?[[-5,0],[-10,-5],[-20,-10],[null,-20]]:id.startsWith('sharpe')?[[0,1],[1,2],[2,null]]:id.startsWith('volatility')?[[0,5],[5,10],[10,20],[20,null]]:[[null,0],[0,10],[10,20],[20,30],[30,50],[50,null]]})),
    ...[['monthlyWin','成立以来月胜率'],['sortino','成立以来索提诺'],['calmar','成立以来卡玛比率']].map(([id,label])=>({id,label,group:'指标筛选',get:r=>{const v=number(r.comparison?.metrics?.[id]);return v===null?null:v*(id==='monthlyWin'?100:1);},unit:id==='monthlyWin'?'%':'倍',bands:id==='monthlyWin'?[[0,50],[50,60],[60,80],[80,100]]:[[null,0],[0,1],[1,2],[2,null]]})),
    ...[['peerRank','同类业绩排名'],['excessReturn','超额收益'],['excessAnnual','超额年化'],['excessDrawdown','超额回撤'],['excessSharpe','超额夏普比率'],['excessVol','超额年化波动率'],['excessSortino','超额索提诺'],['excessCalmar','超额卡玛比率']].map(([id,label])=>({id,label,group:id==='peerRank'?'指标筛选':'超额指标',get:()=>null,note:id==='peerRank'?'严格同类样本、币种与统一观察期尚未全部确认，暂不开放。':'产品基准指派及指数名称尚未核实，候选指数试算不计可用覆盖。'})),
    {id:'winning',label:'月胜率≥80%',group:'特色筛选',get:r=>{const n=number(r.comparison?.metrics?.monthlyWin);return n===null?null:n>=.8?'符合':'不符合';},note:'成立以来完整月度观测，不等同于排排网专有标签。'},
    {id:'drawdownControl',label:'回撤≤5%',group:'特色筛选',get:r=>{const n=metric(r,'max_drawdown_1y');return n===null?null:Math.abs(n)<=5?'符合':'不符合';},note:'近一年最大回撤绝对幅度，不代表未来风险。'},
  ];
  const groups=['投资策略','更多信息','指标筛选','超额指标','特色筛选'];
  fields.find(f=>f.id==='return_since_inception').label='完整可用期收益率';
  fields.find(f=>f.id==='institution').get=r=>{const v=text(profile(r).companyTypeRaw);return v&&!/^\d+$/.test(v)?v:null;};
  fields.find(f=>f.id==='institution').note='仅采用含业务含义的机构类型；源端数字代码未确认字典时不算覆盖。';
  fields.find(f=>f.id==='risk').get=r=>{const p=profile(r),v=Object.hasOwn(p,'riskLevel')?p.riskLevel:r.riskLevel;return /^R[1-5]$/.test(v||'')?v:null;};
  fields.find(f=>f.id==='strategy').get=r=>{const v=profile(r).classification?.strategy1||r.strategy1;return ['股票策略','债券策略','期货及衍生品策略','多资产策略','组合基金'].includes(v)?v:null;};
  const periods={since:'成立以来 / 可用历史',ytd:'今年以来','1m':'近1月','3m':'近3月','6m':'近半年','1y':'近一年','2y':'近两年','3y':'近三年','5y':'近五年'};
  const notes={strategy:'按主要投资资产和投资方式划分；未明确披露的产品不强行归类。',subStrategy:'进一步区分主观多头、量化多头、市场中性等投资方式。',age:'从成立日计算至页面数据日期，不以首条可见净值代替成立日。',risk:'采用渠道披露的R1至R5等级；等级越高，风险承受要求越高。不同渠道评级不保证完全等价。',scale:'管理机构规模，不是单只产品规模；同一区间的亿、亿元等写法统一。',institution:'按管理机构披露的业务类型划分；身份不明确的不归类。',region:'管理机构披露的注册或所在地区，不代表产品投资区域。',currency:'产品净值计价币种；不同币种收益未折算汇率。'};
  for(const f of fields)if(notes[f.id])f.note=notes[f.id];
  fields.find(f=>f.id==='currency').get=r=>{const v=text(profile(r).currency)||text(r.currency);return ({CNY:'人民币',RMB:'人民币',人民币元:'人民币',USD:'美元',HKD:'港币',港元:'港币',EUR:'欧元'})[v]||v;};
  fields.find(f=>f.id==='region').get=r=>{const v=text(profile(r).registeredCity);return v&&/^(北京|上海|天津|重庆)市?$/.test(v)?v.replace(/市$/,'')+'市':v;};
  fields.find(f=>f.id==='scale').get=r=>{const s=profile(r).companyScale;if(!s||s.unit!=='亿元'||!text(s.raw))return null;const v=s.raw.replace(/\s/g,'').replace(/亿元|亿/g,'').replace(/[~～—–至]/g,'-');return /(以上|以下|以内)$/.test(v)?v.replace(/(以上|以下|以内)$/,'亿元$1'):v+'亿元';};
  const completeSince=r=>!!r.filterFacts?.firstDate;
  const familySpecs=[
    ['return','收益率','return',100,'期末业绩水平÷期初业绩水平−1；以最新业绩日向前回溯。成立以来选项统一使用首个至最后一个可用净值，属于完整可用历史，不保证覆盖真实成立日；其余区间采用起点附近的已披露业绩。'],
    ['annual','年化收益','annualized_return',100,'将区间收益按实际天数复利折算为一年收益；至少需要约一年有效历史。'],
    ['drawdown','最大回撤','max_drawdown',-100,'区间内从前期高点到后续低点的最大跌幅；以负数展示，越接近0跌幅越小。'],
    ['volatility','年化波动率','annualized_volatility',100,'月度收益的样本标准差×√12；需要足够且连续的月度历史。'],
    ['sharpe','夏普比率','sharpe_ratio',1,'（年化收益−2%无风险收益）÷年化波动率；分母为0时不计算。'],
    ['monthlyWin','月胜率','positive_month_ratio',100,'正收益完整月份数÷有效完整月份数；零收益月不算获胜，不纳入未结束月份。'],
    ['sortino','索提诺比率','sortino_ratio',1,'（年化收益−2%目标收益）÷年化下行偏离；只衡量低于目标的风险，分母为0不计算。'],
    ['calmar','卡玛比率','calmar_ratio',1,'年化收益÷最大回撤绝对幅度；回撤为0时不计算。'],
    ...fields.filter(f=>f.id==='peerRank'||f.group==='超额指标').map(f=>[f.id,f.label,null,1,f.id==='peerRank'?'同一策略、币种和观察期的排名百分位，越小越靠前。同类范围未确认时不排名。':'与产品约定基准在同一期间比较。基准或超额收益口径未确认时不参与数值筛选。'])
  ];
  const legacy={annual:'annual_return_since',drawdown:'max_drawdown_1y',volatility:'volatility_since',sharpe:'sharpe_since',monthlyWin:'monthlyWin',sortino:'sortino',calmar:'calmar'};
  const metricIds={annual:'annual_return',drawdown:'max_drawdown',volatility:'volatility',sharpe:'sharpe',monthlyWin:'monthlyWin',sortino:'sortino',calmar:'calmar'};
  const templates=Object.fromEntries(fields.map(f=>[f.id,f]));
  fields.splice(8);
  for(const [family,label,code,multiplier,note] of familySpecs){
    const sinceFirst=['annual','volatility','sharpe','monthlyWin','sortino','calmar','excessAnnual','excessVol','excessSharpe','excessSortino','excessCalmar'].includes(family);
    const ps=family==='return'?['since','ytd','1m','3m','6m','1y','2y','3y','5y']:family==='peerRank'?['ytd','6m','1y','2y','3y','5y']:family==='excessReturn'?['since','ytd','6m','1y','2y','3y','5y']:sinceFirst?['since','1y','3y','5y']:['since','1y','3y','5y'];
    const template=templates[family==='return'?'return_1y':legacy[family]||family];
    for(const period of ps){
      const id=family==='return'?(period==='since'?'return_since_inception':'return_'+period):(metricIds[family]?metricIds[family]+'_'+period:period==='1y'?(legacy[family]||family):family+'_'+period);
      const periodLabel=period==='since'?'成立以来':periods[period];
      const f={...template,id,label:periodLabel+label,family,familyLabel:label,period,code,note};
      if(!f.bands){f.unit=family.match(/Sharpe|Sortino|Calmar/)?'倍':'%';f.bands=f.unit==='倍'?[[null,0],[0,1],[1,2],[2,null]]:family==='peerRank'?[[0,10],[10,25],[25,50],[50,100]]:family==='excessDrawdown'?[[-5,0],[-10,-5],[-20,-10],[null,-20]]:[[null,0],[0,10],[10,20],[20,30],[30,null]];}
      f.get=r=>{if(!code||period==='since'&&!completeSince(r))return null;const n=number(r.filterMetrics?.[code+'_'+period]);if(n!==null)return n*multiplier;if(r.filterMetrics&&family!=='return')return null;if(period==='1y')return template.get(r);return family==='return'?metric(r,id):null;};
      fields.push(f);
    }
  }
  // Business combinations retain the observed AND structure. Annualized return,
  // annualized volatility and risk-adjusted metrics follow this project's
  // since-inception policy rather than copying source-specific time windows.
  const rules=[
    ['longTerm','长期业绩优异',5,[['rank5y','<=',50],['rank3y','<=',25],['max_drawdown_5y','<=',.5],['annualized_volatility_since','<=',.3],['sharpe_ratio_since','>',1]],'成立≥5年；5年收益同类前50%、3年前25%；5年回撤≤50%；成立以来波动≤30%、成立以来夏普>1。'],
    ['holding','持有体验佳',4,[['annualized_volatility_since','<=',.1],['calendar3','>',0],['sharpe_ratio_since','>',1]],'成立≥4年；成立以来波动≤10%；最近三个完整自然年各年收益>0；成立以来夏普>1。'],
    ['veteran','老牌基金经理',5,[['career','>',10],['rank3y','<=',30],['rank5y','<=',50],['max_drawdown_5y','<=',.5]],'成立≥5年；至少一位已披露经理从业>10年；3年收益同类前30%、5年前50%；5年回撤≤50%。'],
    ['highWin','高胜率',3,[['positive_month_ratio_since','>',.8],['max_drawdown_3y','<=',.2],['rank3y','<=',50]],'成立≥3年；成立以来月胜率>80%；3年回撤≤20%；3年收益同类前50%。'],
    ['recovery','回撤修复快',3,[['recovery3y','<',30],['recoverySince','<',50],['max_drawdown_3y','<=',.5],['rank3y','<=',60]],'成立≥3年；3年最大回撤修复<30天、成立以来<50天；3年回撤≤50%；3年收益同类前60%。修复天数采用本库自然日算法：从最大跌幅谷底到首次恢复此前高点；未修复留空，不认作0天。'],
    ['darkHorse','黑马潜力选手',2,[['rank2y','<=',20],['rank1y','<=',10],['max_drawdown_2y','<=',.3],['annualized_volatility_since','<=',.2]],'成立≥2年；2年收益同类前20%、1年前10%；2年回撤≤30%；成立以来波动≤20%。'],
    ['4433','4433选基',5,[...['ytd','5y','3y','2y','1y'].map(p=>['rank'+p,'<=',25]),...['6m','3m'].map(p=>['rank'+p,'<=',33])],'成立≥5年；今年以来及1、2、3、5年收益均同类前25%；半年、3个月均同类前33%。'],
    ['fivePositive','连续五年正收益',5,[['calendar5','>',0]],'成立≥5年；最近五个完整自然年各年收益分别大于0。'],
    ['winning','月胜率≥80%',3,[['positive_month_ratio_since','>=',.8]],'成立≥3年；成立以来月胜率≥80%。排排网标题为>80%，公开条件实际为≥80%。'],
    ['drawdownControl','低回撤',3,[['max_drawdown_3y','<=',.2]],'成立≥3年；近3年最大回撤幅度≤20%。'],
    ['lowVol','低波求稳',3,[['annualized_volatility_since','<=',.2],['calendar3','>',0]],'成立≥3年；成立以来波动≤20%；最近三个完整自然年各年收益>0。']
  ];
  function tagInput(r,key,asOf){if(key.startsWith('calendar')){const vs=Array.from({length:Number(key.slice(8))},(_,i)=>number(r.filterFacts?.calendarReturns?.[Number(String(asOf||r.filterFacts?.asOf||'2026').slice(0,4))-1-i]));return vs.includes(null)?null:Math.min(...vs);}if(key.startsWith('rank'))return number(r.researchRanks?.[key.slice(4)]?.percentile);if(key==='career')return number(r.filterFacts?.managerCareerYears);if(key.startsWith('recovery'))return number(r.filterFacts?.[key]);if(key.endsWith('_since')&&!completeSince(r))return null;return number(r.filterMetrics?.[key]);}
  const compare=(v,op,n)=>op==='>'?v>n:op==='>='?v>=n:op==='<'?v<n:v<=n;
  for(const [id,label,minAge,conditions,note] of rules)fields.push({id,label,group:'特色筛选',note,feature:true,get:(r,asOf)=>{const d=r.inceptionDate||profile(r).inceptionDate||r.filterFacts?.firstDate,cutoff=r.filterFacts?.asOf||asOf,anniversary=d?new Date(d+'T00:00:00Z'):null;if(anniversary)anniversary.setUTCFullYear(anniversary.getUTCFullYear()+minAge);const agePass=anniversary&&Number.isFinite(anniversary.getTime())&&cutoff?anniversary.getTime()<=Date.parse(cutoff):null,vs=conditions.map(([k,op,n])=>{const v=tagInput(r,k,asOf);return v===null?null:compare(v,op,n);});if(agePass===false||vs.includes(false))return '不符合';return agePass===null||vs.includes(null)?null:'符合';}});
  function missing(f,r,asOf){
    if(f.get(r,asOf)!==null)return 'available';if(f.feature||f.family&&!f.code)return 'unconfirmed';if(!f.period)return 'data';
    const stem={return:'return',annual:'annual_return',drawdown:'drawdown',volatility:'volatility',sharpe:'sharpe',monthlyWin:'monthly_win',sortino:'sortino',calmar:'calmar'}[f.family],reason=stem?r.metricMissing?.[stem+'_'+f.period]?.code:null;
    if(f.family==='sharpe'&&number(r.filterMetrics?.['annualized_volatility_'+f.period])===0||f.family==='calmar'&&number(r.filterMetrics?.['max_drawdown_'+f.period])===0)return 'unconfirmed';
    if(reason==='inception_short')return 'age';if(['zero_denominator','calculation_unavailable'].includes(reason))return 'unconfirmed';
    const end=r.filterFacts?.asOf,inc=r.inceptionDate||profile(r).inceptionDate;
    if(end&&inc&&f.period==='since'&&['annual','volatility','sharpe','monthlyWin','sortino','calmar'].includes(f.family)&&(Date.parse(end)-Date.parse(inc))/86400000<330)return 'age';
    if(end&&inc&&f.period!=='since'){const target=new Date(end+'T00:00:00Z');if(f.period==='ytd')target.setUTCFullYear(target.getUTCFullYear()-1,11,31);else{const day=target.getUTCDate(),months=parseInt(f.period)*(f.period.endsWith('y')?12:1);target.setUTCDate(1);target.setUTCMonth(target.getUTCMonth()-months);target.setUTCDate(Math.min(day,new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate()));}if(Date.parse(inc)>target.getTime())return 'age';}
    return 'data';
  }
  let benchmark='sh000300';
  const benchmarkIds=['sh000300','sh000905','sh000852','sh000906','sh000016','sz399006'];
  const setBenchmark=id=>{benchmark=benchmarkIds.includes(id)?id:'sh000300';};
  const excessCodes={excessReturn:'return',excessAnnual:'annualized_return',excessDrawdown:'max_drawdown',excessSharpe:'sharpe_ratio',excessVol:'annualized_volatility',excessSortino:'sortino_ratio',excessCalmar:'calmar_ratio'};
  for(const f of fields.filter(f=>f.group==='超额指标')){
    f.code=excessCodes[f.family];
    f.get=r=>{const item=r.marketExcess?.[benchmark];if(!item||item.status!=='calculated')return null;
      if(f.period==='since'){const inc=r.inceptionDate||profile(r).inceptionDate,gap=(Date.parse(item.firstDate)-Date.parse(inc))/86400000;if(!item.firstDate)return null;}
      const v=number(item.metrics?.[f.code+'_'+f.period]);return v===null?null:v*(f.family==='excessDrawdown'?-100:f.unit==='倍'?1:100);};
    const algorithms={excessReturn:'相对收益＝（1＋产品区间收益）÷（1＋指数区间收益）−1。例如产品涨10%、指数涨5%，相对收益为4.76%，不是简单相减的5个百分点。',excessAnnual:'将相对收益按实际天数复利年化：（1＋相对收益）^(365.25÷天数)−1，至少330天历史。',excessDrawdown:'先计算产品净值÷指数收盘值形成相对净值，再取该曲线从历史高点到后续低点的最大跌幅；以负数展示。',excessVol:'相对净值的月度收益样本标准差×√12。',excessSharpe:'相对净值年化收益÷相对净值年化波动率；已扣除基准，目标超额收益设为0。',excessSortino:'相对净值年化收益÷年化下行偏离；目标超额收益为0，仅计低于0的月度收益。',excessCalmar:'相对净值年化收益÷相对净值最大回撤绝对幅度。'};
    f.note='【加工计算】'+algorithms[f.family]+'【比较标准】所选指数为研究对照，非产品合同基准。“成立以来 / 可用历史”从产品和指数均有数据的首日计算，可能短于产品全部历史，不拼接缺失的指数历史。采用净值原币种的相对表现。币种未知或非人民币时不作汇率调整，不能理解为人民币投资者实际超额收益；使用已结束交易日的价格指数，不含红利再投资。产品每个业绩日匹配当日或此前7天内指数，超出共同历史范围不计算；风险比率分母为0时留空。产品沿用各渠道披露的复权或累计净值，分红口径差异仍需注意。';
  }
  for(const f of fields.filter(f=>f.family==='peerRank')){f.code='research_rank';f.get=r=>number(r.researchRanks?.[f.period]?.percentile);f.note='【本库加工排名】同细分策略、披露币种（未披露独立成组）及业绩序列类型比较；采用最近已结束月份的统一期末，期初期末匹配此前7天内净值。至少10个样本，按备案号去重，没有备案号时按渠道产品独立。收益从高到低排列，同收益并列；排名百分位＝名次÷样本数×100%，越小越靠前。不是排排网官方排名。成立以来因起点不同不排名。';}
  const originalMissing=missing;
  const missingWithBenchmark=(f,r,asOf)=>{if(f.group==='超额指标'&&f.get(r,asOf)===null){const item=r.marketExcess?.[benchmark];if(!item||['currency_unconfirmed','currency_mismatch'].includes(item.status))return 'unconfirmed';}return originalMissing(f,r,asOf);};
  const explanations={
    strategy:'【原始披露＋统一分类】采用渠道明确披露的主要资产、投资方式，将同义策略合并为股票、债券、期货及衍生品、多资产、组合基金五类。不通过产品名称猜测策略。只有大类依据的，不推断细分类。',
    subStrategy:'【原始披露＋同义归并】依据渠道明确披露的细分标签；主观选股归主观多头、量化选股归量化多头、程序化期货归量化CTA。未披露方法或证据不足的保留待细分，不按收益形态猜测。',
    age:'【加工计算】优先使用渠道披露成立日；未披露时，用首个有效净值日补充历史年限，按实际天数÷365.2425计算。补充日期仅为已知历史起点，不代表真实成立日，列表标注“净值起点”。',
    risk:'【原始披露＋等级统一】保留渠道的风险评定，将低、中低、中、中高、高映射为R1、R2、R3、R4、R5。不用历史波动率反推风险评级，不同渠道评级标准可能不同。',
    scale:'【原始披露＋单位统一】使用管理机构披露的管理规模区间，不是单只基金规模。0-5亿、0~5亿元统一为0-5亿元；不以产品数量推算规模，区间不同不合并。',
    institution:'【原始披露】采用管理机构披露的业务身份，如公募基金管理公司；仅有未确认含义的编号时不归类。不以销售渠道替代管理机构身份。',
    region:'【原始披露＋名称统一】采用机构披露的注册或所在城市，北京/北京市等同义名称合并。不代表产品资产的投资地区。',
    currency:'【原始披露＋名称统一】人民币、CNY、RMB统一为人民币，USD为美元、HKD为港币。不根据渠道或策略推测币种，不自动折算汇率。'};
    for(const f of fields){if(explanations[f.id])f.note=explanations[f.id];else if(f.feature)f.note='【组合加工】'+f.note+' 所列条件须同时满足。至少一项明确不满足，判为不符合；没有不符合但仍缺必要条件，判为条件不足。不是直接采集的推荐标签。成立日缺失时用首个净值日起算；年化收益、年化波动、夏普、索提诺、卡玛和月胜率优先采用完整可用历史，不保证覆盖真实成立日；各固定区间仍保留供显式筛选。同类名次使用本库共同月末窗口排名，并非排排网官方榜单；按细分策略、披露币种、业绩序列类型分组，端点允许相差7天，至少10个样本，备案号去重。经理从业年限使用已披露数值，多经理取最高值，未确认履历不推测。排名采用共同月末，其余风险指标截至各产品最新业绩日。';else if(f.group==='指标筛选')f.note='【'+(f.family==='peerRank'?'同类比较':'业绩加工')+'】'+f.note+' 【数据标准】优先按实际可用业绩计算；收益率无法计算时，仅采用日期、单位已明确的渠道披露值。排排网、格上、雪球采用复权业绩，其他渠道沿用已披露累计净值；不额外扣除或估算费用。最大回撤使用所选区间全部已披露业绩点；年化收益、年化波动、夏普、索提诺、卡玛和月胜率默认优先展示成立以来口径，同时保留近1年、近3年、近5年供显式筛选。风险类指标使用完整月度样本，固定区间及成立以来均需满足相应历史长度且月度覆盖不少于80%。缺失不按0处理。';}
  const subtypeRules={'主观多头':'主动研究和判断选股，以股票多头投资为主。','量化多头':'依据量化模型选股和构建股票多头组合。','股票多空':'同时使用股票多头和空头头寸，不要求维持市场中性。','股票市场中性':'以对冲市场整体方向敞口、获取相对收益为主要目标。','指数增强':'围绕明确指数构建组合，目标为在跟踪基础上获取超额收益。','纯债策略':'主要投资债券，不从标签额外推断可转债或股票敞口。','高收益债':'以较高票息、较高信用风险债券为主要投资方向。','转债策略':'以可转换债券投资为主要方法。','量化转债':'采用量化模型进行转债选择与交易。','债券增强':'以债券为基础并采用增强手段，增强资产范围以披露为准。','债券复合':'组合使用多种债券投资和交易方法。','量化CTA':'采用程序化或量化方法交易期货、衍生品。','主观CTA':'以主观判断进行期货、衍生品投资。','期权策略':'主要采用期权及其组合进行风险收益管理。','其他衍生品策略':'明确以衍生品为主要工具，但不属于已披露的CTA或期权子类。','宏观策略':'以宏观判断在多类资产间配置或交易。','复合策略':'同时采用多类资产或多种投资策略。','套利策略':'渠道明确披露为多资产套利，利用相关资产的相对价差。','FOF':'以投资其他基金为主要形式，未明确单资产或多资产。','单资产FOF':'所投资基金主要属于同一资产类别。','多资产FOF':'所投资基金覆盖多个资产类别。'};
  const typeNote=(f,value)=>'【划分依据】'+((f.id==='strategy'?({'股票策略':'主要股票投资或股票相关多空、对冲方法。','债券策略':'主要债券、转债或债券增强方法。','期货及衍生品策略':'主要期货、期权等衍生品投资方法。','多资产策略':'跨资产配置、宏观、复合或明确多资产套利。','组合基金':'以投资其他基金为主要形式。'})[value]:subtypeRules[value])||'仅明确主要投资范围，尚未披露足够细分方法。')+' 仅依据渠道明确披露的策略标签及上述同义归并，不按净值走势推断。';
  const fieldMap=new Map(fields.map(f=>[f.id,f]));
  const valid=(f,r,asOf)=>f.get(r,asOf)!==null;
  const coverage=(f,rows,asOf)=>{const count=rows.filter(r=>valid(f,r,asOf)).length;return {count,total:rows.length,pct:rows.length?count/rows.length*100:0};};
  const bandLabel=(a,b,u)=>a===null?`<${b}${u}`:b===null?`≥${a}${u}`:`${a}至${b}${u}`;
  function options(f,rows,asOf){return f.feature?[{value:'符合',label:'符合'},{value:'不符合',label:'不符合'}]:f.bands?f.bands.map(([a,b])=>({value:JSON.stringify([a,b]),label:bandLabel(a,b,f.unit||'')})):[...new Set(rows.map(r=>f.get(r,asOf)).filter(v=>v!==null))].sort((a,b)=>(f.id==='scale'?(parseFloat(a)-parseFloat(b)):0)||String(a).localeCompare(String(b),'zh-CN')).map(v=>({value:String(v),label:String(v)}));}
  function matches(row,state,asOf){return Object.entries(state).every(([id,s])=>{const f=fieldMap.get(id);if(!f||!s)return true;const v=f.get(row,asOf);if(s==='__missing')return v===null;if(s==='__present')return v!==null;if(s.startsWith('__'))return missingWithBenchmark(f,row,asOf)===s.slice(2);if(v===null)return false;if(f.bands){try{const [a,b]=JSON.parse(s);return (a===null||v>=a)&&(b===null||v<b||(b===100&&v===100)||(f.family==='drawdown'&&b===0&&v===0));}catch{return false;}}return String(v)===s;});}
  const aliases={annual_since:'annual_return_since',drawdown_since:'max_drawdown_since'};
  function read(params){setBenchmark(params.get("benchmark"));const result={};for(const f of fields){const v=params.get('f_'+f.id);if(v&&v.length<200)result[f.id]=v;}for(const [oldId,newId] of Object.entries(aliases)){const v=params.get('f_'+oldId);if(v&&v.length<200&&result[newId]===undefined)result[newId]=v;}return result;}
  function write(params,state){if(benchmark==='sh000300')params.delete('benchmark');else params.set('benchmark',benchmark);for(const f of fields){const alias=Object.entries(aliases).find(([,newId])=>newId===f.id)?.[0],v=state[f.id]||state[alias];if(v)params.set('f_'+f.id,v);else params.delete('f_'+f.id);}for(const oldId of Object.keys(aliases))params.delete('f_'+oldId);}
  const api={fields,groups,periods,number,coverage,options,matches,read,write,missing:missingWithBenchmark,rules,setBenchmark,getBenchmark:()=>benchmark,benchmarkIds,typeNote};
  if(typeof module!=='undefined')module.exports=api;
  if(typeof window!=='undefined')window.PrivateFundFilters=api;
})();
