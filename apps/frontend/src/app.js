import { initial } from '../../../data/demo-state.js';
import { loadDemoState, saveDemoState } from './services/demo-store.js';
import { esc, toast } from './components/ui.js';
import { renderLanding } from './pages/landing.js';
import { renderInstructorPage } from './pages/instructor/instructor.js';
import { renderStudentPage } from './pages/student/student.js';
import { renderWorkspace } from './layouts/workspace.js';
let state=loadDemoState(initial),role=location.pathname.startsWith("/student")?"student":"teacher",page=role==="student"?"My learning":"Overview",selectedGap=1;
function persist(){saveDemoState(state)}
const app=document.querySelector("#app");const gap=()=>state.gaps.find(g=>g.id===selectedGap);

function go(p){page=p;render()}function switchRole(r){persist();location.assign("/"+r+"/")}function log(text){persist();state.history.unshift({text,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})});persist()}
function render() {
  persist();
  if (!location.pathname.startsWith('/teacher') && !location.pathname.startsWith('/student')) return renderLanding();
  document.title = role === 'teacher' ? 'Gap — Teacher workspace' : 'Gap — Student workspace';
  app.innerHTML = renderWorkspace({state, role, page, content});
  bind();
}
function content() {
  const context = {state, page, gap};
  return role === 'teacher' ? renderInstructorPage(context) : renderStudentPage(context);
}

function bind(){app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));app.querySelectorAll("[data-role]").forEach(b=>b.onclick=()=>switchRole(b.dataset.role));app.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>act(b.dataset.action));
const m=document.querySelector("#materials");if(m)m.onsubmit=e=>{e.preventDefault();state.course=document.querySelector("#course").value;state.syllabus=document.querySelector("#syllabus").value;render();toast("Class materials saved")};
const f=document.querySelector("#file");if(f)f.onchange=async()=>{if(f.files[0]){if(f.files[0].size>1000000)return toast("Choose a text file under 1 MB");document.querySelector("#syllabus").value=await f.files[0].text();toast("Text imported. Save to apply.")}};
const qe=document.querySelector("#quizEdit");if(qe)qe.onsubmit=e=>{e.preventDefault();saveQuiz();persist();toast("Quiz edits saved")};
const p=document.querySelector("#probe");if(p)p.onsubmit=e=>{e.preventDefault();const answer=Number(new FormData(p).get("choice"));const g=gap(),ok=answer===g.answer;g.status=ok?"resolved":"struggling";log(ok?"Sara resolved "+g.title:"Sara needs more support with "+g.title);document.querySelector("#feedback").innerHTML='<div class="feedback">'+(ok?"Correct. You’ve closed this learning gap. Your teacher’s dashboard has been updated.":"Not quite. "+esc(g.explanation)+" Your teacher has been notified.")+'</div>';if(ok)p.querySelector("button").disabled=true;toast(ok?"Learning gap resolved":"Follow-up shared with your teacher")};
const a=document.querySelector("#assessment");if(a)a.onsubmit=e=>{e.preventDefault();const ok=Number(new FormData(a).get("choice"))===state.quiz.answer;state.submitted=true;const g=state.gaps.find(g=>g.id===state.quiz.gapId);if(!ok){g.status="open";log("Assessment flagged "+g.title+" for Sara")}else log("Sara answered the "+g.title+" assessment correctly");document.querySelector("#feedback").innerHTML='<div class="feedback">'+(ok?"Correct · 2 / 2. Well done.":"0 / 2 · The correct answer is: "+esc(state.quiz.options[state.quiz.answer])+". A learning gap has been flagged for your teacher.")+'<p class="muted">Rubric: '+esc(state.quiz.rubric)+'</p></div>';a.querySelector("button").disabled=true}};
function saveQuiz(){state.quiz.question=document.querySelector("#qtext").value;state.quiz.options=state.quiz.options.map((_,i)=>document.querySelector("#opt"+i).value);state.quiz.answer=Number(document.querySelector("#answer").value);state.quiz.rubric=document.querySelector("#rubric").value}
function act(a){const [action,id]=a.split(":");if(action==="quiz")go("Assessments");if(action==="overview")go("Overview");if(action==="explain"){selectedGap=Number(id);go("Explainer")}if(action==="learn"){selectedGap=Number(id);go("Lesson")}if(action==="draft"){const g=state.gaps.find(g=>g.id===Number(document.querySelector("#topic").value));state.quiz={title:g.title+" · Understanding check",question:g.question,options:[...g.options],answer:g.answer,gapId:g.id,published:false,rubric:"2 points: selects the correct answer. 0 points: selects an incorrect answer."};render();toast("Quiz drafted from sample topic bank")}if(action==="publish"){const form=document.querySelector("#quizEdit");if(!form.reportValidity())return;saveQuiz();state.quiz.published=true;state.submitted=false;log("Published "+state.quiz.title);render();toast("Quiz published to the student workspace")}if(action==="approve"){const r=state.review.find(r=>r.id===Number(id)),input=document.querySelector("#score"+id);if(!input.reportValidity())return;r.score=Number(input.value);state.review=state.review.filter(item=>item.id!==r.id);log("Published reviewed grade for "+r.name+": "+r.score+"/"+r.total);render();toast("Grade approved and published")}if(action==="send"){const text=document.querySelector("#explanation").value.trim();if(!text)return toast("Add an explanation before sharing");gap().explanation=text;gap().status="sent";log("Shared "+gap().title+" explanation with Sara");render();toast("Explanation ready in the student workspace")}if(action==="reset"){state=structuredClone(initial);page=role==="teacher"?"Overview":"My learning";render();toast("Demo reset")}}
render();
if(document.modelContext?.registerTool){document.modelContext.registerTool({name:"read_learning_gaps",description:"Read current demo learning gaps and their follow-up status.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({gaps:state.gaps.map(({id,title,status})=>({id,title,status}))})});document.modelContext.registerTool({name:"open_learning_workspace",description:"Navigate to the separate teacher or student workspace. Demo data stays in this tab.",inputSchema:{type:"object",properties:{role:{type:"string",enum:["teacher","student"]}},required:["role"],additionalProperties:false},execute:input=>{if(!["teacher","student"].includes(input.role))throw Error("Invalid role");switchRole(input.role);return{destination:"/"+input.role+"/"}}})}
