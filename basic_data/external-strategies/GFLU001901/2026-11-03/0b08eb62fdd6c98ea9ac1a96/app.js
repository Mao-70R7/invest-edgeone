'use strict';
async function exportImage(target, suffix) {
  const status=document.getElementById('export-status');
  const buttons=[...document.querySelectorAll('button')];
  buttons.forEach(b=>b.disabled=true);status.textContent='正在生成图片…';
  document.body.classList.add('exporting');
  if(target==='report')document.body.classList.add('exporting-report');
  try {
    await document.fonts.ready;
    const element=document.getElementById(target);
    if(element.scrollHeight*2>16384)throw new Error('报告过长，请保存摘要图片或打印为 PDF');
    const data=await htmlToImage.toPng(element,{backgroundColor:'#ffffff',pixelRatio:2,cacheBust:false});
    const a=document.createElement('a');a.href=data;a.download=document.title+'-'+suffix+'.png';a.click();
    status.textContent='图片已生成，包含仓位日期、报告期及来源说明。';
  } catch(error) {status.textContent='图片生成失败，请使用浏览器截图或打印。';console.error(error);}
  finally {document.body.classList.remove('exporting','exporting-report');buttons.forEach(b=>b.disabled=false);}
}
document.getElementById('save-summary').addEventListener('click',()=>exportImage('summary','摘要'));
document.getElementById('save-all').addEventListener('click',()=>exportImage('report','报告'));
