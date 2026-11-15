import {readFile,mkdir,writeFile,cp} from 'node:fs/promises';
const assets={};
for(const [path,name,type] of [['/','index.html','text/html; charset=utf-8'],['/app.js','app.js','text/javascript; charset=utf-8'],['/style.css','style.css','text/css; charset=utf-8']])assets[path]={body:await readFile('public/'+name,'utf8'),type};
const code=await readFile('worker/api.js','utf8');
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',code+`\nconst assets=${JSON.stringify(assets)};\nexport default {async fetch(request,env){try{const path=new URL(request.url).pathname;if(path.startsWith('/api/'))return await api(request,env);const asset=assets[path];if(!asset)return new Response('Nie znaleziono',{status:404,headers});if(request.method!=='GET'&&request.method!=='HEAD')return new Response('',{status:405,headers});return new Response(request.method==='HEAD'?null:asset.body,{headers:{...headers,'Content-Type':asset.type}});}catch{return json({error:'Błąd serwera. Spróbuj ponownie.'},500);}}};`);
await cp('.openai/hosting.json','dist/.openai/hosting.json');
await cp('drizzle','dist/drizzle',{recursive:true});
console.log('Built Worker ESM with embedded assets');
