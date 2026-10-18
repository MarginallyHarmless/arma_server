import {mkdir,copyFile,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=resolve(root,'dist');
await mkdir(out,{recursive:true});
for (const file of ['index.html','style.css','config.js','icon.svg','README.md','.nojekyll']) await copyFile(resolve(root,file),resolve(out,file));
await cp(resolve(root,'src'),resolve(out,'src'),{recursive:true});
console.log('Static site prepared in dist/');
