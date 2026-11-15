import fs from 'node:fs';
import path from 'node:path';

const destination=path.resolve('artifacts/quality/railway-service');
fs.mkdirSync(destination,{recursive:true});
const files={
  'services/quality/Dockerfile':'Dockerfile',
  'services/quality/railway.json':'railway.json',
  'services/quality/infer.py':'services/quality/infer.py',
  'services/quality/requirements.txt':'services/quality/requirements.txt',
  'yolo_best_weights/detector_yolo26s_best.pt':'yolo_best_weights/detector_yolo26s_best.pt',
  'yolo_best_weights/ripeness_yolo26s-cls_best.pt':'yolo_best_weights/ripeness_yolo26s-cls_best.pt'
};
for(const [source,name] of Object.entries(files)){
  const target=path.join(destination,name);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(source,target);
}
const configPath=path.resolve('artifacts/quality/railway-inference-secret.json');
if(!fs.existsSync(configPath)){
  const {randomBytes}=await import('node:crypto');
  fs.writeFileSync(configPath,JSON.stringify({token:randomBytes(48).toString('hex')}));
}
console.log('Prepared isolated Railway build context:',destination);
console.log('Includes inference code and tomato weights only; the service secret remains outside the upload directory.');
