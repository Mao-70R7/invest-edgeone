(() => {
  const P=window.PrivateFund,F=window.PrivateFundFilters,C=window.PrivateFundScatterControls;
  function mount(pack){
    const root=document.getElementById('mainContent'),previous=root.querySelector('.product-shell-filters');if(!previous)return;
    const host=previous.cloneNode(false);previous.replaceWith(host);
    const params=new URLSearchParams(location.search),selected=F.read(params),active={};
    for(const group of F.groups)active[group]=pack.fields.find(f=>f.group===group&&selected[f.id])?.id||pack.fields.find(f=>f.group===group)?.id;
    const count=n=>Number(n).toLocaleString('zh-CN'),amount=n=>count(n)+'只 · '+(pack.total?n/pack.total*100:0).toFixed(1)+'%';
    const heading=root.querySelector('.asof-block');heading.querySelector('strong').textContent=count(pack.total);
    heading.querySelector('span').textContent=Object.entries(pack.meta.sourceCounts||{}).map(([id,n])=>(P.sourceColors[id]?.label||id)+' '+count(n)).join(' · ');
    root.querySelectorAll('.panel-count').forEach(n=>n.textContent=count(pack.total)+'只 · 产品结果加载中');
    const sources=Object.entries(pack.meta.sourceCounts||{});
    const options=(items,value)=>items.map(([id,label])=>`<option value="${P.esc(id)}"${id===value?' selected':''}>${P.esc(label)}</option>`).join('');
    host.innerHTML=`<details class="filter-disclosure" open><summary>筛选产品 <span>可先选择条件</span></summary><div class="filter-panel"><div class="rank-filter-row basic-filter-row"><h3>基础筛选</h3><div class="rank-filter-content"><div class="filter-grid product-preview-grid">
      <label class="field"><span>产品 / 管理人 / 经理 / 备案号</span><input type="search" data-preview-query value="${P.esc(params.get('q')||'')}" placeholder="输入产品、机构或经理"></label>
      <label class="field"><span>数据来源</span><select data-preview-param="source">${options([['','全部来源（'+amount(pack.total)+'）'],...sources.map(([id,n])=>[id,(P.sourceColors[id]?.label||id)+'（'+amount(n)+'）'])],params.get('source')||'')}</select></label>
      <div class="field" data-preview-multi="company"></div><div class="field" data-preview-multi="strategy"></div>
      <button type="button" class="secondary-button" data-preview-reset>重置</button>
      </div></div></div><div class="rank-filters" data-preview-fields></div><p class="rank-help" data-preview-note>数量为本版全部产品覆盖；产品数据加载后更新当前条件的匹配数量。</p></div></details>
      <div class="scatter-toolbar">${[['x','return','X 轴 · 区间收益',pack.meta.defaultXMetric],['y','risk','Y 轴 · 风险指标',pack.meta.defaultYMetric]].map(([param,group,label,defaultValue])=>`<label class="field"><span>${label}</span><select data-preview-param="${param}">${options(pack.metrics.filter(m=>m.group===group&&m.coverageTotal>0).map(m=>[m.code,m.label+' · '+count(m.coverageTotal)+'只']),params.get(param)||defaultValue)}</select></label>`).join('')}</div>`;
    const save=(key,value)=>{const u=new URL(location.href);value?u.searchParams.set(key,value):u.searchParams.delete(key);u.searchParams.delete('page');history.replaceState(null,'',u);};
    const fieldsHost=host.querySelector('[data-preview-fields]');
    function renderFields(){fieldsHost.innerHTML=F.groups.map(group=>{
      const fs=pack.fields.filter(f=>f.group===group),f=fs.find(f=>f.id===active[group])||fs[0];
      const tabs=fs.filter((v,i)=>!v.family||fs.findIndex(x=>x.family===v.family)===i).map(t=>t.family?(fs.find(x=>x.family===t.family&&x.period===f.period)||t):t);
      return `<div class="rank-filter-row"><h3>${P.esc(group)}</h3><div class="rank-filter-content">${group==='超额指标'?'<p class="rank-help">预览数量以沪深300为研究对照；所选其他指数的数量在指标数据到达后更新。</p>':''}<div class="rank-field-tabs">${tabs.map(t=>`<button type="button" data-preview-field="${t.id}" aria-pressed="${t.family?t.family===f.family:t.id===f.id}">${P.esc(t.familyLabel||t.label)}<small>（${amount(t.options.find(o=>o.value===(t.feature?'符合':'__present'))?.count||0)}）</small></button>`).join('')}</div>${f.family?`<div class="rank-periods">${fs.filter(t=>t.family===f.family).map(t=>`<button type="button" data-preview-field="${t.id}" aria-pressed="${t.id===f.id}">${P.esc(F.periods[t.period])}</button>`).join('')}</div>`:''}<div class="rank-options">${f.options.map(o=>`<button type="button" data-preview-condition="${f.id}" data-value="${P.esc(o.value)}" aria-pressed="${(selected[f.id]||'')===o.value}">${P.esc(o.label)}<small>（${amount(o.count)}）</small></button>`).join('')}</div>${f.bands?`<div class="rank-custom"><span>自定义（${P.esc(f.unit)}）</span><input type="number" step="any" data-preview-min="${f.id}" aria-label="${P.esc(f.label)}下限" placeholder="下限 ≥"><span>至</span><input type="number" step="any" data-preview-max="${f.id}" aria-label="${P.esc(f.label)}上限" placeholder="上限 <"><button type="button" data-preview-custom="${f.id}">应用</button></div>`:''}</div></div>`;
    }).join('');}
    function multi(field,choices,title){const box=host.querySelector(`[data-preview-multi="${field}"]`);box.innerHTML=`<span>${title}</span><details class="multi-select"><summary><span data-preview-value>全部${title}</span>⌄</summary><div class="multi-select-menu"><input type="search" aria-label="搜索${title}" placeholder="搜索${title}"><div class="multi-select-options"></div></div></details>`;
      const search=box.querySelector('input'),list=box.querySelector('.multi-select-options');
      const refresh=()=>{const selected=new URLSearchParams(location.search).getAll(field),q=search.value.trim().toLowerCase();box.querySelector('[data-preview-value]').textContent=selected.length?'已选 '+selected.length+' 项':'全部'+title;list.innerHTML=choices.filter(v=>(field==='company'?pack.companySearch[v]||v:C.label(v,'strategy')).toLowerCase().includes(q)).slice(0,80).map(v=>`<label><input type="checkbox" value="${P.esc(v)}"${selected.includes(v)?' checked':''}><span>${P.esc(C.label(v,field==='company'?'company':'strategy'))}</span></label>`).join('');};
      search.addEventListener('input',refresh);list.addEventListener('change',e=>{const u=new URL(location.href),values=u.searchParams.getAll(field).filter(v=>v!==e.target.value);if(e.target.checked)values.push(e.target.value);u.searchParams.delete(field);values.forEach(v=>u.searchParams.append(field,v));u.searchParams.delete('page');history.replaceState(null,'',u);refresh();});refresh();}
    renderFields();multi('company',pack.companies,'基金公司');multi('strategy',pack.strategies,'策略类型');
    host.addEventListener('input',e=>{if(e.target.matches('[data-preview-query]'))save('q',e.target.value);});
    host.addEventListener('change',e=>{if(e.target.dataset.previewParam)save(e.target.dataset.previewParam,e.target.value);});
    host.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
      if(b.dataset.previewField){const f=pack.fields.find(f=>f.id===b.dataset.previewField);active[f.group]=f.id;renderFields();}
      if(b.dataset.previewCondition){const id=b.dataset.previewCondition;selected[id]=b.dataset.value;save('f_'+id,b.dataset.value);if(id==='strategy'){delete selected.subStrategy;save('f_subStrategy','');}renderFields();}
      if(b.dataset.previewCustom){const id=b.dataset.previewCustom,a=F.number(host.querySelector(`[data-preview-min="${id}"]`).value),z=F.number(host.querySelector(`[data-preview-max="${id}"]`).value);if(a!==null&&z!==null&&a>=z)return;selected[id]=a===null&&z===null?'':JSON.stringify([a,z]);save('f_'+id,selected[id]);renderFields();}
      if(b.hasAttribute('data-preview-reset')){const u=new URL(location.href);for(const key of [...u.searchParams.keys()])if(key.startsWith('f_')||['q','source','company','strategy','x','y','page'].includes(key))u.searchParams.delete(key);history.replaceState(null,'',u);mount(pack);}
    });
    document.body.dataset.filtersReady='true';
  }
  window.PrivateFundProductPreview={mount};
})();
