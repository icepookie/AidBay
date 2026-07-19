import { Conversation } from "./eleven-agent-client.js";

const ELEVEN_AGENT_ID = "agent_5301kxvj22yrezs9qa5evw01hnfe";
const ELEVEN_BRANCH_ID = "agtbrch_5701kxvj24the9ctdjvx2nyxngzw";

const stateTitle = document.querySelector("#state-title");
const statePrompt = document.querySelector("#state-prompt");
const orb = document.querySelector("#orb");
const liveCaption = document.querySelector("#live-caption");
const captionLabel = document.querySelector("#caption-label");
const transcript = document.querySelector("#transcript");
const results = document.querySelector("#results");
const flowStage = document.querySelector("#flow-stage");
const companionStep = document.querySelector("#companion-step");
const voiceHeader = document.querySelector(".voice-header");
const orbStage = document.querySelector(".orb-stage");
const captionCard = document.querySelector(".caption-card");
const notice = document.querySelector("#notice");
const voiceControls = document.querySelector(".voice-controls");
const hotResource = document.querySelector("#hot-resource");
const orbHint = document.querySelector("#orb-hint");
const readyComposer = document.querySelector("#ready-composer");
const readyKeyboard = document.querySelector("#ready-keyboard");
const readySend = document.querySelector("#ready-send");
const readyMic = document.querySelector("#ready-mic");
const voiceShell = document.querySelector(".voice-shell");
const understanding = document.querySelector("#understanding");
const understandingFields = document.querySelector("#understanding-fields");
const correctUnderstanding = document.querySelector("#correct-understanding");
const voiceToggle = document.querySelector("#voice-toggle");
const voiceLabel = document.querySelector("#voice-label");
const keyboard = document.querySelector("#keyboard");
const conversationSend = document.querySelector("#conversation-send");
const endConversation = document.querySelector("#end-conversation");
const help = document.querySelector("#help");
const textDialog = document.querySelector("#text-dialog");
const helpDialog = document.querySelector("#help-dialog");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#message");
const closeText = document.querySelector("#close-text");
const closeHelp = document.querySelector("#close-help");
const reset = document.querySelector("#reset");
const clearTranscript = document.querySelector("#clear-transcript");
const voiceSupport = document.querySelector("#voice-support");
const testAudio = document.querySelector("#test-audio");
const audioStatus = document.querySelector("#audio-status");
const integrationSummary = document.querySelector("#integration-summary");
const serviceSelect = document.querySelector("#service-select");
const sourceSelect = document.querySelector("#source-select");
const stateSelect = document.querySelector("#state-select");
const simulate = document.querySelector("#simulate");
const simResult = document.querySelector("#sim-result");

let conversationState = { stage: "new" };
let voiceSessionActive = false;
let recognitionRunning = false;
let agentSpeaking = false;
let waitingForResponse = false;
let transcriptEntries = [];
let currentUtterance = null;
let availableVoices = [];
let audioTestActive = false;
let audioContext = null;
let currentAudioSource = null;
let latestResults = [];
let lastUserMessage = "";
let activeService = null;
let pendingResultsAfterSpeech = false;
let interimCommitTimer = null;
let recognitionSubmitted = false;
let feedbackRating = 0;
let pendingCompletionUI = null;
let responseWaitTimer = null;
let awaitingUserResponse = false;
let lastRenderedResultSignature = "";
let expectedMissing = [];
let lastAssistantMessage = "";
let elevenConversation = null;
let elevenAgentConnected = false;
let elevenConnecting = false;
let micPaused = false;
let callLeftPage = false;
let localSyncPromise = Promise.resolve();
function requestElevenToken() { return fetch("/api/elevenlabs-token", { cache: "no-store" }).then(async (response) => {
  if (!response.ok) throw new Error("Could not obtain ElevenLabs conversation token");
  return response.json();
}); }
// Voice credentials are short-lived and may be single-use. Request them only
// from the user's tap so a prefetched token can never be stale at startup.
let elevenTokenPromise = null;

function refreshVoices() {
  if (!("speechSynthesis" in window)) return;
  availableVoices = speechSynthesis.getVoices();
}
refreshVoices();
if ("speechSynthesis" in window) speechSynthesis.addEventListener("voiceschanged", refreshVoices);

function setVisualState(mode, title, prompt) {
  orb.className = `orb ${mode}`;
  voiceShell.classList.toggle("is-listening", mode === "listening");
  voiceShell.classList.toggle("is-speaking", mode === "speaking");
  stateTitle.textContent = title;
  statePrompt.textContent = prompt;
  captionLabel.textContent = mode === "listening" ? "LIVE CAPTIONS · LISTENING" : "CONVERSATION CAPTIONS";
}

