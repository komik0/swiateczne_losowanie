import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {api,draw} from '../worker/api.js';
function database(){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE organizers(token TEXT PRIMARY KEY); CREATE TABLE draws(id TEXT PRIMARY KEY,title TEXT,links TEXT,owner TEXT,created_at INTEGER); CREATE TABLE results(token TEXT PRIMARY KEY,giver TEXT,recipient TEXT,title TEXT);');
 const prepare=(sql,values=[])=>({bind(...v){return prepare(sql,v);},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){db.prepare(sql).run(...values);return {};}});
 return {prepare,async batch(statements){db.exec('BEGIN');try{for(const stmt of statements)await stmt.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}};
}
const env={DB:database()};
async function call(path,data,token,extra={}){const r=await api(new Request('https://example.test/api/'+path,{method:data===undefined?'GET':'POST',headers:{'X-Requested-With':'gift-draw',...(token?{'X-Organizer-Token':token}:{}),...extra},...(data===undefined?{}:{body:JSON.stringify(data)})}),env);return {status:r.status,body:await r.json()};}
test('perfect matching and exclusions',()=>{for(let n=2;n<=100;n++){const names=Array.from({length:n},(_,i)=>String(i));const result=draw(names);assert.equal(result.size,n);assert.equal(new Set(result.values()).size,n);assert.ok([...result].every(([i,j])=>i!==j));}for(let i=0;i<100;i++)assert.deepEqual([...draw(['A','B','C'],[[0,1],[1,2],[2,0]])].sort(),[[0,2],[1,0],[2,1]]);assert.throws(()=>draw(['A','B'],[[0,1]]));assert.throws(()=>draw(['A',' a ']));});
test('independent organizers, persistent results, public access isolation',async()=>{
 const a=(await call('organizers',{})).body.token,b=(await call('organizers',{})).body.token;
 assert.equal((await call('draws')).status,401);
 const first=await call('draws',{title:'Święta',names:['Ania','Bartek','Kasia'],exclusions:[[0,1]]},a);
 assert.equal(first.status,201);assert.equal(first.body.links.length,3);assert.equal(JSON.stringify(first.body).includes('recipient'),false);
 assert.equal((await call('draws',undefined,a)).body.length,1);assert.equal((await call('draws',undefined,b)).body.length,0);
 const recipients=[];
 for(const link of first.body.links){const r=await call('result',{token:link.token});assert.equal(r.status,200);assert.equal(r.body.giver,link.name);assert.notEqual(r.body.giver,r.body.recipient);if(link.name==='Ania')assert.notEqual(r.body.recipient,'Bartek');recipients.push(r.body.recipient);assert.deepEqual((await call('result',{token:link.token})).body,r.body);}
 assert.equal(new Set(recipients).size,3);
 assert.equal((await call('result',{token:'bad'})).status,404);
 assert.equal((await call('draws',undefined,'0'.repeat(64))).status,401);
 assert.equal((await call('draws',{title:'Bad',names:['A','B'],exclusions:[[0,1]]},a)).status,400);
 assert.equal((await call('draws',undefined,a)).body.length,1);
 assert.equal((await call('session',undefined,a)).body.authenticated,true);
 assert.equal((await call('organizers',{},undefined,{'Origin':'https://attacker.test'})).status,403);
});
