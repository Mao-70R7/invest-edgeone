import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {createMirror} from './feishu-mirror.mjs';
import {visitor,reference} from './visitor.mjs';

const terminal = new Set(['answer','clarification','rejected','failed']);
const digest = value => createHash('sha256').update(value).digest('hex');
const nonce = () => randomBytes(16).toString('hex');
class ApiError extends Error { constructor(status,message){super(message);this.status=status;} }
const check = (condition,status,message) => {if(!condition)throw new ApiError(status,message);};
const same = (a,b) => typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));

// Authentication configuration contains hashes of independently generated,
// high-entropy credentials. Plaintext credentials stay on the local machine.
export function createHandler(config,store,clock=()=>Date.now()/1000,fetcher=fetch) {
  const mirror=config.mirrorRequired?createMirror(store,clock,fetcher):null;
  const get = key => store.get(key,{type:'json',consistency:'strong'});
  const put = (key,value,options) => store.setJSON(key,value,options);
  const list = async prefix => (await store.list({prefix,consistency:'strong'})).blobs;
  const records = async prefix => (await Promise.all((await list(prefix)).map(item=>get(item.key)))).filter(Boolean);
  const taskKey = (sid,id) => `tasks/${sid}/${id}`;
  const archive=async(task,phase)=>{
    const key=`audit-outbox/${task.id}-${phase}`;
    try{await put(key,{task,phase},{onlyIfNew:true});}catch(error){if(error.code!=='PRECONDITION_FAILED')throw error;}
  };
  const taskById = async id => {const pointer=await get(`queue/${id}`)||await get(`lookup/${id}`);return pointer?get(pointer.key):null;};
  const publicTask = async task => {
    check(task,404,'未找到本会话的任务');
    const {id,question,status,stage,answer,result,client_message_id,created_at}=task;
    return {id,question,status,stage,answer,result,client_message_id,created_at,
      attachments:terminal.has(status)?await records(`filemeta/${id}/`):[]};
  };
  const requireLease = async (id,lease) => {
    const task=await taskById(id);
    check(task && same(task.lease,lease) && task.lease_until>clock(),409,'任务连接已更新，请重新获取任务');
    return task;
  };
  const heartbeat = async owner => {
    await put('meta/worker',{seen:clock()});
    const lock=await get('locks/worker');
    if(lock?.owner===owner)await put('locks/worker',{owner,expires:clock()+60});
  };
  const history = async sid => (await records(`tasks/${sid}/`)).sort((a,b)=>b.created_at-a.created_at);
  const jsonBody = async (request,max=300000) => {
    const text=await request.text();check(Buffer.byteLength(text)<=max,413,'请求内容超出上限');
    try{return JSON.parse(text);}catch{throw new ApiError(400,'请求内容无效');}
  };
  const workerLock = async owner => {
    check(typeof owner==='string' && /^[a-f0-9]{32,64}$/.test(owner),400,'监听服务标识无效');
    let lock=await get('locks/worker');
    if(lock && lock.owner!==owner && lock.expires>clock())throw new ApiError(409,'已有监听服务连接');
    if(lock && lock.expires<=clock())await store.delete('locks/worker');
    if(!lock || lock.expires<=clock()){
      try{await put('locks/worker',{owner,expires:clock()+60},{onlyIfNew:true});}
      catch(error){if(error.code!=='PRECONDITION_FAILED')throw error;}
      lock=await get('locks/worker');check(lock?.owner===owner,409,'已有监听服务连接');
    }
    await heartbeat(owner);
  };
  const cleanup = async () => {
    const last=await get('meta/cleanup');
    if(last && clock()-last.seen<3600)return;
    // Bound each pass so maintenance cannot monopolize a cloud invocation.
    const state=await store.list({prefix:'tasks/',consistency:'strong',paginate:false,limit:50,...(last?.cursor?{cursor:last.cursor}:{})});
    for(const item of state.blobs){
      const task=await get(item.key);
      if(!task || clock()-task.created_at<=7*86400 || !terminal.has(task.status))continue;
      if(await get(`audit-outbox/${task.id}-question`) || await get(`audit-outbox/${task.id}-answer`))continue;
      if(mirror){const notifications=await mirror.status(task.id);if(notifications.question?.status!=='sent' || notifications.answer?.status!=='sent')continue;
        await store.delete(`notifications/${task.id}/question`);await store.delete(`notifications/${task.id}/answer`);}
      for(const file of await list(`files/${task.id}/`))await store.delete(file.key);
      for(const file of await list(`filemeta/${task.id}/`))await store.delete(file.key);
      await store.delete(`lookup/${task.id}`);await store.delete(`queue/${task.id}`);await store.delete(item.key);
    }
    for(const item of (await list('sessions/')).slice(0,100)){
      const session=await get(item.key);if(session && session.expires<clock())await store.delete(item.key);
    }
    await put('meta/cleanup',{seen:clock(),cursor:state.cursor||null});
  };
  return async function handle(request,requestContext={}) {
    const origin=request.headers.get('origin')||'';
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    const respond = (value,status=200,extra={}) => new Response(status===204?null:typeof value==='string'||value instanceof ArrayBuffer?value:JSON.stringify(value),{status,headers:{...headers,...extra}});
    try {
      check(!origin || config.origins.includes(origin),403,'此网页来源未获授权');
      if(origin){headers['Access-Control-Allow-Origin']=origin;headers.Vary='Origin';}
      if(request.method==='OPTIONS')return respond('',204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, X-Task-Lease, X-File-Name, X-File-Kind, X-File-Sha256'});
      const path=new URL(request.url).pathname.replace(/^\/ai-api(?=\/)/,'');
      const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
      if(path==='/v1/health' && request.method==='GET'){
        const seen=await get('meta/worker');
        return respond({ok:true,version:'tianyan-blob-relay-v3',public_access:!!config.publicAccess,feishu_mirror:!!mirror,worker_online:!!seen && clock()-seen.seen<45,queued:(await list('queue/')).length});
      }
      if(path==='/v1/sessions' && request.method==='POST'){
        const body=await jsonBody(request,80000);
        if(!config.publicAccess)check(typeof body.access_code==='string' && same(digest(body.access_code),config.clientCodeSha256),401,'访问码不正确');
        const token=randomBytes(32).toString('hex'),sid=nonce(),expires=clock()+86400;
        const is_test=same(digest((request.headers.get('authorization')||'').replace(/^Bearer /,'')),config.workerTokenSha256) && body.test_run===true;
        const machine_name=is_test?String(body.machine_name||'').replace(/[\x00-\x1f\x7f]/g,'').slice(0,80):'';
        await put(`sessions/${digest(token)}`,{id:sid,expires,is_test,machine_name},{onlyIfNew:true});
        return respond({token,session_id:sid,expires_at:expires});
      }
      if(path.startsWith('/v1/worker/')){
        check(token && same(digest(token),config.workerTokenSha256),401,'监听服务身份无效');
        if(path==='/v1/worker/audit' && request.method==='GET'){
          const page=await store.list({prefix:'audit-outbox/',consistency:'strong',paginate:false,limit:10});
          return respond({events:(await Promise.all(page.blobs.map(async item=>({key:item.key,...await get(item.key)})))).filter(item=>item.task)});
        }
        if(path==='/v1/worker/audit/ack' && request.method==='POST'){
          const body=await jsonBody(request);check(Array.isArray(body.keys) && body.keys.length<=10 && body.keys.every(key=>/^audit-outbox\/[a-f0-9]{32}-(question|answer)$/.test(key)),400,'归档确认无效');
          for(const key of body.keys)await store.delete(key);return respond({ok:true});
        }
        if(path==='/v1/worker/history' && request.method==='GET'){
          const cursor=new URL(request.url).searchParams.get('cursor');const page=await store.list({prefix:'tasks/',consistency:'strong',paginate:false,limit:20,...(cursor?{cursor}:{})});
          return respond({tasks:(await Promise.all(page.blobs.map(item=>get(item.key)))).filter(Boolean),cursor:page.cursor||null});
        }
        if(path==='/v1/worker/notification-config' && request.method==='POST'){
          check(mirror,400,'未启用飞书同步');const body=await jsonBody(request,10000);
          try{return respond(await mirror.configure(body));}catch{return respond({error:'飞书同步配置无效'},400);}
        }
        const receiptMatch=path.match(/^\/v1\/worker\/notifications\/([a-f0-9]{32})$/);
        if(receiptMatch && request.method==='GET')return respond(mirror?await mirror.status(receiptMatch[1]):{});
        if(path==='/v1/worker/claim' && request.method==='POST'){
          const body=await jsonBody(request);await workerLock(body.worker_id);
          if(mirror)await mirror.drain();
          const queue=(await records('queue/')).sort((a,b)=>a.created_at-b.created_at);
          for(const pointer of queue){
            const task=await get(pointer.key);
            if(!task || terminal.has(task.status)){if(task){await archive(task,'answer');if(mirror){await mirror.enqueue(task,'question');await mirror.enqueue(task,'answer');}}await store.delete(`queue/${pointer.id}`);continue;}
            if(task.status==='processing' && task.lease_until>clock())continue;
            if(mirror){await mirror.enqueue(task,'question');if(!await mirror.send(task.id,'question')){task.stage='问题已收到，等待飞书通知送达';await put(pointer.key,task);continue;}}
            if(task.attempts>=3 || clock()-task.created_at>7*86400){
              task.status='failed';task.answer='本次任务连接中断，请重新提交。';
              await archive(task,'answer');
              if(mirror){await mirror.enqueue(task,'answer');await mirror.send(task.id,'answer');}
              await put(pointer.key,task);await store.delete(`queue/${task.id}`);await store.delete(`active/${task.session_id}`);continue;
            }
            Object.assign(task,{status:'processing',stage:'核对问题范围',lease:nonce(),lease_until:clock()+600,owner:body.worker_id,attempts:(task.attempts||0)+1});
            await put(pointer.key,task);
            const context=(await history(task.session_id)).filter(item=>item.id!==task.id && ['answer','clarification','rejected'].includes(item.status)).slice(0,4).reverse();
            return respond({task:{...task,context}});
          }
          await cleanup();return respond({task:null});
        }
        const match=path.match(/^\/v1\/worker\/tasks\/([a-f0-9]{32})(\/files)?$/);
        check(match && request.method==='POST',404,'接口不存在');
        if(match[2]){
          const task=await requireLease(match[1],request.headers.get('x-task-lease'));
          const data=await request.arrayBuffer(),kind=request.headers.get('x-file-kind'),sha=digest(Buffer.from(data));
          check(['png','xlsx'].includes(kind) && data.byteLength>0 && data.byteLength<=50*1024*1024,400,'附件类型或体积无效');
          check(same(sha,request.headers.get('x-file-sha256')),400,'附件校验失败');
          const magic=Buffer.from(data);check(kind==='png'?magic.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):magic.subarray(0,2).toString()==='PK',400,'附件内容与类型不符');
          const files=await records(`filemeta/${task.id}/`),existing=files.find(file=>file.sha256===sha);
          if(existing)return respond({id:existing.id});
          check(files.length<4,400,'单题最多四个附件');
          const id=nonce(),name=(request.headers.get('x-file-name')||`结果.${kind}`).replace(/[^\w.\-\u4e00-\u9fff]/g,'_').slice(0,100);
          await store.set(`files/${task.id}/${id}`,data);
          await put(`filemeta/${task.id}/${id}`,{id,name,kind,size:data.byteLength,sha256:sha});
          return respond({id});
        }
        const body=await jsonBody(request),task=await requireLease(match[1],body.lease);
        check(terminal.has(body.status) || body.status==='processing',400,'任务状态无效');
        check(typeof (body.answer||'')==='string' && (body.answer||'').length<=100000,400,'答复超出上限');
        // A retrying completion cannot regress an already terminal answer.
        if(terminal.has(task.status) && body.status==='processing')return respond({ok:true});
        task.status=body.status;task.stage=String(body.stage||'处理中').slice(0,80);task.lease_until=clock()+600;
        if(body.answer!==undefined)task.answer=body.answer;
        if(body.result){task.result={};for(const key of ['business_status','options','clarification','reason','slot_type','original_question'])if(key in body.result)task.result[key]=body.result[key];}
        await put(taskKey(task.session_id,task.id),task);await heartbeat(task.owner);
        if(terminal.has(task.status))await archive(task,'answer');
        if(terminal.has(task.status) && mirror)await mirror.enqueue(task,'answer');
        if(terminal.has(task.status)){await store.delete(`queue/${task.id}`);const active=await get(`active/${task.session_id}`);if(active?.id===task.id)await store.delete(`active/${task.session_id}`);}
        if(terminal.has(task.status) && mirror)await mirror.send(task.id,'answer');
        return respond({ok:true});
      }
      const session=token?await get(`sessions/${digest(token)}`):null;
      check(session && session.expires>clock(),401,'会话已过期，请重新连接');
      if(path==='/v1/tasks' && request.method==='GET')return respond({tasks:await Promise.all((await history(session.id)).slice(0,20).map(publicTask))});
      if(path==='/v1/tasks' && request.method==='POST'){
        const body=await jsonBody(request,80000),question=String(body.question||'').trim(),client=String(body.client_message_id||'');
        check(question && question.length<=16000 && /^[\w-]{8,100}$/.test(client),400,'问题或提交编号无效');
        const id=digest(session.id+'|'+client).slice(0,32),key=taskKey(session.id,id),existing=await get(key);
        if(existing){check(existing.question===question,409,'提交编号已用于另一问题');if(existing.status==='queued'){await archive(existing,'question');await put(`lookup/${id}`,{key});await put(`queue/${id}`,{id,key,created_at:existing.created_at});if(mirror){await mirror.enqueue(existing,'question');await mirror.send(id,'question');}}return respond(await publicTask(existing));}
        const active=await get(`active/${session.id}`);
        if(active){const old=await get(taskKey(session.id,active.id));if(old && terminal.has(old.status))await store.delete(`active/${session.id}`);}
        try{await put(`active/${session.id}`,{id,created_at:clock()},{onlyIfNew:true});}
        catch(error){if(error.code==='PRECONDITION_FAILED')throw new ApiError(409,'本会话已有任务处理中，请等待答复');throw error;}
        const task={id,session_id:session.id,question,client_message_id:client,status:'queued',stage:'等待处理',answer:'',result:{},created_at:clock(),attempts:0,visitor:visitor(request,requestContext,session)};
        task.display_ref=reference(task);
        try{
          await put(key,task,{onlyIfNew:true});await archive(task,'question');await put(`lookup/${id}`,{key});await put(`queue/${id}`,{id,key,created_at:task.created_at});
          if(mirror){await mirror.enqueue(task,'question');await mirror.send(task.id,'question');}
        }catch(error){if(!await get(key))await store.delete(`active/${session.id}`);throw error;}
        return respond(await publicTask(task));
      }
      const match=path.match(/^\/v1\/tasks\/([a-f0-9]{32})(?:\/files\/([a-f0-9]{32}))?$/);
      check(match && request.method==='GET',404,'接口不存在');
      const task=await get(taskKey(session.id,match[1]));check(task,404,'未找到本会话的任务');
      if(!match[2])return respond(await publicTask(task));
      const file=await get(`filemeta/${task.id}/${match[2]}`);check(file && terminal.has(task.status),404,'附件尚未就绪');
      const data=await store.get(`files/${task.id}/${file.id}`,{type:'arrayBuffer',consistency:'strong'});
      check(data && data.byteLength===file.size && same(digest(Buffer.from(data)),file.sha256),409,'附件文件校验失败');
      return respond(data,200,{'Content-Type':file.kind==='png'?'image/png':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="download.${file.kind}"`});
    }catch(error){
      if(error instanceof ApiError)return respond({error:error.message},error.status);
      return respond({error:'助手服务暂时不可用，请稍后再试。'},503);
    }
  };
}
