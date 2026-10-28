'use strict';
// Prepare an ephemeral EdgeOne checkout without duplicating the static site.
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const OUTPUT='_edgeone_static';
function inside(root,name){
  if(!name||path.isAbsolute(name)||name.split(/[\\/]/).includes('..'))throw Error('Unsafe build path');
  const p=path.resolve(root,name);
  if(!p.startsWith(root+path.sep))throw Error('Build path escapes checkout');
  return p;
}
function prepare(root,names,{removeGit=false}={}){
  root=fs.realpathSync(root);
  const out=inside(root,OUTPUT);
  if(fs.existsSync(out))throw Error('Build output already exists; use a fresh checkout');
  const files=[];
  let bytes=0;
  for(const name of names){
    if(name==='.git'||name.startsWith('.git/')||name.startsWith('.github/'))continue;
    if(name===OUTPUT||name.startsWith(OUTPUT+'/'))throw Error('Build output must not be tracked');
    const source=inside(root,name),stat=fs.lstatSync(source);
    if(!stat.isFile()||fs.realpathSync(source)!==source)throw Error('Only checkout regular files may be deployed: '+name);
    files.push({name,source,size:stat.size});bytes+=stat.size;
  }
  if(!files.some(f=>f.name==='private_fund/version.json')||!files.some(f=>f.name==='index.html'))throw Error('Expected shared static-site checkout');
  if(files.length>20000)throw Error('EdgeOne file-count limit exceeded');
  // All source paths are validated before altering the ephemeral checkout.
  // Release clone history before the CLI creates its upload archive.
  if(removeGit){
    const git=inside(root,'.git');
    if(fs.existsSync(git)){
      if(!fs.lstatSync(git).isDirectory()||fs.realpathSync(git)!==git)throw Error('Refuse external Git metadata');
      fs.rmSync(git,{recursive:true,force:true});
    }
  }
  fs.mkdirSync(out);
  for(const f of files){
    const target=inside(out,f.name);fs.mkdirSync(path.dirname(target),{recursive:true});
    // Same-filesystem hard links keep source/config/functions available to the
    // hosting runtime without allocating another copy of their content.
    fs.linkSync(f.source,target);
  }
  console.log(JSON.stringify({status:'ready',files:files.length,staticBytes:bytes,outputDirectory:OUTPUT,
    fileBytesChanged:false,wholeSiteCopied:false,hardLinked:true,gitHistoryRemoved:removeGit}));
  return {out,files,bytes};
}
if(require.main===module){
  if(process.platform!=='linux'||process.env.PRIVATE_FUND_EDGEONE_BUILD!=='1')throw Error('Only an explicitly selected Linux cloud build may run this entrypoint');
  const root=process.cwd();
  const listing=cp.execFileSync('git',['ls-files','-z'],{cwd:root,maxBuffer:16*1024*1024}).toString('utf8');
  prepare(root,listing.split('\0').filter(Boolean),{removeGit:true});
}
module.exports={prepare,OUTPUT};
