/* Static adapter for the existing product-analysis renderer. No local API. */
(() => {
  const version = new URL(document.currentScript?.dataset?.inlineSrc || document.currentScript?.src || location.href, location.href).searchParams.get('v') || '';
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
  function referenceCohort(row) {
    const c=row.style?.classification;
    if(!c || c.status!=='source_label_mapped' || !known(c.strategy1) || !known(c.strategy2))return null;
    if(c.strategy2==='指数增强'&&!known(c.benchmark))return null;
    // Missing fields remain explicit, separate buckets. Never merge a disclosed
    // market/currency with an unknown one or infer either from a product name.
    return [c.strategy1,c.strategy2,c.strategy2==='指数增强'?c.benchmark:'',
      known(c.market)?c.market:'市场待核',known(row.currency)?row.currency.toUpperCase():'币种待核'].filter(Boolean).join(' · ');
  }
  function broadCohort(row) {
    // Source-disclosed families only; never infer from names or returns.
    const c=row.style?.classification;
    const families={'股票策略':'权益类','债券策略':'固收类','期货及衍生品策略':'CTA/期货','多资产策略':'宏观/多策略','组合基金':'FOF'};
    return ['source_label_mapped','source_primary_only'].includes(c?.status)?(families[c.strategy1]||null):null;
  }
  function comparisonGroup(rows,target,today=todayShanghai(),requested='style') {
    const disclosed=broadCohort(target);
    const identity=({'equity':'权益类','fixed_income':'固收类'})[requested]||disclosed||'权益类',scope='broad_category';
    // This is a comparison assumption for this target, not a source classification.
    const assumed=!disclosed;
    const classified=rows.filter(r=>(broadCohort(r)===identity||(assumed&&r.key===target.key))&&freshPerformance(r,today));
    return {scope,assumed,label:identity?`${identity}大类对比`:'资料参考（大类待确认）',
      identity:identity||'分类证据不足',classified,pool:classified.filter(sixComplete)};
  }
  const sixComplete = row => row.externalPeerRankEligible!==false && row.dataQualityStatus!=='needs_review' && row.comparison?.scoringPeriod==='1y' && volatilityEligible(row) && axes.every(a=>a.inputs.every(c=>finite(scoringMetrics(row)[c])));

  async function dataScript(url, prefix, onDownload=()=>{}, timeoutMs=12000) {
    if(version) url += `${url.includes('?')?'&':'?'}v=${encodeURIComponent(version)}`;
    const controller=new AbortController(), hardTimeout=setTimeout(()=>controller.abort(),30000);
    let timeout=setTimeout(()=>controller.abort(),timeoutMs);
    const receivedChunk=()=>{clearTimeout(timeout);timeout=setTimeout(()=>controller.abort(),timeoutMs);};
    try {
    const response = await fetch(url,{signal:controller.signal});
    if (!response.ok) throw new Error(`静态数据加载失败 ${response.status}：${url}`);
    const total=Number(response.headers?.get('Content-Length'))||0,chunks=[];
    let received=0;
    if(response.body?.getReader){const reader=response.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;receivedChunk();chunks.push(value);received+=value.byteLength;onDownload(received,total);}}
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
    } catch(error){if(controller.signal.aborted)throw new Error('数据下载超时，请重试加载。');throw error;}
    finally {clearTimeout(timeout);clearTimeout(hardTimeout);}
  }
  function catalog(onDownload) {
    catalogPromise ||= window.__PRIVATE_FUND_CATALOG__ ? Promise.resolve(window.__PRIVATE_FUND_CATALOG__)
      : dataScript(window.__PRIVATE_FUND_ANALYSIS_CATALOG_URL__ || './data/detail-index.js.gz', 'window.__PRIVATE_FUND_CATALOG__=',onDownload).catch(e=>{catalogPromise=null;throw e;});
    return catalogPromise;
  }
  const snapshotCache=new Map();
  function snapshot(url){
    if(!snapshotCache.has(url))snapshotCache.set(url,dataScript(url,'window.__PRIVATE_FUND_ANALYSIS_SNAPSHOT__=',undefined,6000)
      .catch(()=>dataScript(`${url}?retry=${Date.now()}`,'window.__PRIVATE_FUND_ANALYSIS_SNAPSHOT__=',undefined,6000))
      .catch(e=>{snapshotCache.delete(url);throw e;}));
    return snapshotCache.get(url);
  }
  async function productSnapshot(key){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
    const hex=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('').slice(0,3);
    const id=(parseInt(hex,16)%2048).toString(16).padStart(3,'0');
    const bucket=await snapshot(`./data/analysis/${id.slice(0,2)}/${id}.js.gz`),product=bucket.products[key];
    if(!product)throw new Error('该产品未包含在当前静态发布包中');
    return {...product,meta:bucket.meta};
  }
  async function preparedInput(params){
    const key=`${params.get('source_id')}:${params.get('product_id')}`,other=`${params.get('compare_source_id')}:${params.get('compare_product_id')}`;
    const target=await productSnapshot(key),today=todayShanghai();
    const expired=today>target.meta.lastPossibleScoringDate;
    if(!target.days[today]&&!expired)return null; // Unexpected clock/future-data cases use the exact live rules.
    const family=({'equity':'权益类','fixed_income':'固收类'})[params.get('peer_mode')]||broadCohort(target.row)||'权益类';
    const filename=({'权益类':'equity','固收类':'fixed_income','CTA/期货':'cta','宏观/多策略':'multi','FOF':'fof'})[family];
    let customUnavailable=false;
    const [summary,custom]=await Promise.all([snapshot(`./data/analysis-groups/${filename}.js.gz`),
      other!=='null:null'&&other!==key?productSnapshot(other).catch(()=>{customUnavailable=true;return null;}):null]);
    const period=expired?{count:0,excludedVolatility:0,median:Object.fromEntries(Object.keys(definitions).map(c=>[c,null])),ranks:{}}:summary.days[today];
    if(!period)return null;
    const rows=[...new Map([...summary.rows,target.row,...(custom?[custom.row]:[])].map(r=>[r.key,r])).values()];
    const inserted=!broadCohort(target.row)&&freshPerformance(target.row,today)&&sixComplete(target.row);
    const allStats={...period.ranks};
    for(const item of [target,custom].filter(Boolean))allStats[item.row.key]=(item===target||broadCohort(item.row)===family)?item.days[today]?.[family]?.ranks||{}:{};
    const independentRanks=new Map(),independentCounts=new Map();
    for(const item of [target,custom].filter(Boolean)){
      const ownFamily=broadCohort(item.row)||(item===target?family:'权益类');
      if(ownFamily===family&&(item===target||broadCohort(item.row)))continue;
      const stats=expired?{}:item.days[today]?.[ownFamily]?.ranks||{},own={};
      for(const [code,[better,equal,n]] of Object.entries(stats)){
        independentCounts.set(item.row.key,n);
        if(n>=2)own[code]={rank:better+1,denominator:n,percentile:Math.round(100*(n-better-(equal+1)/2)/(n-1)*10)/10};
      }
      independentRanks.set(item.row.key,own);
    }
    const ranks=new Map(Object.keys(definitions).map(c=>[c,new Map()]));
    for(const [rowKey,metrics] of Object.entries(allStats))for(const [code,stat] of Object.entries(metrics)){
      let [better,equal,n]=stat;
      const value=scoringMetrics(target.row)[code];
      if(inserted&&rowKey!==key&&finite(value)){
        const peer=scoringMetrics(rows.find(r=>r.key===rowKey))[code];
        if(value===peer)equal++;
        if(definitions[code].direction==='high'?value>peer:value<peer)better++;
        n++;
      }
      if(n>=2)ranks.get(code).set(rowKey,{rank:better+1,denominator:n,percentile:Math.round(100*(n-better-(equal+1)/2)/(n-1)*10)/10});
    }
    return {meta:target.meta,rows,ranks,independentRanks,independentCounts,customUnavailable,references:summary.references,count:period.count+(inserted?1:0),
      median:inserted?target.days[today][family].median:period.median,
      excludedVolatility:period.excludedVolatility+(!broadCohort(target.row)&&freshPerformance(target.row,today)&&!volatilityEligible(target.row)?1:0)};
  }
  const detailQueue=[];
  let detailActive=0;
  function scheduleDetail(task){
    return new Promise((resolve,reject)=>{detailQueue.push({task,resolve,reject});drainDetails()});
  }
  function drainDetails(){
    while(detailActive<3&&detailQueue.length){
      const job=detailQueue.shift();detailActive++;
      Promise.resolve().then(job.task).then(job.resolve,job.reject).finally(()=>{detailActive--;drainDetails()});
    }
  }
  const detailBundles=new Map();
  function detail(row) {
    if (!cache.has(row.key)) {
      const file = row.detailFile;
      if (!/^[A-Za-z0-9_./-]+$/.test(file) || file.includes('..')) throw new Error('无效详情路径');
      const url=`./data/details/${file}`;
      if(file.startsWith('anonymous/')){
        if(!detailBundles.has(file))detailBundles.set(file,scheduleDetail(()=>dataScript(url,'window.__PRIVATE_FUND_DETAIL__=',undefined,6000)
          .catch(()=>dataScript(`${url}?retry=${Date.now()}`,'window.__PRIVATE_FUND_DETAIL__=',undefined,6000)))
          .catch(e=>{detailBundles.delete(file);throw e;}));
        cache.set(row.key,detailBundles.get(file).then(bundle=>{
          const value=bundle.bundleVersion===1&&bundle.details?.[row.key];
          if(!value||value.catalog?.key!==row.key)throw new Error('产品详情与目录不匹配');
          return value;
        }).catch(e=>{cache.delete(row.key);throw e;}));
        return cache.get(row.key);
      }
      cache.set(row.key, scheduleDetail(()=>dataScript(url, 'window.__PRIVATE_FUND_DETAIL__=',undefined,6000)
        .catch(()=>dataScript(`${url}?retry=${Date.now()}`, 'window.__PRIVATE_FUND_DETAIL__=',undefined,6000)))
        .catch(e => {cache.delete(row.key);throw e;}));
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
      productScale:window.PrivateFundBusinessText.productScale(scale.scale_readable_raw||scale.scale_value_raw,scale.scale_unit_raw||scale.scale_unit||''),
      productScaleDate:scale.scale_date, productScaleNote:'来源原值，未擅自换算', latestPerformanceDate:row.analysisLatestDate||(d.incomeSeries?.[0]?.points||[]).at(-1)?.date,
      investmentLogic:d.terms?.investment_strategy_description, strategy:row.strategy1,
      productStatus:d.product?.sale_status||d.product?.product_status,
      recentOpenDates:d.terms?.recent_open_dates || d.terms?.recent_open_dates_json});
    const displayCore=window.PrivateFundBusinessText.coreElements(core,row.source);
    displayCore.detailNotice=d.termsAvailability?.message || '';
    if(d.sourceEvidence?.message)displayCore.detailNotice=d.sourceEvidence.message+' '+displayCore.detailNotice;
    if(d.sourceEvidence?.internalDirectoryKey)displayCore.sourceProductId=d.sourceEvidence.officialProductCode || '源站未提供；内部目录键见详情';
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
  function referenceCandidates(rows, target, excluded=new Set(), limit=3, family=broadCohort(target)||'权益类') {
    let cache=referenceCache.get(rows);
    if(!cache){cache=new Map();referenceCache.set(rows,cache);}
    const cacheKey=JSON.stringify([target.source,family]);
    const tier=r=>family&&broadCohort(r)===family?0:r.source===target.source?1:2;
    if(!cache.has(cacheKey)) {
      const candidates=rows.filter(r=>r.detailFile&&r.comparison?.eligible&&r.analysisPointCount>=2&&r.dataQualityStatus!=='needs_review'&&(!family||broadCohort(r)===family));
      const latest=candidates.reduce((d,r)=>String(r.analysisLatestDate||'')>d?String(r.analysisLatestDate):d,'');
      const freshness=r=>!r.analysisLatestDate||days(latest,r.analysisLatestDate)>30?1:0;
      candidates.sort((a,b)=>tier(a)-tier(b)||freshness(a)-freshness(b)||
        (b.analysisPointCount||0)-(a.analysisPointCount||0)||a.key.localeCompare(b.key));
      cache.set(cacheKey,candidates);
    }
    return cache.get(cacheKey).filter(r=>r.key!==target.key&&!excluded.has(r.key)).slice(0,limit).map(row=>({row,label:[
      '同大类补充参考','同渠道资料参考（大类未确认）','资料参考（大类未确认）'
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
  function scoringReason(row, pool, reference=false, scope='strict', count=pool.length, included=pool.some(r=>r.key===row.key)) {
    if(reference)return '资料参考产品：不属于当前评分样本，不生成百分位；保留已有指标。';
    const reasons=[];
    if(!broadCohort(row)&&!included)reasons.push('来源大类待确认；按默认权益比较假设检查评分条件，不修改原始分类。');
    if(!freshPerformance(row))reasons.push('最新业绩日期须距今天不超过15个自然日；超期、未知或未来日期不进入评分。');
    if(!sixComplete(row))reasons.push('近1年六维所需指标不齐或风险序列代表性不足，不进入综合评分。');
    if(!finite(row.comparison?.metrics?.return1y))reasons.push(row.metricMissing?.return_1y?.message||'近一年历史不足。');
    if(!included)reasons.push('未满足所属评分大类的样本准入条件。');
    else if(count!=null&&count<2)reasons.push('所属大类评分样本不足2只。');
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
  async function build(params, progress=()=>{}, onUpdate) {
    progress(5,'正在读取产品索引…');
    const started = performance.now(), prepared=window.__PRIVATE_FUND_ANALYSIS_SNAPSHOT_ENABLED__?await preparedInput(params):null;
    const pack = prepared || await catalog((received,total)=>progress(total?5+40*Math.min(1,received/total):null,`正在下载产品索引 · ${Math.ceil(received/1024)} KB${total?` / ${Math.ceil(total/1024)} KB`:''}`)), rows = pack.rows;
    progress(45,'产品索引已就绪，正在计算同类与标杆…');
    const key = `${params.get('source_id')}:${params.get('product_id')}`, targetRow = rows.find(r=>r.key===key);
    if (!targetRow) throw new Error('该产品未包含在当前静态发布包中');
    const compareKey = `${params.get('compare_source_id')}:${params.get('compare_product_id')}`;
    const custom = rows.find(r=>r.key===compareKey && r.key!==key);
    const today = todayShanghai(), group=comparisonGroup(rows,targetRow,today,params.get('peer_mode'));
    const modes = [{code:'style',label:broadCohort(targetRow)?'来源大类':'默认权益（分类待确认）',targetBucket:broadCohort(targetRow)||'权益类',available:true},
      {code:'equity',label:'权益比较',targetBucket:'权益类',available:true},{code:'fixed_income',label:'固收比较',targetBucket:'固收类',available:true}];
    const mode = modes.some(m=>m.code===params.get('peer_mode'))?params.get('peer_mode'):'style';
    // Freshness is relative to today's Shanghai calendar date, not the target
    // or snapshot date. Historical metrics retain their original contract.
    // Custom products NEVER alter this population or its ranks/medians.
    const classifiedPool = group.classified, pool = group.pool;
    // Precompute each metric's percentile once per population, instead of
    // screening thousands of rows again for every rendered product and metric.
    const populationRanks=prepared?.ranks||new Map();
    for(const [code,spec] of (prepared?[]:Object.entries(definitions))){
      if(spec.rankable===false)continue;
      const ordered=pool.map(r=>({key:r.key,value:scoringMetrics(r)[code]})).filter(r=>finite(r.value));
      ordered.sort((a,b)=>(a.value-b.value)*(spec.direction==='high'?-1:1));
      const ranks=new Map();
      if(ordered.length>=2)for(let i=0;i<ordered.length;){
        let end=i+1;while(end<ordered.length&&ordered[end].value===ordered[i].value)end++;
        const rank={rank:i+1,denominator:ordered.length,percentile:Math.round(100*(ordered.length-i-(end-i+1)/2)/(ordered.length-1)*10)/10};
        for(let j=i;j<end;j++)ranks.set(ordered[j].key,rank);
        i=end;
      }
      populationRanks.set(code,ranks);
    }
    const reasons = new Map();
    for (const code of ['return1y','maxDrawdown','annualVol1y','monthlyWin1y','sharpe1y','recovery']) {
      const candidates = pool.filter(r=>r.key!==key);
      candidates.sort((a,b)=>(scoringMetrics(a)[code]-scoringMetrics(b)[code])*(definitions[code].direction==='high'?-1:1)||a.key.localeCompare(b.key));
      if (candidates.length) {const winner=candidates[0];reasons.set(winner.key,[...(reasons.get(winner.key)||[]),`${definitions[code].label}领先（${group.identity}）`]);}
    }
    const referenceKeys=new Set();
    const appendReferences=(excluded,limit)=>(prepared?prepared.references.filter(k=>k!==key&&!excluded.has(k)).slice(0,limit).map(k=>({row:rows.find(r=>r.key===k),label:'同大类补充参考'})):referenceCandidates(rows,targetRow,excluded,limit,group.identity)).map(({row,label})=>{
      if(pool.some(r=>r.key===row.key))reasons.set(row.key,['同组补充对比']);
      else {referenceKeys.add(row.key);reasons.set(row.key,[label,'仅展示参考，不参与大类排名']);}
      return row;
    });
    if(reasons.size<3)appendReferences(new Set([...reasons.keys(),...(custom?[custom.key]:[])]),3-reasons.size);
    const selectedRows = [targetRow, ...(custom?[custom]:[]), ...[...reasons.keys()].filter(k=>k!==custom?.key).map(k=>rows.find(r=>r.key===k))];
    // The target's population/medians never change when a custom product is
    // selected. Outside-category products carry their own category percentiles.
    const independentContexts=new Map();
    const contextFor=row=>{
      const family=broadCohort(row)||(row.key===key?group.identity:'权益类');
      const assumed=!broadCohort(row),independent=family!==group.identity||(assumed&&row.key!==key);
      if(!independent)return {family,assumed,independent,pool,ranks:populationRanks,count:prepared?.count??pool.length};
      const contextKey=assumed?row.key:family;
      if(!independentContexts.has(contextKey)){
        if(prepared){
          independentContexts.set(contextKey,{family,assumed,independent,pool:[],ranks:null,count:null});
        } else {
          const own=comparisonGroup(rows,row,today),ranks=new Map();
          for(const code of Object.keys(definitions)){
            const column=new Map();
            // There are at most two independently selected products. Compute
            // only their ranks; do not sort or hydrate a second full catalog.
            for(const candidate of selectedRows.filter(r=>(broadCohort(r)||'权益类')===family)){
              const value=rank(own.pool,candidate.key,code);if(value)column.set(candidate.key,value);
            }
            ranks.set(code,column);
          }
          independentContexts.set(contextKey,{family,assumed,independent,pool:own.pool,ranks,count:own.pool.length});
        }
      }
      const ctx=independentContexts.get(contextKey);
      return prepared?{...ctx,ownRanks:prepared.independentRanks.get(row.key)||{},count:prepared.independentCounts.get(row.key)??null}:
        {...ctx,count:freshPerformance(row,today)&&sixComplete(row)?ctx.count:null};
    };
    const peerLoadErrors=[];
    const productData=(row,d={},detailStatus='pending')=>{
      const context=contextFor(row),ranks = {};
      for (const code of Object.keys(definitions)) {const r=context.ownRanks?.[code]||context.ranks?.get(code)?.get(row.key);if(r)ranks[code]=r;}
      const included=context.independent?(freshPerformance(row,today)&&sixComplete(row)):pool.some(r=>r.key===row.key);
      const notice=scoringReason(row,context.pool,false,'broad_category',context.count,included);
      const scores = Object.fromEntries(axes.map(a=>{const vals=a.inputs.map(c=>ranks[c]?.percentile).filter(finite),complete=vals.length===a.inputs.length;return[a.code,{score:complete?Math.round(vals.reduce((s,v)=>s+v,0)/vals.length*10)/10:null,usedInputs:vals.length,totalInputs:a.inputs.length,reason:complete?null:notice,observations:axisObservations(row,a)}];}));
      const metricSources = Object.fromEntries(Object.keys(definitions).map(c=>[c,{label:c==='returnSinceInception'?'完整可用历史计算':c.startsWith('return')?'历史区间端点计算':c==='annualReturn'?'成立以来几何年化 · 实际天数':c==='maxDrawdown'||c==='recovery'?'近1年全部有效观测点计算':'成立以来历史计算 · 完整月度口径'}]));
      const displayMetrics = scoringMetrics(row);
      const reviewedNavDisplay = row.source==='zocaifu_highend' && row.publicationScope==='source_business_display_20261031_v2' && (d.analysisCurve||[]).length>=2;
      for(const c of Object.keys(definitions).filter(c=>c.endsWith('1y')))metricSources[c]={label:'近1年历史计算 · 与六维观察期一致'};
      for (const [key,code] of Object.entries({return1m:'return_1m',return3m:'return_3m',return6m:'return_6m',returnYtd:'return_ytd',return1y:'return_1y',returnSinceInception:'return_since'})) {
        const metric=row.metrics?.[code];
        if (!finite(displayMetrics[key]) && metric?.scaleStatus==='verified' && (metric.origin==='source' || (reviewedNavDisplay && metric.origin==='calculated'))) {
          displayMetrics[key]=metric.value/100;
          metricSources[key]={label:metric.origin==='source'?`来源披露（尺度已核验；${metric.asOf||'日期未披露'}），不参与历史计算排名`:`已核验净值区间计算 · ${metric.windowStart||'—'} 至 ${metric.windowEnd||metric.asOf||'—'}`};
        }
      }
      const reviewedDrawdown=row.metrics?.drawdown_1y;
      if(reviewedNavDisplay && !finite(displayMetrics.maxDrawdown) && reviewedDrawdown?.origin==='calculated' && reviewedDrawdown.scaleStatus==='verified' && finite(reviewedDrawdown.value)) {
        displayMetrics.maxDrawdown=-Math.abs(reviewedDrawdown.value/100);
        metricSources.maxDrawdown={label:`已核验净值区间计算 · ${reviewedDrawdown.windowStart||'—'} 至 ${reviewedDrawdown.windowEnd||reviewedDrawdown.asOf||'—'}`};
      }
      const reasonCodes={return1m:'return_1m',return3m:'return_3m',return6m:'return_6m',returnYtd:'return_ytd',return1y:'return_1y',returnSinceInception:'return_since',annualReturn:'annual_return_since',annualVol:'volatility_since',maxDrawdown:'drawdown_1y',sharpe:'sharpe_since',sortino:'sortino_since',calmar:'calmar_since',monthlyWin:'monthly_win_since'};
      for(const code of Object.keys(definitions)) if(!finite(displayMetrics[code])) {
        const reason=row.metricMissing?.[reasonCodes[code]];
        metricSources[code]={label:reason?.label||'历史、采样或分母条件不足',message:reason?.message};
      }
      const rawNavOnly=row.source==='zocaifu_highend' && (d.nav||[]).length>0 && !(d.analysisCurve||[]).length;
      if(rawNavOnly)for(const code of Object.keys(definitions))if(!finite(displayMetrics[code])) {
        metricSources[code]={label:'原始净值已采集；统一收益口径待核',message:'来源单位净值和累计净值已保留。复权与收益计算口径尚未核验，暂不生成统一收益或排名；可在来源区域查看全部记录。'};
      }
      return {detailStatus,key:row.key,sourceId:row.source,sourceLabel:row.sourceLabel,productId:row.id,name:row.name,
        rawNavOnly,
        displayProductCode:row.internalDirectoryKey ? (row.officialProductCode || '源站未提供代码') : row.id,
        sourceEvidence:d.sourceEvidence||null, sourceDocuments:d.sourceEvidence?(d.documents||[]):[],
        periodicReports:d.periodicReports||[],
        sourceBonus:d.sourceEvidence?(d.terms?.anonymous_bonus||[]):[],
        sourceNav:row.source==='zocaifu_highend'?(d.nav||[]).map(n=>({date:n.nav_date,unit:n.unit_nav_raw,total:n.accumulated_nav_raw})):[],
        sourcePerformance:row.source==='zocaifu_highend'?(d.performance||[]).map(p=>({code:p.metric_code,value:p.value_raw,date:p.as_of_date})):[],
        companyName:row.company,managerNames:d.managers?.length ? d.managers.map(m=>m.relation?.source_manager_name || m.profile?.source_manager_name).filter(Boolean) : (row.managers||[]),inceptionDate:row.inceptionDate,style:row.style,
        awards:(row.awards||[]).map(a=>({id:a.id,brand:a.brand,year:a.year,evaluationYear:a.evaluationYear,periodYears:a.periodYears,series:a.series,category:a.category,status:a.status,url:a.url,recipient:a.recipient})),
        reasons:row.key===key?['目标产品']:row.key===custom?.key?['自选对比',...(context.independent?['按自身大类独立评分']:[])]:reasons.get(row.key)||[],
        coreComparable:!referenceKeys.has(row.key) && pool.some(r=>r.key===row.key) && axes.every(a=>finite(scores[a.code].score)),
        comparisonScope:context.independent?'own_category':group.scope,
        comparisonLabel:`${context.family}大类评分${context.assumed?'（分类待确认，比较假设）':''}${context.independent?' · 独立样本':''}`,
        scoringGroup:{bucket:context.family,label:`${context.family}大类评分`,count:context.count,assumed:context.assumed,independent:context.independent,period:'1y'},
        comparisonDetails:[row.style?.classification?.strategy2||'细分策略待核',row.style?.classification?.market||'市场待核',row.currency||'币种待核'].join(' · '),
        metrics:displayMetrics,metricSources,directMetrics:{},ranks,axisScores:scores,scoreNotice:notice,volatilityScreen:row.comparison?.volatilityScreen,
        curve:(d.analysisCurve||[]).map(p=>({date:p.date,value:1+p.value})),latestDate:row.analysisLatestDate,
        incomeSeries:d.incomeSeries||[],representativeProduct:d.representativeProduct||null,
        gffundsAttribution:row.key===key?(d.gffundsAttribution||null):null,
        analysisUrl:`./detail.html?id=${encodeURIComponent(row.key)}`,profile:profile(row,detailStatus==='ready'?d:{...d,termsAvailability:{message:detailStatus==='pending'?'走势与详细条款正在加载；已有指标可先查看。':'走势与详细条款暂未载入，可重试；不代表来源未披露。'}})};
    };
    const products=selectedRows.map(row=>productData(row));
    const target=products[0], targetCurve=target.curve, median=prepared?.median||{};
    if(!prepared)for(const c of Object.keys(definitions)){const vals=pool.map(r=>scoringMetrics(r)[c]).filter(finite).sort((a,b)=>a-b);median[c]=vals.length?(vals[Math.floor((vals.length-1)/2)]+vals[Math.ceil((vals.length-1)/2)])/2:null;}
    const excludedVolatility=prepared?.excludedVolatility??classifiedPool.filter(r=>!volatilityEligible(r)).length;
    progress(94,'数据计算完成，正在绘制走势与对比…');
    const result={target,products,coreElements:target.profile.coreElements,company:target.profile.company,managers:target.profile.managers,
      gffundsAttribution:target.gffundsAttribution||null,
      peerGroup:{mode,assumed:group.assumed,scope:group.scope,label:group.label,bucket:group.identity,modes,count:prepared?.count??pool.length,median,
        definition:(group.assumed?`目标来源大类待确认，当前按${group.identity}比较（可切换）；此设定不修改原始分类。`:'')+'按来源披露的资产策略大类分组：权益类、固收类、CTA/期货、宏观/多策略、FOF。权益类包含主观多头、量化、指数增强、股票多空与市场中性；固收类包含纯债、债券增强、转债等。同大类跨渠道比较，不按细分策略、市场、币种或指数基准拆组。未分类目标默认按权益比较，可切换固收；其他未分类产品不自动并入样本。收益沿用各产品披露币种，未做汇率折算；大类百分位用于宽口径观察。',
        alignmentRule:`六维统一近1年；最新业绩日期距今天（${today}，北京时间）不超过15个自然日，不再要求区间起止日对齐。六维所需指标全部有效、月度覆盖率至少80%、通过净值代表性筛查才入选；不足2只不评分。`},
      selectedComparison:custom&&products.some(p=>p.key===custom.key)?{key:custom.key}:null,
      metricDefinitions:Object.fromEntries([...new Set(['return1y','annualReturn1y','maxDrawdown','annualVol1y','sharpe1y','sortino1y','calmar1y','monthlyWin1y','recovery',...Object.keys(definitions)])].map(c=>[c,definitions[c]])),axisDefinitions:axes.map(a=>({...a,rule:'统一近1年，每只产品在其自身评分大类的完整六维样本池中计算百分位；复合维度必须各项齐全，缺失不记0分。'})),
      detailLoading:{pending:products.length,failed:[]},
      referenceSelection:{version:'broad_category_v4',count:products.filter(p=>referenceKeys.has(p.key)).length,failed:peerLoadErrors},
      benchmark:{curve:[]},quality:{historySinceInception:false,targetCurvePointCount:targetCurve.length,benchmarkPointCount:0,volatilityExcludedCount:excludedVolatility,
        notes:[...(group.scope==='broad_category'?['当前采用资产策略大类分组；同一大类不再按细分策略、渠道、市场、币种或基准拆分。大类排名不代表细分策略内排名。']:[]),'自选对比产品按自身大类独立评分，不改变目标组样本、排名或中位数。跨类百分位只反映各自在本类的位置，不代表跨类直接排名。',...(peerLoadErrors.length?[`部分参考详情加载失败，已保留目标详情及其他可用参考：${peerLoadErrors.join('；')}`]:[]),...(target.incomeSeries.length?['货币型产品：万份收益以元/万份展示，七日年化以百分比展示；年化指标不代表实际持有期收益。']:[...(targetRow.dataQualityNote ? [`${targetRow.dataQualityStatus==='needs_review'?'待核对：':''}${targetRow.dataQualityNote}`] : []),...(targetRow.analysisSeriesLabel ? [`目标业绩口径：${targetRow.analysisSeriesLabel}；使用已入库可观测历史，不声明源端历史已全部披露。`] : []),'六维评分统一近1年，每只产品使用其自身评分大类的完整样本池；成立以来指标仅保留原有展示，不进入六维排名。夏普与索提诺无风险年利率假设2%。',
          `风险序列代表性不足的产品不进入六维综合样本池。筛查包括长期净值未变、实际变动不足，以及高波动策略的异常平滑序列，不等同于认定数据虚假。`,
          ...(!volatilityEligible(targetRow)?[`目标产品不参与波动领先与波动评分：${(targetRow.comparison?.volatilityScreen?.reasons||[]).map(r=>r.label).join('；')||'风险质量证据不足'}。原始指标及手动对比仍保留。`]:[]),
          ...(targetRow.comparison?.eligible?pool.length<2?['当前比较大类不足2个可比样本；自选产品仍按自身大类检查评分条件，不补造不足样本的排名。']:[]:['目标产品近1年六维指标、分类证据或风险序列条件不足，保留已有数据，不生成可比排名。'])])]},
      meta:{generatedAt:pack.meta.generatedAt,databaseModifiedAt:pack.meta.generatedAt,queryDurationMs:Math.round(performance.now()-started),comparisonWindowLabel:'六维统一近1年',
        databasePath:'私募静态数据快照',dynamicContract:'所有比较在浏览器内基于静态分片生成，不调用本地数据库接口。仅用于内部研究，不用于任何投资建议。'}};
    if(prepared?.customUnavailable)result.quality.notes.unshift('自选对比产品暂未载入，请重新选择或重试；目标产品与同大类比较已保留。');
    // Return catalog metrics immediately. Slow optional shards cannot block the page.
    const hydrate=async()=>{
      let next=0;
      const worker=async()=>{while(next<selectedRows.length){
        const index=next++,row=selectedRows[index];
        try {products[index]=productData(row,await detail(row),'ready');}
        catch(error){products[index]=productData(row,{},'failed');peerLoadErrors.push(`${row.name}：详情暂未载入`);result.detailLoading.failed.push(row.key);}
        result.target=products[0];result.coreElements=result.target.profile.coreElements;
        result.company=result.target.profile.company;result.managers=result.target.profile.managers;
        result.gffundsAttribution=result.target.gffundsAttribution;
        result.quality.targetCurvePointCount=result.target.curve.length;
        result.detailLoading.pending--;
        if(onUpdate)onUpdate(result);
      }};
      await Promise.all(Array.from({length:Math.min(3,selectedRows.length)},worker));
      if(peerLoadErrors.length)result.quality.notes.push('部分详情加载失败；已有指标和评分保留，可重试加载走势与条款。');
      result.meta.detailDurationMs=Math.round(performance.now()-started);
    };
    if(onUpdate)setTimeout(()=>hydrate().catch(()=>{}),0);
    else await hydrate();
    return result;
  }
  async function request(url, options={}) {
    try {
      const parsed = new URL(url,location.href);
      const data = parsed.pathname.endsWith('/products')
        ? {items:(await (window.__PRIVATE_FUND_ANALYSIS_SNAPSHOT_ENABLED__?snapshot('./data/analysis-search.js.gz'):catalog())).rows.filter(r=>`${r.name} ${r.id} ${r.company} ${(r.companyAliases||[]).join(' ')}`.toLowerCase().includes((parsed.searchParams.get('q')||'').toLowerCase())).slice(0,12).map(r=>({key:r.key,sourceId:r.source,productId:r.id,name:r.name,sourceLabel:r.sourceLabel,companyName:r.company}))}
        : await build(parsed.searchParams,options.onProgress,options.onUpdate);
      return {ok:true,json:async()=>({status:'ok',data})};
    } catch(e) {return {ok:false,json:async()=>({status:'error',message:e.message})};}
  }
  window.PrivateFundAnalysisStatic = {request,build,rank,bucket,profile,volatilityEligible,referenceCandidates,scoringReason,axisObservations,cohort,referenceCohort,broadCohort,comparisonGroup,sixComplete,freshPerformance,todayShanghai,definitions};
})();
