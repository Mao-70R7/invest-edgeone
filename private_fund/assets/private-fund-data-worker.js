// Parse and decode public JSON payloads off the UI thread. Never execute data.
function unpack(pack){
  if(pack?.recordEncoding!==1)return pack;
  const decode=v=>{if(!Array.isArray(v))return v;const tag=v[0];
    if(tag===-2)return pack.strings[v[1]];
    if(tag===-1)return v.slice(1).map(decode);
    return Object.fromEntries(pack.schemas[tag].map((k,i)=>[k,decode(v[i+1])]));};
  return decode(pack.data);
}
self.onmessage=async ({data:{id,buffer}})=>{
  try{
    const bytes=new Uint8Array(buffer),blob=new Blob([bytes]);
    const text=(bytes[0]===31&&bytes[1]===139?await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text():await blob.text()).trim();
    const assignment=text.match(/^window\.(__PRIVATE_FUND_[A-Z_]+__)=([\s\S]*);$/);
    const payload=unpack(JSON.parse(assignment?assignment[2]:text));
    const name=assignment?.[1]||null;
    if(Array.isArray(payload.rows)&&payload.rows.length>256){
      const rows=payload.rows;self.postMessage({id,type:'header',name,payload:{...payload,rows:[]}});
      for(let start=0;start<rows.length;start+=128){self.postMessage({id,type:'rows',rows:rows.slice(start,start+128)});if(start%512===0)await new Promise(resolve=>setTimeout(resolve,0));}
      self.postMessage({id,type:'done'});
    }else self.postMessage({id,name,payload});
  }catch(error){self.postMessage({id,error:String(error.message||error)});}
};
