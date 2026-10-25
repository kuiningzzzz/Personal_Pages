import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createActivityGeolocation, locationOptions} from '../../src/lib/activity-geolocation.js';

const position={coords:{latitude:30,longitude:120,accuracy:100,altitude:12,speed:2,heading:90},timestamp:1234};
const service=options=>createActivityGeolocation({secureContext:true,confirm:async()=>true,...options});

test('活动定位必须先由主站确认，只返回经纬度、精度和时间',async()=>{
  let allow,called=0,confirmations=0,received;
  const geo=service({confirm:()=>{confirmations++;return new Promise(resolve=>{allow=resolve;});},geolocation:{getCurrentPosition(ok,error,options){called++;received=options;ok(position);}}});
  const a=geo.getCurrentPosition({enableHighAccuracy:true,timeout:999999,maximumAge:999999});
  const b=geo.getCurrentPosition();
  assert.equal(called,0);assert.equal(confirmations,1);
  allow(true);
  const result=await a;assert.deepEqual(await b,result);
  assert.deepEqual(result,{coords:{latitude:30,longitude:120,accuracy:100},timestamp:1234});
  assert.deepEqual(received,{enableHighAccuracy:true,timeout:20000,maximumAge:300000});
  await geo.getCurrentPosition();assert.equal(called,2);assert.equal(confirmations,1);
  geo.dispose();
});

test('拒绝、HTTPS 不满足或父页面策略禁止时，不调用设备定位',async()=>{
  let called=0;
  const geolocation={getCurrentPosition(){called++;}};
  for(const options of [{confirm:async()=>false},{secureContext:false},{allowsFeature:()=>false}]){
    const geo=service({geolocation,...options});
    await assert.rejects(geo.getCurrentPosition(),{code:1,status:403});geo.dispose();
  }
  assert.equal(called,0);
  const unsupported=service({geolocation:null});
  await assert.rejects(unsupported.getCurrentPosition(),{code:2,status:501});unsupported.dispose();
});

test('主站定位错误保留拒绝、超时和不可用的区别',async()=>{
  for(const [code,status] of [[1,403],[2,503],[3,408]]){
    const geo=service({geolocation:{getCurrentPosition(ok,fail){fail({code});}}});
    await assert.rejects(geo.getCurrentPosition(),{code,status});geo.dispose();
  }
});

test('活动切换后取消旧请求，忽略迟到的位置并重新确认新页面',async()=>{
  let late,confirmations=0;
  const geo=service({confirm:async()=>{confirmations++;return true;},geolocation:{getCurrentPosition(ok){late=ok;}}});
  const first=geo.getCurrentPosition();await Promise.resolve();await Promise.resolve();
  geo.reset();await assert.rejects(first,{status:499});late?.(position);
  const second=geo.getCurrentPosition();await Promise.resolve();await Promise.resolve();
  assert.equal(confirmations,2);geo.dispose();await assert.rejects(second,{status:499});
});

test('设备未回调时也会超时；不接受无效坐标',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const geo=service({geolocation:{getCurrentPosition(){}}});
  const pending=geo.getCurrentPosition({timeout:1000});
  await Promise.resolve();await Promise.resolve();
  const rejected=assert.rejects(pending,{code:3,status:408});t.mock.timers.tick(1000);await rejected;geo.dispose();
  t.mock.timers.reset();
  const bad=service({geolocation:{getCurrentPosition(ok){ok({coords:{latitude:NaN,longitude:120,accuracy:10}});}}});
  await assert.rejects(bad.getCurrentPosition(),{code:2});bad.dispose();
});

test('定位选项限制时长并接受空值',()=>{
  assert.deepEqual(locationOptions(null),{enableHighAccuracy:false,timeout:15000,maximumAge:60000});
  assert.deepEqual(locationOptions({timeout:-2,maximumAge:-1}),{enableHighAccuracy:false,timeout:1000,maximumAge:0});
});

test('SDK 通过 MessageChannel 代理定位并透传定位错误码',async()=>{
  let listener,denied=false;const sent=[];
  const parent={postMessage(){}},port={start(){},postMessage(message){sent.push(message);queueMicrotask(()=>port.onmessage({data:denied?{id:message.id,error:'未获允许',code:1,status:403}:{id:message.id,data:{coords:{latitude:30,longitude:120,accuracy:100},timestamp:1234}}}));}};
  const window={parent,addEventListener(type,fn){if(type==='message')listener=fn;}};
  vm.runInNewContext(await readFile(new URL('../activities/sdk.js',import.meta.url),'utf8'),{window,setTimeout,clearTimeout,console,Headers,Response,Blob,FormData,URLSearchParams});
  listener({source:parent,data:{type:'PP_ACTIVITY_CONNECT',runtime:{},theme:'light'},ports:[port]});
  const result=await window.ActivitySDK.geolocation.getCurrentPosition({timeout:1000});
  assert.equal(result.coords.latitude,30);assert.equal(sent[0].method,'geolocation.getCurrentPosition');assert.equal(sent[0].args.options.timeout,1000);
  denied=true;await assert.rejects(window.ActivitySDK.geolocation.getCurrentPosition(),{code:1,status:403});
});

