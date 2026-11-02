(function () {
  'use strict';
  const esc = value => String(value == null || value === '' ? '—' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const table = (head, rows) => `<div class="tableWrap table-wrap" style="overflow:auto;max-height:390px"><table class="detail-table"><thead><tr>${head.map(v=>`<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  function render(e) {
    if (!e?.directoryFacts && !e?.publicProductReferences?.length) return '';
    const d=e.directoryFacts, refs=e.publicProductReferences||[];
    let html=d?`<section style="margin:20px 0;color:#16324f"><h3>公示目录基础信息</h3>${table(['字段','来源原值'],[
      ['发行方',d.issuer],['登记机构（非托管人）',d.registration_authority],['官方产品代码',d.official_product_code],
      ['销售范围',d.sales_scope],['目录状态原值',d.product_status],
      ['认购起点原值（待核；不换算）',d.subscription_threshold_raw==null?null:String(d.subscription_threshold_raw)+' · '+(d.subscription_threshold_unit||'单位未披露')]
    ])}<p class="headNote analytics-note">公示目录包含历史产品；在售状态、完整合同条款、成立及到期日期尚未核实。</p></section>`:'';
    for (const r of refs) {
      const nav=r.nav||[], metrics=r.performance||[], b=r.basic_fields||{};
      const dateConflict=nav.length && b.inception_date && nav[0].nav_date < b.inception_date;
      const url=/^https?:\/\//.test(r.source_url||'')?`<a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">公开来源 ↗</a>`:'';
      const key=r.source_id+':'+r.source_product_id;
      html+=`<section style="margin:24px 0;color:#16324f" class="public-product-reference"><h3>同产品公开资料参考 · ${esc(r.source_label)}</h3><p>${esc(r.scope_note)} 所有参考指标均不参与排名。</p><p>匹配依据：名称、发行方、代码一致 · ${esc(r.matched_code)}<br>资料采集时间：${esc(r.collected_at)} · ${url} · <a href="./detail.html?id=${encodeURIComponent(key)}">查看来源产品详情</a></p>${table(['参考基础信息','来源披露'],[['成立日期',b.inception_date],['投资策略',[b.strategy_l1,b.strategy_l2].filter(Boolean).join(' / ')],['基金经理',Array.isArray(b.source_manager_names)?b.source_manager_names.join('、'):b.source_manager_names]])}`;
      if(nav.length) {
        if(dateConflict) html+=`<p class="headNote analytics-note"><strong>日期待核：</strong>来源最早净值日 ${esc(nav[0].nav_date)} 早于其披露的成立日期 ${esc(b.inception_date)}。两项原值均保留，不据此确定成立以来统计区间。</p>`;
        const latest=nav.at(-1);
        html+=`<p><strong>最新单位净值原值 ${esc(latest.unit_nav_raw)}</strong> · 累计净值原值 ${esc(latest.accumulated_nav_raw)} · 净值日 ${esc(latest.nav_date)}</p>`;
        html+=`<p>已取得 ${nav.length} 个净值日期：${esc(nav[0].nav_date)} 至 ${esc(nav.at(-1).nav_date)}。保留原值；尺度待核，不据此计算统一收益。</p><details><summary>查看全部来源净值（${nav.length} 条）</summary>${table(['净值日期','单位净值原值','累计净值原值','来源单位','采集时间'],nav.slice().reverse().map(n=>[n.nav_date,n.unit_nav_raw,n.accumulated_nav_raw,n.nav_unit,n.collected_at]))}</details>`;
      }
      if(metrics.length) html+=`<details style="margin-top:12px"><summary>来源业绩原值（${metrics.length} 项，口径待核）</summary><p>以下仅保留来源数值，未推定百分比单位；统计口径未核验。</p>${table(['指标','原值','关联日期','采集时间'],metrics.map(m=>[m.label,m.value_raw,m.as_of_date,m.collected_at]))}</details>`;
      html+='</section>';
    }
    return html;
  }
  window.PrivateFundPublicReferences={render};
})();
