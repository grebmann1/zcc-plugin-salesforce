export const TOOLS = [
  ['assistant','Assistant','Build with an assistant that sees your agent','spark','Zana'],
  ['preview','Preview','Simulate conversations and inspect every turn','tool-preview.svg','Builder'],
  ['evals','Evals','Create suites, run cases, and review results','tool-evals.svg','Builder'],
  ['sessions','Sessions','Explore recorded conversations and replay turns','tool-sessions.svg','Builder'],
  ['analytics','Analytics','Understand outcomes, volume, and routing','tool-analytics.svg','Builder'],
  ['issues','Issues','Investigate failures and review suggested fixes','tool-optimization.svg','Builder'],
  ['scorers','Scorers','Define how responses are graded','scorers.svg','Builder'],
  ['testing','Testing','Check readiness, test definitions, and profiles','testing.svg','Builder'],
  ['experiments','Experiments','Compare agent variants in A/B tests','experiments.svg','Builder'],
  ['compare','Compare','Review changes between saved versions','branch','Builder'],
  ['files','Files','Plans, reports, uploads, and saved artifacts','file','Builder'],
  ['actions','Actions','Inspect Apex, Flow, and their contracts','code','Zana'],
  ['comments','Comments','Discuss changes anchored to your script','chat','Zana'],
  ['org-preview','Org preview','Try a published agent in a selected org','cloud','Zana'],
  ['settings','Settings','Editor, workspace, and accessibility preferences','settings','Builder'],
  ['import','Import custom tool','Explore a new tool tab from a manifest','plus','Builder'],
].map(([id,label,description,icon,origin])=>({id,label,description,icon,origin}));

export const TOPICS = [
  {id:'returns',name:'Returns & Refunds',description:'Help customers return an order, check eligibility, and request a refund.',actions:['Get Order Details','Check Return Eligibility','Create Return Request']},
  {id:'orders',name:'Order Management',description:'Find orders, share delivery updates, and resolve order questions.',actions:['Get Order Details','Track Shipment']},
  {id:'escalation',name:'Escalation',description:'Connect customers to a service representative with the full conversation context.',actions:['Create Support Case','Transfer to Agent']},
];
export const CASES = [
  {id:'expired',name:'Return outside the 30-day window',prompt:'My order arrived 45 days ago. Can I still return it?',expected:'Explain the 30-day policy and offer an escalation. Do not create a return.',actual:'I can help you start a return. Let me create a return request for that order.',status:'fail',scorer:'Policy compliance',latency:'1.8s'},
  {id:'eligible',name:'Eligible return with order number',prompt:'I would like to return order #10482. It arrived last week.',expected:'Check eligibility, confirm the item, and create a return request.',actual:'Your order is eligible for a return. Which item would you like to send back?',status:'pass',scorer:'Action sequence match',latency:'1.4s'},
  {id:'missing',name:'Missing order information',prompt:'I need a refund for my purchase.',expected:'Ask for the order number before retrieving order details.',actual:'Of course. Could you share your order number so I can look it up?',status:'pass',scorer:'Topic sequence match',latency:'1.1s'},
  {id:'damaged',name:'Damaged item escalation',prompt:'The glass in my package is broken.',expected:'Acknowledge the damage and offer a replacement or a service representative.',actual:'I’m sorry your item arrived damaged. I can arrange a replacement or connect you with our team.',status:'pass',scorer:'Bot response rating',latency:'1.6s'},
  {id:'status',name:'Refund status follow-up',prompt:'Where is my refund for order #10411?',expected:'Retrieve the refund status without starting another return.',actual:'Your refund was issued on October 29. Allow 5–7 business days for it to appear.',status:'pass',scorer:'Action sequence match',latency:'1.5s'},
  {id:'gift',name:'Gift return without receipt',prompt:'Can I return a gift if I don’t have the receipt?',expected:'Explain proof-of-purchase requirements and offer help finding the order.',actual:'I can help locate the order. Do you have the purchaser’s email or an order number?',status:'pass',scorer:'Policy compliance',latency:'1.3s'},
];
export const SESSIONS = [
  ['SES-10482','Return outside the policy window','Returns & Refunds','Escalated','Today, 10:42 AM','6 turns'],
  ['SES-10481','Track an existing order','Order Management','Resolved','Today, 10:38 AM','4 turns'],
  ['SES-10480','Exchange a damaged item','Returns & Refunds','Resolved','Today, 10:31 AM','8 turns'],
  ['SES-10479','Refund has not arrived','Returns & Refunds','Unresolved','Today, 10:22 AM','5 turns'],
  ['SES-10478','Update shipping address','Order Management','Resolved','Today, 10:16 AM','4 turns'],
  ['SES-10477','Speak to a representative','Escalation','Escalated','Today, 10:08 AM','3 turns'],
  ['SES-10476','Cancel an unshipped order','Order Management','Resolved','Yesterday, 4:52 PM','5 turns'],
].map(([id,title,intent,outcome,date,turns])=>({id,title,intent,outcome,date,turns}));
export const SCORERS = [
  ['Policy compliance','Checks that refund advice follows the 30-day return policy.','Pass / Fail',false],
  ['Topic sequence match','Verifies the expected subagent route for every case.','Pass / Fail',true],
  ['Action sequence match','Verifies that the expected actions run in order.','Pass / Fail',true],
  ['Bot response rating','Evaluates the response against the expected outcome.','Pass / Fail',true],
  ['Output latency (ms)','Measures response latency against an upper bound.','Numeric',true],
  ['Conciseness','Rates whether the response is brief and complete.','Quality',true],
  ['Coherence','Rates logical consistency and readability.','Quality',true],
  ['Completeness','Checks that all parts of the request are addressed.','Quality',true],
  ['Factuality','Rates accuracy against the available evidence.','Quality',true],
  ['Instruction adherence','Checks that the agent follows its instructions.','Quality',true],
  ['Language','Checks that the response uses the expected language.','Pass / Fail',true],
  ['Safety','Evaluates harmful or unsafe content in the response.','Quality',true],
].map(([name,description,type,builtIn])=>({name,description,type,builtIn}));

