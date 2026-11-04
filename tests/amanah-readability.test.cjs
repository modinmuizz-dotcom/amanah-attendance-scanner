const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const R=require('../amanah-readability.js');
const dark=[22,34,53,1],white=[255,255,255,1];

test('contrast math handles transparent and percentage RGB values',()=>{
  assert.equal(R.ratio([0,0,0,1],white),21);
  assert.equal(R.ratio(white,white),1);
  assert.deepEqual(R.over([255,255,255,.5],[0,0,0,1]),[127.5,127.5,127.5,1]);
  assert.deepEqual(R.color('rgb(100% 0% 0% / 50%)').map(v=>Math.round(v*100)/100),[255,0,0,.5]);
  assert.equal(R.color('not a CSS color'),null);
});
test('dark record values and light-panel values both reach 4.5:1',()=>{
  for(const [foreground,background] of [[[15,23,42,1],dark],[[241,246,255,1],white]]){
    const corrected=R.readableColor(foreground,[background]);
    assert.ok(corrected);assert.ok(R.ratio(corrected,background)>=4.5);
  }
  assert.equal(R.readableColor([241,246,255,1],[dark]),null,'Readable text stays unchanged');
});
test('colored text retains its color direction while becoming readable',()=>{
  for(const original of [[185,28,28,1],[21,128,61,1],[29,78,216,1]]){
    const corrected=R.readableColor(original,[dark]);
    assert.ok(corrected);assert.ok(R.ratio(corrected,dark)>=4.5);
    assert.equal(corrected.indexOf(Math.max(...corrected.slice(0,3))),original.indexOf(Math.max(...original.slice(0,3))));
  }
  assert.equal(R.readableColor([180,180,180,1],[white,[0,0,0,1]]),null,'Mixed photographic backgrounds need their own backing');
});
test('readability holds across the workspace palette and gradient endpoints',()=>{
  const backgrounds=[[9,15,28,1],[30,48,72,1],[37,56,79,1],[37,58,82,1],[255,248,232,1],white];
  const foregrounds=[[0,0,0,1],[15,23,42,1],[51,65,85,1],[100,116,139,1],[121,88,23,1],[241,246,255,1]];
  for(const bg of backgrounds)for(const fg of foregrounds){
    const corrected=R.readableColor(fg,[bg])||fg;assert.ok(R.ratio(corrected,bg)>=4.5);
  }
  const stops=[[24,29,41,1],[118,87,30,1]];
  const corrected=R.readableColor([15,23,42,1],stops);
  assert.ok(stops.every(bg=>R.ratio(corrected,bg)>=4.5));
});

