/* Presentation only: source structures stay untouched in the exported detail. */
(() => {
  const REVIEW='来源提供了结构化条款，具体内容待核对原文';
  const unique=xs=>[...new Set(xs.filter(x=>x!==null&&x!==undefined&&x!==''))].join('；');
  const text=v=>v===null||v===undefined?'':String(v).trim();
  const structured=v=>v&&typeof v==='object';
  function decode(value) {
    if(typeof value!=='string')return value;
    let v=value.trim();
    if(!v||['null','None','undefined'].includes(v))return null;
    for(let i=0;i<3&&typeof v==='string'&&/^[\[{]/.test(v);i++){
      try{v=JSON.parse(v);}catch{return REVIEW;}
    }
    return v;
  }
  function dateText(v) {
    const s=text(v);
    return /^\d{8}$/.test(s)?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6)}`:s;
  }
  function recentDates(value, paymentsOnly=false) {
    const v=decode(value);
    if(!v)return null;
    if(Array.isArray(v))return unique(v.map(item=>{
      if(!structured(item))return paymentsOnly?null:dateText(item);
      const open=dateText(item.open_day),payment=dateText(item.payment_time);
      if(paymentsOnly)return payment?`${open?open+'开放，':''}缴款时点${payment}`:null;
      return unique([open?`开放日${open}`:null,payment?`缴款时点${payment}`:null]);
    }))||null;
    if(structured(v))return unique(['recent','next'].map(k=>Array.isArray(v[k])&&v[k].length?`${k==='recent'?'近期':'后续'}：${v[k].map(dateText).join('、')}`:null))||readable(v);
    return text(v)||null;
  }
  function redemptionTier(v,source) {
    const start=v.start_time||{},end=v.end_time||{},unit=text(v.unit),rate=text(v.redemption_rate);
    if(!unit||!rate||!/^\d+(?:\.\d+)?%?$/.test(rate))return REVIEW;
    const lo=text(start.num),hi=text(end.num);
    if((lo&&!/^\d+(?:\.\d+)?$/.test(lo))||(hi&&!/^\d+(?:\.\d+)?$/.test(hi)))return REVIEW;
    if((lo&&typeof start.include!=='boolean')||(hi&&typeof end.include!=='boolean'))return REVIEW;
    const lower=lo&&Number(lo)!==0?`${start.include?'满':'超过'}${lo}${unit}`:lo==='0'&&!start.include?`超过0${unit}`:'';
    const upper=hi?`${end.include?'不超过':'不足'}${hi}${unit}`:'';
    const basis=text(v.time_reference);
    const prefix=!basis||basis==='持有日起'?'持有':`${basis}，期限`;
    const condition=lower||upper?prefix+[lower,upper].filter(Boolean).join('且'):'不限持有期限';
    const rateText=rate.endsWith('%')?rate:source==='geshang'?rate+'%':`${rate}（费率单位未披露）`;
    return `${condition}：赎回费率${rateText}`;
  }
  function openRule(rule) {
    if(!structured(rule)||rule.openday_type!=='Chinese_openday')return null;
    const yr=rule.year||[],mo=rule.month||[],day=rule.day||[];
    let prefix='';
    if(yr[0]==='after_establishment_months')prefix=`成立满${yr[1]}个月后，`;
    else if(yr[0]==='after_establishment_years')prefix=`成立满${yr[1]}年后，`;
    else if(yr[0]!=='every_year')return null;
    const month=mo[0]==='every_month'?'每月':mo[0]==='certain_month'&&Array.isArray(mo[1])?`每年${mo[1].join('、')}月`:null;
    if(!month||!day.length)return null;
    const weekdays=['','周一','周二','周三','周四','周五','周六','周日'];
    const days=day.map(d=>{
      if(!Array.isArray(d))return null;
      const nums=d[1];
      if(d[0]==='certain_day'&&Array.isArray(nums)&&nums.every(n=>Number.isInteger(n)&&n>=1&&n<=31))return `${month}${nums.join('、')}日`;
      if(d[0]==='many_week'&&Array.isArray(nums)&&Array.isArray(d[2])&&nums.every(n=>n>=1&&n<=5)&&d[2].every(n=>weekdays[n]))return `${month}第${nums.join('、')}个${d[2].map(n=>weekdays[n]).join('、')}`;
      if(d[0]==='every_week'&&Array.isArray(nums)&&nums.every(n=>weekdays[n]))return `${month==='每月'?'':month+'内，'}每${nums.map(n=>weekdays[n]).join('、')}`;
      if(d[0]==='every_day')return `${month==='每月'?'':month+'内，'}每个交易日`;
      // Do not guess whether less common relative-day codes mean calendar or trading days.
      return null;
    });
    if(days.some(x=>!x))return null;
    const shift=rule.no_trading_date_rule||[];
    let adjustment='';
    if(['after','ahead'].includes(shift[0])&&Number.isInteger(shift[1])&&shift[1]>0)adjustment=`遇非交易日${shift[0]==='after'?'顺延至其后':'提前至此前'}第${shift[1]}个交易日`;
    else if(shift[0]!=='all')return null;
    return prefix+unique([unique(days),adjustment]);
  }
  function readable(value,field='',context={}) {
    const v=decode(value);
    if(v===null||v===undefined||v==='')return null;
    if(!structured(v))return typeof v==='boolean'?null:v;
    if(field==='recentOpenDates')return recentDates(v);
    if(field==='paymentTime') {
      const start=structured(v.start_time)?null:dateText(v.start_time),end=structured(v.end_time)?null:dateText(v.end_time);
      const interval=start||end?`来源披露时段：${start||'起始时间未披露'} 至 ${end||'结束时间未披露'}`:null;
      const recent=recentDates(context.recentOpenDates,true);
      return unique([interval||'到账时间未披露',recent?`近期缴款安排：${recent}`:null]);
    }
    if(field==='documentAvailability') {
      if(Array.isArray(v))return unique(v.map(d=>typeof d==='string'?d:d.document_name||d.document_type_name))||null;
      const labels={contract:'基金合同',supplementary_contract:'补充合同',risk_disclosure:'风险揭示书',company_material:'机构材料',custom_material:'其他材料',product_element_table_mobile:'产品要素表'};
      return unique(Object.keys(labels).filter(k=>v[k]&&!['0','false'].includes(text(v[k]))).map(k=>labels[k]))||null;
    }
    if('redemption_rate' in v)return redemptionTier(v,context.source);
    if('execute_date_rule' in v||'lockup_period_rule' in v) {
      const rules=v.execute_date_rule||v.lockup_period_rule;
      const parts=Array.isArray(rules)?rules.map(openRule):[];
      const fallback=readable(context.openDay);
      const schedule=parts.length&&parts.every(Boolean)?unique(parts):fallback&&fallback!==REVIEW?`具体规则待核对；来源开放安排：${fallback}`:'具体开放规则待核对原文';
      const deadline='latest_payment' in v?'申购缴款时点见近期开放日；相对截止日口径待核对':'赎回申请截止日口径待核对';
      return unique([schedule,deadline]);
    }
    if(Array.isArray(v))return unique(v.map(x=>readable(x,field,context)))||null;
    if(!Object.keys(v).length)return null;
    if('fee' in v)return unique([readable(v.limit,field,context),readable(v.fee,field,context)])||null;
    const notes=['note','description','text','desc'].map(k=>readable(v[k],field,context)).filter(Boolean);
    const content=Array.isArray(v.content)?v.content.map(x=>{
      if(!structured(x))return readable(x,field,context);
      if(x.num!==undefined&&x.unit)return `${x.label||x.name?text(x.label||x.name)+'：':''}${x.num}${x.unit}`;
      return readable(x,field,context);
    }):[];
    if(notes.length||content.length)return unique([...content,...notes])||null;
    const known={open_day:'开放日',payment_time:'缴款时点',start_time:'开始时间',end_time:'结束时间',name:'名称',label:'说明',value:'数值',rate:'费率',limit:'适用条件',document_name:'材料名称',document_type_name:'材料类型'};
    const parts=Object.entries(v).filter(([k])=>known[k]||/[\u4e00-\u9fff]/.test(k)).map(([k,val])=>{
      const t=readable(val,field,context);return t?`${known[k]||k}：${t}`:null;
    });
    if(parts.some(Boolean))return unique(parts);
    return Object.values(v).every(x=>x===null||x===''||Array.isArray(x)&&!x.length)?null:REVIEW;
  }
  function coreElements(core,source) {
    const context={source,openDay:core.openDay,recentOpenDates:core.recentOpenDates};
    const out=Object.fromEntries(Object.entries(core).map(([k,v])=>[k,readable(v,k,context)]));
    const feeNote=readable(core.subscriptionFeeNote);
    if(feeNote&&feeNote!==REVIEW){
      out.subscriptionFee=feeNote;
      if(!out.purchaseFee&&/申购/.test(feeNote))out.purchaseFee=feeNote;
    }
    if(!out.paymentTime&&recentDates(core.recentOpenDates,true))out.paymentTime=`到账时间未披露；近期缴款安排：${recentDates(core.recentOpenDates,true)}`;
    return out;
  }
  window.PrivateFundBusinessText={readable,coreElements,redemptionTier,openRule,recentDates};
})();
