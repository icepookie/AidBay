import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

export const services = [
 {id:"community-forward-awp",name:"A Woman’s Place",summary:"Women’s shelter and support",address:"211 13th Street, San Francisco",phone:"(415) 487-2140",email:"",usualHours:"Call 24/7 for current intake",eligibility:"Adult women; eligibility and space must be confirmed",why:"A direct women-focused shelter option with crisis support.",nextAction:"Call before traveling to ask about intake and space.",warning:"Availability changes quickly.",source:{url:"https://communityforwardsf.org/"},availability:{state:"call_required",observedAt:null},availabilityLabel:"Call to confirm"},
 {id:"sf-safehouse",name:"San Francisco SafeHouse",summary:"Women’s emergency shelter",address:"Confidential location, San Francisco",phone:"(415) 643-7861",email:"",usualHours:"Call for intake hours",eligibility:"Women experiencing homelessness and sexual exploitation; screening required",why:"Offers women-centered emergency shelter and longer-term support.",nextAction:"Call the intake line and confirm fit and availability.",warning:"Location and placement are confidential.",source:{url:"https://www.sfsafehouse.org/"},availability:{state:"call_required",observedAt:null},availabilityLabel:"Call to confirm"},
 {id:"la-casa",name:"La Casa de las Madres",summary:"Domestic violence shelter",address:"Confidential location, San Francisco",phone:"(877) 503-1850",email:"",usualHours:"24-hour crisis line",eligibility:"People experiencing domestic violence; confidential screening",why:"A direct crisis and shelter option when safety from abuse is part of the need.",nextAction:"Call the 24-hour crisis line.",warning:"Do not travel without speaking to the program.",source:{url:"https://www.lacasa.org/"},availability:{state:"call_required",observedAt:null},availabilityLabel:"24-hour call line"},
 {id:"glide",name:"GLIDE Daily Free Meals",summary:"Free meals and support",address:"330 Ellis Street, San Francisco",phone:"(415) 674-6000",email:"info@glide.org",usualHours:"Daily meal service; confirm today’s times",eligibility:"Low-barrier community service",why:"Provides a direct, low-barrier food option in the Tenderloin.",nextAction:"Check today’s meal hours or call.",warning:"Hours can change on holidays.",source:{url:"https://www.glide.org/"},availability:{state:"accepting",observedAt:null},availabilityLabel:"Service regularly offered; verify hours"},
 {id:"bhac",name:"Behavioral Health Access Center",summary:"Recovery and treatment access",address:"1380 Howard Street, San Francisco",phone:"(415) 503-4730",email:"",usualHours:"Call to confirm same-day hours",eligibility:"San Francisco adults seeking mental health or substance-use care",why:"A direct starting point for assessment, treatment access, and medication support.",nextAction:"Call or visit during intake hours.",warning:"Program placement depends on assessment and capacity.",source:{url:"https://www.sf.gov/location/behavioral-health-access-center"},availability:{state:"call_required",observedAt:null},availabilityLabel:"Same-day access varies"}
];

function choose(message){const m=message.toLowerCase();if(/food|meal|pantry|hungry/.test(m))return services.filter(s=>s.id==="glide");if(/drug|recovery|methadone|substance|mental/.test(m))return services.filter(s=>s.id==="bhac");if(/women|woman|female|shelter|bed|safe tonight/.test(m))return services.slice(0,3);return services.slice(0,3)}
function understanding(message){const location=message.match(/(?:near|at|corner of)\s+([^,.]+)/i)?.[1];return {need:/food|meal|hungry/i.test(message)?"food":/drug|recovery|substance/i.test(message)?"recovery support":"shelter or safety",location:location||"San Francisco (please correct if needed)",timing:/tonight|now|urgent/i.test(message)?"needed now":"not yet confirmed"}}
function json(res,status,data){res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(data))}
async function body(req){let text="";for await(const chunk of req)text+=chunk;return text?JSON.parse(text):{}}

export function createServer(){return http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,"http://localhost");
 if(req.method==="GET"&&url.pathname==="/api/services")return json(res,200,services);
 if(req.method==="GET"&&url.pathname==="/api/integrations")return json(res,200,{moss:"index-ready",brightData:"curation pipeline-ready",conversation:"ElevenLabs agent"});
 if(req.method==="GET"&&url.pathname==="/api/elevenlabs-token"){
   const headers=process.env.ELEVENLABS_API_KEY?{"xi-api-key":process.env.ELEVENLABS_API_KEY}:{};
   const upstream=await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${process.env.ELEVENLABS_AGENT_ID||"agent_5301kxvj22yrezs9qa5evw01hnfe"}`,{headers});
   if(!upstream.ok)return json(res,upstream.status,{error:"ElevenLabs agent token unavailable"});
   const data=await upstream.json();return json(res,200,{conversationToken:data.token||data.conversation_token});
 }
 if(req.method==="POST"&&url.pathname==="/api/chat"){const data=await body(req);const results=choose(data.message||"");return json(res,200,{reply:results.length?`I found ${results.length} direct service option${results.length===1?"":"s"}. I’ll show what is known and what still needs to be confirmed.`:"I need one more detail to narrow this down.",results,state:{stage:"results",understanding:understanding(data.message||"")}})}
 if(req.method==="POST"&&url.pathname==="/api/observations"){return json(res,201,{ok:true})}
 if(req.method==="POST"&&url.pathname==="/api/tts"){res.writeHead(503);return res.end()}
 const path=url.pathname==="/"?"index.html":normalize(url.pathname).replace(/^\/+/,"");
 const file=join(process.cwd(),"public",path);if(!file.startsWith(join(process.cwd(),"public"))){res.writeHead(403);return res.end()}
 const content=await readFile(file);const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};res.writeHead(200,{"content-type":types[extname(file)]||"application/octet-stream"});res.end(content)
 }catch(error){if(error.code==="ENOENT"){res.writeHead(404);res.end("Not found")}else{console.error(error);json(res,500,{error:"Server error"})}}})}
if(import.meta.url===`file://${process.argv[1]}`){const port=Number(process.env.PORT||4173);createServer().listen(port,()=>console.log(`AidBay running at http://127.0.0.1:${port}`))}
