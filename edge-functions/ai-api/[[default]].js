// Same-origin visitor bridge. Credentials are checked only by the existing relay.
const ORIGIN='https://private.gfinvest.site';
const UPSTREAM='https://gfinvest.site';
const VERSION='private-visitor-bridge-v1';
export async function proxyRequest(request, fetcher=fetch) {
  const url=new URL(request.url),origin=request.headers.get('origin');
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Tianyan-Bridge':VERSION};
  const fail=(status,error)=>new Response(JSON.stringify({error}),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
  if(url.origin!==ORIGIN || origin && origin!==ORIGIN || !origin && request.headers.get('sec-fetch-site')==='cross-site')return fail(403,'此网页来源未获授权');
  const path=url.pathname;
  const get=path==='/ai-api/v1/health' || path==='/ai-api/v1/tasks' || /^\/ai-api\/v1\/tasks\/[a-f0-9]{32}(?:\/files\/[a-f0-9]{32})?$/.test(path) || /^\/ai-api\/v1\/results\/(?:legacy\/)?[a-f0-9]{64}$/.test(path);
  const post=path==='/ai-api/v1/sessions' || path==='/ai-api/v1/tasks';
  if(!get && !post)return fail(404,'接口不存在');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Vary':'Origin'}});
  if(!(request.method==='GET' && get || request.method==='POST' && post))return fail(405,'请求方式不支持');
  const outgoing=new Headers({'Origin':UPSTREAM,'Accept':request.headers.get('accept')||'application/json'});
  const token=request.headers.get('authorization');if(token)outgoing.set('Authorization',token);
  let body;
  if(request.method==='POST') {
    if(Number(request.headers.get('content-length')||0)>300000)return fail(413,'请求内容超出上限');
    body=await request.arrayBuffer();if(body.byteLength>300000)return fail(413,'请求内容超出上限');
    outgoing.set('Content-Type',request.headers.get('content-type')||'application/json');
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try {
    const response=await fetcher(UPSTREAM+path+url.search,{method:request.method,headers:outgoing,body,redirect:'manual',signal:controller.signal});
    if(response.status>=300 && response.status<400)return fail(502,'助手服务暂时不可用');
    const resultHeaders=new Headers(headers);
    for(const name of ['Content-Type','Content-Disposition']){const value=response.headers.get(name);if(value)resultHeaders.set(name,value);}
    if(origin){resultHeaders.set('Access-Control-Allow-Origin',ORIGIN);resultHeaders.set('Vary','Origin');}
    return new Response(response.body,{status:response.status,headers:resultHeaders});
  } catch {return fail(502,'助手服务暂时不可用，请稍后重试。');}
  finally {clearTimeout(timer);}
}
export function onRequest({request}) {return proxyRequest(request);}
