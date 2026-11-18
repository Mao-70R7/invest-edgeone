'use strict';
// Prepare an ephemeral EdgeOne checkout without duplicating the static site.
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const crypto=require('node:crypto');
const OUTPUT='_edgeone_static';
function selectFiles(root,names){
  const selection=path.join(root,'atomic-deploy-selection.json');
  if(!fs.existsSync(selection)){if(names.some(x=>x.startsWith('private_fund/')))throw Error('Advisor checkout still contains private files');return {names,omitted:0,advisorOnly:true};}
  const v=JSON.parse(fs.readFileSync(selection,'utf8'));
  if(v.contract!=='atomic_cloud_selection_v1'||v.gitFilesDeleted!==false||v.localFilesDeleted!==false||v.acceptedBaselinePreserved!==true)throw Error('Invalid cloud selection contract');
  if(!Array.isArray(v.managedBuildIds)||!v.managedBuildIds.length||new Set(v.managedBuildIds).size!==v.managedBuildIds.length||v.managedBuildIds.some(id=>!/^[A-Za-z0-9_.+-]+$/.test(id)||id===v.buildId))throw Error('Invalid managed builds');
  const prefixes=v.managedBuildIds.map(id=>'basic_data/atomic/releases/'+id+'/');
  const all=new Set(names),required=new Set(),retained=new Set(),omitted=new Set();
  const validate=(item)=>{
    const file=inside(root,item.path);
    if(!all.has(item.path)||!fs.lstatSync(file).isFile()||fs.realpathSync(file)!==file)throw Error('Selected regular file missing');
    const body=fs.readFileSync(file);
    if(body.length!==item.bytes||crypto.createHash('sha256').update(body).digest('hex')!==item.sha256)throw Error('Selected bytes changed');
  };
  for(const item of v.requiredFiles){if(required.has(item.path))throw Error('Duplicate required file');validate(item);required.add(item.path);}
  for(const item of v.retainedFiles){if(required.has(item.path)||retained.has(item.path))throw Error('Duplicate retained file');validate(item);retained.add(item.path);}
  if(!required.has('version.json')||!required.has('basic_data/institutions.html')||!required.has('scripts/prepare_edgeone_static.cjs'))throw Error('Current selection incomplete');
  if(JSON.parse(fs.readFileSync(inside(root,'version.json'),'utf8')).buildId!==v.buildId)throw Error('Current build differs');
  for(const item of v.omittedGeneratedFiles){
    if(!(prefixes.some(prefix=>item.path.startsWith(prefix))||/^basic_data\/atomic\/(catalog|details|comparison)\/[0-9a-f]{64}\.js$/.test(item.path))||required.has(item.path)||retained.has(item.path)||omitted.has(item.path))throw Error('Unowned or live omitted path');
    validate(item);omitted.add(item.path);
  }
  if(v.publicationScope==='advisor_only'&&names.some(x=>x.startsWith('private_fund/')))throw Error('Advisor checkout still contains private files');
  return {names:names.filter(x=>!omitted.has(x)),omitted:omitted.size,advisorOnly:v.publicationScope==='advisor_only'};
}
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
  const selected=selectFiles(root,names);
  const files=[];
  let bytes=0;
  for(const name of selected.names){
    if(name==='.git'||name.startsWith('.git/')||name.startsWith('.github/'))continue;
    if(name===OUTPUT||name.startsWith(OUTPUT+'/'))throw Error('Build output must not be tracked');
    const source=inside(root,name),stat=fs.lstatSync(source);
    if(!stat.isFile()||fs.realpathSync(source)!==source)throw Error('Only checkout regular files may be deployed: '+name);
    if(stat.size>25*1024*1024)throw Error('EdgeOne single-file limit exceeded: '+name);
    files.push({name,source,size:stat.size});bytes+=stat.size;
  }
  if(!files.some(f=>f.name==='index.html')||!(selected.advisorOnly ? files.some(f=>f.name==='basic_data/institutions.html')&&files.some(f=>f.name==='version.json') : files.some(f=>f.name==='private_fund/version.json')))throw Error('Expected selected static-site checkout');
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
    fileBytesChanged:false,wholeSiteCopied:false,hardLinked:true,gitHistoryRemoved:removeGit,
    omittedManagedGeneratedFiles:selected.omitted,sourceFilesDeleted:false}));
  return {out,files,bytes};
}
if(require.main===module){
  if(process.platform!=='linux'||(process.env.ADVISOR_EDGEONE_BUILD!=='1'&&process.env.PRIVATE_FUND_EDGEONE_BUILD!=='1'))throw Error('Only an explicitly selected Linux cloud build may run this entrypoint');
  const root=process.cwd();
  const listing=cp.execFileSync('git',['ls-files','-z'],{cwd:root,maxBuffer:16*1024*1024}).toString('utf8');
  prepare(root,listing.split('\0').filter(Boolean),{removeGit:true});
}
module.exports={prepare,selectFiles,OUTPUT};
