window.PrivateFundManagerZoneEnabled = false;
/* Pure, source-preserving view models shared by the overview and history chart. */
(() => {
  const DAY = 86400000;
  const ranges = [['3m','近3月'],['6m','近6月'],['ytd','今年以来'],['1y','近一年'],['3y','近三年'],['since','成立以来']];
  const sources = [
    {id:'simuwang',label:'排排网',color:'#27835b'},
    {id:'geshang',label:'格上',color:'#e8bd3e'},
    {id:'gffunds_highend',label:'广发基金',color:'#c52a30'},
  ];
  function stamp(value) {
    const text=String(value||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;
    const ms=Date.parse(text+'T00:00:00Z');
    return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===text?ms:null;
  }
  const iso = ms => new Date(ms).toISOString().slice(0,10);
  function today() {
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function shiftMonths(ms, months) {
    const d=new Date(ms), start=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+months,1));
    const last=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
    return Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),Math.min(d.getUTCDate(),last));
  }
  function historyWindow(curve, range='since', endDate=null) {
    if(!ranges.some(r=>r[0]===range))range='since';
    const rows=[...new Map((curve||[]).filter(p=>stamp(p.date)!==null && typeof p.value==='number' && Number.isFinite(p.value) && p.value>0).map(p=>[p.date,{...p}])).values()].sort((a,b)=>a.date.localeCompare(b.date));
    const end=stamp(endDate)??(rows.length?stamp(rows.at(-1).date):null);
    let start=null;
    if(end!==null && range!=='since')start=range==='ytd'?Date.UTC(new Date(end).getUTCFullYear()-1,11,31):shiftMonths(end,-({ '3m':3,'6m':6,'1y':12,'3y':36 }[range]));
    const points=rows.filter(p=>(start===null||stamp(p.date)>=start)&&(end===null||stamp(p.date)<=end));
    return {range,requestedStart:start===null?null:iso(start),end:end===null?null:iso(end),points,
      first:points[0]?.date||null,last:points.at(-1)?.date||null};
  }
  function latestDate(row) {
    return [row.analysisLatestDate,row.latestNavDate].filter(v=>stamp(v)!==null).map(v=>v.slice(0,10)).sort().at(-1)||null;
  }
  function freshness(rows, asOf=today()) {
    const reference=stamp(asOf);
    if(reference===null)throw new Error('日期分布统计基准无效');
    const threeMonths=shiftMonths(reference,-3);
    const empty=(id,fields={})=>({id,...fields,total:0,counts:Object.fromEntries(sources.map(s=>[s.id,0]))});
    const dayStart=reference-29*DAY;
    const days=Array.from({length:30},(_,i)=>{const date=iso(dayStart+i*DAY);return empty(date,{date,label:date.slice(5)});});
    days.push(empty('other',{date:null,label:'其他'}));
    // Keep the established interval boundaries, but expose exact inclusive dates.
    // Undated/future records are separate: they cannot be assigned a real range.
    const intervals=[[reference-7*DAY,reference],[reference-14*DAY,reference-8*DAY],
      [reference-21*DAY,reference-15*DAY],[reference-28*DAY,reference-22*DAY],
      [threeMonths,reference-29*DAY],[null,threeMonths-DAY]]
      .map(([start,end],i)=>empty(`interval-${i}`,{startDate:start===null?null:iso(start),endDate:iso(end)}));
    intervals.push(empty('undated',{startDate:null,endDate:null,label:'日期缺失 / 异常'}));
    const buckets=[['w1','近一周','0–7天'],['w2','近2周','8–14天'],['w3','近3周','15–21天'],['w4','近4周','22–28天'],['m3','近3月','29天至3个月'],['other','其他','超过3个月 / 日期缺失']]
      .map(([id,label,range])=>({id,label,range,total:0,counts:Object.fromEntries(sources.map(s=>[s.id,0]))}));
    const bySource=Object.fromEntries(sources.map(s=>[s.id,0]));
    let excluded=0,missing=0,future=0,duplicates=0;
    const seen=new Set();
    for(const row of rows||[]) {
      if(!(row.source in bySource)){excluded++;continue;}
      const key=row.key||`${row.source}:${row.id}`;
      if(seen.has(key)){duplicates++;continue;}seen.add(key);
      const value=stamp(latestDate(row)), age=value===null?null:(reference-value)/DAY;
      if(value===null)missing++;
      if(age!==null&&age<0)future++;
      const index=age===null||age<0?5:age<=7?0:age<=14?1:age<=21?2:age<=28?3:value>=threeMonths?4:5;
      buckets[index].counts[row.source]++;buckets[index].total++;bySource[row.source]++;
      const day=days[age!==null&&age>=0&&age<30?29-age:30];
      day.counts[row.source]++;day.total++;
      const interval=intervals[age===null||age<0?6:index];
      interval.counts[row.source]++;interval.total++;
      if(interval.id==='interval-5' && (!interval.startDate||value<stamp(interval.startDate)))interval.startDate=iso(value);
    }
    return {asOf,sources,buckets,days,dayStart:iso(dayStart),intervals,bySource,total:Object.values(bySource).reduce((a,b)=>a+b,0),excluded,missing,future,duplicates};
  }
  function inceptionYears(rows, asOf=today()) {
    const reference=stamp(asOf);
    if(reference===null)throw new Error('成立年份统计基准无效');
    const currentYear=new Date(reference).getUTCFullYear();
    const buckets=Array.from({length:5},(_,i)=>({id:String(currentYear-i),label:`${currentYear-i}年`,count:0}));
    buckets.push({id:'other',label:'其他年份',count:0});
    const seen=new Set();let missing=0,invalid=0,future=0,duplicates=0;
    for(const row of rows||[]) {
      const key=row.key||`${row.source}:${row.id}`;
      if(seen.has(key)){duplicates++;continue;}seen.add(key);
      // Establishment must come from the disclosed inception date, never from
      // the first NAV date or the date when a product was collected.
      if(!String(row.inceptionDate??'').trim()){missing++;continue;}
      const date=stamp(row.inceptionDate);
      if(date===null){invalid++;continue;}
      if(date>reference){future++;continue;}
      const age=currentYear-new Date(date).getUTCFullYear();
      buckets[Math.min(age,5)].count++;
    }
    return {asOf,currentYear,buckets,valid:buckets.reduce((n,b)=>n+b.count,0),total:seen.size,missing,invalid,future,duplicates};
  }
  window.PrivateFundExperience={ranges,sources,stamp,today,shiftMonths,historyWindow,latestDate,freshness,inceptionYears};
})();

