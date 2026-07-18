import { services } from "./_shared.mjs";

const mossConfigured=()=>Boolean(process.env.MOSS_PROJECT_ID&&process.env.MOSS_PROJECT_KEY);
const brightDataConfigured=()=>Boolean(process.env.BRIGHTDATA_API_KEY);
let mossClient;
let mossLoad;

async function getMoss({load=true}={}){
  if(!mossConfigured())return null;
  if(!mossClient){const {MossClient}=await import("@moss-dev/moss");mossClient=new MossClient(process.env.MOSS_PROJECT_ID,process.env.MOSS_PROJECT_KEY)}
  if(load&&!mossLoad)mossLoad=mossClient.loadIndex(process.env.MOSS_INDEX_NAME||"aidbay").catch(error=>{mossLoad=null;throw error});
  if(load)await mossLoad;
  return mossClient;
}

export function integrationConfig(){return {mossConfigured:mossConfigured(),brightDataConfigured:brightDataConfigured(),indexName:process.env.MOSS_INDEX_NAME||"aidbay"}}

export async function mossSearch(query,topK=5){
  const client=await getMoss();if(!client)return {used:false,reason:"credentials_missing",items:[]};
  try{const found=await client.query(process.env.MOSS_INDEX_NAME||"aidbay",query,{topK,alpha:.7});const byId=new Map(services.map(item=>[item.id,item]));return {used:true,items:(found.docs||[]).map(doc=>byId.get(doc.id)).filter(Boolean),timeTakenInMs:found.timeTakenInMs}}
  catch(error){console.error("Moss query failed",error);return {used:false,reason:"query_failed",items:[]}}
}

export async function refreshWithBrightData(){
  if(!brightDataConfigured())throw new Error("BRIGHTDATA_API_KEY is not configured");
  if(!mossConfigured())throw new Error("Moss credentials are not configured");
  const {bdclient}=await import("@brightdata/sdk");const bright=new bdclient({apiKey:process.env.BRIGHTDATA_API_KEY,webUnlockerZone:process.env.BRIGHTDATA_WEB_UNLOCKER_ZONE,logLevel:"WARN"});
  try{
    const docs=[];
    for(const service of services){
      let page="";try{page=await bright.scrapeUrl(service.source.url,{dataFormat:"markdown",country:"us",timeout:30000})}catch(error){console.error(`Bright Data refresh failed for ${service.id}`,error)}
      docs.push({id:service.id,text:[service.name,service.summary,service.address,service.usualHours,service.eligibility,service.nextAction,`Official source page refreshed by Bright Data: ${String(page||"").slice(0,12000)}`].filter(Boolean).join("\n"),metadata:{serviceId:service.id,sourceUrl:service.source.url,refreshedAt:new Date().toISOString(),refreshProvider:"bright-data"}})
    }
    const moss=await getMoss({load:false});const index=process.env.MOSS_INDEX_NAME||"aidbay";
    try{await moss.getIndex(index);await moss.addDocs(index,docs,{upsert:true})}catch(error){if(/not found|404/i.test(String(error)))await moss.createIndex(index,docs,{modelId:"moss-minilm"});else throw error}
    mossLoad=null;return {documents:docs.length,index};
  }finally{await bright.close()}
}
