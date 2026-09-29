let language=localStorage.getItem('language') === 'hu' ? 'hu' : 'en';
export const t=(en,hu)=>language==='hu'?hu:en;
export function translate(){document.documentElement.lang=language;for(const node of document.querySelectorAll('[data-hu]')){node.dataset.en??=node.textContent;node.textContent=language==='hu'?node.dataset.hu:node.dataset.en;}document.getElementById('language').textContent=language==='hu'?'HU / EN':'EN / HU';}
export function toggleLanguage(){language=language==='hu'?'en':'hu';localStorage.setItem('language',language);translate();}
