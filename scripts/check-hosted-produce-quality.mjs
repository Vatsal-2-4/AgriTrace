/** Isolated production smoke test; removes every record it creates. No CEDA calls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {loadEnv} from 'vite';
import mongoose from 'mongoose';
import User from '../api/_models/User.js';
import ProduceLot from '../api/_models/ProduceLot.js';
import ProduceImage from '../api/_models/ProduceImage.js';
import MarketIntelligence from '../api/_models/MarketIntelligence.js';
const env=loadEnv('production',process.cwd(),'');
const base=process.env.QUALITY_TEST_BASE_URL||'https://agritrace-eosin.vercel.app';
const marker='HOSTED-QUALITY-TEST-'+randomUUID();
const actors=['FARMER','FARMER','QUALITY_INSPECTOR'].map((role,index)=>({_id:new mongoose.Types.ObjectId(),name:marker,email:`${marker.toLowerCase()}-${index}@example.test`,mobile:`${marker}-${index}`,role,password:randomBytes(24).toString('hex')}));
const sellerId=String(actors[0]._id);
async function request(path,token,body,method='POST'){
 const response=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(110000)});
 return {status:response.status,body:response.headers.get('content-type')?.includes('application/json')?await response.json():await response.arrayBuffer()};
}
try{
 await mongoose.connect(env.MONGO_URI);
 await User.insertMany(actors);
 const tokens=[];
 for(const actor of actors){const login=await request('/api/login',null,{identifier:actor.email,password:actor.password});assert.equal(login.status,200);assert.ok(login.body.accessToken);tokens.push(login.body.accessToken)}
 const [seller,other,inspector]=tokens;
 const upload=await request('/api/produce-quality',seller,{action:'analyze',cropId:'TOMATO',imageData:'data:image/jpeg;base64,'+fs.readFileSync('artifacts/quality/tomato.jpg').toString('base64')});
 assert.equal(upload.status,201,JSON.stringify(upload));
 const photo=upload.body.data;
 assert.equal(photo.result.status,'ESTIMATED');assert.ok(photo.result.samples.length>0);
 const create={cropId:'TOMATO',cropName:marker,quantity:1,unit:'kg',location:{district:'TEST ONLY',state:'Rajasthan'},askingPrice:1,priceUnit:'INR/kg',imageRefs:[photo.imageRef],qualityAssessmentIds:[photo.assessmentId]};
 assert.equal((await request('/api/market/lots',other,create)).status,400);
 const lot=await request('/api/market/lots',seller,create);assert.equal(lot.status,201,JSON.stringify(lot));
 const imageUrl='/api/produce-quality?image='+photo.imageRef.split('/').at(-1);
 assert.equal((await request(imageUrl,other,undefined,'GET')).status,404);
 const image=await request(imageUrl,inspector,undefined,'GET');assert.equal(image.status,200);assert.equal(new Uint8Array(image.body)[0],255);
 const queue=await request('/api/produce-quality?action=queue',inspector,undefined,'GET');assert.ok(queue.body.data.items.some(item=>item.lotId===lot.body.data.lotId));
 const path='/api/market/quality-assessments/'+photo.assessmentId+'/verification';
 const verification={verifiedGrade:'A',decision:'CORRECTED',photosReviewed:true,notes:'Isolated deployment test of photo-review recording, not a commercial inspection.'};
 assert.equal((await request(path,seller,verification,'PATCH')).status,403);
 const verified=await request(path,inspector,verification,'PATCH');assert.equal(verified.status,200,JSON.stringify(verified));assert.deepEqual(verified.body.data.result,photo.result);
 assert.equal((await request(path,inspector,verification,'PATCH')).status,409);
 console.log('PASS: production Vercel -> Railway YOLO -> stored photo -> lot -> private inspector image -> manual review. Ownership, authorization, original AI result and duplicate protection passed.');
}finally{
 if(mongoose.connection.readyState){
  await ProduceLot.deleteMany({sellerId});await ProduceImage.deleteMany({ownerId:sellerId});await MarketIntelligence.deleteMany({evaluatorId:sellerId});await User.deleteMany({_id:{$in:actors.map(a=>a._id)},name:marker});await mongoose.disconnect();
  console.log('Removed the isolated deployment-test users, lot, photo and assessment.');
 }
}
