import {loadEnv} from 'vite';
import {spawn} from 'node:child_process';
const env=loadEnv('production',process.cwd(),'');
if(!env.HF_TOKEN)throw new Error('Add HF_TOKEN to the ignored local .env file; do not paste it into chat.');
const child=spawn(process.env.PYTHON_EXECUTABLE||'python',['scripts/deploy-quality-space.py'],{
  env:{...process.env,HF_TOKEN:env.HF_TOKEN,NODE_EXECUTABLE:process.execPath,VERCEL_CLI_PATH:'C:/Users/Lenovo/AppData/Local/npm-cache/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js'},
  stdio:'inherit',windowsHide:true
});
child.on('exit',code=>process.exitCode=code||0);
