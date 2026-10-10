/* AMANAH direct printing: renders prepared HTML inside the current page in a
   short-lived off-screen iframe, then calls the native print dialog.
   It creates no browser tabs or external print preview pages.
*/
(function(){
  'use strict';
  const frames=new WeakMap();
  const MAX_WAIT_MS=6000;
  const CLEANUP_MS=180000;
  function create(title){
    const frame=document.createElement('iframe');
    frame.setAttribute('title','AMANAH Print: '+(title||'Document'));
    frame.setAttribute('aria-hidden','true');
    frame.style.cssText='position:fixed!important;left:-12000px!important;top:0!important;width:794px!important;height:1123px!important;border:0!important;opacity:0!important;pointer-events:none!important;z-index:-1!important';
    document.body.appendChild(frame);
    const child=frame.contentWindow;
    frames.set(child,{frame,done:false,closing:false});
    return child;
  }
  function release(child){
    const job=frames.get(child);
    if(!job||job.closing)return;
    job.closing=true;
    frames.delete(child);
    if(job.frame.isConnected)job.frame.remove();
  }
  function waitForMedia(doc,maxWait){
    const images=Array.from(doc.images||[]);
    const settled=images.map(img=>img.complete?Promise.resolve():
      new Promise(resolve=>{
        img.addEventListener('load',resolve,{once:true});
        img.addEventListener('error',resolve,{once:true});
      }));
    return Promise.race([
      Promise.all(settled),
      new Promise(resolve=>setTimeout(resolve,maxWait))
    ]);
  }
  function finish(child,options){
    const job=frames.get(child);
    if(!job||job.done)return;
    job.done=true;
    const opts=options||{};
    const timeout=setTimeout(()=>release(child),CLEANUP_MS);
    const cleanup=()=>{clearTimeout(timeout);setTimeout(()=>release(child),750);};
    child.addEventListener('afterprint',cleanup,{once:true});
    // Keep the original app and its scroll position unchanged; only print the iframe.
    waitForMedia(child.document,opts.maxWaitMs||MAX_WAIT_MS).then(()=>{
      if(!frames.has(child))return;
      setTimeout(()=>{
        if(!frames.has(child))return;
        try{
          child.focus();
          child.print();
        }catch(error){
          console.error('AMANAH direct print failed:',error);
          cleanup();
          window.alert('The browser could not open the print dialog. Please try again.');
        }
      },150);
    }).catch(error=>{console.error('AMANAH print media error:',error);cleanup();});
  }
  window.AmanahDirectPrint={create,finish,release};
})();