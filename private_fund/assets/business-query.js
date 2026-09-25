/* Versioned, bounded hidden query protocol. No eval, HTML or arbitrary fetch. */
(() => {
  'use strict';
  const blocked=new Set(['__proto__','prototype','constructor']);
  const get=(row,path)=>path.split('.').reduce((v,k)=>blocked.has(k)?undefined:(v&&Object.prototype.hasOwnProperty.call(v,k)?v[k]:undefined),row);
  const text=v=>String(v??'');
  function matches(row,f){
    const v=get(row,f.field);if(f.op==='exists')return v!==undefined&&v!==null&&v!=='';
    if(v===undefined||v===null||v==='')return false;
    if(f.op==='eq')return text(v)===text(f.value);
    if(f.op==='in')return f.value.map(text).includes(text(v));
    if(f.op==='contains')return text(v).toLocaleLowerCase().includes(text(f.value).toLocaleLowerCase());
    const a=Number(v),b=Number(f.value);if(!Number.isFinite(a)||!Number.isFinite(b))return false;
    return {gte:a>=b,gt:a>b,lte:a<=b,lt:a<b}[f.op]===true;
  }
  async function read(){
    const code=new URLSearchParams(location.search).get('bf');if(!code)return null;
    if(code.length>16000||!/^[A-Za-z0-9_-]+$/.test(code))throw Error('筛选链接格式无效');
    const bytes=Uint8Array.from(atob(code.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-code.length%4)%4)),c=>c.charCodeAt(0));
    if(!window.DecompressionStream)throw Error('浏览器不支持此筛选链接，请升级浏览器');
    const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let size=0,parts=[];
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>200000){await reader.cancel();throw Error('筛选条件超出大小限制');}parts.push(value);}
    const spec=JSON.parse(await new Blob(parts).text());
    if(spec.v!==1||!Array.isArray(spec.filters||[])||(spec.filters||[]).length>30||typeof spec.summary!=='string'||spec.summary.length>500)throw Error('筛选条件版本或长度无效');
    if(spec.ids!==undefined&&(!Array.isArray(spec.ids)||spec.ids.length>10000||spec.ids.some(x=>typeof x!=='string'||x.length>150)))throw Error('名单无效');
    for(const f of spec.filters||[]){if(!f||typeof f.field!=='string'||f.field.length>100||f.field.split('.').some(k=>blocked.has(k))||!['eq','in','contains','gte','gt','lte','lt','exists'].includes(f.op)||(f.op==='in'&&(!Array.isArray(f.value)||f.value.length>200)))throw Error('字段筛选条件无效');}
    return spec;
  }
  async function create(rows,key,root){
    let spec=null,error='';try{spec=await read();}catch(e){error=/[\u4e00-\u9fff]/.test(e.message)?e.message:'筛选链接损坏或格式无效';}
    let currentCode=new URLSearchParams(location.search).get('bf');
    let highlightEnabled=true, explicitHighlight=new URLSearchParams(location.search).get('highlight')==='blue';
    window.addEventListener('popstate',()=>{if(new URLSearchParams(location.search).get('bf')!==currentCode)location.reload();});
    const box=document.createElement('p');box.className='business-filter-summary';box.setAttribute('role','status');box.style.cssText='padding:12px 16px;background:#f3f6fa;color:#16324f;border-left:3px solid #16324f;line-height:1.6';root.prepend(box);
    let ids=spec?.ids?new Set(spec.ids):null;let active=Boolean(spec)||Boolean(error);
    if(spec){for(const f of spec.filters||[]){if(!rows.some(r=>get(r,f.field)!==undefined)){error='当前页面未发布字段“'+f.field+'”，无法执行此条件';break;}}}
    const original=new Set(rows.map(key));let missing=ids?[...ids].filter(id=>!original.has(id)).length:0;
    return {get active(){return active;},get highlightColor(){return highlightEnabled&&(spec||explicitHighlight)&&!error?'#2563EB':null;},clearHighlight(){highlightEnabled=false;},apply(input){
      if(error)return [];
      if(!spec)return input;
      return input.filter(r=>(!ids||ids.has(key(r)))&&(spec.filters||[]).every(f=>matches(r,f)));
    },describe(count){
      box.textContent=error?'筛选未执行：'+error+'。请重新生成链接。':spec?'当前范围：'+spec.summary+'；本页显示'+count+'条'+(missing?'；有'+missing+'条尚未进入此发布版本':'')+(spec.asOf?'；名单核对日'+spec.asOf:'')+'。':'当前范围：按页面已选条件筛选，共'+count+'条。';
    },clear(){spec=null;error='';ids=null;active=false;missing=0;currentCode=null;explicitHighlight=false;const u=new URL(location.href);u.searchParams.delete('bf');u.searchParams.delete('highlight');history.replaceState(null,'',u);}};
  }
  window.BusinessQuery={create,version:1};
})();
