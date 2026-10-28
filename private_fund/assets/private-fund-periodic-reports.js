(() => {
  'use strict';
  const esc=window.PrivateFund?.esc||((value)=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const num=(v,d=2)=>v===null||v===undefined||v===''?'—':Number(v).toLocaleString('zh-CN',{maximumFractionDigits:d});
  const missing={available:'已提取',not_disclosed_in_report:'报告未披露',not_disclosed_in_custodian_report:'托管报告未披露',no_itemized_holdings_with_explicit_category_absences:'未列示持仓，部分资产明确未持有',parent_fund_total_available_channel_share_not_disclosed:'已提取基金合计；渠道份额规模未披露'};
  const levels={direct:'直接投资',lookthrough:'穿透配置',industry:'行业配置',bond_type:'债券分类'};
  const baseLabels={total_assets:'总资产',net_assets:'净资产'};
  const kind=r=>r.document_type==='custodian_quarterly'?'托管报告':'管理人季报';
  function link(r,page){return `<a href="${esc(r.source_urls[0])}${page?'#page='+Number(page):''}" target="_blank" rel="noopener noreferrer">${page?'第 '+Number(page)+' 页':'原始报告'} ↗</a>`;}
  function table(headers,rows){return `<div class="report-table-scroll"><table class="report-data-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
  function reportBody(r){
    const a=r.net_assets;
    const holdings=r.holdings||[],alloc=r.asset_allocation||[],analysis=r.operation_analysis||[];
    const statuses=Object.entries(r.field_status||{}).map(([key,status])=>`${{holdings:'持仓',scale:'规模',asset_allocation:'配置',operation_analysis:'运作分析'}[key]}：${missing[status]||status}`);
    let body=`<p class="report-scope">报告期 ${esc(r.period_start)} 至 ${esc(r.period_end)} · 披露日期 ${esc(r.document_date)} · ${link(r)}</p><p class="report-status">${statuses.map(esc).join('；')}</p>`;
    if(r.source_reporting_ranges?.some(x=>x.start!==r.period_start))body+=`<p class="report-scope">报告另列统计期间：${[...new Set(r.source_reporting_ranges.map(x=>x.start+' 至 '+x.end))].map(esc).join('；')}。</p>`;
    body+=`<div class="report-facts"><div><span>${a?.scope==='parent_fund_all_share_classes'?'基金合计期末净资产':'期末净资产'}</span><strong>${a?num(a.value)+' '+esc(a.unit):'—'}</strong>${a?link(r,a.source_page):''}</div><div><span>已披露持仓</span><strong>${holdings.length} 条</strong><small>部分披露，不代表完整持仓</small></div></div>`;
    for(const note of [...(r.scope_notes||[]),...(r.source_consistency_notes||[])])body+=`<p class="report-scope">${esc(note)}</p>`;
    if(r.share_class_net_assets?.length)body+=`<p class="report-scope">分级规模单独保留：${r.share_class_net_assets.map(x=>esc(x.share_class)+' 类 '+esc(x.value_raw)+' '+esc(x.unit)).join('；')}。上方为产品合计。</p>`;
    body+='<h3>期末持仓</h3><p class="report-scope">只列期末持仓或期末投资余额。比例按报告原值展示；合约权利方与义务方分别保留，未披露比例不推算。</p>';
    body+=holdings.length?table(['标的 / 代码','数量 / 单位','市值 / 单位','占比 / 分母','来源'],holdings.map(h=>[
      `${esc(h.security_name_status==='source_not_disclosed'?'名称未披露':h.security_name)}<small>${esc(h.security_id||'代码未披露')}${h.position_side?' · '+esc(h.position_side):''}</small>`,
      `${num(h.quantity,4)}${h.quantity_unit?' '+esc(h.quantity_unit):''}`,`${num(h.market_value)} ${esc(h.value_unit||'单位未披露')}`,
      `${num(h.weight_pct)}${h.weight_pct!==null?'%':''}<small>${esc(baseLabels[h.weight_denominator]||'比例未披露')}</small>`,link(r,h.source_page)
    ])):`<p class="report-missing">— ${esc(missing[r.field_status.holdings]||'未披露')}</p>`;
    body+='<h3>资产配置</h3><p class="report-scope">直接投资、穿透配置和行业分类分别展示；子项与合计不能重复相加。空白或横线保留为缺失，原文零值保留为 0。</p>';
    for(const level of [...new Set(alloc.map(x=>x.allocation_level))]){
      const rows=alloc.filter(x=>x.allocation_level===level);
      body+=`<details class="report-allocation" ${level==='direct'?'open':''}><summary>${esc(levels[level]||level)} · ${rows.length} 项</summary>`+table(['资产项','金额 / 单位','占比 / 分母','来源'],rows.map(x=>[
        `${esc(x.asset_name)}${x.parent_category?'<small>'+esc(x.parent_category)+'</small>':''}${x.is_subcategory?'<small>子项</small>':''}`,
        `${num(x.amount)} ${esc(x.amount_unit||'单位未披露')}`,`${num(x.weight_pct)}${x.weight_pct!==null?'%':''}<small>${esc(baseLabels[x.weight_denominator]||'分母未披露')}</small>`,link(r,x.source_page)
      ]))+'</details>';
    }
    if(!alloc.length)body+=`<p class="report-missing">— ${esc(missing[r.field_status.asset_allocation]||'未披露')}</p>`;
    body+='<h3>投资运作分析原文</h3>';
    body+=analysis.length?analysis.map(x=>`<article class="report-narrative"><h4>${esc(x.title)}</h4><small>${x.kind==='strategy_operation_and_risks'?'策略运行及风险说明':'管理人运作分析'}</small><p>${esc(x.text)}</p><small>报告原文 · ${x.source_pages.map(n=>link(r,n)).join(' / ')}</small></article>`).join(''):`<p class="report-missing">— ${esc(missing[r.field_status.operation_analysis]||'未披露')}</p>`;
    if(r.financial_metrics?.length)body+='<details class="report-allocation"><summary>其他财务指标原值</summary>'+table(['报告指标','原值','单位','来源'],r.financial_metrics.map(x=>[esc(x.label),esc(x.value_raw),esc(x.unit),link(r,x.source_page)]))+'</details>';
    if(r.explicit_absences?.length)body+=`<details class="report-allocation"><summary>原文缺失与未持有说明 · ${r.explicit_absences.length} 条</summary>${r.explicit_absences.map(x=>`<p class="report-scope">${esc(x.text)} ${link(r,x.page)}</p>`).join('')}</details>`;
    body+=`<p class="report-scope">来源：中欧财富匿名可访问报告 · ${r.page_count} 页${r.ocr_pages.length?'，其中 '+r.ocr_pages.length+' 页经 OCR 识别':''} · 文件指纹 ${esc(r.document_sha256.slice(0,16))}…</p>`;
    return body;
  }
  function renderDetail(reports){
    if(!reports?.length)return '';
    const target=location.hash.slice(1);
    return `<p class="report-scope">共 ${reports.length} 份已解析季报文件。选择报告可查看对应季度；同季度不同披露文件分别保留，请勿重复汇总。<a href="./reports.html">查看季报目录 ↗</a></p>`+reports.map((r,i)=>`<details class="periodic-report" id="report-${esc(r.document_sha256.slice(0,16))}" ${(target===`report-${r.document_sha256.slice(0,16)}`||(!target&&i===0))?'open':''}><summary><strong>${esc(r.report_period)} · ${kind(r)} · 披露 ${esc(r.document_date)}</strong><span>${r.holdings.length} 条持仓 / ${r.asset_allocation.length} 项配置</span></summary><div class="periodic-report-body">${reportBody(r)}</div></details>`).join('');
  }
  window.PrivateFundPeriodicReports={renderDetail,reportBody};
  window.addEventListener('hashchange',()=>{
    const report=document.getElementById(location.hash.slice(1));
    if(report?.classList.contains('periodic-report')){report.open=true;report.scrollIntoView({block:'start'});}
  });
  const data=window.__PRIVATE_FUND_PERIODIC_REPORTS__,root=document.getElementById('periodicReportIndex');
  if(!data||!root)return;
  const all=data.rows||[];
  const productListHref=[...document.querySelectorAll('nav a')].find(a=>a.textContent.trim()==='产品列表')?.getAttribute('href')||'./index.html';
  const periods=[...new Set(all.map(r=>r.reportPeriod))].sort().reverse();
  root.innerHTML=`<div class="report-heading"><p class="eyebrow">PERIODIC DISCLOSURES</p><h1>私募季报</h1><p>按报告期查看规模、持仓、资产配置与运作原文。</p></div><div id="reportKpis" class="report-index-kpis"></div><section class="report-coverage"><h2>披露覆盖</h2><div id="reportCoverageBars"></div><p class="report-scope">按文件内容去重；同季度不同披露文件及托管报告分别计数，不重复汇总持仓。覆盖数量不代表完整在售产品或完整持仓。</p></section><div class="report-filters"><label>产品名称<input id="reportSearch" type="search" placeholder="搜索产品"></label><label>报告期<select id="reportPeriod"><option value="">全部报告期</option>${periods.map(p=>`<option>${esc(p)}</option>`).join('')}</select></label><label>报告类型<select id="reportType"><option value="">全部类型</option><option value="manager_quarterly">管理人季报</option><option value="custodian_quarterly">托管报告</option></select></label></div><div id="reportRows"></div><p class="report-scope">来源：中欧财富公开报告链接。缺失不视为零。其他渠道已采集的资料仍在<a href="${esc(productListHref)}">产品列表</a>中查看。构建时间 ${esc(data.generatedAt)}。</p>`;
  function refresh(){
    const q=document.getElementById('reportSearch').value.trim().toLowerCase(),p=document.getElementById('reportPeriod').value,t=document.getElementById('reportType').value;
    const rows=all.filter(r=>(!q||r.name.toLowerCase().includes(q))&&(!p||r.reportPeriod===p)&&(!t||r.reportType===t)).sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd)||a.name.localeCompare(b.name,'zh-CN'));
    document.getElementById('reportKpis').innerHTML=[['报告文件',rows.length],['产品',new Set(rows.map(r=>r.key)).size],['持仓记录',rows.reduce((n,r)=>n+r.holdingsCount,0)],['配置记录',rows.reduce((n,r)=>n+r.allocationCount,0)]].map(([label,value])=>`<div><span>${label}</span><strong>${num(value,0)}</strong></div>`).join('');
    document.getElementById('reportCoverageBars').innerHTML=[['规模',r=>!!r.netAssets],['持仓',r=>r.holdingsCount>0],['资产配置',r=>r.allocationCount>0],['运作分析',r=>r.analysisCount>0]].map(([label,test])=>{const n=rows.filter(test).length;return `<div class="report-coverage-row"><span>${label}</span><i><b style="width:${rows.length?n/rows.length*100:0}%"></b></i><strong>${n} / ${rows.length} 份</strong></div>`;}).join('');
    document.getElementById('reportRows').innerHTML=table(['报告期 / 类型','产品','报告披露净资产','持仓 / 配置','运作分析','来源'],rows.map(r=>[
      `${esc(r.reportPeriod)}<small>${r.reportType==='custodian_quarterly'?'托管报告':'管理人季报'}</small><small>披露 ${esc(r.documentDate)}</small>`,
      `<a href="./detail.html?id=${encodeURIComponent(r.key)}#report-${r.sha256.slice(0,16)}">${esc(r.name)}</a>`,
      r.netAssets?num(r.netAssets.value)+' '+esc(r.netAssets.unit)+(r.netAssets.scope==='parent_fund_all_share_classes'?'<small>基金合计；该渠道份额规模未披露</small>':''):'— 未披露',
      `${r.holdingsCount} 条 / ${r.allocationCount} 项`,r.analysisCount?'已提取':'— 未披露',
      `<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">PDF ↗</a>`
    ]));
    document.body.dataset.ready='true';
  }
  for(const id of ['reportSearch','reportPeriod','reportType'])document.getElementById(id).addEventListener('input',refresh);
  refresh();
})();
