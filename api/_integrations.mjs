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
  try{const client=await getMoss();if(!client)return {used:false,reason:"credentials_missing",items:[]};const found=await client.query(process.env.MOSS_INDEX_NAME||"aidbay",query,{topK,alpha:.7});const byId=new Map(services.map(item=>[item.id,item]));return {used:true,items:(found.docs||[]).map(doc=>byId.get(doc.id)).filter(Boolean),timeTakenInMs:found.timeTakenInMs}}
  catch(error){console.error("Moss query failed",error);return {used:false,reason:"query_failed",items:[]}}
}

export async function refreshWithBrightData(){
  if(!brightDataConfigured())throw new Error("BRIGHTDATA_API_KEY is not configured");
  if(!mossConfigured())throw new Error("Moss credentials are not configured");
  const {bdclient}=await import("@brightdata/sdk");const bright=new bdclient({apiKey:process.env.BRIGHTDATA_API_KEY,webUnlockerZone:process.env.BRIGHTDATA_WEB_UNLOCKER_ZONE,logLevel:"WARN"});
  try{
    // Rotate ten official pages per run to keep the free/low-cost refresh bounded.
    // Every record is still upserted into Moss, even when its page is not in today's batch.
    const batchSize=Math.max(1,Math.min(Number(process.env.BRIGHTDATA_REFRESH_BATCH_SIZE||10),services.length));
    const day=Math.floor(Date.now()/86400000),start=(day*batchSize)%services.length;
    const refreshIds=new Set(Array.from({length:batchSize},(_,i)=>services[(start+i)%services.length].id));
    const scraped=new Map();
    await Promise.all(services.filter(s=>refreshIds.has(s.id)).map(async service=>{
      try{const page=await bright.scrapeUrl(service.source.url,{dataFormat:"markdown",country:"us",timeout:20000});scraped.set(service.id,String(page||"").slice(0,12000))}
      catch(error){console.error(`Bright Data refresh failed for ${service.id}`,error)}
    }));
    const refreshedAt=new Date().toISOString();
    const docs=services.map(service=>({id:service.id,text:[service.name,service.summary,`Needs: ${service.needs.join(", ")}`,`Populations: ${service.populations.join(", ")}`,service.address,service.usualHours,service.eligibility,service.why,service.nextAction,scraped.has(service.id)?`Official source page refreshed by Bright Data: ${scraped.get(service.id)}`:"Official source page not in this rotation; verify before relying on availability."].filter(Boolean).join("\n"),metadata:{serviceId:service.id,sourceUrl:service.source.url,refreshedAt,refreshProvider:scraped.has(service.id)?"bright-data":"curated-fallback"}}));
    const moss=await getMoss({load:false});const index=process.env.MOSS_INDEX_NAME||"aidbay";
    try{await moss.getIndex(index);await moss.addDocs(index,docs,{upsert:true})}catch(error){if(/not found|404/i.test(String(error)))await moss.createIndex(index,docs,{modelId:"moss-minilm"});else throw error}
    mossLoad=null;return {documents:docs.length,brightDataPagesAttempted:batchSize,brightDataPagesRefreshed:scraped.size,index};
  }finally{await bright.close()}
}
