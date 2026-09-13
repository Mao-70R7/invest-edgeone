/* Company identity is source-disclosed, never inferred from a product name. */
(() => {
  const STORAGE_KEY = 'privateFund.scatterPalette.v1';
  const MISSING = '__not_disclosed__';
  const GF_COMPANY = '广发基金管理有限公司';
  const RED = '#c52a30', GRAY = '#929aa2';
  const clean = value => String(value ?? '').trim();
  const company = row => clean(row.company) || MISSING;
  const strategy = row => clean(row.strategy1) || MISSING;
  const label = (value, field) => value === MISSING ? (field === 'company' ? '基金公司未披露' : '策略类型未披露') : value;
  const values = (rows, field) => [...new Set(rows.map(field === 'company' ? company : strategy))].sort((a,b) => a.localeCompare(b,'zh-CN'));
  const selection = (items, allowed) => [...new Set(items.filter(value => allowed.includes(value)))];
  const color = value => /^#[0-9a-f]{6}$/i.test(clean(value)) ? clean(value).toLowerCase() : null;
  const defaults = () => ({version:1, other:GRAY, rules:[{company:GF_COMPANY,color:RED}]});

  function normalizePalette(raw) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.rules)) return defaults();
    const rules = new Map();
    for (const rule of raw.rules) {
      const name=clean(rule?.company), hex=color(rule?.color);
      if (name && name.length <= 160 && name !== MISSING && hex) rules.set(name,{company:name,color:hex});
    }
    return {version:1,other:color(raw.other)||GRAY,rules:[...rules.values()]};
  }
  function upsertRule(palette, name, hex, previous = '') {
    name=clean(name); hex=color(hex); previous=clean(previous);
    if (!name || name.length > 160 || name === MISSING) throw new Error('请输入有效基金公司名称（最多160字）。');
    if (!hex) throw new Error('请选择有效的六位颜色。');
    const next=normalizePalette(palette);
    if (next.rules.some(rule => rule.company === name && rule.company !== previous)) throw new Error('该公司已有配色，请点击对应的“修改”。');
    const index=next.rules.findIndex(rule => rule.company === previous);
    if (index >= 0) next.rules[index]={company:name,color:hex}; else next.rules.push({company:name,color:hex});
    return next;
  }
  function removeRule(palette, name) {
    const next=normalizePalette(palette);
    next.rules=next.rules.filter(rule => rule.company !== name);
    return next;
  }
  function resolver(palette) {
    const normalized=normalizePalette(palette), rules=new Map(normalized.rules.map(rule => [rule.company,rule.color]));
    return row => {
      const key=company(row), hex=rules.get(key);
      return {color:hex||normalized.other,highlighted:rules.has(key),company:key};
    };
  }
  function filter(rows, state) {
    const companies=new Set(state.companies||[]), strategies=new Set(state.strategies||[]);
    const normalize=value => clean(value).toLocaleLowerCase('zh-CN').replace(/\s+/g,'');
    const query=normalize(state.query);
    return rows.filter(row => (!state.source || row.source === state.source)
      && (!companies.size || companies.has(company(row)))
      && (!strategies.size || strategies.has(strategy(row)))
      && (!query || normalize([row.name,row.fullName,row.id,row.registrationNumber,row.company,
        ...(row.managers||[]),row.strategy1,row.strategy2,row.strategy3].join(' ')).includes(query)));
  }
  function readFilters(params, rows) {
    return {companies:selection(params.getAll('company'),values(rows,'company')),
      strategies:selection(params.getAll('strategy'),values(rows,'strategy'))};
  }
  function writeFilters(params, state) {
    for (const key of ['company','strategy','data']) params.delete(key);
    for (const value of new Set(state.companies||[])) params.append('company',value);
    for (const value of new Set(state.strategies||[])) params.append('strategy',value);
  }
  window.PrivateFundScatterControls={STORAGE_KEY,MISSING,GF_COMPANY,RED,GRAY,company,strategy,label,values,
    selection,defaults,normalizePalette,upsertRule,removeRule,resolver,filter,readFilters,writeFilters};
})();