function appendTranscript(role, text) {
  text = String(text || "").replace(/\[(?:patiently|warmly|gently|calmly|kindly|empathetically|reassuringly|supportively)\]\s*/gi, "").trim();
  if (!text) return;
  if (/^[.·…\s-]+$/.test(text)) return;
  if (role === "assistant" && /\b(?:are you still there|if you(?:'re| are) still there|please let me know if you need assistance)\b/i.test(text)) return;
  if (role === "assistant" && /^(?:hi|hello)(?: there)?[!.]?\s*(?:how (?:can|may) i help|what can i)/i.test(text)) return;
  const previous = transcriptEntries.at(-1);
  if (previous?.role === role && previous.text.toLowerCase() === text.toLowerCase()) return;
  transcriptEntries.push({ role, text });
  transcriptEntries = transcriptEntries.slice(-60);
  const line = document.createElement("p");
  line.className = `transcript-line ${role}`;
  const name = document.createElement("strong");
  name.textContent = role === "user" ? "You: " : "AidBay: ";
  line.append(name, document.createTextNode(text));
  transcript.append(line);
  liveCaption.hidden = true;
  while (transcript.children.length > 60) transcript.firstElementChild?.remove();
  transcript.scrollTop = transcript.scrollHeight;
}

function normalizedWords(value){return String(value||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(Boolean)}
function looksLikeEcho(message){const words=normalizedWords(message),prior=new Set(normalizedWords(lastAssistantMessage));return words.length>3&&words.filter(word=>prior.has(word)).length/words.length>.72}
function isExpectedAnswer(message){
  if (/\b(?:i'm sorry|didn't quite catch|rephrase your question|like, i mean, do you have something to show)\b/i.test(message)||looksLikeEcho(message)) return false;
  if (!expectedMissing.length) return true;
  const missing=expectedMissing[0];
  if (missing.includes("neighborhood")) return /\b(?:san francisco|downtown|tenderloin|soma|mission|civic center|bayview|haight|castro|sunset|richmond|street|st\.?|avenue|ave\.?|near|at|around|corner)\b/i.test(message);
  if (missing.includes("adult")) return /\b(?:adult|woman|female|man|male|family|child|children|kid|youth|teen)\b/i.test(message);
  if (missing.includes("now")) return /\b(?:now|tonight|today|urgent|right away|later|tomorrow|planning|ahead)\b/i.test(message);
  return /\b(?:shelter|bed|food|meal|health|doctor|recovery|drug|legal|shower|help)\b/i.test(message);
}

function stopRecognition() {
  clearTimeout(interimCommitTimer);
  if (recognition && recognitionRunning) {
    try { recognition.stop(); } catch { /* already stopping */ }
  }
}

function startRecognition() {
  if (!recognition || !voiceSessionActive || recognitionRunning || agentSpeaking || waitingForResponse) return;
  recognitionSubmitted = false;
  try { recognition.start(); } catch { /* browser may still be ending its previous session */ }
}

function finishSpeaking() {
  agentSpeaking = false;
  currentAudioSource = null;
  currentUtterance = null;
  if (pendingResultsAfterSpeech) {
    pendingResultsAfterSpeech = false;
    showServiceList(latestResults);
    if (voiceSessionActive) setTimeout(startRecognition, 250);
    return;
  }
  if (audioTestActive) {
    audioTestActive = false;
    voiceSessionActive = false;
    voiceLabel.textContent = "Start conversation";
    voiceToggle.classList.remove("active");
    setVisualState("ready", "Ready when you are", "Tap start and tell me what kind of help is needed.");
  } else if (voiceSessionActive) {
    setVisualState("listening", "I’m listening…", "Continue speaking when you’re ready.");
    setTimeout(startRecognition, 250);
  }
}

function setMainConversationVisible(visible) {
  voiceHeader.hidden = !visible;
  orbStage.hidden = !visible;
  flowStage.hidden = visible;
}

function showFlow(html, step) {
  voiceShell.classList.add("conversation-active");
  flowStage.hidden = false;
  companionStep.textContent = step;
  flowStage.innerHTML = html;
  flowStage.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function setConversationStarted(started) {
  voiceShell.classList.toggle("conversation-active", started);
  voiceHeader.hidden = started;
  orbStage.hidden = started;
  captionCard.hidden = !started;
  notice.hidden = !started;
  hotResource.hidden = !started;
  voiceControls.hidden = !started;
  orbHint.hidden = started;
  readyComposer.hidden = started;
  if (!started) flowStage.hidden = true;
}

function showProcessing(message) {
  showFlow(`
    <article class="spoken-card"><p class="flow-kicker"><span class="status-dot"></span> You spoke</p><blockquote></blockquote></article>
    <div class="processing-center"><div class="wave-bars" aria-hidden="true">${"<i></i>".repeat(12)}</div><h2>Searching nearby services…</h2><p>Checking fit, access details, and current evidence</p></div>
    <div class="flow-footer"><span>Processing voice input</span><button class="soft-danger" data-action="cancel">Cancel</button></div>`, "Hearing and understanding");
  flowStage.querySelector("blockquote").textContent = `“${message}”`;
}

function summaryFor(items) {
  if (!items.length) return "I couldn’t find a suitable verified service in the current prototype.";
  return `I found ${items.length} possible next steps. ${items[0].name} appears to be the closest match. I still need you to confirm current availability and eligibility before traveling.`;
}

function showSpokenSummary(items) {
  const summary = summaryFor(items);
  showFlow(`
    <div class="speaking-label"><span class="sound-mark filled">◖))</span><div><strong>AidBay Companion</strong><small>Speaking response aloud…</small></div></div>
    <article class="spoken-card response"><blockquote></blockquote><div class="mini-wave">${"<i></i>".repeat(14)}</div></article>
    <div class="suggestions"><p>Or say one of these:</p><button data-action="results">“Show options”</button><button data-action="details">“More details”</button><button data-action="next">“Next option”</button></div>
    <div class="flow-footer"><span>Listening for voice response</span><span class="listening-pill">● Listening</span></div>`, "Sharing what I found");
  flowStage.querySelector("blockquote").textContent = `“${summary}”`;
  pendingResultsAfterSpeech = voiceSessionActive;
  if (voiceSessionActive) speakAndResume(summary);
  else setTimeout(() => showServiceList(items), 900);
}

function showAgentSpeech(message) {
  companionStep.textContent = "Speaking response aloud…";
  flowStage.hidden = true;
}

async function syncUserMessageWithAidBay(message) {
  try {
    const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, state: conversationState }) });
    if (!response.ok) return;
    const data = await response.json();
    conversationState = data.state;
    expectedMissing = data.missing ?? [];
    renderUnderstanding(conversationState.understanding);
    if (data.nextStep === "feedback") { latestResults = []; pendingCompletionUI = "feedback"; }
    if (data.nextStep === "another_request") { latestResults = []; pendingCompletionUI = "another"; }
    if (data.results?.length) {
      latestResults = data.results;
      showServiceList(latestResults);
      const facts = data.results.slice(0, 3).map((item) => ({name:item.name, phone:item.phone, address:item.address, eligibility:item.eligibility, availability:item.availabilityLabel, next:item.nextAction, source:item.source?.url}));
      elevenConversation?.sendContextualUpdate(`AidBay retrieved these service records for the user's latest request: ${JSON.stringify(facts)}. Recommend only these named services. Never invent another organization. Tell the user the cards and phone buttons are now on screen. Clearly state availability and eligibility must be confirmed.`);
    } else {
      latestResults = [];
      lastRenderedResultSignature = "";
      elevenConversation?.sendContextualUpdate(`Do not recommend or reveal service options yet. Required information is still missing: ${JSON.stringify(data.missing || [])}. Ask exactly one short question for the first missing item, then wait for the user to answer.`);
    }
  } catch { /* ElevenLabs conversation can continue if local retrieval is unavailable. */ }
}

async function startElevenAgent() {
  if (elevenAgentConnected || elevenConversation || elevenConnecting) return;
  elevenConnecting = true;
  orb.disabled = true;
  setConversationStarted(true);
  liveCaption.textContent = "Connecting to the microphone…";
  companionStep.textContent = "Connecting to voice";
  voiceLabel.textContent = "Connecting…";
  setVisualState("thinking", "Connecting…", "Starting your private voice conversation.");
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support microphone access");
    const permissionStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    permissionStream.getTracks().forEach(track=>track.stop());
    const credentials = await requestElevenToken();
    const sessionOptions = {
      useWakeLock: true,
      dynamicVariables: { app_name: "AidBay", branch_reference: ELEVEN_BRANCH_ID },
      clientTools: {
        showServiceResults: () => { if (latestResults.length) showServiceList(latestResults); return "Displayed the verified service options."; },
        saveCurrentService: () => { if (latestResults[0]) saveService(latestResults[0]); return "Saved the current service locally on this device."; }
        ,callService: ({ serviceName } = {}) => {
          const item = findServiceToCall(serviceName || "first");
          if (!item) return "No matching service is currently displayed.";
          showCalling(item);
          return `Opening the phone call to ${item.name}.`;
        }
      },
      onConnect: () => {
        elevenConnecting = false;
        orb.disabled = false;
        elevenAgentConnected = true;
        voiceSessionActive = true;
        micPaused = false;
        voiceToggle.classList.add("active");
        voiceLabel.textContent = "Pause conversation";
        setConversationStarted(true);
        liveCaption.textContent = "Listening… start speaking now.";
        companionStep.textContent = "Mic on";
        setVisualState("listening", "I’m listening…", "Start speaking whenever you’re ready.");
        fetch("/api/services").then(response=>response.json()).then(items=>elevenConversation?.sendContextualUpdate(`AidBay policy: Practice curiosity over assumption. Never infer gender, family status, disability, eligibility, preferences, or urgency. If the user asks for shelter without specifying who it is for, ask neutrally: “Is this for one adult, a family with children, or a young person?” Never ask them to confirm they are an adult woman unless they themselves said woman. For one adult without stated gender preferences, use gender-neutral adult options; gender-specific options may be offered only after the person requests or identifies a relevant preference. Ask one question at a time and wait. Never say bracketed tone directions, ask whether the user is still there, narrate ending due to silence, or greet first. Recommend ONLY a service from this approved catalog and only after AidBay displays results: ${JSON.stringify(items.map(({id,name,phone,address,eligibility,availabilityLabel})=>({id,name,phone,address,eligibility,availabilityLabel})))}. Never invent organizations. If no cards are displayed, ask the next neutral question. When the user asks to call, use the callService client tool.`)).catch(()=>{});
        integrationSummary.textContent = "Voice conversation: your live ElevenLabs agent. Service retrieval: AidBay curated records and Moss index.";
      },
      onMessage: ({ message, role }) => {
        if (!message?.trim()) return;
        const cleaned = message.replace(/\[(?:patiently|warmly|gently|calmly|kindly|empathetically|reassuringly|supportively)\]\s*/gi, "").trim();
        if (!cleaned || /^[.·…\s-]+$/.test(cleaned)) return;
        if (role !== "user" && /\b(?:are you still there|if you(?:'re| are) still there|please let me know if you need assistance)\b/i.test(cleaned)) return;
        if (role === "user") {
          if (!isExpectedAnswer(cleaned)) return;
          clearTimeout(responseWaitTimer);
          awaitingUserResponse = false;
          lastUserMessage = cleaned;
          setConversationStarted(true);
          companionStep.textContent = "Hearing you…";
          liveCaption.textContent = cleaned;
          appendTranscript("user", cleaned);
          maybeHandleVoiceCall(cleaned);
          flowStage.hidden = true;
          localSyncPromise = localSyncPromise.then(() => syncUserMessageWithAidBay(cleaned));
        } else {
          if (/\b(?:it seems you(?:'re| are) not responding|i(?:'ll| will) end this conversation|feel free to reach out again)\b/i.test(cleaned)) { resetConversation(); return; }
          if (/\b(?:i'm sorry,? i didn't quite catch|could you please rephrase|unable to make calls directly|can't provide specific contact numbers)\b/i.test(cleaned)) return;
          awaitingUserResponse = /\?\s*$/.test(cleaned);
          lastAssistantMessage = cleaned;
          appendTranscript("assistant", cleaned);
          showAgentSpeech(cleaned);
        }
      },
      onModeChange: ({ mode }) => {
        agentSpeaking = mode === "speaking";
        if (mode === "listening") {
          companionStep.textContent = "Mic on";
          if (pendingCompletionUI === "feedback") { pendingCompletionUI = null; showFeedback(); }
          else if (pendingCompletionUI === "another") { pendingCompletionUI = null; beginAnotherRequest(); }
          else if (latestResults.length) showServiceList(latestResults);
          else {
            flowStage.hidden = true;
            setVisualState("listening", "I’m listening…", "Your ElevenLabs AidBay agent is ready.");
          }
          clearTimeout(responseWaitTimer);
        }
      },
      onDisconnect: () => {
        elevenConnecting = false;
        orb.disabled = false;
        elevenAgentConnected = false;
        elevenConversation = null;
        voiceSessionActive = false;
        voiceToggle.classList.remove("active");
        voiceLabel.textContent = "Pause conversation";
        clearTimeout(responseWaitTimer);
        elevenTokenPromise = null;
        setConversationStarted(false);
        setVisualState("ready", "Ready when you are", "Tap start to speak with your AidBay agent.");
      },
      onError: (message) => {
        setConversationStarted(true);
        const detail = typeof message === "string" ? message : JSON.stringify(message);
        liveCaption.textContent = `Voice could not start: ${detail || "unknown connection error"}. You can use the text field while I reconnect.`;
        companionStep.textContent = "Voice needs attention";
        audioStatus.textContent = `ElevenLabs connection issue: ${message}`;
      }
    };
    let webRtcError = null;
    if (credentials.conversationToken) {
      try { elevenConversation = await Conversation.startSession({...sessionOptions,conversationToken:credentials.conversationToken,connectionType:"webrtc"}); }
      catch (error) { webRtcError = error; console.warn("ElevenLabs WebRTC startup failed; trying WebSocket.",error); }
    }
    if (!elevenConversation && credentials.signedUrl) {
      elevenConversation = await Conversation.startSession({...sessionOptions,signedUrl:credentials.signedUrl,connectionType:"websocket"});
    }
    if (!elevenConversation) {
      // The user's Talk-to link is public, so this remains a final safe path if
      // a network blocks WebRTC and the workspace does not issue signed URLs.
      elevenConversation = await Conversation.startSession({...sessionOptions,agentId:ELEVEN_AGENT_ID,connectionType:"websocket"});
    }
    if (!elevenConversation) throw webRtcError || new Error("ElevenLabs returned no usable voice connection");
  } catch (error) {
    elevenConnecting = false;
    orb.disabled = false;
    elevenTokenPromise = null;
    elevenConversation = null;
    elevenAgentConnected = false;
    voiceSessionActive = false;
    voiceLabel.textContent = "Pause conversation";
    setConversationStarted(false);
    const permissionDenied=error?.name==="NotAllowedError"||/permission|not allowed/i.test(String(error?.message||error));
    companionStep.textContent = "Ready to listen";
    setVisualState("ready", permissionDenied?"Microphone permission is off":"Voice couldn’t connect", permissionDenied?"Allow microphone access in your browser, or type below.":"Tap the circle to retry, or type below while voice reconnects.");
    audioStatus.textContent = `Voice start error: ${error?.name||"ConnectionError"}.`;
  }
}

async function stopElevenAgent() {
  if (elevenConversation) await elevenConversation.endSession();
  elevenConversation = null;
  elevenAgentConnected = false;
  elevenTokenPromise = null;
}

function availabilityClass(state) { return state === "accepting" ? "positive" : state === "full" || state === "closed" ? "negative" : "uncertain"; }

function contactAction(item) {
  if (item.textPhone) return `<a href="sms:${item.textPhone.replace(/\D/g, "")}">Message by text</a>`;
  if (item.email) return `<a href="mailto:${item.email}?subject=${encodeURIComponent(`Question about ${item.name} services`)}">Email organization</a>`;
  return `<a href="${item.source.url}" target="_blank" rel="noreferrer">Contact information</a>`;
}

function showServiceList(items) {
  latestResults = items;
  const signature = items.map((item) => item.id).join("|");
  if (signature === lastRenderedResultSignature) return;
  lastRenderedResultSignature = signature;
  const cards = items.map((item, index) => `
    <article class="service-row ${index === 0 ? "featured" : ""}" data-id="${item.id}">
      <div class="service-top"><span class="service-type">${item.summary.split(" ").slice(0, 3).join(" ")}</span><span class="service-status ${availabilityClass(item.availability.state)}">${item.availabilityLabel}</span></div>
      <h2>${item.name}</h2>
      ${item.address ? `<p>⌖ ${item.address}</p>` : ""}<p>◷ ${item.usualHours || "Hours must be confirmed"}</p>
      <button class="wide-button" data-action="expand-card" data-index="${index}" aria-expanded="false">More information and contact options</button>
      <div class="service-expanded">
        ${item.phone ? `<p class="visible-phone"><strong>Phone:</strong> <a href="tel:${item.phone.replace(/\D/g, "")}">${item.phone}</a></p>` : ""}
        ${item.email ? `<p><strong>Email:</strong> ${item.email}</p>` : ""}
        <p><strong>Current evidence:</strong> ${item.availabilityLabel}. Confirm before traveling.</p>
        <p><strong>Why this recommendation:</strong> ${item.why}</p>
        <p><strong>Who it may serve:</strong> ${item.eligibility}</p>
        <div class="contact-actions">${item.phone ? `<a href="tel:${item.phone.replace(/\D/g, "")}" data-action="call" data-index="${index}">☎ Call now</a>` : ""}${contactAction(item)}</div>
        <div class="service-actions"><button data-action="directions" data-index="${index}" aria-label="Directions">➤ Directions</button><button data-action="save" data-index="${index}" aria-label="Save">♡ Save</button></div>
      </div>
    </article>`).join("");
  const inline = document.createElement("section");
  inline.className = "inline-service-results";
  inline.innerHTML = `<div class="list-heading"><strong>${items.length} possible services</strong><button data-action="map">Map view</button></div>${cards}`;
  transcript.append(inline);
  transcript.scrollTop = transcript.scrollHeight;
  companionStep.textContent = "Reviewing options together";
}

function saveService(item) {
  const saved = JSON.parse(localStorage.getItem("aidbay-saved") || "[]");
  if (!saved.some((service) => service.id === item.id)) saved.push({ id: item.id, name: item.name, address: item.address, summary: item.summary });
  localStorage.setItem("aidbay-saved", JSON.stringify(saved));
}

function showCalling(item) {
  activeService = item;
  callLeftPage = false;
  showFlow(`<article class="calling-card"><div class="call-rings"><span>☎</span></div><p>Calling out now</p><h1>${item.name}</h1><div>${item.phone || "Phone number needs confirmation"}</div></article>
    <div class="stay-card"><strong>ⓘ “I’ll stay right here.”</strong><p>If you need anything else after your call, just talk to me.</p></div>
    <button class="wide-button" data-action="text-mode">▢ Switch AidBay to text</button><button class="wide-button" data-action="finished-call">✓ I finished the call</button><button class="wide-button danger-outline" data-action="cancel-call">Cancel connection</button>`, "Helping you connect");
  if (item.phone) window.location.href = `tel:${item.phone.replace(/\D/g, "")}`;
}

function findServiceToCall(request = "") {
  const normalized = request.toLowerCase();
  if (/\b(second|2nd|two)\b/.test(normalized)) return latestResults[1];
  if (/\b(third|3rd|three)\b/.test(normalized)) return latestResults[2];
  return latestResults.find((item) => normalized.includes(item.name.toLowerCase())) || latestResults[0];
}

function maybeHandleVoiceCall(message) {
  if (!latestResults.length || !/\b(call|phone|ring)\b/i.test(message)) return false;
  const item = findServiceToCall(message);
  if (!item?.phone) return false;
  showCalling(item);
  return true;
}

function showCheckIn(item) {
  showFlow(`<article class="spoken-card response"><p class="flow-kicker"><span class="status-dot"></span> Companion check-in</p><blockquote>“How did it go? Would you like me to help with anything else?”</blockquote></article>
    <article class="recent-card"><small>Recently contacted</small><strong>${item.name}</strong><span>${item.address || "Location must be confirmed"}</span></article>
    <div class="outcome-actions"><p>What happened?</p><button data-action="outcome-helped">They could help</button><button data-action="outcome-full">They were full or closed</button><small>Your report is anonymous, temporary, and never treated as provider confirmation.</small></div>
    <div class="next-actions"><p>What next?</p><button data-action="another">⌕ Find another service</button><button data-action="save-active">♡ Save this for later</button><button data-action="all-set">✓ I’m all set, thanks</button></div>
    <div class="flow-footer"><span>Speaking enabled</span><span class="listening-pill">● Listening</span></div>`, "Checking in after the call");
}

function beginAnotherRequest() {
  conversationState = { stage: "new" };
  latestResults = [];
  lastRenderedResultSignature = "";
  expectedMissing = [];
  lastAssistantMessage = "";
  activeService = null;
  results.replaceChildren();
  renderUnderstanding(null);
  setMainConversationVisible(true);
  liveCaption.textContent = "What else would you like help finding?";
  setVisualState(elevenAgentConnected ? "listening" : "ready", "What else can I help with?", elevenAgentConnected ? "I’m listening for your next request." : "Tap start or use the keyboard.");
  companionStep.textContent = "Starting another request";
}

function showFeedback() {
  feedbackRating = 0;
  showFlow(`<article class="spoken-card response closing-card"><p class="flow-kicker"><span class="status-dot"></span> Conversation complete</p><blockquote>“Thank you for letting me help. Take care, and have a good rest of your day.”</blockquote></article>
    <section class="feedback-card"><p class="section-label">Optional feedback</p><h2>How was your AidBay experience?</h2><div class="rating-row" role="group" aria-label="Rate AidBay from 1 to 5"><button data-rating="1" aria-label="1 out of 5">★</button><button data-rating="2" aria-label="2 out of 5">★</button><button data-rating="3" aria-label="3 out of 5">★</button><button data-rating="4" aria-label="4 out of 5">★</button><button data-rating="5" aria-label="5 out of 5">★</button></div><label for="feedback-note">Anything you’d like us to know?</label><textarea id="feedback-note" rows="3" placeholder="Optional. Please don’t include private medical or identifying information."></textarea><button class="primary-action feedback-submit" data-action="submit-feedback">Send feedback</button><button class="wide-button" data-action="skip-feedback">Skip</button><p class="feedback-privacy">Feedback is saved locally in this prototype.</p></section>`, "Wrapping up warmly");
}

function showThankYou() {
  showFlow(`<article class="spoken-card response thank-you"><p class="flow-kicker"><span class="status-dot"></span> Thank you</p><blockquote>“Your feedback helps make AidBay more useful and respectful. Take good care.”</blockquote></article><button class="wide-button primary-action" data-action="another">Start a new request</button><button class="wide-button" data-action="saved-home">View saved resources</button>`, "Conversation complete");
}

function showSavedHome() {
  const saved = JSON.parse(localStorage.getItem("aidbay-saved") || "[]");
  const rows = saved.map((item) => `<article class="saved-row"><span class="saved-dot"></span><div><strong>${item.name}</strong><small>${item.address || item.summary}</small></div><span>›</span></article>`).join("") || "<p class=\"empty-saved\">No saved resources yet.</p>";
  showFlow(`${activeService ? `<p class="section-label">Continue where you left off</p><article class="continue-card" data-action="check-in"><span>☎</span><div><strong>${activeService.name}</strong><small>Contacted today</small></div><b>›</b></article>` : ""}<div class="saved-heading"><strong>Saved resources (${saved.length})</strong></div>${rows}<div class="privacy-card">▣ Your past requests are saved locally on this device only. We do not track or share your location history.</div><div class="flow-footer"><button data-action="another">Start a new request</button><button class="primary-action" data-action="another">◖)) Tap to speak</button></div>`, "Your private resource list");
}

async function ensureAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioContext = new AudioContextClass();
  }
  if (audioContext?.state === "suspended") await audioContext.resume();
  return audioContext;
}

function browserSpeechFallback(text) {
  if (!("speechSynthesis" in window)) {
    audioStatus.textContent = "This browser cannot play spoken output.";
    finishSpeaking();
    return;
  }
  stopRecognition();
  speechSynthesis.cancel();
  speechSynthesis.resume();
  currentUtterance = new SpeechSynthesisUtterance(text);
  const preferredVoice = availableVoices.find((voice) => voice.lang === "en-US" && /Samantha|Google|Microsoft|Natural/i.test(voice.name))
    ?? availableVoices.find((voice) => voice.lang.startsWith("en"));
  if (preferredVoice) currentUtterance.voice = preferredVoice;
  currentUtterance.lang = "en-US";
  currentUtterance.volume = 1;
  currentUtterance.rate = 1;
  currentUtterance.pitch = 1;
  currentUtterance.onstart = () => {
    agentSpeaking = true;
    audioStatus.textContent = preferredVoice ? `Speaking with ${preferredVoice.name}.` : "Speaking with the browser's default voice.";
    setVisualState("speaking", "Here’s what I found", "AidBay is speaking. You can pause at any time.");
  };
  currentUtterance.onend = finishSpeaking;
  currentUtterance.onerror = (event) => {
    audioStatus.textContent = `Spoken audio failed: ${event.error || "unknown browser error"}.`;
    finishSpeaking();
  };
  speechSynthesis.speak(currentUtterance);
}

async function speakAndResume(text) {
  if (!voiceSessionActive) return;
  stopRecognition();
  agentSpeaking = true;
  setVisualState("speaking", "Here’s what I found", "AidBay is speaking. You can pause at any time.");
  audioStatus.textContent = "Preparing the local AidBay voice…";
  try {
    const context = await ensureAudioContext();
    if (!context) throw new Error("Web Audio is unavailable");
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!response.ok) throw new Error("Local speech service failed");
    const voiceProvider = response.headers.get("x-aidbay-voice");
    const audioBuffer = await context.decodeAudioData(await response.arrayBuffer());
    try { currentAudioSource?.stop(); } catch { /* already stopped */ }
    currentAudioSource = context.createBufferSource();
    currentAudioSource.buffer = audioBuffer;
    currentAudioSource.connect(context.destination);
    currentAudioSource.onended = finishSpeaking;
    currentAudioSource.start();
    audioStatus.textContent = voiceProvider === "elevenlabs" ? "Speaking with the warm AidBay voice." : "Speaking with the local AidBay voice.";
  } catch {
    agentSpeaking = false;
    audioStatus.textContent = "Local voice failed; trying the browser voice instead.";
    browserSpeechFallback(text);
  }
}

function renderResults(items) {
  results.replaceChildren();
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "card";
    const checked = item.availability.observedAt
      ? new Date(item.availability.observedAt).toLocaleString()
      : "No current observation";
    card.innerHTML = `
      <span class="badge ${item.availability.state}">${item.availability.state.replaceAll("_", " ")}</span>
      <h2></h2><p class="summary"></p>
      <p class="why"><strong>Why this:</strong> <span></span></p>
      <p><strong>Who it may serve:</strong> <span class="eligibility"></span></p>
      ${item.address ? '<p><strong>Address:</strong> <span class="address"></span></p>' : ""}
      ${item.phone ? '<p><strong>Phone:</strong> <a class="phone"></a></p>' : ""}
      <p><strong>Next:</strong> <span class="next"></span></p>
      <p class="availability-copy"><strong>Availability:</strong> <span></span></p>
      <p class="meta">Last checked signal: ${checked}. Confidence reflects the evidence—not a guarantee of access.</p>
      <p class="warning"></p><a class="source" target="_blank" rel="noreferrer">View source</a>`;
    card.querySelector("h2").textContent = item.name;
    card.querySelector(".summary").textContent = item.summary;
    card.querySelector(".why span").textContent = item.why;
    card.querySelector(".eligibility").textContent = item.eligibility;
    card.querySelector(".availability-copy span").textContent = item.availabilityLabel;
    if (item.address) card.querySelector(".address").textContent = item.address;
    if (item.phone) {
      const phone = card.querySelector(".phone");
      phone.textContent = item.phone;
      phone.href = `tel:${item.phone.replace(/\D/g, "")}`;
    }
    card.querySelector(".next").textContent = item.nextAction;
    card.querySelector(".warning").textContent = item.warning;
    card.querySelector(".source").href = item.source.url;
    results.append(card);
  }
}

function renderUnderstanding(value) {
  const fields = [
    ["Looking for", value?.need], ["Location", value?.location], ["Timing", value?.timing],
    ["Preferences or constraints", value?.preferences], ["Already tried", value?.alreadyTried]
  ].filter(([, field]) => field);
  understanding.hidden = fields.length === 0;
  understandingFields.replaceChildren(...fields.map(([label, field]) => {
    const row = document.createElement("div");
    const dt = document.createElement("dt"); dt.textContent = label;
    const dd = document.createElement("dd"); dd.textContent = field;
    row.append(dt, dd); return row;
  }));
}

async function sendMessage(message, fromVoice = false) {
  if (!message.trim() || waitingForResponse) return;
  waitingForResponse = true;
  stopRecognition();
  liveCaption.textContent = message;
  lastUserMessage = message;
  appendTranscript("user", message);
  showProcessing(message);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, state: conversationState })
    });
    if (!response.ok) throw new Error("Request failed");
    const data = await response.json();
    conversationState = data.state;
    renderUnderstanding(conversationState.understanding);
    appendTranscript("assistant", data.reply);
    liveCaption.textContent = data.reply;
    latestResults = data.results ?? [];
    waitingForResponse = false;
    if (data.nextStep === "feedback") showFeedback();
    else if (data.nextStep === "another_request") beginAnotherRequest();
    else if (latestResults.length) showSpokenSummary(latestResults);
    else {
      setMainConversationVisible(true);
      renderResults([]);
      if (voiceSessionActive && fromVoice) speakAndResume(data.reply);
      else setVisualState("ready", "Ready when you are", "Tap start to continue by voice, or use the keyboard.");
    }
  } catch {
    waitingForResponse = false;
    const error = "I couldn’t complete that request. Please try again.";
    appendTranscript("assistant", error);
    liveCaption.textContent = error;
    setVisualState("paused", "Something went wrong", "Try again or use the keyboard.");
    setMainConversationVisible(true);
    if (voiceSessionActive) speakAndResume(error);
  }
}

function handleConversationAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const item = latestResults[Number(button.dataset.index ?? 0)];
  if (action === "cancel" || action === "cancel-call") return setMainConversationVisible(true);
  if (action === "another") return beginAnotherRequest();
  if (action === "results") return showServiceList(latestResults);
  if (action === "details" && latestResults[0]) return showServiceList(latestResults);
  if (action === "next" && latestResults.length > 1) return showServiceList([...latestResults.slice(1), latestResults[0]]);
  if (action === "expand-card") {
    const card = button.closest(".service-row");
    const expanded = card?.classList.toggle("expanded") || false;
    button.setAttribute("aria-expanded", String(expanded));
    button.textContent = expanded ? "Hide information" : "More information and contact options";
    return;
  }
  if (action === "call" && item) return showCalling(item);
  if (action === "directions" && item?.address) return window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}`, "_blank", "noopener");
  if (action === "save" && item) { saveService(item); button.textContent = "♥"; button.setAttribute("aria-label", "Saved"); return; }
  if (action === "finished-call" && activeService) return showCheckIn(activeService);
  if (action === "text-mode") { textDialog.showModal(); setTimeout(() => input.focus(), 50); return; }
  if ((action === "outcome-helped" || action === "outcome-full") && activeService) {
    fetch("/api/observations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serviceId: activeService.id, sourceType: "anonymous_outcome", state: action === "outcome-helped" ? "accepting" : "full" }) }).catch(() => {});
    button.textContent = "✓ Thanks—report saved temporarily";
    button.disabled = true;
    return;
  }
  if (action === "save-active" && activeService) { saveService(activeService); button.textContent = "♥ Saved"; return; }
  if (action === "all-set") return showFeedback();
  if (action === "skip-feedback") return showThankYou();
  if (action === "saved-home") return showSavedHome();
  if (action === "submit-feedback") {
    const entries = JSON.parse(localStorage.getItem("aidbay-feedback") || "[]");
    entries.push({ rating: feedbackRating || null, note: document.querySelector("#feedback-note")?.value.trim() || "", createdAt: new Date().toISOString() });
    localStorage.setItem("aidbay-feedback", JSON.stringify(entries.slice(-20)));
    return showThankYou();
  }
  if (action === "check-in" && activeService) return showCheckIn(activeService);
  if (action === "map") return alert("Map view is ready for the later Figma/map integration. Service addresses remain available in the list.");
}

flowStage.addEventListener("click", handleConversationAction);
transcript.addEventListener("click", handleConversationAction);

flowStage.addEventListener("click", (event) => {
  const rating = event.target.closest("[data-rating]");
  if (!rating) return;
  feedbackRating = Number(rating.dataset.rating);
  for (const star of flowStage.querySelectorAll("[data-rating]")) star.classList.toggle("selected", Number(star.dataset.rating) <= feedbackRating);
});

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (Recognition) {
  recognition = new Recognition();
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    recognitionRunning = true;
    liveCaption.textContent = "Listening…";
    setVisualState("listening", "I’m listening…", "Tell me what you need. I’ll speak back when you finish.");
  };
  recognition.onresult = (event) => {
    let interim = "";
    let finalText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const words = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += words;
      else interim += words;
    }
    liveCaption.textContent = finalText || interim || "Listening…";
    clearTimeout(interimCommitTimer);
    if (finalText.trim() && !recognitionSubmitted) {
      recognitionSubmitted = true;
      sendMessage(finalText.trim(), true);
    } else if (interim.trim() && !recognitionSubmitted) {
      // Browser speech recognition can wait several seconds to mark a result
      // final. Treat a short pause as the end of the turn for faster dialogue.
      const candidate = interim.trim();
      interimCommitTimer = setTimeout(() => {
        if (recognitionSubmitted || waitingForResponse) return;
        recognitionSubmitted = true;
        try { recognition.abort(); } catch { /* already ending */ }
        sendMessage(candidate, true);
      }, 650);
    }
  };
  recognition.onend = () => {
    recognitionRunning = false;
    if (voiceSessionActive && !agentSpeaking && !waitingForResponse) setTimeout(startRecognition, 350);
  };
  recognition.onerror = (event) => {
    recognitionRunning = false;
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      voiceSessionActive = false;
      voiceLabel.textContent = "Start conversation";
      voiceToggle.classList.remove("active");
      liveCaption.textContent = "Microphone access was not allowed. Use the keyboard or enable microphone permission.";
      setVisualState("paused", "Microphone unavailable", "Enable microphone access or type your message.");
    }
  };
  voiceSupport.textContent = "This browser reports that speech recognition is available.";
} else {
  voiceSupport.textContent = "This browser does not provide speech recognition. Voice mode can be tested in a browser that supports it; typing and spoken output remain available here.";
  voiceToggle.classList.add("unsupported");
}

voiceToggle.addEventListener("click", () => {
  if (!elevenConversation) return startElevenAgent();
  micPaused = !micPaused;
  elevenConversation.setMicMuted(micPaused);
  voiceSessionActive = !micPaused;
  voiceToggle.classList.toggle("active", !micPaused);
  voiceLabel.textContent = micPaused ? "Resume conversation" : "Pause conversation";
  setVisualState(micPaused ? "paused" : "listening", micPaused ? "Conversation paused" : "I’m listening…", micPaused ? "Tap resume when you’re ready." : "Continue speaking when you’re ready.");
});
orb.addEventListener("pointerdown", () => {
  if (!elevenAgentConnected && !elevenConversation) startElevenAgent();
}, { passive: true });
orb.addEventListener("click", () => {
  if (!elevenAgentConnected && !elevenConversation) startElevenAgent();
});
readyMic.addEventListener("pointerdown", () => {
  if (!elevenAgentConnected && !elevenConversation) startElevenAgent();
}, { passive: true });
function submitInlineText(field){const message=field.value.trim();if(!message||waitingForResponse)return;field.value="";setConversationStarted(true);sendMessage(message,false)}
readySend.addEventListener("click",()=>submitInlineText(readyKeyboard));
readyKeyboard.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();submitInlineText(readyKeyboard)}});
voiceToggle.addEventListener("pointerdown", () => { ensureAudioContext().catch(() => {}); }, { passive: true });

document.addEventListener("visibilitychange", () => {
  if (!activeService) return;
  if (document.hidden) callLeftPage = true;
  else if (callLeftPage) {
    callLeftPage = false;
    showCheckIn(activeService);
    elevenConversation?.sendContextualUpdate(`The user has returned after calling ${activeService.name}. Ask one concise question: how did the call go? Then wait for their answer.`);
  }
});

testAudio.addEventListener("click", () => {
  audioTestActive = !voiceSessionActive;
  voiceSessionActive = true;
  audioStatus.textContent = "Starting audio test…";
  speakAndResume("AidBay audio is working. I can speak responses aloud.");
});

conversationSend.addEventListener("click",()=>submitInlineText(keyboard));
keyboard.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();submitInlineText(keyboard)}});
help.addEventListener("click", () => helpDialog.showModal());
closeText.addEventListener("click", () => textDialog.close());
closeHelp.addEventListener("click", () => helpDialog.close());
correctUnderstanding.addEventListener("click", () => {
  textDialog.showModal();
  input.placeholder = "Example: Change my location to 16th and Mission, and avoid congregate shelters.";
  setTimeout(() => input.focus(), 50);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  textDialog.close();
  input.value = "";
  sendMessage(message, false);
});

function resetConversation() {
  voiceSessionActive = false;
  agentSpeaking = false;
  waitingForResponse = false;
  stopRecognition();
  stopElevenAgent().catch(() => {});
  speechSynthesis?.cancel();
  try { currentAudioSource?.stop(); } catch { /* already stopped */ }
  conversationState = { stage: "new" };
  transcriptEntries = [];
  transcript.replaceChildren();
  results.replaceChildren();
  latestResults = [];
  lastRenderedResultSignature = "";
  pendingResultsAfterSpeech = false;
  clearTimeout(responseWaitTimer);
  setConversationStarted(false);
  companionStep.textContent = "Ready to listen";
  renderUnderstanding(null);
  liveCaption.textContent = "Your words and the agent’s responses will appear here.";
  voiceLabel.textContent = "Pause conversation";
  voiceToggle.classList.remove("active");
  setVisualState("ready", "Ready when you are", "Tap start and tell me what kind of help is needed.");
  helpDialog.close();
}
reset.addEventListener("click", resetConversation);
endConversation.addEventListener("click", resetConversation);
clearTranscript.addEventListener("click", () => { transcriptEntries = []; transcript.replaceChildren(); });

async function loadServices() {
  const response = await fetch("/api/services");
  const items = await response.json();
  serviceSelect.replaceChildren(...items.map((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    return option;
  }));
}

async function loadIntegrationStatus() {
  try {
    const response = await fetch("/api/integrations");
    const status = await response.json();
    integrationSummary.textContent = `Moss: ${status.moss}. Bright Data: ${status.brightData}. Conversation: ${status.conversation}. The current service recommendations come from local curated records.`;
  } catch {
    integrationSummary.textContent = "Integration status could not be loaded.";
  }
}

simulate.addEventListener("click", async () => {
  simulate.disabled = true;
  simResult.textContent = "Adding simulated observation…";
  try {
    const response = await fetch("/api/observations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serviceId: serviceSelect.value, sourceType: sourceSelect.value, state: stateSelect.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error();
    simResult.textContent = `Saved: ${data.assessment.state.replaceAll("_", " ")} at ${Math.round(data.assessment.confidence * 100)}% evidence confidence.`;
  } catch {
    simResult.textContent = "The update could not be saved.";
  } finally { simulate.disabled = false; }
});

loadServices();
loadIntegrationStatus();
setConversationStarted(false);
