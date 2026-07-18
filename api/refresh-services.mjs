import {send} from "./_shared.mjs";import {refreshWithBrightData} from "./_integrations.mjs";
export const config={maxDuration:60};
export default async function handler(req,res){const secret=process.env.CRON_SECRET;if(secret&&req.headers.authorization!==`Bearer ${secret}`)return send(res,401,{error:"Unauthorized"});try{return send(res,200,{ok:true,...await refreshWithBrightData()})}catch(error){console.error(error);return send(res,500,{ok:false,error:error.message})}}
