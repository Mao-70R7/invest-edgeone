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
      <p>产品目录为公开信息；业绩指标由项目数据库中的完整可观测净值历史计算，部分历史来自认证访问后的最小化分析结果。不同产品的历史长度和披露日期可能不同，请结合可用区间比较。</p>
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
      "将广发高端理财的基金经理、产品族、业绩与风险指标纳入天眼私募统一更新。",
      `<span>业绩截止</span><strong>${P.formatDate(summary.latestPerformanceDate)}</strong><small>页面生成 ${P.formatDateTime(zone.generatedAt)}</small>`,
    )}
    ${kpis([
      ["基金经理/团队", `${summary.managerCount || 0}组`, `另有未披露产品 ${summary.unassignedProductCount || 0}只`],
      ["专区产品", `${summary.productCount || 0}只`, `活跃披露 ${summary.activeProductCount || 0}只`],
      ["历史曲线可用", `${summary.historyReadyCount || 0}只`, ratio(summary.historyReadyCount, summary.productCount)],
      ["近1年指标", `${summary.verifiedOneYearMetricCount || 0}只`, ratio(summary.verifiedOneYearMetricCount, summary.productCount)],
    ])}
    ${boundaryNote()}
    <section class="gf-section">
      <div class="gf-section-head"><div><p class="gf-section-index">01</p><h2>基金经理产品族</h2><p>收益为该经理/团队有值产品的等权算术平均，不代表组合收益。</p></div><label class="gf-search">筛选经理/策略<input id="gfManagerSearch" type="search" placeholder="输入经理或策略名称" autocomplete="off"></label></div>
      <div class="gf-table-wrap"><table class="gf-table"><thead><tr><th>基金经理/团队</th><th>产品</th><th>历史</th><th>平均近1月</th><th>平均近3月</th><th>平均近1年</th><th>业绩截止</th></tr></thead><tbody id="gfManagerRows">${managerTable}</tbody></table></div>
      <p class="gf-result-line" id="gfManagerResult">显示 ${managers.length} 组经理/团队</p>
    </section>
    <section class="gf-two-column">
      <section class="gf-section"><div class="gf-section-head"><div><p class="gf-section-index">02</p><h2>策略类型分布</h2><p>按专区产品主策略字段统计。</p></div></div>${strategyBars(zone.strategies || [])}</section>
      <section class="gf-section gf-conclusion"><div class="gf-section-head"><div><p class="gf-section-index">03</p><h2>覆盖结论</h2></div></div><p><strong>${summary.historyReadyCount || 0}只</strong>产品具备至少两个历史点，可进入业绩计算。缺失项继续保留为缺失，不以 0 或推测值补齐。</p></section>
    </section>
    <section class="gf-section">
      <div class="gf-section-head"><div><p class="gf-section-index">04</p><h2>产品清单</h2><p>默认按近1年收益排序；点击产品进入天眼私募同类对标详情。</p></div></div>
      <div class="gf-table-wrap"><table class="gf-table"><thead><tr><th>产品</th><th>经理/团队</th><th>业绩截止</th><th>历史点</th><th>近1月</th><th>近3月</th><th>近1年</th><th>近1年最大回撤</th></tr></thead><tbody>${productRows(sortedProducts)}</tbody></table></div>
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

  function renderManager() {
    const id = new URLSearchParams(location.search).get("id") || "";
    const manager = (zone.managers || []).find((item) => item.id === id);
    if (!manager) {
      root.innerHTML = '<section class="empty-panel"><strong>未找到基金经理产品族</strong><div><a class="gf-primary-link" href="./gffunds.html">返回广发专区</a></div></section>';
      return;
    }
    const items = window.PrivateFundTables.sorted((manager.productKeys || []).map((key) => productByKey.get(key)).filter(Boolean), product => number(metric(product, 'return1y')), 'desc');
    document.title = `${manager.name}｜广发专区｜天眼私募`;
    root.innerHTML = `<a class="gf-back" href="./gffunds.html">← 返回广发专区</a>
    ${hero(
      manager.name,
      "GFUNDS · PRODUCT FAMILY",
      `${manager.productCount}只产品的业绩与风险。`,
      `<span>最新业绩</span><strong>${P.formatDate(manager.latestPerformanceDate)}</strong>`,
    )}
    ${kpis([
      ["产品数量", `${manager.productCount}只`, `活跃披露 ${manager.activeProductCount}只`],
      ["历史曲线可用", `${manager.historyReadyCount}只`, ratio(manager.historyReadyCount, manager.productCount)],
      ["平均近1月", pct(meanMetric(manager, "return1m")), `${manager.metricAverages?.return1m?.coverage || 0}/${manager.productCount}只`],
      ["平均近3月", pct(meanMetric(manager, "return3m")), `${manager.metricAverages?.return3m?.coverage || 0}/${manager.productCount}只`],
      ["平均近1年", pct(meanMetric(manager, "return1y")), `${manager.metricAverages?.return1y?.coverage || 0}/${manager.productCount}只`],
      ["平均近1年回撤", pct(meanMetric(manager, "maxDrawdown1y"), { signed: false }), `${manager.metricAverages?.maxDrawdown1y?.coverage || 0}/${manager.productCount}只`],
      ["平均成立以来年化收益", pct(meanMetric(manager, "annualReturnSince")), `${manager.metricAverages?.annualReturnSince?.coverage || 0}/${manager.productCount}只`],
      ["平均成立以来年化波动", pct(meanMetric(manager, "volatilitySince"), { signed: false }), `${manager.metricAverages?.volatilitySince?.coverage || 0}/${manager.productCount}只`],
    ])}
    ${boundaryNote()}
    <section class="gf-section">
      <div class="gf-section-head"><div><p class="gf-section-index">01</p><h2>产品族业绩</h2><p>每只产品按自身完整可观测净值计算；历史窗口不够时留空。</p></div></div>
      <div class="gf-table-wrap"><table class="gf-table"><thead><tr><th>产品</th><th>经理/团队</th><th>业绩截止</th><th>历史点</th><th>近1月</th><th>近3月</th><th>近1年</th><th>近1年最大回撤</th></tr></thead><tbody>${productRows(items, manager.id)}</tbody></table></div>
    </section>
    <section class="gf-section gf-methodology"><div class="gf-section-head"><div><p class="gf-section-index">04</p><h2>解释边界</h2></div></div><ul><li>经理平均值只对有值产品等权，不代表资产加权组合。</li><li>点击产品名称进入天眼私募同类对标页，可查看完整可观测业绩曲线及计算口径。</li></ul></section>`;
  }

  if (document.body.dataset.page === "private-fund-gffunds-manager") renderManager();
  else renderOverview();
  document.body.dataset.ready = "true";
})();
