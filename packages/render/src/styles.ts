export function baseCss(accent: string): string {
  return `
:root { --navy:#1f2d4d; --navy2:#2f4470; --gray:#5b6472; --light:#eef1f6; --line:#c9d0dc; --accent:${accent}; --ink:#1d2330; }
* { box-sizing:border-box; }
html,body { margin:0; padding:0; }
body { font-family:'Noto Serif JP','Hiragino Mincho ProN','Yu Mincho',serif; color:var(--ink); font-size:9pt; line-height:1.55; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
h1,h2,h3,h4 { font-weight:700; margin:0; color:var(--navy); }
table { border-collapse:collapse; width:100%; }
th,td { border-bottom:1px solid var(--line); padding:3px 5px; text-align:left; vertical-align:top; }
th { color:var(--gray); font-weight:400; white-space:nowrap; }
td.num, th.num { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
.badge-assumed { display:inline-block; margin-left:4px; padding:0 4px; font-size:7pt; border-radius:3px; background:#fff3bf; color:#7a5b00; border:1px solid #e9c46a; }
.badge { display:inline-block; padding:1px 6px; font-size:7.5pt; border-radius:3px; background:var(--navy); color:#fff; }
.badge.accent { background:var(--accent); }
.muted { color:var(--gray); }
.small { font-size:7.5pt; }
.xsmall { font-size:6.6pt; line-height:1.45; }
ul { margin:2px 0; padding-left:1.2em; }
li { margin:1px 0; }
.page { position:relative; overflow:hidden; background:#fff; }
.box { border:1px solid var(--line); border-radius:4px; padding:6px 8px; }
.box-title { font-size:9.5pt; color:var(--navy); border-left:3px solid var(--accent); padding-left:6px; margin-bottom:4px; font-weight:700; }
.disclaimers { border-top:1px solid var(--line); padding-top:3px; }
.disclaimers li { margin:0; }
@media screen {
  body { background:#dfe3ea; }
  .page { margin:12px auto; box-shadow:0 2px 10px rgba(0,0,0,.15); }
}
@media print { .page { margin:0; box-shadow:none; } .noprint { display:none !important; } }
`;
}

/** Scales fixed-size pages down to the viewport width in screen previews. */
export const FIT_SCRIPT = `<script>(function(){function fit(){var p=document.querySelector('.page');if(!p)return;var w=p.offsetWidth+24;var z=Math.min(1,window.innerWidth/w);document.body.style.zoom=z;}window.addEventListener('resize',fit);window.addEventListener('load',fit);fit();})();</script>`;
