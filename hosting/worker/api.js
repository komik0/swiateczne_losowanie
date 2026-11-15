const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers});
export function token() { return Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join(''); }
async function hash(value) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
function shuffle(array) {for(let i=array.length-1;i>0;i--){const range=i+1,limit=4294967296-4294967296%range;let r;do{r=crypto.getRandomValues(new Uint32Array(1))[0];}while(r>=limit);const j=r%range;[array[i],array[j]]=[array[j],array[i]];}return array;}
export function draw(names,exclusions=[]) {
  if(!Array.isArray(names)||names.length<2||names.length>100||names.some(n=>typeof n!=='string'||!n.trim()||n.length>80))throw Error('Dodaj od 2 do 100 osób (nazwy do 80 znaków).');
  names=names.map(n=>n.trim());
  if(new Set(names.map(n=>n.toLocaleLowerCase('pl'))).size!==names.length)throw Error('Każda osoba musi mieć unikalną nazwę.');
  if(!Array.isArray(exclusions)||exclusions.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isInteger(n)||n<0||n>=names.length)))throw Error('Nieprawidłowe wykluczenia.');
  const blocked=new Set(exclusions.map(p=>p.join(',')));
  const choices=names.map((_,i)=>shuffle(names.map((_,j)=>j).filter(j=>j!==i&&!blocked.has(i+','+j))));
  const owners=new Map();
  function assign(i,seen){for(const j of choices[i]){if(seen.has(j))continue;seen.add(j);if(!owners.has(j)||assign(owners.get(j),seen)){owners.set(j,i);return true;}}return false;}
  if(!shuffle(names.map((_,i)=>i)).every(i=>assign(i,new Set())))throw Error('Nie da się przeprowadzić losowania z tymi wykluczeniami. Zmień je i spróbuj ponownie.');
  return new Map([...owners].map(([j,i])=>[i,j]));
}
export async function api(request,env){
  const path=new URL(request.url).pathname;
  const bearer=request.headers.get('X-Organizer-Token')||'';
  const owner=bearer.length===64?await hash(bearer):null;
  const authenticated=owner?!!await env.DB.prepare('SELECT token FROM organizers WHERE token=?').bind(owner).first():false;
  if(request.method==='GET'){
    if(path==='/api/session')return json({authenticated});
    if(path==='/api/draws'){
      if(!authenticated)return json({error:'Otwórz swój prywatny link administratora.'},401);
      const {results}=await env.DB.prepare('SELECT id,title,links FROM draws WHERE owner=? ORDER BY created_at DESC, rowid DESC').bind(owner).all();
      return json(results.map(r=>({...r,links:JSON.parse(r.links)})));
    }
    return json({error:'Nie znaleziono.'},404);
  }
  if(request.method!=='POST')return json({error:'Niedozwolona metoda.'},405);
  if(request.headers.get('X-Requested-With')!=='gift-draw')return json({error:'Niedozwolone żądanie.'},403);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==new URL(request.url).origin)return json({error:'Niedozwolone źródło.'},403);
  const raw=await request.text();
  if(raw.length>65536)return json({error:'Za duże żądanie.'},413);
  let data;try{data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw Error();}catch{return json({error:'Nieprawidłowe dane.'},400);}
  if(path==='/api/organizers'){
    const key=token();
    await env.DB.prepare('INSERT INTO organizers (token) VALUES (?)').bind(await hash(key)).run();
    return json({token:key},201);
  }
  if(path==='/api/result'){
    if(typeof data.token!=='string'||data.token.length!==64)return json({error:'Nieprawidłowy link.'},404);
    const result=await env.DB.prepare('SELECT giver,recipient,title FROM results WHERE token=?').bind(await hash(data.token)).first();
    return result?json(result):json({error:'Ten link nie istnieje. Poproś organizatora o poprawny link.'},404);
  }
  if(!authenticated)return json({error:'Otwórz swój prywatny link administratora.'},401);
  if(path==='/api/logout')return json({});
  if(path==='/api/draws'){
    let matching;try{matching=draw(data.names,data.exclusions);if(typeof data.title!=='string'||!data.title.trim()||data.title.length>120)throw Error('Podaj nazwę losowania (do 120 znaków).');}catch(e){return json({error:e.message},400);}
    const names=data.names.map(n=>n.trim());
    const links=names.map(name=>({name,token:token()}));
    const id=token(),title=data.title.trim();
    const statements=[env.DB.prepare('INSERT INTO draws (id,title,links,owner,created_at) VALUES (?,?,?,?,?)').bind(id,title,JSON.stringify(links),owner,Date.now())];
    for(let i=0;i<links.length;i++)statements.push(env.DB.prepare('INSERT INTO results (token,giver,recipient,title) VALUES (?,?,?,?)').bind(await hash(links[i].token),names[i],names[matching.get(i)],title));
    await env.DB.batch(statements);
    return json({id,title,links},201);
  }
  return json({error:'Nie znaleziono.'},404);
}
export {headers};
