import {mkdir,copyFile,cp,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=resolve(root,'dist');
await mkdir(out,{recursive:true});
for (const file of ['index.html','style.css','config.js','icon.svg','README.md','.nojekyll']) await copyFile(resolve(root,file),resolve(out,file));
await cp(resolve(root,'src'),resolve(out,'src'),{recursive:true});
// Version module imports as well as the entry point so a deployment cannot mix
// cached JavaScript from the previous version with newly published modules.
const modules=(await readdir(resolve(root,'src'))).filter(name=>name.endsWith('.js')).sort().map(name=>'src/'+name);
const sources=await Promise.all(['config.js','style.css',...modules].map(name=>readFile(resolve(root,name),'utf8')));
const version=createHash('sha256').update(sources.join('\n')).digest('hex').slice(0,12);
for (const name of modules) {
  const source=await readFile(resolve(root,name),'utf8');
  await writeFile(resolve(out,name),source.replace(/(['"])(\.\.?\/[^'"?]+\.js)\1/g,(_,quote,path)=>`${quote}${path}?v=${version}${quote}`));
}
const html=await readFile(resolve(root,'index.html'),'utf8');
await writeFile(resolve(out,'index.html'),html.replace('./src/app.js',`./src/app.js?v=${version}`).replace('./style.css',`./style.css?v=${version}`));
console.log('Static site prepared in dist/');
