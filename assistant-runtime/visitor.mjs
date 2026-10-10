import {isIP} from 'node:net';

export const reference=task=>task.display_ref||`网页-${new Date((task.created_at+8*3600)*1000).toISOString().slice(0,10).replaceAll('-','')}-${String(parseInt(task.id.slice(0,10),16)%1000000).padStart(6,'0')}`;
export const statuses={queued:'等待处理',processing:'正在处理',answer:'已答复',clarification:'需要补充条件',rejected:'已拒绝处理',failed:'处理失败'};
export function visitor(request,context={},session={}){
  const ua=request.headers.get('user-agent')||'';
  const device=/iPad/i.test(ua)?'iPad 平板':/iPhone/i.test(ua)?'iPhone 手机':/Android/i.test(ua)?'Android 设备':/Windows/i.test(ua)?'Windows 电脑':/Macintosh|Mac OS/i.test(ua)?'Mac 电脑':/Linux/i.test(ua)?'Linux 电脑':'设备未识别';
  const browser=/Edg\//.test(ua)?'Edge':/Chrome\//.test(ua)?'Chrome':/Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':/Python-urllib/i.test(ua)?'程序接口调用':'浏览器未识别';
  let page='天眼系统';
  try{const url=new URL(request.headers.get('referer')||'');if(url.hostname==='gfinvest.site')page=url.pathname.startsWith('/private_fund/')?'天眼私募':url.pathname.startsWith('/basic_data/')?'天眼投顾':page;}catch{}
  // Only the platform connection address is trusted; visitor-supplied proxy headers are ignored.
  const ip=isIP(String(context.clientIp||''))?String(context.clientIp):'未取得';
  return {ip,device,browser,source_page:page,is_test:session.is_test===true,
    machine_name:session.is_test?session.machine_name||'未提供':'浏览器无法读取',
    person:session.is_test?'系统上线验收测试':'匿名网页访客'};
}
export function identityText(task){
  const v=task.visitor||{};
  return `提问人：${v.person||'匿名网页访客'}\n来源：${v.source_page||'天眼系统网页'}\n访客 IP：${v.ip||'此前未记录'}\n设备：${v.device||'此前未记录'} · ${v.browser||'此前未记录'}\n`+
    (v.is_test?`测试执行电脑：${v.machine_name||'未提供'}\n`:'')+`问答编号：${reference(task)}\n`;
}
