import type { Plan } from '@p3/engine';
import { coverageChart } from './charts';
import { documentDisclaimers, htmlDoc } from './common';
import type { RenderInput, RenderOptions } from './types';
import { h, list, man, TIER_JA } from './util';

const CSS = `
html,body { height:100%; overflow:hidden; background:#10182b; }
.deck { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; }
.slide { position:absolute; width:1280px; height:720px; background:#fff; padding:56px 72px; display:none; flex-direction:column; gap:22px; transform-origin:center center; font-size:20px; line-height:1.6; }
.slide.active { display:flex; }
.slide h1 { font-size:40px; }
.slide h2 { font-size:32px; border-left:8px solid var(--accent); padding-left:16px; }
.slide .lead { font-size:22px; color:var(--gray); }
.big { font-size:44px; color:var(--navy); font-weight:700; }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:36px; align-items:center; }
.kv { display:flex; justify-content:space-between; border-bottom:1px solid var(--line); padding:6px 0; }
.comp { border:1px solid var(--line); border-radius:8px; padding:12px 18px; margin-bottom:10px; }
.meter { height:12px; background:var(--light); border-radius:6px; overflow:hidden; }
.meter-fill { height:100%; background:var(--accent); }
.foot { position:absolute; bottom:18px; left:72px; right:72px; display:flex; justify-content:space-between; font-size:13px; color:var(--gray); }
.cover { background:linear-gradient(135deg,#1f2d4d,#2f4470); color:#fff; justify-content:center; }
.cover h1 { color:#fff; font-size:46px; } .cover .lead { color:#dfe5f0; }
.nav { position:fixed; bottom:12px; right:16px; display:flex; gap:8px; z-index:5; }
.nav button { font:inherit; font-size:14px; padding:8px 14px; border-radius:6px; border:0; background:rgba(255,255,255,.85); cursor:pointer; min-width:44px; min-height:44px; }
.disc { font-size:13px; line-height:1.5; }
@media print { .nav { display:none; } }
`;

const SCRIPT = `<script>(function(){var s=[].slice.call(document.querySelectorAll('.slide'));var i=0;function fit(){var z=Math.min(window.innerWidth/1280,window.innerHeight/720);s.forEach(function(x){x.style.transform='scale('+z+')';});}
function go(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach(function(x,j){x.classList.toggle('active',j===i);});var c=document.getElementById('cnt');if(c)c.textContent=(i+1)+' / '+s.length;}
document.addEventListener('keydown',function(e){if(['ArrowRight','PageDown',' ','Enter'].indexOf(e.key)>=0){go(i+1);e.preventDefault();}if(['ArrowLeft','PageUp','Backspace'].indexOf(e.key)>=0){go(i-1);e.preventDefault();}if(e.key==='f'||e.key==='F'){if(!document.fullscreenElement&&document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();else if(document.exitFullscreen)document.exitFullscreen();}});
var x0=null;document.addEventListener('touchstart',function(e){x0=e.touches[0].clientX;},{passive:true});document.addEventListener('touchend',function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>40)go(i+(dx<0?1:-1));x0=null;});
document.getElementById('prev').onclick=function(){go(i-1)};document.getElementById('next').onclick=function(){go(i+1)};document.getElementById('fs').onclick=function(){if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();};
window.addEventListener('resize',fit);fit();go(0);})();</script>`;

function planSlide(input: RenderInput, p: Plan): string {
  const n = input.narrative.plans.find((x) => x.tier === p.tier);
  const rec = input.recommendedTier === p.tier;
  const comps = p.components
    .map((c) => `<div class="comp"><div class="kv" style="border:0"><b>${h(c.label)}</b><span>${h(man(c.deathBenefit))}</span></div><div style="font-size:16px;color:var(--gray)">${h(c.purpose)}（${c.categoryCode === 'WHOLE_LIFE' ? '終身' : `${c.termToAge}歳まで`}）</div></div>`)
    .join('');
  return `<section class="slide"><h2>${h(TIER_JA[p.tier])}${rec ? ' <span class="badge accent" style="font-size:16px;vertical-align:middle">おすすめ</span>' : ''}</h2>
<div class="grid" style="align-items:start"><div><div style="font-size:28px;font-weight:700;color:var(--navy2)">${h(n?.headline ?? '')}</div><p class="lead">${h(p.concept)}</p>${list((n?.whyThisCompany ?? []).slice(-1))}<p style="color:var(--gray)">${h(n?.fitFor ?? '')}</p></div>
<div>${comps}<div class="kv"><span>充足率（既存保障を含む）</span><b>${p.coverageRatioMoney.value.toFixed(1)}%</b></div><div class="meter"><div class="meter-fill" style="width:${Math.min(100, p.coverageRatio * 100).toFixed(1)}%"></div></div>
<div class="kv"><span>保険料の目安</span><span>${p.totalPremium ? `年 約${h(man(p.totalPremium))}（参考値）` : '設計書にて提示'}</span></div></div></div></section>`;
}

export function renderSlides(input: RenderInput, opts: RenderOptions): string {
  const { narrative: n, calc } = input;
  const cv = calc.coverage;
  const slides = [
    `<section class="slide cover"><h1>${h(n.onePaper.title)}</h1><p class="lead">${h(n.onePaper.lead)}</p></section>`,
    `<section class="slide"><h2>必要保障額の算定</h2><div class="grid"><div>${coverageChart(calc, { width: 330, height: 200 })}</div><div>
<div class="kv"><span>事業保障資金</span><b>${h(man(cv.businessFund))}</b></div><div class="kv"><span>死亡退職金</span><b>${h(man(cv.deathRetirement))}</b></div><div class="kv"><span>弔慰金</span><b>${h(man(cv.condolence))}</b></div>
<div class="kv"><span>必要保障額</span><b>${h(man(cv.required))}</b></div><div class="kv"><span>既存の保障</span><b>${h(man(cv.existing))}</b></div><div class="kv"><span>不足額</span><span class="big">${h(man(cv.gap))}</span></div></div></div></section>`,
    ...input.planSet.plans.map((p) => planSlide(input, p)),
    `<section class="slide"><h2>次のアクション</h2><p class="big" style="font-size:34px">${h(n.onePaper.closing)}</p><div class="disc">${list(documentDisclaimers(input))}</div></section>`,
  ];
  const body = `<div class="deck">${slides.join('')}</div><div class="nav noprint"><button id="prev" aria-label="前へ">◀</button><button id="cnt" disabled></button><button id="next" aria-label="次へ">▶</button><button id="fs" aria-label="全画面">⛶</button></div>${SCRIPT}`;
  return htmlDoc(`${input.company.name}様 ご提案スライド`, body, CSS, input, { ...opts, preview: false });
}