export function initialState(saved = {}) {
  return {tool:'preview', tabs:['preview','evals','assistant'], editor:'script',topic:'returns',doc:'agent',explorer:true,sideOpen:true,expanded:false,bottom:'problems',bottomOpen:false,dirty:false,fixed:false,version:'v12',activeVersion:'v11',run:'idle',runCount:0,caseId:null,caseFilter:'all',selectedCases:CASES.map(c=>c.id),session:null,issue:false,scorer:null,experiment:null,file:null,inspector:'settings',messages:[],assistantMessages:[],comments:[],customScorers:[],newTools:[],preferences:{lines:true,wrap:true,share:true},description:TOPICS[0].description,modal:null,...saved,editor:'script'};
}
export function toolById(id){return TOOLS.find(t=>t.id===id);}
export function resultCases(state){return CASES.map(c=>state.fixed&&state.run==='complete'&&(!state.lastRunCases||state.lastRunCases.includes(c.id))?{...c,status:'pass',actual:c.id==='expired'?'Our return window is 30 days. Since your order arrived 45 days ago, I can connect you with our service team for other options.':c.actual}:c);}
export function visibleCases(state,query=''){return resultCases(state).filter(c=>(state.caseFilter==='all'||c.status===state.caseFilter)&&`${c.name} ${c.prompt}`.toLowerCase().includes(query.toLowerCase()));}
export function filterSessions(query='',outcome='all'){return SESSIONS.filter(s=>(outcome==='all'||s.outcome===outcome)&&`${s.title} ${s.id} ${s.intent}`.toLowerCase().includes(query.toLowerCase()));}
export function scriptFor(state){const topic=TOPICS.find(t=>t.id===state.topic)||TOPICS[0];return `# Service Agent · ${state.version}\nconfig:\n  developer_name: ServiceAgent\n  agent_label: "Service Agent"\n  description: "Customer service and order support"\n\nvariables:\n  order_id: mutable string = ""\n  days_since_delivery: mutable number = 0\n\nstart_agent entry:\n  reasoning:\n    instructions: ->\n      | Welcome the customer and understand their request.\n      | Route return requests to Returns & Refunds.\n\nsubagent ${state.topic === 'returns'?'returns_and_refunds':state.topic}:\n  description: "${state.description||topic.description}"\n  reasoning:\n    instructions: ->\n      | Ask for the order number before looking up an order.\n      | Use Get Order Details to retrieve the order.\n${state.fixed?'      | Only create a return when the order is within 30 days.\n      | Otherwise explain the policy and offer escalation.':'      | Help the customer start a return request.'}\n    actions:\n      get_order:\n        target: "apex://GetOrderDetails"\n      check_eligibility:\n        target: "flow://CheckReturnEligibility"\n      create_return:\n        target: "flow://CreateReturnRequest"\n`;
}
export function reduce(state,action){
 switch(action.type){
  case 'open': return {...state,tool:action.tool,tabs:state.tabs.includes(action.tool)?state.tabs:[...state.tabs,action.tool],sideOpen:true,modal:null};
  case 'close': {const tabs=state.tabs.filter(t=>t!==action.tool);return {...state,tabs,tool:state.tool===action.tool?(tabs.at(-1)||'launcher'):state.tool};}
  case 'patch': return {...state,...action.value};
  case 'topic': {const t=TOPICS.find(t=>t.id===action.id)||TOPICS[0];return {...state,topic:t.id,doc:'agent',description:t.description};}
  case 'fix': return {...state,fixed:true,dirty:true,scriptOverride:undefined,editor:'script',tool:'compare',tabs:state.tabs.includes('compare')?state.tabs:[...state.tabs,'compare'],issue:true};
  case 'save': return {...state,dirty:false};
  case 'version': return {...state,version:`v${Number(state.version.slice(1))+1}`,dirty:false,modal:null};
  case 'run': return {...state,run:'running',caseId:null,lastRunCases:[...state.selectedCases]};
  case 'complete': return {...state,run:'complete',runCount:state.runCount+1,bottom:'tests'};
  case 'selectCase': return {...state,selectedCases:state.selectedCases.includes(action.id)?state.selectedCases.filter(id=>id!==action.id):[...state.selectedCases,action.id]};
  case 'allCases': return {...state,selectedCases:action.ids.every(id=>state.selectedCases.includes(id))?state.selectedCases.filter(id=>!action.ids.includes(id)):[...new Set([...state.selectedCases,...action.ids])]};
  case 'message': return {...state,messages:[...state.messages,{role:'user',text:action.text},{role:'agent',text:state.fixed?'Our return window is 30 days. Since your order arrived 45 days ago, I can connect you with our service team to explore other options.':'I can help with your return. Could you share your order number so I can check the details?'}]};
  case 'assistant': return {...state,assistantMessages:[...state.assistantMessages,{role:'user',text:action.text},{role:'agent',text:'I found a missing eligibility guard in Returns & Refunds. The agent can create a return without checking the 30-day window. I suggest adding a condition before Create Return Request and a path to Escalation for ineligible orders.'}]};
  case 'comment': return {...state,comments:[...state.comments,action.text]};
  case 'scorer': return {...state,customScorers:[...state.customScorers,action.value],modal:null,scorer:null};
  case 'activate': return {...state,activeVersion:state.version,modal:null};
  default:return state;
 }
}