/* Shared list sorting. Data-paginated tables supply their own complete-row sort. */
(() => {
  const missing = v => v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v));
  const compare = (a,b,direction='asc') => {
    if (missing(a) || missing(b)) return missing(a) ? (missing(b)?0:1) : -1;
    const n = typeof a === 'number' && typeof b === 'number' ? a-b : String(a).localeCompare(String(b),'zh-CN',{numeric:true});
    return direction === 'desc' ? -n : n;
  };
  const sorted = (rows, getter, direction) => rows.map((row,i)=>({row,i})).sort((a,b)=>compare(getter(a.row),getter(b.row),direction)||a.i-b.i).map(x=>x.row);
  function value(cell) {
    if (!cell) return null;
    if ('sortValue' in cell.dataset) return cell.dataset.sortValue === '' ? null : (/^-?\d+(\.\d+)?$/.test(cell.dataset.sortValue)?Number(cell.dataset.sortValue):cell.dataset.sortValue);
    const clone=cell.cloneNode(true);clone.querySelectorAll('small,.cell-sub,.pmeta').forEach(n=>n.remove());
    const text=clone.textContent.trim();
    if (/^(?:—|--|未披露|暂无|未知|所选指标暂缺)$/.test(text)) return null;
    const numeric=text.replace(/,/g,'').match(/^([+-]?\d+(?:\.\d+)?)\s*(?:%|年|只|条|项|点)?$/);
    return numeric?Number(numeric[1]):text;
  }
  function header(th,label,active,direction,onSort) {
    th.setAttribute('aria-sort',active?(direction==='desc'?'descending':'ascending'):'none');
    const button=document.createElement('button');button.type='button';button.className='pf-sort-button';
    button.textContent=label+(active?(direction==='desc'?' ↓':' ↑'):' ↕');
    button.style.cssText='font:inherit;color:inherit;background:transparent;border:0;padding:6px 0;text-align:inherit;cursor:pointer;white-space:normal;min-height:36px';
    button.onclick=onSort;th.replaceChildren(button);
  }
  let observer;
  const observe=()=>observer.observe(document.body,{childList:true,subtree:true});
  function sortTable(table,index,direction) {
    const body=table.tBodies[0];if(!body)return;
    const rows=[...body.rows], visible=rows.filter(r=>!r.hidden).length, hasHidden=rows.some(r=>r.hidden)&&rows.every(r=>r.classList.contains('gf-nav-row'));
    sorted(rows,r=>value(r.cells[index]),direction).forEach((r,i)=>{if(hasHidden)r.hidden=i>=visible;body.appendChild(r);});
  }
  function enhance() {
    observer.disconnect();
    document.querySelectorAll('table:not([data-external-sort])').forEach(table=>{
      const heads=[...(table.tHead?.rows[0]?.cells||[])];
      if(!heads.length || !table.tBodies.length || heads.some(h=>h.colSpan>1))return;
      heads.forEach((th,index)=>{
        if(th.querySelector('input,select') || th.dataset.pfSortable)return;
        th.dataset.pfSortable='1';const label=th.textContent.trim();
        header(th,label,false,'asc',()=>{
          observer.disconnect();
          const direction=table._pfSort?.index===index && table._pfSort.direction==='asc'?'desc':'asc';
          table._pfSort={index,direction};sortTable(table,index,direction);
          heads.forEach((h,i)=>{h.setAttribute('aria-sort',i===index?(direction==='asc'?'ascending':'descending'):'none');const b=h.querySelector('.pf-sort-button');if(b)b.textContent=b.textContent.replace(/ [↕↑↓]$/,'')+(i===index?(direction==='asc'?' ↑':' ↓'):' ↕');});
          observe();
        });
      });
      if(table._pfSort)sortTable(table,table._pfSort.index,table._pfSort.direction);
    });
    const nav=document.querySelector('nav.nav,nav.siteNav');
    if(window.PrivateFundManagerZoneEnabled!==false&&nav&&!nav.querySelector('a[href*="managers.html"]')){
      const a=document.createElement('a');a.href='./managers.html';a.textContent='经理专区';a.className='nav-link back';
      nav.insertBefore(a,nav.querySelector('a[href*="gffunds.html"]')||nav.querySelector('.advisor-link'));
    }
    observe();
  }
  window.PrivateFundTables={compare,sorted,header,value};
  if(typeof document==='undefined' || typeof MutationObserver==='undefined')return;
  function start(){observer=new MutationObserver(enhance);enhance();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
