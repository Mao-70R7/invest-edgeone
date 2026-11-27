(() => {
  const previous = enhanceLatestWeightView;
  const registeredFunds = new Set((document.currentScript?.dataset.fundCodes || '').split(','));
  let renderVersion = 0;
  let dataPromise;

  function add(parent, tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function source(parent, url, label) {
    if (!url?.startsWith('https://')) return;
    const anchor = add(parent, 'a', label);
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
  }

  const pct = value => `${Number(value).toFixed(2)}%`;
  enhanceLatestWeightView = strategy => {
    previous(strategy);
    const version = ++renderVersion;
    document.getElementById('nested-fund-disclosure')?.remove();
    if (!strategy.holdings?.some(holding => registeredFunds.has(holding.fundCode))) return;
    dataPromise ??= fetch('assets/strategy-lookthrough/nested_fund_disclosures.json').then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    });
    dataPromise.then(data => {
      if (version !== renderVersion) return;
      const matched = data.funds.flatMap(fund => {
        const holding = strategy.holdings.find(row => row.fundCode === fund.fundCode && row.reportDate === fund.reportDate
          && row.assetCompositionSource?.pdfSha256 === fund.parentPdfSha256 && row.weight > 0);
        return holding ? [{fund, name: holding.fundName, scale: holding.weight / 100}] : [];
      });
      if (!matched.length) return;
      const namedWeight = matched.reduce((total, {fund, scale}) => total + scale * fund.rows.reduce((n, row) => n + row.parentWeightPct, 0), 0);
      const assetWeight = matched.reduce((total, {fund, scale}) => total + scale * fund.rows.reduce((n, row) => n + (row.bookAssetPctOfParent ? row.parentWeightPct : 0), 0), 0);
      const firstLevel = strategy.businessLookthrough?.assetGroups.find(group => group.name === '基金投资')?.value ?? 0;
      const panel = document.createElement('section');
      panel.className = 'card wide';
      panel.id = 'nested-fund-disclosure';
      // The strategy iframe keeps optional report sections hidden by default.
      if (document.body.classList.contains('lookthrough-embedded')) {
        panel.style.setProperty('display', 'block', 'important');
      }
      add(panel, 'h2', '基金投资穿透明细');
      add(panel, 'p', `按 ${strategy.weightDate || strategy.holdingDate} 组合权重和基金同季总资产折算。已核验底层基金占组合 ${pct(namedWeight)}，其中 ${pct(assetWeight)} 已拆分目标 ETF 账面资产。待核验 ${pct(Math.max(0, firstLevel - namedWeight))}。明细属于上方基金投资分项。`);
      add(panel, 'p', '账面资产分项保留基金投资、现金和其他资产，衍生品合约单列。境外 ETF 的逐股持仓如无同季原件，保留在底层基金层级。');
      for (const {fund, name, scale} of matched) {
        const details = add(panel, 'details', '');
        const summary = add(details, 'summary', `${name || fund.fundName} · ${fund.reportDate} · 基金投资 ${pct(fund.investmentPctOfParent * scale)}`);
        summary.style.cursor = 'pointer';
        source(details, fund.parentSourceUrl, '母基金季报');
        const list = add(details, 'ul', '');
        for (const row of fund.rows) {
          const item = add(list, 'li', `${row.targetCode ? row.targetCode + ' ' : ''}${row.name} · 占组合 ${pct(row.parentWeightPct * scale)}`);
          if (row.bookAssetPctOfParent) {
            add(item, 'p', Object.entries(row.bookAssetPctOfParent).map(([label, value]) => `${label} ${pct(value * scale)}`).join('　'));
            source(item, row.targetSourceUrl, '目标 ETF 季报');
            if (row.derivativeContracts?.length) add(item, 'p', `报告披露衍生品合约 ${row.derivativeContracts.join('、')}，合约敞口待核验。`);
          }
        }
        const remaining = scale * (fund.investmentPctOfParent - fund.rows.reduce((n, row) => n + row.parentWeightPct, 0));
        if (remaining > 1e-7) add(details, 'p', `底层基金待核验 ${pct(remaining)}`);
        if (fund.gap) add(details, 'p', fund.gap);
      }
      document.getElementById('holdings').closest('section').after(panel);
    }).catch(error => {
      if (version === renderVersion) add(document.getElementById('lead'), 'p', `底层基金明细加载失败 ${error.message}`);
    });
  };
})();
