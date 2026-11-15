import fs from 'node:fs';
import path from 'node:path';

// LightGBM's wheel needs the OpenMP runtime that is absent from Vercel functions.
const candidates=['/usr/lib64/libgomp.so.1','/usr/lib/x86_64-linux-gnu/libgomp.so.1','/lib/x86_64-linux-gnu/libgomp.so.1'];
const source=candidates.find(file=>fs.existsSync(file));
if(!source)throw new Error('Build image does not provide libgomp.so.1 required by LightGBM');
const destination=path.resolve('api/_native');
fs.mkdirSync(destination,{recursive:true});
fs.copyFileSync(fs.realpathSync(source),path.join(destination,'libgomp.so.1'));
const license='/usr/share/doc/libgomp1/copyright';
if(fs.existsSync(license))fs.copyFileSync(license,path.join(destination,'libgomp-copyright'));
console.log('Packaged system OpenMP runtime for LightGBM');
