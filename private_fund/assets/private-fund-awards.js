(function (root) {
  'use strict';
  const brands = ['金牛','英华','金阳光','金长江'];
  const colors = {'金牛':'#315D9C','英华':'#947337','金阳光':'#357F83','金长江':'#8B659B','多榜单':'#C36B38','未匹配':'#AAB2BA'};
  const statusLabels = {cross_checked:'交叉核对',text_verified:'文本核对',recipient_text_verified:'获奖对象文本核对',source_extracted:'原文提取·待核',needs_review:'待复核',secondary_text_pending:'转录待核'};
  const checked = new Set(['cross_checked','text_verified','recipient_text_verified']);
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const entries = (row, state={}) => (row.awards||[]).filter(a=>(!state.awardYear||String(a.year)===state.awardYear)&&(!state.awardStatus||(state.awardStatus==='verified'?checked.has(a.status):!checked.has(a.status))));
  function matches(row,state) {
    const list=entries(row,state);
    if(state.award==='none')return !(row.awards||[]).length && !state.awardYear && !state.awardStatus;
    return (!state.award||state.award==='any'?(!state.award&&!state.awardYear&&!state.awardStatus)||list.length>0:list.some(a=>a.brand===state.award));
  }
  function read(params,state) {
    state.award=['any','none',...brands].includes(params.get('award'))?params.get('award'):'';
    state.awardYear=/^20\d{2}$/.test(params.get('awardYear')||'')?params.get('awardYear'):'';
    state.awardStatus=['verified','pending'].includes(params.get('awardStatus'))?params.get('awardStatus'):'';
    state.colorBy=params.get('colorBy')==='award'?'award':'company';
  }
  function write(params,state) {for(const k of ['award','awardYear','awardStatus','colorBy']){if(state[k]&&!(k==='colorBy'&&state[k]==='company'))params.set(k,state[k]);else params.delete(k);}}
  function badges(row) {
    const list=row.awards||[];
    if(!list.length)return '<small class="cell-sub award-empty">未匹配直接获奖记录</small>';
    const labels=[...new Set(list.map(a=>`${a.brand} ${a.year}${checked.has(a.status)?'':' · 待核'}`))];
    return `<details class="award-records"><summary aria-label="展开直接获奖明细">${labels.slice(0,2).map(t=>`<span class="award-badge">${esc(t)}</span>`).join('')}<small>直接获奖 ${list.length} 项 · 展开</small></summary><div class="award-record-list">${list.map(a=>`<article><strong>${esc(a.year)} ${esc(a.brand)} · ${esc(a.category||'类别未披露')}</strong><span>${esc(a.series)}${a.evaluationYear?' · 评价年度 '+esc(a.evaluationYear):''}</span><span>获奖对象：${esc(a.recipient||a.product||a.manager)}${a.company?' · '+esc(a.company):''}</span><span>${esc(statusLabels[a.status]||'待核')} ${/^https?:\/\//i.test(a.url||'')?`· <a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">榜单来源 ↗</a>`:'· 来源链接未提供'}</span></article>`).join('')}</div></details>`;
  }
  const summary=row=>(row.awards||[]).length?[...new Set(row.awards.map(a=>`${a.year} ${a.brand}${checked.has(a.status)?'':'（待核）'}`))].join('、'):'未匹配直接获奖记录';
  function style(row,state) {
    const found=[...new Set(entries(row,state).map(a=>a.brand))];
    const label=found.length>1?'多榜单':found[0]||'未匹配';
    return {color:colors[label]||colors['未匹配'],highlighted:found.length>0,label};
  }
  function legend(rows,state) {
    const count={};rows.forEach(r=>{const k=style(r,state).label;count[k]=(count[k]||0)+1;});
    return [...brands,'多榜单','未匹配'].map(k=>`<span class="legend-item"><i class="legend-mark" style="--mark:${colors[k]};background:${colors[k]}"></i>${esc(k==='未匹配'?'当前范围未匹配奖项':k)} · ${count[k]||0}</span>`).join('')+'<small>数量含缺坐标对象；按公布年及核验条件标色，多榜单不重复计数。颜色不代表收益或评级。</small>';
  }
  function mount(filterHost, toolbar, rows, state, changed, meta={}) {
    const years=[...new Set(rows.flatMap(r=>(r.awards||[]).map(a=>String(a.year))))].sort().reverse();
    const option=(v,t)=>`<option value="${esc(v)}">${esc(t)}</option>`;
    const holder=document.createElement('div');holder.className='award-filters';
    holder.innerHTML=`<label class="field"><span>直接获奖榜单</span><select id="awardFilter">${[['','全部对象'],['any','有匹配获奖记录'],...brands.map(b=>[b,b+'奖']),['none','未匹配获奖记录']].map(a=>option(...a)).join('')}</select></label><label class="field"><span>榜单公布年</span><select id="awardYearFilter">${option('','全部年份')+years.map(y=>option(y,y)).join('')}</select></label><label class="field"><span>获奖记录核验</span><select id="awardStatusFilter">${[['','全部（含待核）'],['verified','已作文本或交叉核对'],['pending','尚待核对']].map(a=>option(...a)).join('')}</select></label>`;
    filterHost.appendChild(holder);
    const note=document.createElement('p');note.className='award-note';note.textContent=(meta.available===false?'奖项匹配快照尚未生成。 ':'')+'仅按直接获奖筛选；未匹配不代表未获奖。机构奖不下传，产品奖不算经理本人获奖。待核记录单独标注。'+(meta.matchedAt?' 匹配快照：'+meta.matchedAt.slice(0,10):'');filterHost.appendChild(note);
    toolbar.insertAdjacentHTML('beforeend',`<label class="field"><span>点阵标色</span><select id="awardColorBy">${option('company','按基金公司')+option('award','按获奖榜单')}</select></label>`);
    const ids={award:'awardFilter',awardYear:'awardYearFilter',awardStatus:'awardStatusFilter',colorBy:'awardColorBy'};
    for(const [key,id] of Object.entries(ids))document.getElementById(id).addEventListener('change',event=>{state[key]=event.target.value;if(key==='award'&&state.award==='none'){state.awardYear='';state.awardStatus='';}if(key!=='award'&&key!=='colorBy'&&state.award==='none')state.award='';state.page=1;changed();});
    return ()=>{for(const [key,id] of Object.entries(ids))document.getElementById(id).value=state[key]||'';};
  }
  const api={brands,colors,matches,read,write,badges,summary,style,legend,mount,entries};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PrivateFundAwards=api;
})(typeof window==='object'?window:globalThis);
