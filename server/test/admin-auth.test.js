import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from '../sqlite.js';
import {createAdminAuth,otpVerifier,DAY} from '../admin-auth.js';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('管理员封禁、失败次数和会话状态重启后保留',async t=>{
 const folder=await mkdtemp(join(tmpdir(),'pages-admin-auth-'));const path=join(folder,'security.sqlite');
 let db=new Database(path);createAdminAuth({db,password:'secret'});
 db.prepare('INSERT INTO failures(ip,created_at) VALUES(?,?)').run('192.0.2.1',Date.now());
 db.prepare('INSERT INTO bans VALUES(?,?)').run('ip:192.0.2.1',Date.now()+7*DAY);
 db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('hashed-token',Date.now(),Date.now()+3*DAY);db.close();
 db=new Database(path);t.after(async()=>{db.close();await rm(folder,{recursive:true,force:true})});createAdminAuth({db,password:'secret'});
 assert.equal(db.prepare('SELECT count(*) AS n FROM failures').get().n,1);
 assert.ok(db.prepare('SELECT until FROM bans').get().until>Date.now());
 assert.equal(db.prepare('SELECT token_hash FROM sessions').get().token_hash,'hashed-token');
});
test('双因素、3天硬过期、2天刷新、持久封禁及全局停用', async t=>{
 const db=new Database(':memory:');let now=Date.now(),unavailable=false;const app=express();app.set('trust proxy',1);app.use(express.json());app.use(createAdminAuth({db,password:'password',clock:()=>now,verifyOtp:async code=>{if(unavailable)throw Error();return code==='012345'}}));app.get('/private',(_q,r)=>r.json({ok:true}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();db.close()});const base='http://127.0.0.1:'+server.address().port;
 async function call(path,body,ip='1.1.1.1',cookie=''){return fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-forwarded-for':ip,...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})})}
 const good={password:'password',code:'012345'};assert.equal((await call('/login',{password:'password'})).status,401);
 unavailable=true;assert.equal((await call('/login',good)).status,503);unavailable=false;
 const login=await call('/login',good);assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.equal((await call('/private',null,'1.1.1.1',cookie)).status,200);
 now+=2*DAY;assert.equal((await call('/private',null,'1.1.1.1',cookie)).status,200);assert.equal((await(await call('/session',null,'1.1.1.1',cookie)).json()).authenticated,false);assert.equal((await call('/private',null,'1.1.1.1',cookie)).status,401);
 const second=await call('/login',good);const cookie2=second.headers.get('set-cookie').split(';')[0];now+=3*DAY;assert.equal((await call('/private',null,'1.1.1.1',cookie2)).status,401);
 for(let n=0;n<3;n++)assert.equal((await call('/login',{password:'bad'},'2.2.2.2')).status,401);assert.equal((await call('/login',good,'2.2.2.2')).status,429);
 for(let n=0;n<8;n++)await call('/login',{password:'bad'},'10.0.0.'+n);assert.equal((await call('/login',good,'3.3.3.3')).status,429);assert.equal((await call('/private',null,'3.3.3.3')).status,429);
 now+=DAY+1;assert.equal((await call('/login',good,'3.3.3.3')).status,200);assert.equal((await call('/login',good,'2.2.2.2')).status,429);now+=6*DAY;assert.equal((await call('/login',good,'2.2.2.2')).status,200);
});
test('OTP只接受HTTPS与valid:true，不把HTTP200当作正确',async()=>{
 let seen;const verify=otpVerifier({url:'https://otp.example/api/otp/verify',client:'pages',token:'secret',request:async(url,options)=>{seen=options;return new Response(JSON.stringify({valid:false}),{status:200})}});assert.equal(await verify('012345'),false);assert.equal(JSON.parse(seen.body).code,'012345');assert.equal(seen.headers['X-Client-ID'],'pages');assert.equal(await otpVerifier({url:'https://otp.example',client:'p',token:'s',request:async()=>new Response('{"valid":true}')})('012345'),true);await assert.rejects(otpVerifier({url:'http://otp.example',client:'p',token:'s'})('123456'));
});
