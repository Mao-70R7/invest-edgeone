import {getStore} from '@edgeone/pages-blob';
import config from '../../assistant-runtime/auth-config.mjs';
import {createHandler} from '../../assistant-runtime/relay.mjs';
import {createHash} from 'node:crypto';

export async function onRequest({request,env={},clientIp}) {
  const workerAuthorized=createHash('sha256').update((request.headers.get('authorization')||'').replace(/^Bearer /,'')).digest('hex')===config.workerTokenSha256;
  const diagnostics=new URL(request.url).pathname.endsWith('/v1/worker/diagnostics') && workerAuthorized;
  const flags={sdkAvailable:typeof getStore==='function',processProject:!!process.env.PAGES_PROJECT_ID,processCredential:!!process.env.PAGES_BLOB_DEPLOY_CREDENTIAL,contextProject:!!env.PAGES_PROJECT_ID,contextCredential:!!env.PAGES_BLOB_DEPLOY_CREDENTIAL};
  try {
    const store=getStore({name:'tianyan-assistant-v1',consistency:'strong'});
    if(diagnostics){await store.get('meta/worker',{type:'json',consistency:'strong'});return new Response(JSON.stringify({ok:true,flags}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
    return await createHandler(config,store)(request,{clientIp});
  } catch (error) {
    if(diagnostics)return new Response(JSON.stringify({ok:false,code:error.code||error.name,flags}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    return new Response(JSON.stringify({error:'助手服务暂时不可用，请稍后再试。'}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
  }
}
