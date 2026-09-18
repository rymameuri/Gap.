const key = 'gap-demo-v2';
export function loadDemoState(initial) {
  let state = structuredClone(initial);
  try {
    const saved = JSON.parse(sessionStorage.getItem(key));
    if (saved && Array.isArray(saved.gaps) && Array.isArray(saved.review)) state = {...state, ...saved};
  } catch {}
  return state;
}
export function saveDemoState(state) {
  try { sessionStorage.setItem(key, JSON.stringify(state)); } catch {}
}
