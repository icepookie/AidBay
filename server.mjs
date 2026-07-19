import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { services } from "./data/services.mjs";
export { services };

const needPatterns={shelter:/shelter|bed|sleep|safe tonight/,food:/food|meal|pantry|hungry|grocer/,health:/medical|doctor|clinic|health|pregnan|dental|reproductive/,recovery:/drug|recovery|methadone|opioid|substance|detox|treatment/,"mental-health":/mental|psychiatr|crisis|counsel/,hygiene:/shower|laundry|hygiene|clothes|clothing/,benefits:/benefit|calfresh|medi-cal|cash aid|ssi|disability/,legal:/legal|lawyer|evict|tenant|id\b/,housing:/housing|long.?term|rent|evict/};
function requestedNeeds(m){return Object.entries(needPatterns).filter(([,p])=>p.test(m)).map(([n])=>n)}
export function choose(message){
 const m=message.toLowerCase(),needs=requestedNeeds(m);if(!needs.length)needs.push("shelter");
 const audience=/family|children|child|kids/.test(m)?"family":/youth|young person|teen/.test(m)?"youth":/women|woman|female/.test(m)?"woman":/trans|nonbinary|gender.nonconforming/.test(m)?"trans":/senior|older adult|elder/.test(m)?"senior":/disab/.test(m)?"disabled":/\badult\b/.test(m)?"adult":null;
 return services.filter(item=>item.needs.some(n=>needs.includes(n))).filter(item=>{
   const restricted=item.populations.filter(p=>!["all","adult"].includes(p));
   if(!restricted.length)return true;if(!audience)return false;
   return item.populations.includes(audience)||(audience==="woman"&&item.populations.includes("all"));
 }).map((item,index)=>({item,score:(item.needs.includes(needs[0])?10:0)+(audience&&item.populations.includes(audience)?5:0)+(needs[0]==="hygiene"&&/shower|laundry|hygiene/i.test(item.summary)?3:0)+(item.availability.state==="accepting"?1:0)-index/1000})).sort((a,b)=>b.score-a.score).slice(0,3).map(x=>x.item)
}
export function understanding(message,prior={}){const namedArea=message.match(/\b(?:downtown(?: san francisco)?|tenderloin|soma|south of market|mission(?: district)?|civic center|bayview|haight|castro|sunset|richmond|san francisco|sf)\b/i)?.[0];const located=message.match(/(?:near|at|around|corner of)\s+([^,.]+)/i)?.[1];const location=located||(namedArea?.toLowerCase()==="sf"?"San Francisco":namedArea);const audience=/woman|female/i.test(message)?"adult woman":/man|male/i.test(message)?"adult man":/family|children|child|kids/i.test(message)?"family with children":/youth|teen|young person/i.test(message)?"young person":/\badult\b/i.test(message)?"adult":prior.audience;const need=/shower|laundry|hygiene|clothes|clothing/i.test(message)?"showers or hygiene":/food|meal|hungry|pantry/i.test(message)?"food":/drug|recovery|substance|methadone|detox/i.test(message)?"recovery support":/doctor|clinic|medical|health care|healthcare/i.test(message)?"health care":/mental health|counsel|therapy|psychiatr/i.test(message)?"mental health support":/benefit|calfresh|id card|identification/i.test(message)?"benefits or identification":/legal|lawyer|attorney/i.test(message)?"legal help":/housing|rental assistance|eviction/i.test(message)?"housing support":/shelter|bed|safe|sleep/i.test(message)?"shelter or safety":prior.need;return {...prior,need,location:location||prior.location,timing:/tonight|today|now|urgent|right away|immediately/i.test(message)?"needed now":/tomorrow|later|planning|ahead/i.test(message)?"planning ahead":prior.timing,audience}}
function json(res,status,data){res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(data))}
async function body(req){let text="";for await(const chunk of req)text+=chunk;return text?JSON.parse(text):{}}

export function createServer(){return http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,"http://localhost");
 if(req.method==="GET"&&url.pathname==="/api/services")return json(res,200,services);
 if(req.method==="GET"&&url.pathname==="/api/integrations")return json(res,200,{moss:"index-ready",brightData:"curation pipeline-ready",conversation:"ElevenLabs agent"});
 if(req.method==="GET"&&url.pathname==="/api/elevenlabs-token"){
   const headers=process.env.ELEVENLABS_API_KEY?{"xi-api-key":process.env.ELEVENLABS_API_KEY}:{};
   const agent=process.env.ELEVENLABS_AGENT_ID||"agent_5301kxvj22yrezs9qa5evw01hnfe";const params=new URLSearchParams({agent_id:agent});if(process.env.ELEVENLABS_BRANCH_ID)params.set("branch_id",process.env.ELEVENLABS_BRANCH_ID);
   const [tokenResponse,signedResponse]=await Promise.all([fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?${params}`,{headers}),fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?${params}`,{headers})]);
   if(!tokenResponse.ok&&!signedResponse.ok)return json(res,tokenResponse.status||signedResponse.status,{error:"ElevenLabs voice credentials unavailable"});
   const tokenData=tokenResponse.ok?await tokenResponse.json():{},signedData=signedResponse.ok?await signedResponse.json():{};return json(res,200,{conversationToken:tokenData.token||tokenData.conversation_token||null,signedUrl:signedData.signed_url||signedData.signedUrl||null});
 }
 if(req.method==="POST"&&url.pathname==="/api/chat"){const data=await body(req);const u=understanding(data.message||"",data.state?.understanding||{});const missing=[];if(!u.need)missing.push("what kind of help is needed");if(!u.location)missing.push("current neighborhood or area");if(u.need==="shelter or safety"&&!u.audience)missing.push("whether this is for an adult, family with children, or youth");if(!u.timing)missing.push("whether this is needed now or planned ahead");const results=missing.length?[]:choose(`${u.need} ${u.audience||""} ${data.message||""}`);const question=missing[0]==="current neighborhood or area"?"What neighborhood or area are you in right now?":missing[0]?.includes("adult")?"Is this for an adult, a family with children, or a young person?":missing[0]?.includes("now")?"Do you need this right now, or are you planning ahead?":"What kind of help are you looking for today?";return json(res,200,{reply:missing.length?question:`I found ${results.length} direct service option${results.length===1?"":"s"}. I’ll show what is known and what still needs confirmation.`,missing,results,state:{stage:missing.length?"qualifying":"results",understanding:u}})}
 if(req.method==="POST"&&url.pathname==="/api/observations"){return json(res,201,{ok:true})}
 if(req.method==="POST"&&url.pathname==="/api/tts"){res.writeHead(503);return res.end()}
 const path=url.pathname==="/"?"index.html":normalize(url.pathname).replace(/^\/+/,"");
 const file=join(process.cwd(),"public",path);if(!file.startsWith(join(process.cwd(),"public"))){res.writeHead(403);return res.end()}
 const content=await readFile(file);const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};res.writeHead(200,{"content-type":types[extname(file)]||"application/octet-stream"});res.end(content)
 }catch(error){if(error.code==="ENOENT"){res.writeHead(404);res.end("Not found")}else{console.error(error);json(res,500,{error:"Server error"})}}})}
if(import.meta.url===`file://${process.argv[1]}`){const port=Number(process.env.PORT||4173);createServer().listen(port,()=>console.log(`AidBay running at http://127.0.0.1:${port}`))}
