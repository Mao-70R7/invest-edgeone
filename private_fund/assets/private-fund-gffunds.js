(() => {
  "use strict";

  const P = window.PrivateFund;
  const zone = window.__PRIVATE_FUND_GFFUNDS_ZONE__;
  const root = document.getElementById("mainContent");
  if (!P || !root) return;
  if (!zone || zone.source?.id !== "gffunds_highend") {
    root.innerHTML = '<section class="empty-panel"><strong>广发专区数据不可用</strong><div>请重新运行 09 日常快速更新并确认页面稽核通过。</div></section>';
    return;
  }

  const esc = P.esc;
  const number = P.number;
  const summary = zone.summary || {};
  const products = Array.isArray(zone.products) ? zone.products : [];
  const productByKey = new Map(products.map((item) => [item.key, item]));

  function pct(value, { signed = true, digits = 2 } = {}) {
    const parsed = number(value);
    if (parsed === null) return "—";
    const sign = signed && parsed > 0 ? "+" : "";
    return `${sign}${parsed.toFixed(digits)}%`;
  }

  function tone(code, value) {
    return P.metricTone(code, value);
  }

  function metric(item, code) {
    return item?.metrics?.[code]?.value ?? null;
  }

  function meanMetric(manager, code) {
    return manager?.metricAverages?.[code]?.value ?? null;
  }

  function ratio(value, total) {
    return total ? `${((Number(value || 0) / total) * 100).toFixed(0)}%` : "—";
  }

  function managerHref(manager) {
    return `./gffunds-manager.html?id=${encodeURIComponent(manager.id)}`;
  }

  function productHref(product, managerId = "") {
    const back = new URLSearchParams();
    if (managerId) back.set("gffunds_manager", managerId);
    return P.detailHref(product.key, back.toString());
  }

  function metricCell(code, value, options = {}) {
    return `<span class="gf-number ${tone(code, value)}">${pct(value, options)}</span>`;
  }

  function coverageBadge(value, total) {
    const complete = total > 0 && value === total;
    return `<span class="gf-coverage ${complete ? "is-complete" : "is-partial"}">${Number(value || 0)}/${Number(total || 0)}</span>`;
  }

  function boundaryNote() {
    return `<section class="gf-boundary" aria-label="数据口径">
      <strong>数据口径</strong>
      <p>产品目录为公开信息；业绩指标由项目数据库中的完整可观测净值历史计算，部分历史来自认证访问后的最小化分析结果。持仓仅限公开定期报告披露的前十大等部分证据，不代表当前完整持仓。当前没有可核验的统一市场基准与持仓行情序列，因此不生成市场归因。</p>
    </section>`;
  }

  function hero(title, eyebrow, subtitle, aside = "") {
    return `<header class="gf-report-hero">
      <div><p class="gf-eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>
      ${aside ? `<div class="gf-hero-aside">${aside}</div>` : ""}
    </header>`;
  }

  function kpis(items) {
    return `<section class="gf-kpi-strip">${items.map(([label, value, note]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong>${note ? `<small>${esc(note)}</small>` : ""}</div>`).join("")}</section>`;
  }

  function strategyBars(items) {
    const max = Math.max(1, ...items.map((item) => Number(item.count || 0)));
    return `<div class="gf-bars">${items.map((item) => `<div class="gf-bar-row"><span>${esc(item.name)}</span><i><b style="width:${Math.max(2, Number(item.count || 0) / max * 100).toFixed(2)}%"></b></i><strong>${Number(item.count || 0)}只</strong></div>`).join("") || '<p class="gf-empty">暂无策略分类。</p>'}</div>`;
  }

  function managerRows(managers) {
    return managers.map((manager) => `<tr data-search="${esc(`${manager.name} ${(manager.strategyDistribution || []).map((item) => item.name).join(" ")}`.toLowerCase())}">
      <td><a class="gf-primary-link" href="${managerHref(manager)}">${esc(manager.name)}</a><small>${esc((manager.strategyDistribution || []).map((item) => item.name).join(" · ") || "未分类")}</small></td>
      <td>${manager.productCount}</td>
      <td>${coverageBadge(manager.historyReadyCount, manager.productCount)}</td>
      <td>${coverageBadge(manager.publicReportProductCount, manager.productCount)}</td>
      <td>${coverageBadge(manager.partialHoldingProductCount, manager.productCount)}</td>
      <td>${metricCell("return1m", meanMetric(manager, "return1m"))}</td>
      <td>${metricCell("return3m", meanMetric(manager, "return3m"))}</td>
      <td>${metricCell("return1y", meanMetric(manager, "return1y"))}</td>
      <td>${P.formatDate(manager.latestPerformanceDate)}</td>
    </tr>`).join("");
  }

  function productRows(items, managerId = "") {
    return items.map((product) => `<tr>
      <td><a class="gf-primary-link" href="${productHref(product, managerId)}">${esc(product.name)}</a><small>${esc(product.id)} · ${esc(product.strategyType)}</small></td>
      <td>${esc((product.managerNames || []).join("、"))}</td>
      <td>${P.formatDate(product.latestPerformanceDate)}</td>
      <td>${Number(product.historyPointCount || 0).toLocaleString("zh-CN")}</td>
      <td>${metricCell("return1m", metric(product, "return1m"))}</td>
      <td>${metricCell("return3m", metric(product, "return3m"))}</td>
      <td>${metricCell("return1y", metric(product, "return1y"))}</td>
      <td>${metricCell("maxDrawdown1y", metric(product, "maxDrawdown1y"), { signed: false })}</td>
      <td>${product.latestHoldings?.length ? `<span class="gf-coverage is-partial">${product.latestHoldings.length}项</span>` : "—"}</td>
    </tr>`).join("");
  }

  function renderOverview() {
    const managers = Array.isArray(zone.managers) ? zone.managers : [];
    const managerTable = managerRows(managers);
    const sortedProducts = [...products].sort((left, right) => {
      const a = number(metric(left, "return1y"));
      const b = number(metric(right, "return1y"));
      return (b ?? -Infinity) - (a ?? -Infinity) || String(left.name).localeCompare(String(right.name), "zh-CN");
    });
    root.innerHTML = `${hero(
      "广发专区",
      "GFUNDS · MANAGER & PRODUCT FAMILY",
      "将广发高端理财的基金经理、产品族、完整可观测业绩与公开持仓线索纳入天眼私募统一更新。",
      `<span>业绩截止</span><strong>${P.formatDate(summary.latestPerformanceDate)}</strong><small>页面生成 ${P.formatDateTime(zone.generatedAt)}</small>`,
    )}
    ${kpis([
      ["基金经理/团队", `${summary.managerCount || 0}组`, `另有未披露产品 ${summary.unassignedProductCount || 0}只`],
      ["专区产品", `${summary.productCount || 0}只`, `活跃披露 ${summary.activeProductCount || 0}只`],
      ["历史曲线可用", `${summary.historyReadyCount || 0}只`, ratio(summary.historyReadyCount, summary.productCount)],
      ["近1年指标", `${summary.verifiedOneYearMetricCount || 0}只`, ratio(summary.verifiedOneYearMetricCount, summary.productCount)],
      ["公开报告覆盖", `${summary.publicReportProductCount || 0}只`, `最新 ${P.formatDate(summary.latestPublicReportDate)}`],
      ["部分持仓覆盖", `${summary.partialHoldingProductCount || 0}只`, `最新 ${P.formatDate(summary.latestPositionDate)}`],
    ])}
    ${boundaryNote()}
    <section class="gf-section">
      <div class="gf-section-head"><div><p class="gf-section-index">01</p><h2>基金经理产品族</h2><p>收益为该经理/团队有值产品的等权算术平均，不代表组合收益。</p></div><label class="gf-search">筛选经理/策略<input id="gfManagerSearch" type="search" placeholder="输入经理或策略名称" autocomplete="off"></label></div>
      <div class="gf-table-wrap"><table class="gf-table"><thead><tr><th>基金经理/团队</th><th>产品</th><th>历史</th><th>报告</th><th>持仓</th><th>平均近1月</th><th>平均近3月</th><th>平均近1年</th><th>业绩截止</th></tr></thead><tbody id="gfManagerRows">${managerTable}</tbody></table></div>
      <p class="gf-result-line" id="gfManagerResult">显示 ${managers.length} 组经理/团队</p>
    </section>
    <section class="gf-two-column">
      <section class="gf-section"><div class="gf-section-head"><div><p class="gf-section-index">02</p><h2>策略类型分布</h2><p>按专区产品主策略字段统计。</p></div></div>${strategyBars(zone.strategies || [])}</section>
      <section class="gf-section gf-conclusion"><div class="gf-section-head"><div><p class="gf-section-index">03</p><h2>覆盖结论</h2></div></div><p><strong>${summary.historyReadyCount || 0}只</strong>产品具备至少两个历史点，可进入业绩计算；<strong>${summary.publicReportProductCount || 0}只</strong>匹配公开定期报告；<strong>${summary.partialHoldingProductCount || 0}只</strong>可展示部分持仓线索。缺失项继续保留为缺失，不以 0 或推测值补齐。</p></section>
    </section>
    <section class="gf-section">
      <div class="gf-section-head"><div><p class="gf-section-index">04</p><h2>产品清单</h2><p>默认按近1年收益排序；点击产品进入天眼私募同类对标详情。</p></div></div>
      <div class="gf-table-wrap"><table class="gf-table"><thead><tr><th>产品</th><th>经理/团队</th><th>业绩截止</th><th>历史点</th><th>近1月</th><th>近3月</th><th>近1年</th><th>近1年最大回撤</th><th>公开持仓</th></tr></thead><tbody>${productRows(sortedProducts)}</tbody></table></div>
    </section>`;
    const search = document.getElementById("gfManagerSearch");
    search?.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      let shown = 0;
      document.querySelectorAll("#gfManagerRows tr").forEach((row) => {
        const visible = !query || String(row.dataset.search || "").includes(query);
        row.hidden = !visible;
        if (visible) shown += 1;
      });
      const result = document.getElementById("gfManagerResult");
      if (result) result.textContent = `显示 ${shown} 组经理/团队`;
      P.announce(`筛选后显示 ${shown} 组经理或团队`);
    });
  }

  function exposureBars(items, valueKey, emptyText) {
    const max = Math.max(1, ...items.map((item) => Number(item[valueKey] || 0)));
    return `<div class="gf-bars is-exposure">${items.map((item) => {
      const label = item.theme || item.securityName;
      const value = Number(item[valueKey] || 0);
      return `<div class="gf-bar-row"><span>${esc(label)}</span><i><b style="width:${Math.max(2, value / max * 100).toFixed(2)}%"></b></i><strong>${pct(value, { signed: false })}</strong></div>`;
    }).join("") || `<p class="gf-empty">${esc(emptyText)}</p>`}</div>`;
  }

  function renderManager() {
    const id = new URLSearchParams(location.search).get("id") || "";
    const manager = (zone.managers || []).find((item) => item.id === id);
    if (!manager) {
      root.innerHTML = '<section class="empty-panel"><strong>未找到基金经理产品族</strong><div><a class="gf-primary-link" href="./gffunds.html">返回广发专区</a></div></section>';
      return;
    }
    const items = (manager.productKeys || []).map((key) => productByKey.get(key)).filter(Boolean).sort((left, right) => String(left.name).localeCompare(String(right.name), "zh-CN"));
    document.title = `${manager.name}｜广发专区｜天眼私募`;
    root.innerHTML = `<a class="gf-back" href="./gffunds.html">← 返回广发专区</a>
    ${hero(
      manager.name,
      "GFUNDS · PRODUCT FAMILY",
      `${manager.productCount}只产品的业绩、风险与公开持仓线索。`,
      `<span>最新业绩</span><strong>${P.formatDate(manager.latestPerformanceDate)}</strong><small>公开报告 ${manager.publicReportProductCount}/${manager.productCount}只</small>`,
    )}
    ${kpis([
      ["产品数量", `${manager.productCount}只`, `活跃披露 ${manager.activeProductCount}只`],
      ["历史曲线可用", `${manager.historyReadyCount}只`, ratio(manager.historyReadyCount, manager.productCount)],
      ["平均近1月", pct(meanMetric(manager, "return1m")), `${manager.metricAverages?.return1m?.coverage || 0}/${manager.productCount}只`],
      ["平均近3月", pct(meanMetric(manager, "return3m")), `${manager.metricAverages?.return3m?.coverage || 0}/${manager.productCount}只`],
      ["平均近1年", pct(meanMetric(manager, "return1y")), `${manager.metricAverages?.return1y?.coverage || 0}/${manager.productCount}只`],
      ["平均近1年回撤", pct(meanMetric(manager, "maxDrawdown1y"), { signed: false }), `${manager.metricAverages?.maxDrawdown1y?.coverage || 0}/${manager.productCount}只`],
    ])}
    ${boundaryNote()}
    <section class="gf-section">
      <div class="gf-section-head"><div><p class="gf-section-index">01</p><h2>产品族业绩</h2><p>每只产品按自身完整可观测净值计算；历史窗口不够时留空。</p></div></div>
      <div class="gf-table-wrap"><table class="gf-table"><thead><tr><th>产品</th><th>经理/团队</th><th>业绩截止</th><th>历史点</th><th>近1月</th><th>近3月</th><th>近1年</th><th>近1年最大回撤</th><th>公开持仓</th></tr></thead><tbody>${productRows(items, manager.id)}</tbody></table></div>
    </section>
    <section class="gf-two-column">
      <section class="gf-section"><div class="gf-section-head"><div><p class="gf-section-index">02</p><h2>公开持仓主题线索</h2><p>在有公开持仓产品中的平均披露占比，仅作风格线索。</p></div></div>${exposureBars(manager.themeExposure || [], "averageDisclosedWeight", "暂无可用公开持仓主题。")}</section>
      <section class="gf-section"><div class="gf-section-head"><div><p class="gf-section-index">03</p><h2>高频公开持仓</h2><p>基于各产品最新一期部分前十大持仓汇总。</p></div></div>${exposureBars(manager.topHoldings || [], "averageDisclosedWeight", "暂无可用公开持仓。")}</section>
    </section>
    <section class="gf-section gf-methodology"><div class="gf-section-head"><div><p class="gf-section-index">04</p><h2>解释边界</h2></div></div><ul><li>经理平均值只对有值产品等权，不代表资产加权组合。</li><li>公开持仓通常滞后，且仅覆盖披露部分；不用于推断实时调仓。</li><li>尚无统一市场基准和逐持仓行情输入，本页不输出虚构的贡献度或残差归因。</li><li>点击产品名称进入天眼私募同类对标页，可查看完整可观测业绩曲线及计算口径。</li></ul></section>`;
  }

  if (document.body.dataset.page === "private-fund-gffunds-manager") renderManager();
  else renderOverview();
  document.body.dataset.ready = "true";
})();
