/* Static adapter for the existing product-analysis renderer. No local API. */
(() => {
  const version = new URL(document.currentScript.src, location.href).searchParams.get('v') || '';
  const cache = new Map();
  let catalogPromise;
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const days = (a, b) => (Date.parse(a) - Date.parse(b)) / 86400000;
  const definitions = {
    return1m:{label:'近1月收益',format:'pct',direction:'high'},
    return3m:{label:'近3月收益',format:'pct',direction:'high'},
    return6m:{label:'近6月收益',format:'pct',direction:'high'},
    returnYtd:{label:'今年以来',format:'pct',direction:'high'},
    return1y:{label:'近1年收益',format:'pct',direction:'high'},
    returnSinceInception:{label:'完整可用期收益',format:'pct',direction:'high',rankable:false},
    annualReturn:{label:'近1年年化收益',format:'pct',direction:'high'},
    annualVol:{label:'近1年年化波动',format:'pct',direction:'low'},
    maxDrawdown:{label:'近1年最大回撤',format:'pct',direction:'high'},
    sharpe:{label:'近1年夏普',format:'number',direction:'high'},
    sortino:{label:'近1年索提诺',format:'number',direction:'high'},
    calmar:{label:'近1年卡玛',format:'number',direction:'high'},
    monthlyWin:{label:'近1年月胜率',format:'pct',direction:'high'},
    recovery:{label:'近1年回撤修复',format:'pct',direction:'high'},
  };
  const axes = [
    ['returnAbility','收益能力',['return1m','return3m','return6m','return1y'],'各区间收益的相对位置'],
    ['riskEfficiency','风险收益效率',['sharpe','sortino','calmar'],'夏普、索提诺与卡玛'],
    ['drawdownControl','回撤控制',['maxDrawdown'],'近1年最大回撤，越接近0越好'],
    ['volatilityControl','波动控制',['annualVol'],'近1年年化波动，越低越好'],
    ['stability','盈利稳定性',['monthlyWin'],'近1年正收益月份占比'],
    ['recoveryAbility','修复能力',['recovery'],'近1年最大回撤后的前高修复程度'],
  ].map(([code,label,inputs,description]) => ({code,label,inputs,description,rule:'同类有效指标百分位等权平均；不足2个可比样本不评分，缺失不记0分。'}));

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
    let body;
    if (/\.gz(?:\?|$)/.test(url)) {
      if (typeof DecompressionStream !== 'function') throw new Error('浏览器不支持压缩数据，请升级浏览器。');
      body = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    } else body = await blob.text();
    if (!body.trim().startsWith(prefix)) throw new Error('静态数据格式不正确');
    return JSON.parse(body.trim().slice(prefix.length).replace(/;\s*$/, ''));
    } finally {clearTimeout(timeout);}
  }
  function catalog(onDownload) {
    catalogPromise ||= window.__PRIVATE_FUND_CATALOG__ ? Promise.resolve(window.__PRIVATE_FUND_CATALOG__)
      : dataScript('./data/catalog.js.gz', 'window.__PRIVATE_FUND_CATALOG__=',onDownload).catch(e=>{catalogPromise=null;throw e;});
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
      productScale:scale.scale_value_raw == null ? '未披露' : `${scale.scale_value_raw}${scale.scale_unit_raw || ''}`,
      productScaleDate:scale.scale_date, productScaleNote:'来源原值，未擅自换算', latestPerformanceDate:row.analysisLatestDate,
      investmentLogic:d.terms?.investment_strategy_description, strategy:row.strategy1,
      recentOpenDates:d.terms?.recent_open_dates || d.terms?.recent_open_dates_json});
    const displayCore=window.PrivateFundBusinessText.coreElements(core,row.source);
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
  function rank(pool, key, code) {
    if(code==='annualVol')pool=pool.filter(volatilityEligible);
    const spec = definitions[code], value = pool.find(r => r.key === key)?.comparison?.metrics?.[code];
    const values = pool.map(r=>r.comparison?.metrics?.[code]).filter(finite);
    if (spec.rankable === false || !finite(value) || values.length < 2) return null;
    const better = values.filter(v => spec.direction === 'high' ? v > value : v < value).length;
    const equal = values.filter(v => v === value).length;
    return {rank:better+1,denominator:values.length,percentile:Math.round(100*(values.length-better-(equal+1)/2)/(values.length-1)*10)/10};
  }
  async function build(params, progress=()=>{}) {
    progress(5,'正在读取产品索引…');
    const started = performance.now(), pack = await catalog((received,total)=>progress(total?5+40*Math.min(1,received/total):null,`正在下载产品索引 · ${Math.ceil(received/1024)} KB${total?` / ${Math.ceil(total/1024)} KB`:''}`)), rows = pack.rows;
    progress(45,'产品索引已就绪，正在计算同类与标杆…');
    const key = `${params.get('source_id')}:${params.get('product_id')}`, targetRow = rows.find(r=>r.key===key);
    if (!targetRow) throw new Error('该产品未包含在当前静态发布包中');
    const compareKey = `${params.get('compare_source_id')}:${params.get('compare_product_id')}`;
    const custom = rows.find(r=>r.key===compareKey && r.key!==key);
    const end = targetRow.comparison?.asOf;
    const modes = [['style','投资风格'],['styleMarket','风格+市场'],['market','市场属性'],['annualReturn','年化收益分档'],['maxDrawdown','回撤分档'],['annualVol','波动分档'],['sharpe','夏普分档'],['monthlyWin','月胜率分档']]
      .map(([code,label])=>({code,label,targetBucket:bucket(targetRow,code),available:Boolean(bucket(targetRow,code))}));
    const mode = modes.some(m=>m.code===params.get('peer_mode') && m.available) ? params.get('peer_mode') : 'style';
    // Same declared trailing-year window, cutoff and start differences <= 7 days.
    // Custom products NEVER alter this population or its ranks/medians.
    const pool = rows.filter(r=>targetRow.comparison?.eligible && r.comparison?.eligible &&
      !(mode.startsWith('style') && targetRow.style?.broad === '其他策略') &&
      bucket(r,mode)===bucket(targetRow,mode) && Math.abs(days(end,r.comparison.asOf))<=7 &&
      Math.abs(days(targetRow.comparison.windowStart,r.comparison.windowStart))<=7);
    const reasons = new Map();
    for (const code of ['return1y','maxDrawdown','annualVol','monthlyWin','sharpe','recovery']) {
      const candidates = pool.filter(r=>r.key!==key && finite(r.comparison.metrics[code]) && (code!=='annualVol'||volatilityEligible(r)));
      candidates.sort((a,b)=>(a.comparison.metrics[code]-b.comparison.metrics[code])*(definitions[code].direction==='high'?-1:1)||a.key.localeCompare(b.key));
      if (candidates.length) {const winner=candidates[0];reasons.set(winner.key,[...(reasons.get(winner.key)||[]),`${definitions[code].label}领先`]);}
    }
    const selectedRows = [targetRow, ...(custom?[custom]:[]), ...[...reasons.keys()].filter(k=>k!==custom?.key).map(k=>rows.find(r=>r.key===k))];
    let completed=0;
    progress(60,`正在加载产品与标杆详情 · 0/${selectedRows.length}`);
    const products = await Promise.all(selectedRows.map(async row=>{
      const d = await detail(row), ranks = {};
      progress(60+30*(++completed/selectedRows.length),`产品与标杆详情已就绪 · ${completed}/${selectedRows.length}`);
      for (const code of Object.keys(definitions)) {const r=rank(pool,row.key,code);if(r)ranks[code]=r;}
      const scores = Object.fromEntries(axes.map(a=>{const vals=a.inputs.map(c=>ranks[c]?.percentile).filter(finite);return[a.code,{score:vals.length?Math.round(vals.reduce((s,v)=>s+v,0)/vals.length*10)/10:null,usedInputs:vals.length,totalInputs:a.inputs.length}];}));
      const metricSources = Object.fromEntries(Object.keys(definitions).map(c=>[c,{label:c==='returnSinceInception'?'完整可用历史计算':c.startsWith('return')?'历史区间端点计算':c==='annualReturn'?'近1年几何年化 · 实际天数':c==='maxDrawdown'||c==='recovery'?'近1年全部有效观测点计算':'近1年历史计算 · 月度口径'}]));
      const displayMetrics = {...row.comparison?.metrics};
      for (const [key,code] of Object.entries({return1m:'return_1m',return3m:'return_3m',return6m:'return_6m',returnYtd:'return_ytd',return1y:'return_1y',returnSinceInception:'return_since'})) {
        const metric=row.metrics?.[code];
        if (!finite(displayMetrics[key]) && metric?.origin==='source' && metric.scaleStatus==='verified') {
          displayMetrics[key]=metric.value/100;
          metricSources[key]={label:`来源披露（尺度已核验；${metric.asOf||'日期未披露'}），不参与历史计算排名`};
        }
      }
      const reasonCodes={return1m:'return_1m',return3m:'return_3m',return6m:'return_6m',returnYtd:'return_ytd',return1y:'return_1y',returnSinceInception:'return_since',annualReturn:'annual_return_1y',annualVol:'volatility_1y',maxDrawdown:'drawdown_1y',sharpe:'sharpe_1y'};
      for(const code of Object.keys(definitions)) if(!finite(displayMetrics[code])) {
        const reason=row.metricMissing?.[reasonCodes[code]];
        metricSources[code]={label:reason?.label||'历史、采样或分母条件不足',message:reason?.message};
      }
      return {key:row.key,sourceId:row.source,sourceLabel:row.sourceLabel,productId:row.id,name:row.name,
        companyName:row.company,managerNames:row.managers||[],inceptionDate:row.inceptionDate,style:row.style,
        reasons:row.key===key?['目标产品']:row.key===custom?.key?['自选对比',...(pool.some(r=>r.key===row.key)?[]:['同类窗外 · 不排名'])]:reasons.get(row.key)||[],
        metrics:displayMetrics,metricSources,directMetrics:{},ranks,axisScores:scores,volatilityScreen:row.comparison?.volatilityScreen,
        curve:(d.analysisCurve||[]).map(p=>({date:p.date,value:1+p.value})),latestDate:row.analysisLatestDate,
        analysisUrl:`./detail.html?id=${encodeURIComponent(row.key)}`,profile:profile(row,d)};
    }));
    const target=products[0], targetCurve=target.curve, median={};
    for(const c of Object.keys(definitions)){const vals=pool.filter(r=>c!=='annualVol'||volatilityEligible(r)).map(r=>r.comparison.metrics[c]).filter(finite).sort((a,b)=>a-b);median[c]=vals.length?(vals[Math.floor((vals.length-1)/2)]+vals[Math.ceil((vals.length-1)/2)])/2:null;}
    const excludedVolatility=pool.filter(r=>!volatilityEligible(r)).length;
    progress(94,'数据计算完成，正在绘制走势与对比…');
    return {target,products,coreElements:target.profile.coreElements,company:target.profile.company,managers:target.profile.managers,
      peerGroup:{mode,bucket:bucket(targetRow,mode),modes,count:pool.length,median,
        definition:'按来源策略标签及产品名称映射标准投资风格；规则版本 style_keywords_v1。收益或风险分档属于事后描述分组，不代表未来能力。',
        alignmentRule:'比较近1年；各自实际起点及截止日差均不超过7天，月度有效覆盖至少80%。短历史或过期自选产品仅展示，不加入排名。'},
      selectedComparison:custom?{key:custom.key}:null,metricDefinitions:definitions,axisDefinitions:axes,
      benchmark:{curve:[]},quality:{historySinceInception:false,targetCurvePointCount:targetCurve.length,benchmarkPointCount:0,volatilityExcludedCount:excludedVolatility,
        notes:[pack.meta.comparability.warning,'排名仅为当前分类与近1年窗口的研究参考；完整可用期收益不参加排名。夏普与索提诺无风险年利率假设2%。',
          `波动领先与波动评分已排除${excludedVolatility}只代表性不足的同类产品；其他指标排名及同类产品总数不变。筛查包括长期净值未变、实际变动不足，以及高波动策略的异常平滑序列，不等同于认定数据虚假。`,
          ...(!volatilityEligible(targetRow)?[`目标产品不参与波动领先与波动评分：${(targetRow.comparison?.volatilityScreen?.reasons||[]).map(r=>r.label).join('；')||'风险质量证据不足'}。原始指标及手动对比仍保留。`]:[]),
          ...(targetRow.comparison?.eligible?pool.length<2?['当前分类与日期条件下不足2个可比样本；可切换分组或自选产品查看，不生成不足样本的排名。']:[]:['目标产品近1年历史或月度覆盖不足，保留已有数据，不生成可比排名。'])]},
      meta:{generatedAt:pack.meta.generatedAt,databaseModifiedAt:pack.meta.generatedAt,queryDurationMs:Math.round(performance.now()-started),comparisonWindowLabel:'近一年',
        databasePath:'私募静态数据快照',dynamicContract:'所有比较在浏览器内基于静态分片生成，不调用本地数据库接口。仅用于内部研究，不用于任何投资建议。'}};
  }
  async function request(url, options={}) {
    try {
      const parsed = new URL(url,location.href);
      const data = parsed.pathname.endsWith('/products')
        ? {items:(await catalog()).rows.filter(r=>`${r.name} ${r.id} ${r.company}`.toLowerCase().includes((parsed.searchParams.get('q')||'').toLowerCase())).slice(0,12).map(r=>({key:r.key,sourceId:r.source,productId:r.id,name:r.name,sourceLabel:r.sourceLabel,companyName:r.company}))}
        : await build(parsed.searchParams,options.onProgress);
      return {ok:true,json:async()=>({status:'ok',data})};
    } catch(e) {return {ok:false,json:async()=>({status:'error',message:e.message})};}
  }
  window.PrivateFundAnalysisStatic = {request,build,rank,bucket,profile,volatilityEligible};
})();
