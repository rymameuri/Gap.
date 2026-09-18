export const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
export function title(k,h,sub,action=""){return '<div class="heading"><div><div class="eyebrow">'+k+'</div><h1>'+h+'</h1><p style="margin-bottom:0">'+sub+'</p></div>'+action+'</div>'}export function btn(text,action,primary=false){return '<button type="button" class="btn '+(primary?"primary":"")+'" data-action="'+action+'">'+text+'</button>'}export function badge(s){return '<span class="badge '+s+'">'+({open:"Needs attention",sent:"Explanation shared",resolved:"Resolved",struggling:"Needs another look"}[s]||s)+'</span>'}

export function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.style.display = 'block';
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => element.style.display = 'none', 3000);
}