class Element {
  constructor(tag='div',classes='',computed={}){
    this.nodeType=1;this.tagName=tag.toUpperCase();this.classes=new Set(classes.split(' '));this.childNodes=[];this.attributes=new Map();this.parentElement=null;this.isConnected=true;
    this.values=new Map();this.style={setProperty:(k,v)=>this.values.set(k,v),removeProperty:k=>this.values.delete(k),getPropertyValue:k=>this.values.get(k)||''};
    this.computed={color:'rgb(15,23,42)',backgroundColor:'rgba(0,0,0,0)',backgroundImage:'none',visibility:'visible',...computed};
  }
  appendChild(node){node.parentElement=this;this.childNodes.push(node);return node;}
  text(value){this.childNodes.push({nodeType:3,textContent:value,parentElement:this});return this;}
  setAttribute(k,v){this.attributes.set(k,v);}
  getAttribute(k){return this.attributes.get(k)??null;}
  hasAttribute(k){return this.attributes.has(k);}
  removeAttribute(k){this.attributes.delete(k);}
  contains(node){for(let n=node;n;n=n.parentElement)if(n===this)return true;return false;}
  matches(selector){
    if(selector==='[data-amanah-contrast="off"]')return this.getAttribute('data-amanah-contrast')==='off';
    const [tag,...classes]=selector.split('.');
    return (!tag||tag.toUpperCase()===this.tagName)&&classes.every(c=>this.classes.has(c));
  }
  closest(selector){for(let n=this;n;n=n.parentElement)if(selector.split(',').some(s=>n.matches(s)))return n;return null;}
  querySelectorAll(){return this.childNodes.filter(n=>n.nodeType===1).flatMap(n=>[n,...n.querySelectorAll('*')]);}
  getClientRects(){return this.hidden?[]:[{}];}
}
function harness(){
  const html=new Element('html'),body=html.appendChild(new Element('body','amanah-common-active',{backgroundColor:'rgb(9,15,28)'}));
  html.setAttribute('data-amanah-mode','dark');
  const timers=new Map(),events=new Map();let timerId=0;
  const screen={matches:true,addEventListener:(name,fn)=>events.set('media-'+name,fn)};
  const doc={documentElement:html,body,head:new Element('head'),readyState:'complete',createElement:tag=>new Element(tag),addEventListener:(name,fn)=>events.set(name,fn)};
  let observer;
  const win={document:doc,matchMedia:()=>screen,MutationObserver:class {
    constructor(callback){this.callback=callback;observer=this;}
    observe(){this.active=true;}
    disconnect(){this.active=false;}
  },setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},addEventListener:(name,fn)=>events.set(name,fn),
  getComputedStyle:node=>({...node.computed,color:node.hasAttribute('data-amanah-readable')&&screen.matches&&html.getAttribute('data-amanah-mode')==='dark'?node.style.getPropertyValue('--amanah-readable-ink'):node.computed.color})};
  const api=R.install(win);
  const flush=()=>{const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());assert.equal(timers.size,0,'Contrast updates must not schedule their own observer loop');};
  return{html,body,doc,win,screen,events,api,flush,change:target=>{observer.callback([{target}]);flush();}};
}
function card(h){return h.body.appendChild(new Element('div','detail-card',{backgroundColor:'rgb(22,34,53)'}));}
function corrected(node){return node.style.getPropertyValue('--amanah-readable-ink');}
test('the shared guard corrects nested detail values, controls and dynamically added records',()=>{
  const h=harness(),c=card(h),value=c.appendChild(new Element('div','value').text('TEST PROJECT'));
  const input=c.appendChild(new Element('input'));input.type='number';
  h.flush();
  assert.ok(R.ratio(R.color(corrected(value)),dark)>=4.5);
  assert.ok(R.ratio(R.color(corrected(input)),dark)>=4.5);
  assert.equal(value.computed.color,'rgb(15,23,42)','Original module colors are retained');
  const fresh=c.appendChild(new Element('div','value').text('Loaded later'));
  h.change(c);assert.ok(corrected(fresh));assert.equal(h.api.observing,true);
});
test('light surfaces get dark text and dark semantic backgrounds retain readable colors',()=>{
  const h=harness(),c=card(h);
  const light=c.appendChild(new Element('div','legacy-summary',{backgroundColor:'rgb(255,255,255)',color:'rgb(241,246,255)'}).text('10'));
  const badge=c.appendChild(new Element('span','pill',{backgroundColor:'rgb(255,247,237)',color:'rgb(194,65,12)'}).text('IN PROGRESS'));
  h.flush();assert.ok(R.ratio(R.color(corrected(light)),white)>=4.5);assert.equal(corrected(badge),'');
});
test('hidden details are corrected on opening and gradients use every color stop',()=>{
  const h=harness(),c=card(h),value=c.appendChild(new Element('div','value').text('Hidden project'));value.hidden=true;
  const gradient=h.body.appendChild(new Element('div','hero',{backgroundImage:'linear-gradient(90deg,rgb(24,29,41),rgb(118,87,30))'}).text('BUILDING'));
  h.flush();assert.equal(corrected(value),'');assert.ok(corrected(gradient));
  value.hidden=false;h.change(c);assert.ok(corrected(value));
});
test('maps, illustrations, login artwork and explicitly opted-out content are excluded',()=>{
  const h=harness();
  for(const [tag,cls]of [['div','leaflet-container'],['svg',''],['div','admin-login-screen']]){
    const parent=h.body.appendChild(new Element(tag,cls,{backgroundColor:'rgb(22,34,53)'}));
    const text=parent.appendChild(new Element('div').text('Protected visual'));
    h.flush();h.change(parent);assert.equal(corrected(text),'');
  }
  const photo=h.body.appendChild(new Element('div','',{backgroundImage:'url(photo.jpg)'}).text('Image'));
  const opt=card(h);opt.setAttribute('data-amanah-contrast','off');opt.text('Opt out');
  h.api.refresh();h.flush();assert.equal(corrected(photo),'');assert.equal(corrected(opt),'');
});
test('light mode and print keep the original styling, and returning to dark recomputes it',()=>{
  const h=harness(),value=card(h).appendChild(new Element('div','value').text('PROJECT'));
  h.flush();assert.ok(corrected(value));
  h.html.setAttribute('data-amanah-mode','light');h.change(h.html);
  assert.equal(h.win.getComputedStyle(value).color,value.computed.color);
  h.html.setAttribute('data-amanah-mode','dark');h.screen.matches=false;h.change(h.html);
  assert.equal(h.win.getComputedStyle(value).color,value.computed.color);
  h.screen.matches=true;h.change(h.html);assert.ok(R.ratio(R.color(corrected(value)),dark)>=4.5);
  const style=h.doc.head.childNodes[0].textContent;
  assert.match(style,/@layer amanah-readability/);assert.match(style,/@media screen/);assert.match(style,/data-amanah-mode="dark"/);
});

test('autofill text fill is corrected while intentionally transparent text remains hidden',()=>{
  const h=harness(),c=card(h);
  const input=c.appendChild(new Element('input','',{color:'rgb(241,246,255)',webkitTextFillColor:'rgb(15,23,42)'}));input.type='text';
  const hidden=c.appendChild(new Element('span','',{color:'rgba(0,0,0,0)'}).text('Intentional replacement text'));
  h.flush();assert.ok(R.ratio(R.color(corrected(input)),dark)>=4.5);assert.equal(corrected(hidden),'');
});

test('all management pages load the updated shared theme and UI',()=>{
  const root=path.resolve(__dirname,'..');let pages=0;
  for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.html'))){
    const html=fs.readFileSync(path.join(root,name),'utf8');
    if(!html.includes('amanah-ui.js'))continue;
    pages++;assert.match(html,/amanah-ui\.js\?v=45/,name);
    if(html.includes('amanah-dark-modules.css'))assert.match(html,/amanah-dark-modules\.css\?v=4/,name);
  }
  assert.equal(pages,19);
  const history=fs.readFileSync(path.join(root,'equipment-history.html'),'utf8');
  assert.match(history,/amanah-readability\.js\?v=1/);assert.match(history,/amanah-dark-modules\.css\?v=4/);
  const ui=fs.readFileSync(path.join(root,'amanah-ui.js'),'utf8');assert.match(ui,/amanah-readability\.js\?v=1/);
});
