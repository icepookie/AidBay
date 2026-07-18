import test from "node:test";import assert from "node:assert/strict";
import chatHandler from "../api/chat.mjs";
function response(){return {code:0,headers:{},payload:null,status(value){this.code=value;return this},setHeader(k,v){this.headers[k]=v;return this},json(value){this.payload=value;return this}}}
test("Vercel chat function returns qualified results",async()=>{const res=response();await chatHandler({method:"POST",body:{message:"A woman near 7th and Howard needs shelter tonight"}},res);assert.equal(res.code,200);assert.equal(res.payload.results.length,3);assert.equal(res.payload.retrieval.provider,"curated-fallback")});
test("Vercel chat function waits for missing answers",async()=>{const res=response();await chatHandler({method:"POST",body:{message:"I need shelter tonight"}},res);assert.equal(res.payload.results.length,0);assert.ok(res.payload.missing.length)});
