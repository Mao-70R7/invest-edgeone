/* Static adapter for the existing product-analysis renderer. No local API. */
(() => {
  const version = new URL(document.currentScript.src, location.href).searchParams.get('v') || '';
  const cache = new Map();
  let catalogPromise;
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const days = (a, b) => (Date.parse(a) - Date.parse(b)) / 86400000;
  function todayShanghai() {
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
  }
  function freshPerformance(row, today=todayShanghai()) {
    const asOf=row.comparison?.asOf;
    const valid=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
    return valid(asOf) && valid(today) && days(today,asOf)>=0 && days(today,asOf)<=15;
  }
  const definitions = {
    return1m:{label:'近1月收益',format:'pct',direction:'high'},
    return3m:{label:'近3月收益',format:'pct',direction:'high'},
    return6m:{label:'近6月收益',format:'pct',direction:'high'},
    returnYtd:{label:'今年以来',format:'pct',direction:'high'},
    return1y:{label:'近1年收益',format:'pct',direction:'high'},
    returnSinceInception:{label:'完整可用期收益',format:'pct',direction:'high',rankable:false},
    annualReturn:{label:'成立以来年化收益',format:'pct',direction:'high',rankable:false},
    annualVol:{label:'成立以来年化波动',format:'pct',direction:'low',rankable:false},
    maxDrawdown:{label:'近1年最大回撤',format:'pct',direction:'high'},
    sharpe:{label:'成立以来夏普',format:'number',direction:'high',rankable:false},
    sortino:{label:'成立以来索提诺',format:'number',direction:'high',rankable:false},
    calmar:{label:'成立以来卡玛',format:'number',direction:'high',rankable:false},
    monthlyWin:{label:'成立以来月胜率',format:'pct',direction:'high',rankable:false},
    annualReturn1y:{label:'近1年年化收益',format:'pct',direction:'high'},
    annualVol1y:{label:'近1年年化波动',format:'pct',direction:'low'},
    sharpe1y:{label:'近1年夏普',format:'number',direction:'high'},
    sortino1y:{label:'近1年索提诺',format:'number',direction:'high'},
    calmar1y:{label:'近1年卡玛',format:'number',direction:'high'},
    monthlyWin1y:{label:'近1年月胜率',format:'pct',direction:'high'},
    recovery:{label:'近1年回撤修复',format:'pct',direction:'high'},
  };
  const axes = [
    ['returnAbility','收益能力',['return1y'],'近1年收益的相对位置'],
    ['riskEfficiency','风险收益效率',['sharpe1y','sortino1y','calmar1y'],'近1年夏普、索提诺与卡玛'],
    ['drawdownControl','回撤控制',['maxDrawdown'],'近1年最大回撤，越接近0越好'],
    ['volatilityControl','波动控制',['annualVol1y'],'近1年年化波动，越低越好'],
    ['stability','盈利稳定性',['monthlyWin1y'],'近1年正收益完整月份占比'],
    ['recoveryAbility','修复能力',['recovery'],'近1年最大回撤后的前高修复程度'],
  ].map(([code,label,inputs,description]) => ({code,label,inputs,description,rule:'统一近1年、同一完整六维样本池；复合维度必须各项齐全，缺失不记0分。'}));
  const scoringMetrics = row => ({...row.comparison?.metrics,...row.comparison?.scoringMetrics});
  const known = value => typeof value==='string' && value.trim() && !/未知|未分类|待分类|待细分|其他|未披露|unresolved|unknown/i.test(value);
  function cohort(row) {
    const c=row.style?.classification;
    if(!c || !known(c.strategy1) || !known(c.strategy2) || !known(c.market) || !known(row.currency))return null;
    if(c.status!=='source_label_mapped')return null;
    if(c.strategy2==='指数增强'&&!known(c.benchmark))return null;
    return [c.strategy1,c.strategy2,c.strategy2==='指数增强'?c.benchmark:'',c.market,row.currency.toUpperCase()].filter(Boolean).join(' · ');
  }
  const sixComplete = row => row.dataQualityStatus!=='needs_review' && row.comparison?.scoringPeriod==='1y' && volatilityEligible(row) && axes.every(a=>a.inputs.every(c=>finite(scoringMetrics(row)[c])));

  async function dataScript(url, prefix, onDownload=()=>{}) {
    if(version) url += `${url.includes('?')?'&':'?'}v=${encodeURIComponent(version)}`;
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),60000);
    try {
    const response = await fetch(url,{signal:controller.signal});
    if (!response.ok) throw new Error(`静态数据加载失败 ${response.status}：${url}`);
    const total=Number(response.headers?.get('Content-Length'))||0,chunks=[];
    let received=0;
    if(response.body?.getReader){const reader=response.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.byteLength;onDownload(received,total);}}
    else {const value=await response.arrayBuffer();chunks.push(value);received=value.byteLength;onDownload(received,total);}
    const blob=new Blob(chunks);
    if(window.PrivateFundStaticLoader?.decodeBytes){const name=prefix.match(/window\.([A-Z_]+)=/)?.[1];return (await window.PrivateFundStaticLoader.decodeBytes(new Uint8Array(await blob.arrayBuffer()),url,name)).payload;}
    let body;
    const magic=new Uint8Array(await blob.slice(0,2).arrayBuffer());
    if (magic[0]===31 && magic[1]===139) {
      if (typeof DecompressionStream !== 'function') throw new Error('浏览器不支持压缩数据，请升级浏览器。');
      body = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    } else body = await blob.text();
    if (!body.trim().startsWith(prefix)) throw new Error('静态数据格式不正确');
    const payload=JSON.parse(body.trim().slice(prefix.length).replace(/;\s*$/, ''));
    return window.PrivateFundStaticLoader?.unpack(payload)||payload;
    } finally {clearTimeout(timeout);}
  }
  function catalog(onDownload) {
    catalogPromise ||= window.__PRIVATE_FUND_CATALOG__ ? Promise.resolve(window.__PRIVATE_FUND_CATALOG__)
      : dataScript(window.__PRIVATE_FUND_ANALYSIS_CATALOG_URL__ || './data/detail-index.js.gz', 'window.__PRIVATE_FUND_CATALOG__=',onDownload).catch(e=>{catalogPromise=null;throw e;});
    return catalogPromise;
  }
  function detail(row) {
    if (!cache.has(row.key)) {
      const file = row.detailFile;
      if (!/^[A-Za-z0-9_./-]+$/.test(file) || file.includes('..')) throw new Error('无效详情路径');
      cache.set(row.key, dataScript(`./data/details/${file}`, 'window.__PRIVATE_FUND_DETAIL__=').catch(e => {cache.delete(row.key);throw e;}));
    }
    return cache.get(row.key);
  }
  const camel = o => Object.fromEntries(Object.entries(o || {}).map(([k,v]) => [k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),v]));
  function readable(v) {
    return window.PrivateFundBusinessText.readable(v);
  }
  function profile(row, d) {
    const displayRecord=o=>Object.fromEntries(Object.entries(camel(o)).map(([k,v])=>[k,readable(v)]));
    const core = {...camel(d.product), ...camel(d.terms)};
    const scale = [...(d.scale || [])].sort((a,b) => String(a.scale_date || '').localeCompare(String(b.scale_date || ''))).at(-1) || {};
    Object.assign(core, {inceptionDate:row.inceptionDate, riskLevel:row.riskLevel,
      productScale:window.PrivateFundBusinessText.productScale(scale.scale_readable_raw||scale.scale_value_raw,row.source==='simuwang'?scale.scale_unit:(scale.scale_unit_raw||'')),
      productScaleDate:scale.scale_date, productScaleNote:'来源原值，未擅自换算', latestPerformanceDate:row.analysisLatestDate||(d.incomeSeries?.[0]?.points||[]).at(-1)?.date,
      investmentLogic:d.terms?.investment_strategy_description, strategy:row.strategy1,
      productStatus:d.product?.sale_status||d.product?.product_status,
      recentOpenDates:d.terms?.recent_open_dates || d.terms?.recent_open_dates_json});
    const displayCore=window.PrivateFundBusinessText.coreElements(core,row.source);
    displayCore.detailNotice=d.termsAvailability?.message || '';
    if(d.termsAvailability?.collectedAt)displayCore.detailNotice+=` 详情采集：${d.termsAvailability.collectedAt}`;
    if(row.source==='simuwang' && d.terms) {
      if(displayCore.paymentTime)displayCore.paymentTime=`申购缴款截止：${displayCore.paymentTime}；赎回到账时间未披露`;
      if(displayCore.documentAvailability)displayCore.documentAvailability+='（来源存在标记，不代表文件正文已下载）';
    }
    if(row.source==='simuwang' && /^\d+$/.test(String(displayCore.productStatus||''))) {
      displayCore.productStatus=String(displayCore.productStatus)==='2'?'正在运作':`来源状态代码 ${displayCore.productStatus}（待核对）`;
    }
    if(d.termsAvailability?.status==='pending_collection') {
      for(const field of 'subscriptionThreshold minimumAdditionalAmount lockupPeriod quasiLockupPeriod openDay recentOpenDates purchaseOpenDay redemptionOpenDay paymentTime managementFee custodianFee operationFee salesServiceFee subscriptionFee purchaseFee redemptionFee performanceFee performanceFeeDescription warningLine stopLossLine custodianName incomeDistributionRule informationDisclosurePeriod documentAvailability investmentLogic investmentScope investmentRestriction'.split(' ')) {
        if(displayCore[field]==null||displayCore[field]==='')displayCore[field]='详情待补齐';
      }
      if(!d.scale?.length)displayCore.productScale='详情待补齐';
    }
    return {coreElements:displayCore, company:{...displayRecord(d.company),name:d.company?.source_company_name || row.company,
      type:d.company?.company_type,scaleBand:d.company?.company_scale_band},
      managers:(d.managers || []).map(m => ({...displayRecord(m.profile),...displayRecord(m.relation),name:m.relation?.source_manager_name || m.profile?.source_manager_name}))};
  }
  function bucket(row, mode) {
    if (mode === 'style') return row.style?.broad || '其他策略';
    if (mode === 'styleMarket') return row.style?.label || '其他策略';
    if (mode === 'market') return row.style?.market || '未分类';
    const value = row.comparison?.metrics?.[mode];
    if (!finite(value)) return null;
    const cuts = {annualReturn:[-.1,0,.05,.1,.2,.4],maxDrawdown:[.05,.1,.2,.3],annualVol:[.05,.1,.15,.2,.3],sharpe:[0,.5,1,1.5,2],monthlyWin:[.4,.5,.6,.7]}[mode];
    if (!cuts) return null;
    const v = mode === 'maxDrawdown' ? Math.abs(value) : value;
    const index = cuts.findIndex(c => v < c), lower = index < 0 ? cuts.at(-1) : cuts[index-1], upper = index < 0 ? null : cuts[index];
    const fmt = n => mode === 'sharpe' ? String(n) : `${Math.round(n*100)}%`;
    return lower == null ? `<${fmt(upper)}` : upper == null ? `≥${fmt(lower)}` : `${fmt(lower)}–${fmt(upper)}`;
  }
  const volatilityEligible = row => row.comparison?.volatilityScreen?.eligible===true;
  const referenceCache=new WeakMap();
  // Display references are deliberately independent of the strict ranking pool.
  // Stable selection uses disclosed classification/history, never assumed target metrics.
  function referenceCandidates(rows, target, excluded=new Set(), limit=3) {
    const known=target.style?.broad && target.style.broad!=='其他策略';
    let cache=referenceCache.get(rows);
    if(!cache){cache=new Map();referenceCache.set(rows,cache);}
    const cacheKey=JSON.stringify([target.source,known?target.style.broad:null,target.style?.market]);
    const tier=r=>known&&r.style?.broad===target.style.broad ?
      (r.style?.market===target.style?.market?0:1) : r.source===target.source?2:3;
    if(!cache.has(cacheKey)) {
      const candidates=rows.filter(r=>r.detailFile&&r.comparison?.eligible&&r.analysisPointCount>=2&&r.dataQualityStatus!=='needs_review');
      const latest=candidates.reduce((d,r)=>String(r.analysisLatestDate||'')>d?String(r.analysisLatestDate):d,'');
      const freshness=r=>!r.analysisLatestDate||days(latest,r.analysisLatestDate)>30?1:0;
      candidates.sort((a,b)=>tier(a)-tier(b)||freshness(a)-freshness(b)||
        (b.analysisPointCount||0)-(a.analysisPointCount||0)||a.key.localeCompare(b.key));
      cache.set(cacheKey,candidates);
    }
    return cache.get(cacheKey).filter(r=>r.key!==target.key&&!excluded.has(r.key)).slice(0,limit).map(row=>({row,label:[
      '同风格同市场标准参考','同风格跨市场标准参考','同渠道标准参考（非同类认定）','通用标准参考（非同类认定）'
    ][tier(row)]}));
  }
  function rank(pool, key, code) {
    pool=pool.filter(sixComplete);
    const spec = definitions[code], value = scoringMetrics(pool.find(r => r.key === key)||{})[code];
    const values = pool.map(r=>scoringMetrics(r)[code]).filter(finite);
    if (spec.rankable === false || !finite(value) || values.length < 2) return null;
    const better = values.filter(v => spec.direction === 'high' ? v > value : v < value).length;
    const equal = values.filter(v => v === value).length;
    return {rank:better+1,denominator:values.length,percentile:Math.round(100*(values.length-better-(equal+1)/2)/(values.length-1)*10)/10};
  }
  function scoringReason(row, pool, reference=false) {
    if(reference)return '标准参考产品：不属于当前严格同类评分样本，不生成百分位。';
    const reasons=[];
    if(!cohort(row))reasons.push('细分策略、市场或币种未确认，不认定同类。');
    if(!freshPerformance(row))reasons.push('最新业绩日期须距今天不超过15个自然日；超期、未知或未来日期不进入评分。');
    if(!sixComplete(row))reasons.push('近1年六维所需指标不齐或风险序列代表性不足，不进入综合评分。');
    if(!finite(row.comparison?.metrics?.return1y))reasons.push(row.metricMissing?.return_1y?.message||'近一年历史不足。');
    if(row.style?.broad==='其他策略')reasons.push('投资风格尚未确认，不能据产品名称或QDII身份认定同类。');
    if(!pool.some(r=>r.key===row.key))reasons.push('未进入当前分类和日期窗口的严格同类组。');
    else if(pool.length<2)reasons.push('当前同类组不足2个可比样本。');
    return reasons.join(' ')||'该维度有效指标或可比样本不足。';
  }
  function axisObservations(row, axis) {
    const metrics=scoringMetrics(row), values=axis.inputs.filter(c=>finite(metrics[c])).map(c=>({label:definitions[c].label,value:metrics[c],format:definitions[c].format,code:c}));
    // Non-annual return and drawdown fallbacks remain evidence only; annualized
    // and risk-adjusted scores already use the full available-history contract.
    if(axis.code==='returnAbility'&&finite(row.filterMetrics?.return_since))values.push({label:'完整可用期收益',value:row.filterMetrics.return_since,format:'pct',code:'returnSinceInception'});
    if(axis.code==='drawdownControl'&&!values.length&&finite(row.filterMetrics?.max_drawdown_since))values.push({label:'完整可用期最大回撤',value:row.filterMetrics.max_drawdown_since,format:'pct',code:'maxDrawdown'});
    return values;
  }
  async function build(params, progress=()=>{}) {
    progress(5,'正在读取产品索引…');
    const started = performance.now(), pack = await catalog((received,total)=>progress(total?5+40*Math.min(1,received/total):null,`正在下载产品索引 · ${Math.ceil(received/1024)} KB${total?` / ${Math.ceil(total/1024)} KB`:''}`)), rows = pack.rows;
    progress(45,'产品索引已就绪，正在计算同类与标杆…');
    const key = `${params.get('source_id')}:${params.get('product_id')}`, targetRow = rows.find(r=>r.key===key);
    if (!targetRow) throw new Error('该产品未包含在当前静态发布包中');
    const compareKey = `${params.get('compare_source_id')}:${params.get('compare_product_id')}`;
    const custom = rows.find(r=>r.key===compareKey && r.key!==key);
    const today = todayShanghai(), identity=cohort(targetRow);
    const modes = [{code:'style',label:'细分策略＋市场＋币种',targetBucket:identity||'分类证据不足',available:true}];
    const mode = 'style';
    // Freshness is relative to today's Shanghai calendar date, not the target
    // or snapshot date. Historical metrics retain their original contract.
    // Custom products NEVER alter this population or its ranks/medians.
    const classifiedPool = identity && freshPerformance(targetRow,today)
      ? rows.filter(r=>cohort(r)===identity && freshPerformance(r,today)) : [];
    const pool = sixComplete(targetRow)?classifiedPool.filter(sixComplete):[];
    const reasons = new Map();
    for (const code of ['return1y','maxDrawdown','annualVol1y','monthlyWin1y','sharpe1y','recovery']) {
      const candidates = pool.filter(r=>r.key!==key);
      candidates.sort((a,b)=>(scoringMetrics(a)[code]-scoringMetrics(b)[code])*(definitions[code].direction==='high'?-1:1)||a.key.localeCompare(b.key));
      if (candidates.length) {const winner=candidates[0];reasons.set(winner.key,[...(reasons.get(winner.key)||[]),`${definitions[code].label}领先`]);}
    }
    const referenceKeys=new Set();
    const appendReferences=(excluded,limit)=>referenceCandidates(rows,targetRow,excluded,limit).map(({row,label})=>{
      referenceKeys.add(row.key);reasons.set(row.key,[label,'仅展示参考，不参与严格排名']);return row;
    });
    if(reasons.size<3)appendReferences(new Set([...reasons.keys(),...(custom?[custom.key]:[])]),3-reasons.size);
    const selectedRows = [targetRow, ...(custom?[custom]:[]), ...[...reasons.keys()].filter(k=>k!==custom?.key).map(k=>rows.find(r=>r.key===k))];
    let completed=0;
    const peerLoadErrors=[];
    progress(60,`正在加载产品与标杆详情 · 0/${selectedRows.length}`);
    const loadProduct=async row=>{
      let d;
      try {d=await detail(row);} catch(firstError) {
        try {d=await detail(row);} catch(error) {
          if(row.key===key)throw error;
          peerLoadErrors.push(`${row.name}：${error.message}`);return null;
        }
      }
      const ranks = {};
      progress(60+30*(++completed/selectedRows.length),`产品与标杆详情已就绪 · ${completed}/${selectedRows.length}`);
      if(!referenceKeys.has(row.key))for (const code of Object.keys(definitions)) {const r=rank(pool,row.key,code);if(r)ranks[code]=r;}
      const scores = Object.fromEntries(axes.map(a=>{const vals=a.inputs.map(c=>ranks[c]?.percentile).filter(finite),complete=vals.length===a.inputs.length;return[a.code,{score:complete?Math.round(vals.reduce((s,v)=>s+v,0)/vals.length*10)/10:null,usedInputs:vals.length,totalInputs:a.inputs.length,reason:complete?null:scoringReason(row,pool,referenceKeys.has(row.key)),observations:axisObservations(row,a)}];}));
      const metricSources = Object.fromEntries(Object.keys(definitions).map(c=>[c,{label:c==='returnSinceInception'?'完整可用历史计算':c.startsWith('return')?'历史区间端点计算':c==='annualReturn'?'成立以来几何年化 · 实际天数':c==='maxDrawdown'||c==='recovery'?'近1年全部有效观测点计算':'成立以来历史计算 · 完整月度口径'}]));
      const displayMetrics = scoringMetrics(row);
      for(const c of Object.keys(definitions).filter(c=>c.endsWith('1y')))metricSources[c]={label:'近1年历史计算 · 与六维观察期一致'};
      for (const [key,code] of Object.entries({return1m:'return_1m',return3m:'return_3m',return6m:'return_6m',returnYtd:'return_ytd',return1y:'return_1y',returnSinceInception:'return_since'})) {
        const metric=row.metrics?.[code];
        if (!finite(displayMetrics[key]) && metric?.origin==='source' && metric.scaleStatus==='verified') {
          displayMetrics[key]=metric.value/100;
          metricSources[key]={label:`来源披露（尺度已核验；${metric.asOf||'日期未披露'}），不参与历史计算排名`};
        }
      }
      const reasonCodes={return1m:'return_1m',return3m:'return_3m',return6m:'return_6m',returnYtd:'return_ytd',return1y:'return_1y',returnSinceInception:'return_since',annualReturn:'annual_return_since',annualVol:'volatility_since',maxDrawdown:'drawdown_1y',sharpe:'sharpe_since',sortino:'sortino_since',calmar:'calmar_since',monthlyWin:'monthly_win_since'};
      for(const code of Object.keys(definitions)) if(!finite(displayMetrics[code])) {
        const reason=row.metricMissing?.[reasonCodes[code]];
        metricSources[code]={label:reason?.label||'历史、采样或分母条件不足',message:reason?.message};
      }
      return {key:row.key,sourceId:row.source,sourceLabel:row.sourceLabel,productId:row.id,name:row.name,
        companyName:row.company,managerNames:d.managers?.length ? d.managers.map(m=>m.relation?.source_manager_name || m.profile?.source_manager_name).filter(Boolean) : (row.managers||[]),inceptionDate:row.inceptionDate,style:row.style,
        awards:(row.awards||[]).map(a=>({id:a.id,brand:a.brand,year:a.year,evaluationYear:a.evaluationYear,periodYears:a.periodYears,series:a.series,category:a.category,status:a.status,url:a.url,recipient:a.recipient})),
        reasons:row.key===key?['目标产品']:row.key===custom?.key?['自选对比',...(pool.some(r=>r.key===row.key)?[]:['同类窗外 · 不排名'])]:reasons.get(row.key)||[],
        coreComparable:!referenceKeys.has(row.key) && pool.some(r=>r.key===row.key) && axes.every(a=>finite(scores[a.code].score)),metrics:displayMetrics,metricSources,directMetrics:{},ranks,axisScores:scores,scoreNotice:scoringReason(row,pool,referenceKeys.has(row.key)),volatilityScreen:row.comparison?.volatilityScreen,
        curve:(d.analysisCurve||[]).map(p=>({date:p.date,value:1+p.value})),latestDate:row.analysisLatestDate,
        incomeSeries:d.incomeSeries||[],representativeProduct:d.representativeProduct||null,
        gffundsAttribution:row.key===key?(d.gffundsAttribution||null):null,
        analysisUrl:`./detail.html?id=${encodeURIComponent(row.key)}`,profile:profile(row,d)};
    };
    const products=(await Promise.all(selectedRows.map(loadProduct))).filter(Boolean);
    if(products.length<2&&peerLoadErrors.length) {
      const alternatives=appendReferences(new Set(selectedRows.map(r=>r.key)),3);
      products.push(...(await Promise.all(alternatives.map(loadProduct))).filter(Boolean));
    }
    const target=products[0], targetCurve=target.curve, median={};
    for(const c of Object.keys(definitions)){const vals=pool.map(r=>scoringMetrics(r)[c]).filter(finite).sort((a,b)=>a-b);median[c]=vals.length?(vals[Math.floor((vals.length-1)/2)]+vals[Math.ceil((vals.length-1)/2)])/2:null;}
    const excludedVolatility=classifiedPool.filter(r=>!volatilityEligible(r)).length;
    progress(94,'数据计算完成，正在绘制走势与对比…');
    return {target,products,coreElements:target.profile.coreElements,company:target.profile.company,managers:target.profile.managers,
      gffundsAttribution:target.gffundsAttribution||null,
      peerGroup:{mode,bucket:cohort(targetRow)||'分类证据不足',modes,count:pool.length,median,
        definition:'仅使用来源明确披露的细分策略；同市场、同币种，不限制业绩序列类型。指数增强还须同基准指数。缺分类不猜测，股票多头与市场中性不混比。',
        alignmentRule:`六维统一近1年；最新业绩日期距今天（${today}，北京时间）不超过15个自然日，不再要求区间起止日对齐。六维所需指标全部有效、月度覆盖率至少80%、通过净值代表性筛查才入选；不足2只不评分。`},
      selectedComparison:custom&&products.some(p=>p.key===custom.key)?{key:custom.key}:null,
      metricDefinitions:Object.fromEntries([...new Set(['return1y','annualReturn1y','maxDrawdown','annualVol1y','sharpe1y','sortino1y','calmar1y','monthlyWin1y','recovery',...Object.keys(definitions)])].map(c=>[c,definitions[c]])),axisDefinitions:axes,
      referenceSelection:{version:'standard_references_v1',count:products.filter(p=>referenceKeys.has(p.key)).length,failed:peerLoadErrors},
      benchmark:{curve:[]},quality:{historySinceInception:false,targetCurvePointCount:targetCurve.length,benchmarkPointCount:0,volatilityExcludedCount:excludedVolatility,
        notes:[...(referenceKeys.size?['已补充标准参考产品；优先同风格同市场，其次同渠道及通用参考。参考池独立于严格同类池，不改变排名、中位数或目标评分。']:[]),...(peerLoadErrors.length?[`部分参考详情加载失败，已保留目标详情及其他可用参考：${peerLoadErrors.join('；')}`]:[]),...(target.incomeSeries.length?['货币型产品：万份收益以元/万份展示，七日年化以百分比展示；年化指标不代表实际持有期收益。']:[...(targetRow.dataQualityNote ? [`${targetRow.dataQualityStatus==='needs_review'?'待核对：':''}${targetRow.dataQualityNote}`] : []),...(targetRow.analysisSeriesLabel ? [`目标业绩口径：${targetRow.analysisSeriesLabel}；使用已入库可观测历史，不声明源端历史已全部披露。`] : []),'六维评分统一近1年并使用同一完整样本池；成立以来指标仅保留原有展示，不进入六维排名。夏普与索提诺无风险年利率假设2%。',
          `风险序列代表性不足的产品不进入六维综合样本池。筛查包括长期净值未变、实际变动不足，以及高波动策略的异常平滑序列，不等同于认定数据虚假。`,
          ...(!volatilityEligible(targetRow)?[`目标产品不参与波动领先与波动评分：${(targetRow.comparison?.volatilityScreen?.reasons||[]).map(r=>r.label).join('；')||'风险质量证据不足'}。原始指标及手动对比仍保留。`]:[]),
          ...(targetRow.comparison?.eligible?pool.length<2?['当前分类与日期条件下不足2个可比样本；可自选产品仅作资料和走势参考，不生成不足样本的排名。']:[]:['目标产品近1年六维指标、分类证据或风险序列条件不足，保留已有数据，不生成可比排名。'])])]},
      meta:{generatedAt:pack.meta.generatedAt,databaseModifiedAt:pack.meta.generatedAt,queryDurationMs:Math.round(performance.now()-started),comparisonWindowLabel:'六维统一近1年',
        databasePath:'私募静态数据快照',dynamicContract:'所有比较在浏览器内基于静态分片生成，不调用本地数据库接口。仅用于内部研究，不用于任何投资建议。'}};
  }
  async function request(url, options={}) {
    try {
      const parsed = new URL(url,location.href);
      const data = parsed.pathname.endsWith('/products')
        ? {items:(await catalog()).rows.filter(r=>`${r.name} ${r.id} ${r.company} ${(r.companyAliases||[]).join(' ')}`.toLowerCase().includes((parsed.searchParams.get('q')||'').toLowerCase())).slice(0,12).map(r=>({key:r.key,sourceId:r.source,productId:r.id,name:r.name,sourceLabel:r.sourceLabel,companyName:r.company}))}
        : await build(parsed.searchParams,options.onProgress);
      return {ok:true,json:async()=>({status:'ok',data})};
    } catch(e) {return {ok:false,json:async()=>({status:'error',message:e.message})};}
  }
  window.PrivateFundAnalysisStatic = {request,build,rank,bucket,profile,volatilityEligible,referenceCandidates,scoringReason,axisObservations,cohort,sixComplete,freshPerformance,todayShanghai};
})();
