(function(){
  'use strict';

  function makeProjectFieldsEditable(){
    const form = document.getElementById('formFields');
    if(!form) return;

    form.querySelectorAll('input, textarea, select').forEach(el => {
      el.removeAttribute('readonly');
      el.removeAttribute('disabled');
      el.readOnly = false;
      el.disabled = false;
      el.style.setProperty('pointer-events','auto','important');
      el.style.setProperty('user-select','text','important');
      el.style.setProperty('-webkit-user-select','text','important');
      el.style.setProperty('caret-color','#0f172a','important');
      el.style.setProperty('cursor','text','important');

      if(el.tagName === 'INPUT' && el.dataset.decimalInput === 'true'){
        el.setAttribute('inputmode','decimal');
        el.setAttribute('autocomplete','off');

        if(el.dataset.decimalFixBound !== 'true'){
          el.dataset.decimalFixBound = 'true';
          el.addEventListener('input', function(){
            let v = String(el.value || '').replace(/[^0-9.]/g,'');
            const dot = v.indexOf('.');
            if(dot >= 0){
              v = v.slice(0,dot+1) + v.slice(dot+1).replace(/\./g,'');
            }
            el.value = v;
          });
        }
      }
    });
  }

  function bind(){
    makeProjectFieldsEditable();

    const form = document.getElementById('formFields');
    if(form && !form.dataset.projectEditableObserver){
      form.dataset.projectEditableObserver = 'true';
      const observer = new MutationObserver(makeProjectFieldsEditable);
      observer.observe(form,{childList:true,subtree:true,attributes:true});
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded',bind,{once:true});
  }else{
    bind();
  }

  document.addEventListener('click', function(event){
    const target = event.target;
    if(target && target.closest && target.closest('#addProjectButton,[data-project-type],[data-project-type]')){
      setTimeout(makeProjectFieldsEditable,50);
      setTimeout(makeProjectFieldsEditable,250);
    }
  });

  document.addEventListener('focusin', function(event){
    const el = event.target;
    if(el && el.closest && el.closest('#formFields')){
      el.removeAttribute('readonly');
      el.removeAttribute('disabled');
      el.readOnly = false;
      el.disabled = false;
      el.style.setProperty('pointer-events','auto','important');
      el.style.setProperty('user-select','text','important');
      el.style.setProperty('-webkit-user-select','text','important');
      el.style.setProperty('caret-color','#0f172a','important');
    }
  }, true);
})();
