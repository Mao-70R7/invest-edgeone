import {createHash} from 'node:crypto';
import {identityText,statuses} from './visitor.mjs';

const configKey='private/feishu-notification-config';
const stamp=seconds=>new Date(seconds*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
const uuid=seed=>{const h=createHash('sha256').update(seed).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
// Split by UTF-8 bytes and Unicode code points, including JSON overhead for posts.
export function chunks(text){
  const output=[];let part='',size=0;
  for(const char of text){const n=Buffer.byteLength(JSON.stringify(char));if(size+n>15000){output.push(part);part='';size=0;}part+=char;size+=n;}
  if(part)output.push(part);return output;
}

export function createMirror(store,clock=()=>Date.now()/1000,fetcher=fetch){
  const get=key=>store.get(key,{type:'json',consistency:'strong'});
  const put=(key,value,options)=>store.setJSON(key,value,options);
  const key=(id,stage)=>`notifications/${id}/${stage}`;
  const outbox=(id,stage)=>`notification-outbox/${id}-${stage}`;
  const api=async(path,body,token)=>{
    const response=await fetcher('https://open.feishu.cn/open-apis/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(6000)});
    const result=await response.json();
    if(!response.ok || result.code!==0){const error=new Error('Feishu send failed');error.code=String(result.code||response.status);throw error;}
    return result;
  };
  const credentials=async()=>{
    const config=await get(configKey);if(!config)throw Object.assign(new Error('Notification not configured'),{code:'NOT_CONFIGURED'});
    let cache=await get('private/feishu-tenant-token');
    if(!cache || cache.expires<clock()+90){
      const reply=await api('auth/v3/tenant_access_token/internal',{app_id:config.app_id,app_secret:config.app_secret});
      cache={token:reply.tenant_access_token,expires:clock()+Number(reply.expire||3600)};
      await put('private/feishu-tenant-token',cache);
    }
    return {config,token:cache.token};
  };
  const configure=async body=>{
    if(!/^cli_[\w]+$/.test(body.app_id||'') || typeof body.app_secret!=='string' || body.app_secret.length<16 || !['open_id','user_id','union_id'].includes(body.receive_id_type) || typeof body.receive_id!=='string' || !body.receive_id || body.label!=='毛家轩')throw new Error('Invalid notification configuration');
    await put(configKey,{app_id:body.app_id,app_secret:body.app_secret,receive_id:body.receive_id,receive_id_type:body.receive_id_type,label:body.label});
    await store.delete('private/feishu-tenant-token');
    return {ok:true,label:body.label,receive_id_type:body.receive_id_type};
  };
  const enqueue=async(task,stage)=>{
    const id=key(task.id,stage);const existing=await get(id);
    if(existing){if(existing.status!=='sent')await put(outbox(task.id,stage),{id:task.id,stage});return;}
    const title=stage==='question'?'收到提问':'完成答复';
    const text=`网页助手问答抄送｜${title}\n${identityText(task)}收到时间：${stamp(task.created_at)}\n`+
      (stage==='answer'?`答复时间：${stamp(clock())}\n处理结果：${statuses[task.status]||'已处理'}\n耗时：${Math.max(0,clock()-task.created_at).toFixed(1)} 秒\n`:'')+
      `\n问题\n${task.question}`+(stage==='answer'?`\n\n答复\n${task.answer||'（未返回答复文字）'}`:'');
    const job={task_id:task.id,stage,status:'pending',parts:chunks(text),sent:[],created_at:clock(),attempts:0,next_at:0};
    try{await put(id,job,{onlyIfNew:true});}catch(error){if(error.code!=='PRECONDITION_FAILED')throw error;}
    await put(outbox(task.id,stage),{id:task.id,stage});
  };
  const send=async(id,stage)=>{
    const job=await get(key(id,stage));if(!job)return false;if(job.status==='sent')return true;
    if(job.next_at>clock())return false;
    // The stable UUID for each part prevents duplicate Feishu messages after a timeout.
    try{
      const {config,token}=await credentials();
      for(let budget=0;job.sent.length<job.parts.length && budget<3;budget++){
        const index=job.sent.length;
        const content={zh_cn:{title:'',content:[[{tag:'md',text:job.parts[index]}]]}};
        const response=await api('im/v1/messages?receive_id_type='+config.receive_id_type,{receive_id:config.receive_id,msg_type:'post',content:JSON.stringify(content),uuid:uuid(`tianyan-web-audit:${id}:${stage}:${index}`)},token);
        if(!response.data?.message_id)throw Object.assign(new Error('Missing delivery receipt'),{code:'NO_RECEIPT'});
        job.sent.push(response.data.message_id);job.status=job.sent.length===job.parts.length?'sent':'pending';job.error_code=null;job.next_at=0;job.delivered_at=clock();
        await put(key(id,stage),job);
      }
    }catch(error){
      job.attempts++;job.status='pending';job.error_code=error.code||error.name||'NETWORK';job.next_at=clock()+Math.min(300,5*2**Math.min(job.attempts,6));
      if(['99991663','99991668','99991671','99991672'].includes(job.error_code))await store.delete('private/feishu-tenant-token');
      await put(key(id,stage),job);
    }
    if(job.status==='sent')await store.delete(outbox(id,stage));
    return job.status==='sent';
  };
  const drain=async()=>{
    const previous=await get('meta/notification-drain');
    const page=await store.list({prefix:'notification-outbox/',consistency:'strong',paginate:false,limit:50,...(previous?.cursor?{cursor:previous.cursor}:{})});
    const entries=page.blobs;
    let budget=2;
    for(const entry of entries){
      const pointer=await get(entry.key);if(!pointer)continue;
      const job=await get(key(pointer.id,pointer.stage));if(!job || job.status==='sent'){await store.delete(entry.key);continue;}if(job.next_at>clock())continue;
      if(job.stage==='answer' && (await get(key(job.task_id,'question')))?.status!=='sent')continue;
      await send(job.task_id,job.stage);if(--budget<=0)break;
    }
    await put('meta/notification-drain',{cursor:page.cursor||null});
  };
  const status=async id=>{
    const out={};for(const stage of ['question','answer']){const job=await get(key(id,stage));out[stage]=job?{status:job.status,message_ids:job.sent,error_code:job.error_code||null,attempts:job.attempts}:null;}return out;
  };
  return {configure,enqueue,send,drain,status};
}
