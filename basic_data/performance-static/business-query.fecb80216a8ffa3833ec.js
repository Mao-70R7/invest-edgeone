/* Versioned, bounded hidden query protocol. No eval, HTML or arbitrary fetch. */
(() => {
  'use strict';
  const isPrivate=location.pathname.startsWith('/private_fund/');
  let legacyProductId=null;
  const incoming=new URL(location.href),legacySource=incoming.searchParams.get('source');
  if(isPrivate&&!incoming.searchParams.has('bf')&&!incoming.searchParams.has('result')&&/^[a-z][a-z0-9_]{1,50}:[^\s:]{1,100}$/.test(legacySource||'')){
    legacyProductId=legacySource;
    // Historical source=source:product links confused source with product.
    // Pin the exact product, then remove the conflicting keyword restriction.
    incoming.searchParams.set('source',legacySource.split(':',1)[0]);incoming.searchParams.delete('q');incoming.searchParams.set('product',legacyProductId);
    history.replaceState(null,'',incoming);
  }
  const blocked=new Set(['__proto__','prototype','constructor']);
  const get=(row,path)=>path.split('.').reduce((v,k)=>blocked.has(k)?undefined:(v&&Object.prototype.hasOwnProperty.call(v,k)?v[k]:undefined),row);
  const text=v=>String(v??'');
  function matches(row,f){
    const v=get(row,f.field);if(f.op==='exists')return v!==undefined&&v!==null&&v!=='';
    if(v===undefined||v===null||v==='')return false;
    if(f.op==='eq')return text(v)===text(f.value);
    if(f.op==='in')return f.value.map(text).includes(text(v));
    if(f.op==='contains')return text(v).toLocaleLowerCase().includes(text(f.value).toLocaleLowerCase());
    const a=Number(v),b=Number(f.value);if(!Number.isFinite(a)||!Number.isFinite(b))return false;
    return {gte:a>=b,gt:a>b,lte:a<=b,lt:a<b}[f.op]===true;
  }
  async function read(){
    const query=new URLSearchParams(location.search),code=query.get('bf'),reference=query.get('result'),product=query.get('product');
    if(['bf','result','product'].some(key=>query.getAll(key).length>1))throw Error('结果名单参数重复');
    if([code,reference,product].filter(Boolean).length>1)throw Error('不能同时使用多种结果名单链接');
    if(product){
      if(!isPrivate||!/^[a-z][a-z0-9_]{1,50}:[^\s:]{1,100}$/.test(product))throw Error('产品完整标识与页面不匹配');
      return {v:1,ids:[product],expected:1,summary:'按完整来源产品编号定位的产品',repairedFromLegacy:Boolean(legacyProductId)};
    }
    if(!code&&!reference)return null;
    if(code&&reference)throw Error('不能同时使用两种结果名单链接');
    let spec;
    const loadResult=async(path,expectedReference)=>{
      const response=await fetch('/ai-api/v1/results/'+path,{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error(response.status===404?'结果名单不存在，请重新生成链接':'结果名单服务暂不可用，请稍后重试');
      const raw=await response.text();if(new TextEncoder().encode(raw).length>400000)throw Error('结果名单超出大小限制');
      const record=JSON.parse(raw),database=location.pathname.startsWith('/private_fund/')?'private_fund':'tianyan';
      if(!/^[a-f0-9]{64}$/.test(record.id)||expectedReference&&record.id!==expectedReference||record.database!==database||typeof record.payload!=='string'||new TextEncoder().encode(record.payload).length>200000)throw Error('结果名单页面或格式不匹配');
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(record.payload))),byte=>byte.toString(16).padStart(2,'0')).join('');
      if(digest!==record.id)throw Error('结果名单完整性校验失败');
      return {...JSON.parse(record.payload),repairedFromLegacy:record.repaired===true};
    };
    if(reference){
      if(!/^[a-f0-9]{64}$/.test(reference))throw Error('结果编号格式无效');
      spec=await loadResult(reference,reference);
    }else{
    if(code.length>16000||!/^[A-Za-z0-9_-]+$/.test(code))throw Error('筛选链接格式无效');
    const bytes=Uint8Array.from(atob(code.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-code.length%4)%4)),c=>c.charCodeAt(0));
    if(!window.DecompressionStream)throw Error('浏览器不支持此筛选链接，请升级浏览器');
    try{
    const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let size=0,parts=[];
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>200000){await reader.cancel();throw Error('筛选条件超出大小限制');}parts.push(value);}
    spec=JSON.parse(await new Blob(parts).text());
    }catch(error){
      // Only a worker-registered exact alias may repair an old corrupted URL.
      // Never guess missing bytes or substitute a keyword/broader result set.
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code))),byte=>byte.toString(16).padStart(2,'0')).join('');
      try{spec=await loadResult('legacy/'+hash);}catch{throw error;}
    }
    }
    if(spec.v!==1||!Array.isArray(spec.filters||[])||(spec.filters||[]).length>30||typeof spec.summary!=='string'||spec.summary.length>500)throw Error('筛选条件版本或长度无效');
    if(spec.ids!==undefined&&(!Array.isArray(spec.ids)||spec.ids.length>10000||spec.ids.some(x=>typeof x!=='string'||x.length>150)))throw Error('名单无效');
    if(spec.ids && (new Set(spec.ids).size!==spec.ids.length || spec.expected!==spec.ids.length))throw Error('名单数量与预期不一致');
    if(spec.ids?.some(id=>!(isPrivate?/^[a-z][a-z0-9_]{1,50}:[^\s]+$/:/^[a-z][a-z0-9_]{1,50}__[^\s]+$/).test(id)))throw Error('名单产品标识与页面不匹配');
    for(const f of spec.filters||[]){if(!f||typeof f.field!=='string'||f.field.length>100||f.field.split('.').some(k=>blocked.has(k))||!['eq','in','contains','gte','gt','lte','lt','exists'].includes(f.op)||(f.op==='in'&&(!Array.isArray(f.value)||f.value.length>200)))throw Error('字段筛选条件无效');}
    return spec;
  }
  // Resolve the exact cohort while page assets are downloading, once per URL.
  const specResult=read().then(value=>({value}),error=>({error}));
  let fastCatalog=false,catalogValues=null;
  async function loadCohort(sourceVersion){
    if(!window.BusinessQuery.requiresFullCatalog)return null;
    const resolved=await specResult;if(resolved.error||!Array.isArray(resolved.value?.ids))return null;
    try{
      const base=new URL('./data/navigation/',location.href);
      const response=await fetch(new URL('index.json?v='+encodeURIComponent(sourceVersion),base),{signal:AbortSignal.timeout(8000)});
      if(!response.ok)return null;
      const manifest=await response.json(),database=isPrivate?'private_fund':'tianyan';
      if(manifest.v!==1||manifest.database!==database||manifest.sourceVersion!==sourceVersion)return null;
      const spec=resolved.value,canonical=JSON.stringify({asOf:spec.asOf,expected:spec.expected,ids:spec.ids,summary:spec.summary,v:spec.v});
      const scopeHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical))),b=>b.toString(16).padStart(2,'0')).join('');
      if(manifest.scopeRepairs?.[scopeHash])spec.summary=manifest.scopeRepairs[scopeHash];
      const ids=new Set(resolved.value.ids),buckets=[...new Set([...ids].map(id=>manifest.index[id]).filter(Boolean))];
      if(buckets.some(b=>!/^[a-f0-9]{2}$/.test(b))||buckets.length>48)return null;
      const rows=[],queue=[...buckets];
      async function next(){while(queue.length){const bucket=queue.shift(),file=manifest.files[bucket];
        if(!file||file.path!==bucket+'.json')throw Error('shard');
        const res=await fetch(new URL(file.path+'?v='+encodeURIComponent(sourceVersion),base),{signal:AbortSignal.timeout(12000)});if(!res.ok)throw Error('shard');
        const envelope=await res.json();if(envelope.encoding!=='gzip-base64-json'||envelope.sha256!==file.sha256)throw Error('shard');
        const bytes=Uint8Array.from(atob(envelope.data),c=>c.charCodeAt(0));
        const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==file.sha256)throw Error('shard');
        const group=JSON.parse(new TextDecoder().decode(raw));if(group.length!==file.count)throw Error('shard');
        rows.push(...group.filter(row=>ids.has(String(row[manifest.keyField]))));
      }}
      await Promise.all(Array.from({length:Math.min(6,buckets.length)},next));
      const present=[...ids].filter(id=>Object.prototype.hasOwnProperty.call(manifest.index,id));
      if(rows.length!==present.length||new Set(rows.map(row=>String(row[manifest.keyField]))).size!==rows.length)throw Error('shard');
      rows.sort((a,b)=>String(a[manifest.keyField]).localeCompare(String(b[manifest.keyField])));
      fastCatalog=true;catalogValues=manifest.filterValues;
      document.body.dataset.navigationLoad='exact-shards';
      return {...manifest.metadata,[manifest.rowField]:rows};
    }catch{document.body.dataset.navigationLoad='full-catalog-fallback';return null;}
  }
  function pageConditions(root){
    const labels=[];
    for(const control of root.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]),select')){
      if(!control.value||control.disabled||['hidden','color'].includes(control.type)||control.closest('.multi-select-menu')||/page|sort|scatter|Metric|benchmark/i.test(control.id))continue;
      const option=control.tagName==='SELECT'?control.selectedOptions[0]?.textContent:control.value;
      if(!option||/^(全部|不限|请选择)/.test(option.trim()))continue;
      const label=control.closest('label')?.querySelector('span')?.childNodes[0]?.textContent?.trim()||control.closest('label')?.childNodes[0]?.textContent?.trim()||control.getAttribute('aria-label')||control.id;
      if(label&&!/颜色|着色|配色|标色/.test(label))labels.push(label+'：'+option.trim());
    }
    for(const group of root.querySelectorAll('[data-multi-filter],.multi-filter,.multi-select')){
      const values=[...group.querySelectorAll('input[type="checkbox"]:checked')].map(n=>n.closest('label')?.querySelector('span')?.childNodes[0]?.textContent?.trim()||n.value);
      if(values.length)labels.push((group.dataset.label||group.querySelector('summary')?.getAttribute('aria-label')||group.querySelector('summary')?.textContent?.trim()||'多选条件')+'：'+values.join('、'));
    }
    for(const condition of root.querySelectorAll('[data-condition]'))if(condition.textContent.includes(' ×'))labels.push(condition.textContent.replace(/\s*×\s*$/,''));
    return [...new Set(labels)];
  }
  async function create(rows,key,root){
    let spec=null,error='';
    const navigation=new URL(location.href);
    if(!isPrivate&&navigation.searchParams.get('channel')){
      const value=navigation.searchParams.get('channel'),labels=new Set(catalogValues?.渠道||rows.map(r=>String(r.渠道||'')));
      const aliases=new Set(catalogValues?.channelAliases?.[value]||rows.filter(r=>String(key(r)).split('__',1)[0]===value).map(r=>String(r.渠道||'')).filter(Boolean));
      if(!labels.has(value)&&aliases.size===1){navigation.searchParams.set('channel',[...aliases][0]);history.replaceState(null,'',navigation);}
      else if(!labels.has(value))error='当前公开页面没有这个渠道，未执行筛选';
    }
    for(const [param,field] of isPrivate?[['source','source'],['strategy','strategy1']]:[['institution','投顾机构']]){
      for(const value of navigation.searchParams.getAll(param)){
        if(value&&!(catalogValues?.[field]||rows.map(r=>String(r[field]||'__not_disclosed__'))).includes(value))error='当前公开页面没有已指定的'+(param==='institution'?'投顾机构':param==='source'?'数据来源':'策略类型')+'，未执行筛选';
      }
    }
    const resolved=await specResult;if(resolved.error){const e=resolved.error;error=/[\u4e00-\u9fff]/.test(e.message)?e.message:'筛选链接损坏或格式无效';}else spec=resolved.value;
    const codeKey=()=>{const q=new URLSearchParams(location.search);return q.get('result')||q.get('bf')||q.get('product');};
    let currentCode=codeKey();
    let highlightEnabled=true, explicitHighlight=new URLSearchParams(location.search).get('highlight')==='blue';
    window.addEventListener('popstate',()=>{if(codeKey()!==currentCode)location.reload();});
    const box=document.createElement('p');box.className='business-filter-summary';box.setAttribute('role','status');box.style.cssText='padding:12px 16px;background:#f3f6fa;color:#16324f;border-left:3px solid #16324f;line-height:1.6';root.prepend(box);
    let ids=spec?.ids?new Set(spec.ids):null;let active=Boolean(spec)||Boolean(error);
    if(spec){for(const f of spec.filters||[]){if(!rows.some(r=>get(r,f.field)!==undefined)){error='当前页面未发布字段“'+f.field+'”，无法执行此条件';break;}}}
    const original=new Set(rows.map(key));let missing=ids?[...ids].filter(id=>!original.has(id)).length:0;
    const navigationConditions=(isPrivate?[['source','source','数据来源'],['strategy','strategy1','策略类型']]:[['channel','渠道','渠道'],['institution','投顾机构','投顾机构']])
      .map(([param,field,label])=>({param,field,label,enabled:true,values:new URLSearchParams(location.search).getAll(param).filter(Boolean)})).filter(f=>f.values.length);
    // Keep URL constraints until their own control changes, including values
    // absent from a partial catalog's options. Capture runs before render handlers.
    const controls=isPrivate?{source:'#sourceFilter',strategy:'#strategyFilter'}:{channel:'#channelSelect',institution:'#institutionSelect'};
    const releaseNavigation=event=>{
      for(const condition of navigationConditions)if(event.target.closest(controls[condition.param]))condition.enabled=false;
    };
    root.addEventListener('input',releaseNavigation,true);
    root.addEventListener('change',releaseNavigation,true);
    const activeNavigation=()=>navigationConditions.filter(f=>f.enabled);
    return {get active(){return active;},get highlightColor(){return highlightEnabled&&(spec||explicitHighlight)&&!error?'#2563EB':null;},clearHighlight(){highlightEnabled=false;},apply(input){
      if(error)return [];
      if(!spec)return input;
      return input.filter(r=>(!ids||ids.has(key(r)))&&(spec.filters||[]).every(f=>matches(r,f))&&activeNavigation().every(f=>f.values.includes(String(r[f.field]||'__not_disclosed__'))));
    },describe(count,extraConditions=[]){
      const selected=pageConditions(root),ops={eq:'＝',in:'属于',contains:'包含',gte:'≥',gt:'>',lte:'≤',lt:'<',exists:'有披露'};
      const conditions=(spec?.filters||[]).map(f=>f.field+ops[f.op]+(f.op==='exists'?'':Array.isArray(f.value)?f.value.join('、'):f.value));
      let scope=spec?.summary||'';
      if(/符合.*条件|满足本题|本题.*对应|已核实的产品/.test(scope))scope='历史链接仅保存精确产品名单，原筛选阈值未完整记录，不能还原；已记录范围：'+scope.replace(/符合.*?条件|满足本题.*?条件/g,'');
      const chosen=[...new Set([...selected,...extraConditions,...activeNavigation().map(f=>f.label+'：'+f.values.map(value=>f.param==='source'?(window.PrivateFund?.sourceColors?.[value]?.label||value):value).join('、'))])];
      box.textContent=error?'筛选未执行：'+error+'。可清除业务筛选后查看公开列表。':spec?(spec.repairedFromLegacy?'已按原查询修复旧链接。':'')+'当前范围：'+[scope,...conditions,...chosen].filter(Boolean).join('；')+(ids?'；查询命中'+ids.size+'条，公开页面已收录'+(ids.size-missing)+'条，尚未发布'+missing+'条；当前筛选显示'+count+'条':'；本页显示'+count+'条')+(spec.asOf?'；名单核对日'+spec.asOf:'')+'。':'当前范围：'+(chosen.length?chosen.join('；'):'公开目录全部产品，未设置筛选条件')+'；显示'+count+'条。';
      box.dataset.expected=ids?String(ids.size):'';box.dataset.published=ids?String(ids.size-missing):'';box.dataset.missing=String(missing);box.dataset.visible=String(count);box.dataset.error=error;
    },clear(){spec=null;error='';ids=null;active=false;missing=0;currentCode=null;legacyProductId=null;explicitHighlight=false;navigationConditions.forEach(f=>f.enabled=false);const u=new URL(location.href);u.searchParams.delete('bf');u.searchParams.delete('result');u.searchParams.delete('product');u.searchParams.delete('highlight');history.replaceState(null,'',u);if(fastCatalog)setTimeout(()=>location.reload(),0);}};
  }
  window.BusinessQuery={create,loadCohort,version:4,requiresFullCatalog:Boolean(legacyProductId)||incoming.searchParams.has('bf')||incoming.searchParams.has('result')||incoming.searchParams.has('product')};
})();
