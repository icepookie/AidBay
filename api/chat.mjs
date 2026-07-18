import {chat,send} from "./_shared.mjs";
export default function handler(req,res){if(req.method!=="POST")return send(res,405,{error:"Method not allowed"});return send(res,200,chat(req.body||{}))}
