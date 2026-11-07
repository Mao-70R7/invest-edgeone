import {createHash} from 'node:crypto';
// Only the authenticated worker may submit this data; still enforce an explicit
// public shape, bounded tables, trusted links and a binding to the final answer.
export function publicPresentation(value,answer) {
  try {
    if(!value || value.version!==1 || !['product_screen','product_detail','business_weekly'].includes(value.template) ||
       value.answer_sha256!==createHash('sha256').update(answer).digest('hex') ||
       JSON.stringify(value).length>180000 || !Array.isArray(value.sections) ||
       !value.sections.length || value.sections.length>12)return null;
    const str=(v,n=800)=>{if(typeof v!=='string' || v.length>n)throw Error();return v;};
    const url=v=>{
      if(v===null || v===undefined)return null;
      const p=new URL(str(v,24000));
      if(p.protocol!=='https:' || p.hostname!=='gfinvest.site' || p.username || p.password || (p.port && p.port!=='443'))throw Error();
      return v;
    };
    const notes=(value.notes||[]).map(v=>str(v,1200));if(notes.length>12)throw Error();
    const followups=(value.followups||[]).map(v=>str(v,32));if(followups.length>2)throw Error();
    const sections=value.sections.map(s=>{
      if(!Array.isArray(s.columns) || !s.columns.length || s.columns.length>12 ||
         !Array.isArray(s.rows) || s.rows.length>40 || !Number.isInteger(s.total) || s.total<0 || s.total>10000)throw Error();
      const columns=s.columns.map(c=>({label:str(c.label,60),numeric:c.numeric===true}));
      const rows=s.rows.map(r=>{
        if(!Array.isArray(r.cells) || r.cells.length!==columns.length)throw Error();
        const cells=r.cells.map(c=>{
          if(![null,'string','number','boolean'].includes(c.value===null?null:typeof c.value) ||
             (typeof c.value==='number' && !Number.isFinite(c.value)) ||
             !['neutral','positive','negative'].includes(c.tone))throw Error();
          return {value:c.value,display:str(c.display,3000),tone:c.tone};
        });
        const related=url(r.related_url);
        if(related && !['持有策略','关联产品'].includes(r.related_label))throw Error();
        return {cells,detail_url:url(r.detail_url),...(related?{related_url:related,related_label:str(r.related_label,20)}:{})};
      });
      return {title:str(s.title,100),columns,rows,total:s.total,list_url:url(s.list_url),scope:str(s.scope||'',1200)};
    });
    let chart=null;
    if(value.chart){
      const c=value.chart;
      if(!['line','bar'].includes(c.kind) || !Array.isArray(c.points) || c.points.length>400)throw Error();
      if(c.format && !['integer','decimal'].includes(c.format))throw Error();
      if(c.semantics && !['neutral','return','drawdown'].includes(c.semantics))throw Error();
      chart={kind:c.kind,title:str(c.title,100),unit:str(c.unit,20),format:c.format||'decimal',semantics:c.semantics||'neutral',points:c.points.map(p=>{
        if(!Array.isArray(p) || p.length!==2 || typeof p[1]!=='number' || !Number.isFinite(p[1]))throw Error();
        return [str(p[0],100),p[1]];
      })};
    }
    const variant=['holdings_aggregation','coverage','comparison'].includes(value.variant)?value.variant:value.template;
    return {version:1,template:value.template,variant,title:str(value.title,100),summary:str(value.summary||'',800),answer_sha256:value.answer_sha256,sections,notes,followups,chart};
  }catch{return null;}
}
