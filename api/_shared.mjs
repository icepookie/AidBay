import { services, choose, understanding } from "../server.mjs";

export { services };
export function send(res,status,data){res.status(status).setHeader("cache-control","no-store").json(data)}
export function chat(data={}){
  const u=understanding(data.message||"",data.state?.understanding||{});
  const missing=[];
  if(!u.need)missing.push("what kind of help is needed");
  if(!u.location)missing.push("current neighborhood or area");
  if(u.need==="shelter or safety"&&!u.audience)missing.push("whether this is for an adult, family with children, or youth");
  if(!u.timing)missing.push("whether this is needed now or planned ahead");
  const results=missing.length?[]:choose(`${u.need} ${u.audience||""} ${data.message||""}`);
  const question=missing[0]==="current neighborhood or area"?"What neighborhood or area are you in right now?":missing[0]?.includes("adult")?"Is this for an adult, a family with children, or a young person?":missing[0]?.includes("now")?"Do you need this right now, or are you planning ahead?":"What kind of help are you looking for today?";
  return {reply:missing.length?question:`I found ${results.length} direct service option${results.length===1?"":"s"}. I’ll show what is known and what still needs confirmation.`,missing,results,state:{stage:missing.length?"qualifying":"results",understanding:u}};
}
