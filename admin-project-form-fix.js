(function(){
  'use strict';

  function makeProjectFieldsEditable(){
    const form = document.getElementById('formFields');
    if(!form) return;

    form.querySelectorAll('input, textarea, select').forEach(el => {
      if (el.hasAttribute('readonly')) el.removeAttribute('readonly');
      if (el.hasAttribute('disabled')) el.removeAttribute('disabled');

      if (el.readOnly) el.readOnly = false;
      if (el.disabled) el.disabled = false;

      el.style.setProperty('pointer-events','auto','important');
      el.style.setProperty('user-select','text','important');
      el.style.setProperty('-webkit-user-select','text','important');
      el.style.setProperty('caret-color','#0f172a','important');
      el.style.setProperty('cursor', el.tagName === 'SELECT' ? 'pointer' : 'text','important');

      if(el.tagName === 'INPUT' && el.dataset.decimalInput === 'true'){
        if (el.getAttribute('inputmode') !== 'decimal') {
          el.setAttribute('inputmode','decimal');
        }
        if (el.getAttribute('autocomplete') !== 'off') {
          el.setAttribute('autocomplete','off');
        }

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

      // IMPORTANT: watch only for new form controls.
      // Watching attributes here would create a mutation loop because
      // makeProjectFieldsEditable() itself updates attributes/styles.
      const observer = new MutationObserver(mutations => {
        if (mutations.some(m => m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length))) {
          makeProjectFieldsEditable();
        }
      });

      observer.observe(form,{
        childList:true,
        subtree:true
      });
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded',bind,{once:true});
  }else{
    bind();
  }

  document.addEventListener('click', function(event){
    const target = event.target;
    if(target && target.closest &&
       target.closest('#addProjectButton,[data-project-type]')){
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
