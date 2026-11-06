const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const names=cp.execFileSync('git',['ls-files','-z']).toString('utf8').split('\0').filter(Boolean);
const allowed=n=>n.startsWith('private_fund/')||n.startsWith('wealth_shelf/')||['index.html','edgeone.json','README.md','site_split.json','edge-functions/ai-api/[[default]].js'].includes(n)||n==='scripts/prepare_private_static.cjs';
if(names.some(n=>!allowed(n)))throw Error('Unexpected non-private artifact');
if(names.length>20000)throw Error('File count exceeds 20000');
if(!names.includes('private_fund/version.json'))throw Error('Private version missing');
const out='_private_static';if(fs.existsSync(out))throw Error('Use a clean build checkout');
for(const n of names){const s=fs.lstatSync(n);if(!s.isFile()||s.size>25*1024*1024)throw Error('Invalid file or oversized file: '+n);}
fs.mkdirSync(out);
for(const n of names){if(n.startsWith('edge-functions/'))continue;const dst=path.join(out,n);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.linkSync(n,dst);}
// The static output is now self-contained. Reclaim only pack files in EdgeOne's
// disposable checkout, and only when the builder lacks space for final output.
if(process.argv.includes('--edgeone-ci')&&process.platform==='linux'&&process.env.HOME==='/tmp/home'){
  const free=()=>{const s=fs.statfsSync('.');return s.bavail*s.bsize;};
  const before=free();
  if(before<1024**3){
    const pack=path.join(fs.realpathSync('.'),'.git','objects','pack');
    if(fs.existsSync(pack)&&fs.realpathSync(pack)===pack){
      let reclaimed=0;
      for(const entry of fs.readdirSync(pack,{withFileTypes:true})){
        if(!entry.isFile()||!/^pack-[0-9a-f]{40}\.(pack|idx|rev|bitmap|mtimes)$/.test(entry.name))continue;
        const file=path.join(pack,entry.name),stat=fs.lstatSync(file);
        if(!stat.isFile()||stat.nlink!==1)continue;
        fs.unlinkSync(file);
        reclaimed+=stat.size;
      }
      console.log(JSON.stringify({event:'edgeone_checkout_space',beforeBytes:before,afterBytes:free(),releasedBytes:reclaimed}));
    }
  }
}
console.log(JSON.stringify({status:'ready',files:names.length,outputDirectory:out,scope:'private_only'}));
