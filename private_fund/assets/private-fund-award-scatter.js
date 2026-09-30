/* Award counts and performance are separate facts. SVG, no extra network runtime. */
(function(global){
  'use strict';
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const median=a=>{a=[...a].sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;};
  const labels={drawdown:'最大回撤幅度',volatility:'年化波动率',return:'区间收益率',annual_return:'年化收益率'};
  const defaults={x:'drawdown',y:'return',period:'1y',fresh:'30',currency:'',strategy:''};
  const clean=s=>({...s,x:['drawdown','volatility'].includes(s.x)?s.x:'drawdown',y:['return','annual_return'].includes(s.y)?s.y:'return',period:s.period==='since'?'since':'1y',fresh:s.fresh==='all'?'all':'30'});
  const effectivePeriod=s=>s.period;
  function coordinate(entity,byKey,state,asOf){
    const s=clean(state), reasons={}, fail=r=>{reasons[r]=(reasons[r]||0)+1;};
    const raw=entity.productKeys.map(k=>byKey.get(k)).filter(Boolean), chosen=new Map(),knownCurrencies=new Map();
    for(const p of raw)if(p.registration&&p.currency!=='未披露'){const id=`${p.company}|${p.registration}`;if(!knownCurrencies.has(id))knownCurrencies.set(id,new Set());knownCurrencies.get(id).add(p.currency);}
    for(const p of raw){
      if((s.currency&&p.currency!==s.currency)||(s.strategy&&p.strategy!==s.strategy)){fail('不符合币种或策略筛选');continue;}
      const metricPeriod=effectivePeriod(s),m=p.metrics?.[metricPeriod]||{},x=m[s.x],y=m[s.y];
      if(!finite(x?.value)||!finite(y?.value)){
        const days=(Date.parse(p.lastDate)-Date.parse(p.firstDate))/86400000;
        fail(metricPeriod==='1y'&&finite(days)&&days<365?'可用历史不足一年':'双轴指标缺失');continue;
      }
      if(!x.start||!x.end||x.start!==y.start||x.end!==y.end){fail('双轴业绩起止日期不一致');continue;}
      const lag=(Date.parse(asOf)-Date.parse(x.end))/86400000;
      if(!finite(lag)||lag<0){fail('业绩日期无法核定');continue;}
      if(s.fresh!=='all'&&lag>30){fail('业绩截止日早于快照30天');continue;}
      const known=knownCurrencies.get(`${p.company}|${p.registration}`),groupCurrency=p.currency==='未披露'&&known?.size===1?[...known][0]:p.currency;
      const id=p.registration?`${p.company}|${p.registration}|${groupCurrency}`:p.key;
      const candidate={p,x:x.value,y:y.value,start:x.start,end:x.end,origins:[x.origin,y.origin]};
      const old=chosen.get(id);
      if(!old||candidate.end>old.end||(candidate.end===old.end&&p.key<old.p.key))chosen.set(id,candidate);
    }
    const samples=[...chosen.values()], dates=samples.map(p=>p.end).sort(),starts=samples.map(p=>p.start).sort();
    const reason=raw.length?Object.entries(reasons).sort((a,b)=>b[1]-a[1])[0]?.[0]||'暂无可用业绩':'尚未关联本库产品';
    return {x:median(samples.map(p=>p.x)),y:median(samples.map(p=>p.y)),samples,count:samples.length,total:raw.length,
      endMin:dates[0],endMax:dates.at(-1),startMin:starts[0],startMax:starts.at(-1),reasons,reason:samples.length?'':reason,
      currencies:[...new Set(samples.map(p=>p.p.currency))],strategies:[...new Set(samples.map(p=>p.p.strategy))]};
  }
  function selectEntities(scatter,awards,state){
    const ids=new Set(awards.map(r=>r.id)),byKey=new Map(scatter.products.map(p=>[p.key,p]));
    return scatter.entities.map(e=>({...e,awardCount:new Set(e.recordIds.filter(id=>ids.has(id))).size}))
      .filter(e=>e.awardCount>0).map(e=>({...e,coordinate:coordinate(e,byKey,state,scatter.asOf)}))
      .sort((a,b)=>b.awardCount-a.awardCount||a.name.localeCompare(b.name,'zh-CN'));
  }
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>finite(v)?v.toFixed(2)+'%':'—', val=(v,risk=false)=>`<b class="${finite(v)&&v!==0?(risk||v<0?'aw-loss':'aw-gain'):''}">${fmt(v)}</b>`;
  const period=s=>effectivePeriod(s)==='since'?'成立以来':'近一年';
  const dateRange=(a,b)=>a===b?a:`${a} 至 ${b}`;
  // Fixed-size marks: opaque, discrete colors keep overlaps from inventing counts.
  const awardBands=[
    {min:1,label:'1次',color:'#AABFD3',gf:'#E5ACAF'},
    {min:2,label:'2–3次',color:'#7E9EBE',gf:'#D9858B'},
    {min:4,label:'4–7次',color:'#517DA6',gf:'#CA5F67'},
    {min:8,label:'8–14次',color:'#2C587F',gf:'#AD3643'},
    {min:15,label:'15次以上',color:'#17324D',gf:'#782330'}
  ];
  const awardBand=count=>awardBands.reduce((a,b)=>count>=b.min?b:a,awardBands[0]);
  const radius=()=>5;
  function niceScale(low,high,count=5){
    if(!finite(low)||!finite(high))return {min:0,max:1,ticks:[0,.25,.5,.75,1]};
    if(high<=low)high=low+1;
    const raw=(high-low)/count,base=10**Math.floor(Math.log10(raw)),r=raw/base;
    const step=(r<=1?1:r<=2?2:r<=2.5?2.5:r<=5?5:10)*base;
    const min=Math.floor(low/step)*step,max=Math.ceil(high/step)*step,ticks=[];
    for(let i=0;i<=Math.round((max-min)/step);i++)ticks.push(Number((min+i*step).toPrecision(12)));
    return {min,max,ticks};
  }
  function mount(host,scatter,onChange){
    if(!scatter?.entities){host.innerHTML='<p class="empty-panel">点阵业绩尚未生成，请重新构建页面数据。</p>';return {render(){}};}
    const names=['公司','经理','产品'], display={'公司':'机构','经理':'经理','产品':'产品'}, selected={};
    let current=[],currentState=defaults,currentAwards=new Map();
    const options=(values)=>values.map(([k,v])=>`<option value="${esc(k)}">${esc(v)}</option>`).join('');
    host.innerHTML=`<div class="aw-plot-controls" aria-label="点阵指标筛选">
      <label>业绩区间<select name="period">${options([['1y','近一年'],['since','成立以来']])}</select></label>
      <label>横轴 · 风险<select name="x">${options([['drawdown',labels.drawdown],['volatility',labels.volatility]])}</select></label>
      <label>纵轴 · 收益<select name="y">${options([['return',labels.return],['annual_return',labels.annual_return]])}</select></label>
      <details class="aw-extra"><summary>样本范围</summary><div>
        <label>净值时效<select name="fresh">${options([['30','截止日在快照前30天内'],['all','全部历史截止日']])}</select></label>
        <label>原始币种<select name="currency">${options([['','全部原币（未折算）'],...[...new Set(scatter.products.map(p=>p.currency))].sort().map(k=>[k,k])])}</select></label>
        <label>产品策略<select name="strategy">${options([['','全部策略'],...[...new Set(scatter.products.map(p=>p.strategy))].sort().map(k=>[k,k])])}</select></label>
      </div></details></div>
      <p class="aw-business-note"><strong>读图方式</strong> 越靠左风险越低，越靠上收益越高；颜色越深，所选年份与奖项内的获奖次数越多。坐标采用当前可用业绩，非获奖当年表现；机构、经理为关联产品中位数。</p>
      <nav class="aw-board-nav" aria-label="点阵板块">${names.map(k=>`<a href="#aw-board-${k}">${display[k]}点阵 ↓</a>`).join('')}</nav>
      ${names.map((k,i)=>`<section class="aw-board" id="aw-board-${k}" data-kind="${k}" aria-label="${display[k]}点阵"><header><div><span class="aw-section-number">0${i+1}</span><h2>${display[k]}点阵</h2></div><p class="aw-board-stats" aria-live="polite"></p></header><div class="aw-axis-note"></div><div class="aw-board-layout"><div class="aw-chart-column"><div class="aw-color-key"></div><div class="aw-svg"></div><p class="aw-quadrant-note"></p></div><aside class="aw-detail-column"><label class="aw-pick-label">查看${display[k]}<select class="aw-pick" aria-label="选择${display[k]}查看详情"></select></label><div class="aw-inspector" aria-live="polite"></div></aside></div><details class="aw-missing"><summary></summary><div></div></details></section>`).join('')}
      <details class="award-method"><summary>点阵计算与比较口径</summary><p>${esc(scatter.method)}</p><p>区间收益＝期末业绩值÷期初业绩值－1；年化收益＝（期末÷期初）的（365.25÷实际天数）次方－1；最大回撤取区间内相对历史高点的最大跌幅，以正的幅度表示；年化波动率为月末收益率样本标准差×√12。优先使用历史业绩加工结果，原始已核定指标保留实际口径；每个坐标仅使用起止日期一致的双轴数值。</p><p>机构、经理两个坐标均使用同一批有效产品，分别计算中位数，不做资产规模加权。当前产品关联不等于历史获奖时的任职关系。来源未提供份额标识时无法进一步区分同备案号份额；未披露备案号的跨渠道重复仍可能保留。混合策略、原币收益和不同业绩截止日不构成严格同类排名；可用“样本范围”限定策略和币种。成立以来的历史长短不一致，仅用于描述，不作为同周期排名。</p><p>机构沿用已确认别名归并；经理优先采用已匹配身份，未匹配时按披露姓名与所属机构分组，不把未核验的同名人员强行合并。点大小固定；颜色按1次、2–3次、4–7次、8–14次、15次以上五档由浅到深，三个板块沿用相同分档；同一获奖记录关联多个渠道只计一次。虚线为当前入图对象的横纵轴中位数，只辅助观察相对位置，不是绝对绩优认定。各板块独立刻度，原币收益未折算。未匹配、历史不足、指标缺失和过期业绩分别提示，不按零收益处理。</p></details>`;
    host.querySelector('.aw-plot-controls').addEventListener('change',e=>{if(e.target.name)onChange(e.target.name,e.target.value);});
    function showInspector(board,e){
      const c=e.coordinate,s=currentState;
      const recordText=`${e.awardCount} 次直接获奖 · ${e.company&&e.type!=='公司'?esc(e.company)+' · ':''}${c.count} / ${c.total} 条关联记录入样`;
      const band=awardBand(e.awardCount),gf=/广发/.test(e.company||'');
      board.querySelector('.aw-inspector').innerHTML=`<div class="aw-selection-kicker">当前选中 <span style="--award-color:${gf?band.gf:band.color}">${e.awardCount} 次获奖</span></div><h3>${esc(e.name)}</h3><p>${recordText}</p>${c.count?`<div class="aw-measures"><span>${labels[s.y]}${val(c.y)}</span><span>${labels[s.x]}${val(c.x,true)}</span></div><p class="aw-stat-basis">${e.type==='产品'?'产品指标':'关联产品中位数'} · ${period(s)}</p><dl class="aw-date-facts"><dt>业绩起点</dt><dd>${esc(dateRange(c.startMin,c.startMax))}</dd><dt>业绩截止</dt><dd>${esc(dateRange(c.endMin,c.endMax))}</dd><dt>币种 / 策略</dt><dd>${esc(c.currencies.join(' / '))} · ${esc(c.strategies.join(' / '))}</dd></dl><details><summary>计算样本与未入样原因</summary><div class="aw-sample-list">${c.samples.map(p=>`<a href="./detail.html?id=${encodeURIComponent(p.p.key)}">${esc(p.p.name)} ↗</a><span>${esc(p.end)} · 风险 ${fmt(p.x)} · 收益 ${fmt(p.y)}</span>`).join('')}</div>${Object.keys(c.reasons).length?`<p>未入样：${Object.entries(c.reasons).map(([k,v])=>`${esc(k)} ${v}条`).join('；')}</p>`:''}</details>`:`<p class="aw-no-point">未入图：${esc(c.reason)}。获奖记录仍保留。</p>`}`;
      board.querySelectorAll('[data-entity]').forEach(el=>{const active=el.dataset.entity===e.id;el.classList.toggle('aw-selected',active);el.setAttribute('aria-pressed',String(active));el.tabIndex=active?0:-1;});
      board.querySelector('.aw-pick').value=e.id;
      const awards=e.recordIds.map(id=>currentAwards.get(id)).filter(Boolean);
      const facts=document.createElement('details');facts.className='aw-recipient-awards';
      facts.innerHTML=`<summary>查看直接获奖记录（${awards.length}条）</summary>${awards.map(r=>`<p>${esc(r.year)} · ${esc(r.brand)} · ${esc(r.category)} ${/^https?:\/\//i.test(r.url||'')?`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">来源 ↗</a>`:''}</p>`).join('')}`;
      board.querySelector('.aw-inspector').append(facts);
      const dot=board.querySelector('.aw-selected .aw-bubble'),svg=board.querySelector('.aw-svg svg');
      if(dot&&svg){
        let label=svg.querySelector('.aw-focus-label');if(!label){label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('class','aw-focus-label');label.setAttribute('pointer-events','none');svg.append(label);}
        const width=Number(svg.getAttribute('width')),cx=Number(dot.getAttribute('cx')),cy=Number(dot.getAttribute('cy')),right=cx>width*.62,limit=width<550?11:18;
        const text=e.name.length>limit?e.name.slice(0,limit)+'…':e.name,labelWidth=text.length*12;
        label.setAttribute('x',right?Math.max(labelWidth+8,cx-14):Math.min(width-labelWidth-8,cx+14));label.setAttribute('y',Math.max(30,cy-14));label.setAttribute('text-anchor',right?'end':'start');label.textContent=text;
      }else if(svg)svg.querySelector('.aw-focus-label')?.remove();
    }
    function draw(board,items){
      const s=currentState,points=items.filter(e=>e.coordinate.count),kind=board.dataset.kind;
      const width=Math.max(240,Math.round(board.querySelector('.aw-svg').clientWidth)),small=width<550,h=small?340:430;
      const margin={left:small?43:56,right:18,top:34,bottom:55},w=width-margin.left-margin.right,height=h-margin.top-margin.bottom;
      const xs=points.map(e=>e.coordinate.x),ys=points.map(e=>e.coordinate.y);
      const xscale=niceScale(0,Math.max(1,...xs)*1.05,small?4:6);
      const ylo=Math.min(0,...ys),yhi=Math.max(1,...ys),pad=(yhi-ylo)*.08;
      const yscale=niceScale(ylo-pad,yhi+pad,small?4:5);
      const X=v=>margin.left+w*(v-xscale.min)/(xscale.max-xscale.min),Y=v=>margin.top+height*(yscale.max-v)/(yscale.max-yscale.min);
      const num=v=>Number(v.toFixed(2)).toString(),bottom=h-margin.bottom,right=width-margin.right;
      const grid=xscale.ticks.map(x=>`<line class="aw-grid" x1="${X(x)}" x2="${X(x)}" y1="${margin.top}" y2="${bottom}"/><text class="aw-tick" x="${X(x)}" y="${bottom+23}" text-anchor="middle">${num(x)}</text>`).join('')
        +yscale.ticks.map(y=>`<line class="aw-grid ${y===0?'aw-zero':''}" x1="${margin.left}" x2="${right}" y1="${Y(y)}" y2="${Y(y)}"/><text class="aw-tick" x="${margin.left-10}" y="${Y(y)+4}" text-anchor="end">${num(y)}</text>`).join('');
      const mx=median(xs),my=median(ys),hasQuadrants=points.length>1;
      const med=hasQuadrants?`<rect class="aw-quadrant-fill" x="${margin.left}" y="${margin.top}" width="${X(mx)-margin.left}" height="${Y(my)-margin.top}"/><line class="aw-median" x1="${X(mx)}" x2="${X(mx)}" y1="${margin.top}" y2="${bottom}"/><line class="aw-median" x1="${margin.left}" x2="${right}" y1="${Y(my)}" y2="${Y(my)}"/>`:'';
      const zoneLabels=hasQuadrants?`<g class="aw-zone-labels" pointer-events="none"><text class="aw-zone-good" x="${margin.left+10}" y="${margin.top+19}">${small?'相对绩优':'相对绩优区'}</text><text x="${right-10}" y="${margin.top+19}" text-anchor="end">${small?'高风险高收益':'高风险 · 高收益'}</text><text x="${margin.left+10}" y="${bottom-12}">${small?'低风险低收益':'低风险 · 低收益'}</text><text x="${right-10}" y="${bottom-12}" text-anchor="end">${small?'相对承压':'相对承压区'}</text></g>`:'';
      board.querySelector('.aw-axis-note').textContent=`${period(s)} · ${kind==='产品'?'产品风险收益':'关联产品风险收益中位数'} · 坐标单位 %`;
      board.querySelector('.aw-board-stats').innerHTML=`<strong>${points.length}</strong> 个入图 <span>/ ${items.length} 个获奖对象</span>`;
      board.querySelector('.aw-svg').innerHTML=points.length?`<svg width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="group" aria-label="${display[kind]}获奖次数与风险收益点阵图"><title>${display[kind]}点阵：${period(s)}${labels[s.x]}与${labels[s.y]}</title>${med}${grid}${zoneLabels}<text class="aw-axis-title" x="${margin.left}" y="16">${labels[s.y]}（%）↑</text><text class="aw-axis-title" x="${right}" y="${h-6}" text-anchor="end">${labels[s.x]}（%）→</text>${[...points].sort((a,b)=>a.awardCount-b.awardCount).map(e=>{
        const c=e.coordinate,gf=/广发/.test(e.company||''),band=awardBand(e.awardCount),r=small?4.5:5;
        return `<g class="aw-dot ${gf?'aw-gf-dot':''}" style="--award-color:${gf?band.gf:band.color}" data-entity="${esc(e.id)}" role="button" tabindex="-1" aria-label="${esc(e.name)}，获奖${e.awardCount}次，${labels[s.x]}${fmt(c.x)}，${labels[s.y]}${fmt(c.y)}"><title>${esc(e.name)}｜获奖${e.awardCount}次｜${labels[s.x]} ${fmt(c.x)}｜${labels[s.y]} ${fmt(c.y)}｜有效样本${c.count}</title><circle class="aw-hit" cx="${X(c.x)}" cy="${Y(c.y)}" r="12"/><circle class="aw-selection-ring" cx="${X(c.x)}" cy="${Y(c.y)}" r="${r+4}"/><circle class="aw-bubble" cx="${X(c.x)}" cy="${Y(c.y)}" r="${r}"/></g>`;
      }).join('')}</svg><div class="aw-hover-card" hidden></div>`:`<div class="empty-panel">${items.length?'当前对象暂无符合条件的业绩，可调整区间或样本范围；获奖记录仍保留。':'当前年份、奖项或名单条件下没有获奖记录。'}</div>`;
      board.querySelector('.aw-color-key').innerHTML=`<span class="aw-key-heading">获奖次数</span>${awardBands.map(b=>`<span class="aw-color-item"><i style="background:${b.color}"></i>${b.label}</span>`).join('')}<span class="aw-gf-key"><i></i>广发用同档红色</span>`;
      board.querySelector('.aw-quadrant-note').textContent=hasQuadrants?`虚线为当前入图样本中位数：风险 ${fmt(mx)} / 收益 ${fmt(my)}。左上方为相对低风险、高收益区域，不构成同类排名。`:'至少两个有效对象时显示中位数分区。';
      board.querySelector('.aw-pick').innerHTML=items.length?items.map(e=>`<option value="${e.id}">${esc(e.name)} · ${e.awardCount}次${e.coordinate.count?'':' · '+esc(e.coordinate.reason)}</option>`).join(''):'<option>无符合条件的对象</option>';
      const reasons={};for(const e of items.filter(e=>!e.coordinate.count))reasons[e.coordinate.reason]=(reasons[e.coordinate.reason]||0)+1;
      board.querySelector('.aw-missing summary').textContent=`未入图说明 · ${items.length-points.length} 个对象`;
      board.querySelector('.aw-missing div').innerHTML=Object.entries(reasons).map(([k,v])=>`<p>${esc(k)}：${v} 个</p>`).join('')||'<p>当前对象均有可绘图业绩。</p>';
      const e=items.find(e=>e.id===selected[kind])||points[0]||items[0];
      if(e){selected[kind]=e.id;showInspector(board,e);}else board.querySelector('.aw-inspector').innerHTML='';
    }
    host.querySelectorAll('.aw-board').forEach(board=>{
      const choose=id=>{const e=current.find(e=>e.id===id);if(e){selected[board.dataset.kind]=id;showInspector(board,e);}};
      board.querySelector('.aw-pick').onchange=e=>choose(e.target.value);
      const plot=board.querySelector('.aw-svg');
      const nearest=event=>{
        const svg=plot.querySelector('svg');if(!svg)return null;
        const rect=svg.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
        let best=null,distance=18;
        for(const dot of svg.querySelectorAll('[data-entity]')){const c=dot.querySelector('.aw-bubble'),d=Math.hypot(x-Number(c.getAttribute('cx')),y-Number(c.getAttribute('cy')));if(d<distance){distance=d;best=dot;}}
        return best;
      };
      plot.onclick=e=>{const dot=nearest(e)||e.target.closest('[data-entity]');if(dot)choose(dot.dataset.entity);};
      plot.onpointermove=event=>{
        const tip=plot.querySelector('.aw-hover-card'),dot=nearest(event);if(!tip)return;
        if(!dot||event.pointerType==='touch'){tip.hidden=true;return;}
        const e=current.find(e=>e.id===dot.dataset.entity);if(!e)return;
        tip.innerHTML=`<strong>${esc(e.name)}</strong><span>获奖 ${e.awardCount} 次 · 有效样本 ${e.coordinate.count}</span><span>${labels[currentState.y]} ${fmt(e.coordinate.y)} · ${labels[currentState.x]} ${fmt(e.coordinate.x)}</span>`;
        tip.hidden=false;const rect=plot.getBoundingClientRect();
        tip.style.left=Math.max(8,Math.min(event.clientX-rect.left+16,rect.width-tip.offsetWidth-8))+'px';
        tip.style.top=Math.max(8,Math.min(event.clientY-rect.top+18,rect.height-tip.offsetHeight-8))+'px';
      };
      plot.onpointerleave=()=>{const tip=plot.querySelector('.aw-hover-card');if(tip)tip.hidden=true;};
      board.querySelector('.aw-svg').onkeydown=e=>{
        const dots=[...board.querySelectorAll('[data-entity]')],index=dots.indexOf(e.target.closest('[data-entity]'));
        if(index<0)return;
        let next=index;if(['ArrowRight','ArrowDown'].includes(e.key))next=(index+1)%dots.length;else if(['ArrowLeft','ArrowUp'].includes(e.key))next=(index+dots.length-1)%dots.length;else if(!['Enter',' '].includes(e.key))return;
        e.preventDefault();choose(dots[next].dataset.entity);dots[next].focus();
      };
    });
    let lastWidth=0,resizeTimer;
    const observer=new ResizeObserver(entries=>{const width=Math.round(entries[0].contentRect.width);if(width!==lastWidth){lastWidth=width;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(current.length)host.querySelectorAll('.aw-board').forEach(b=>draw(b,current.filter(e=>e.type===b.dataset.kind)));},60);}});observer.observe(host);
    return {render(awards,state){currentState=clean(state);currentAwards=new Map(awards.map(r=>[r.id,r]));current=selectEntities(scatter,awards,currentState);for(const el of host.querySelectorAll('.aw-plot-controls select'))el.value=currentState[el.name]||'';const periodSelect=host.querySelector('[name="period"]');periodSelect.disabled=false;periodSelect.title='成立以来为年化指标优先口径，也可显式切换近一年';host.querySelectorAll('.aw-board').forEach(b=>draw(b,current.filter(e=>e.type===b.dataset.kind)));}};
  }
  const api={coordinate,selectEntities,median,radius,awardBands,awardBand,niceScale,defaults,clean,effectivePeriod,mount};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.PrivateFundAwardScatter=api;
})(typeof window==='undefined'?globalThis:window);
