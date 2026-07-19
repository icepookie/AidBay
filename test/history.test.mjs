import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the interface exposes local transcript and service-card history",async()=>{
  const [html,app]=await Promise.all([readFile(new URL("../public/index.html",import.meta.url),"utf8"),readFile(new URL("../public/app.js",import.meta.url),"utf8")]);
  assert.match(html,/id="history-button"/);
  assert.match(html,/id="history-dialog"/);
  assert.match(html,/id="history-list"/);
  assert.match(app,/aidbay-chat-history-v1/);
  assert.match(app,/resultSnapshots/);
  assert.match(app,/renderChatHistory/);
});
