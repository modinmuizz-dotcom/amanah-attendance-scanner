const SUPABASE_URL="https://bafmycjninxomufhkjvy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ";
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

const state={suppliers:[],editingId:null,confirmResolver:null};

function esc(v){return v==null?"":String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
function notice(text,type="success"){
 const el=document.getElementById("notice"),shade=document.getElementById("shade");
 el.textContent=text;el.className="notice "+type;el.style.display="block";shade.style.display="block";
 clearTimeout(window.__supplierTimer);window.__supplierTimer=setTimeout(()=>{el.style.display="none";el.textContent="";shade.style.display="none";},2800);
}
function clearNotice(){document.getElementById("notice").style.display="none";document.getElementById("notice").textContent="";document.getElementById("shade").style.display="none";}
function bind(){
 document.getElementById("addSupplier").addEventListener("click",openAdd);
 document.getElementById("closeSupplier").addEventListener("click",closeSupplier);
 document.getElementById("cancelSupplier").addEventListener("click",closeSupplier);
 document.getElementById("saveSupplier").addEventListener("click",saveSupplier);
 document.getElementById("closeConfirm").addEventListener("click",()=>resolveConfirm(false));
 document.getElementById("cancelConfirm").addEventListener("click",()=>resolveConfirm(false));
 document.getElementById("acceptConfirm").addEventListener("click",()=>resolveConfirm(true));
 ["searchSupplier","filterStatus","filterType"].forEach(id=>document.getElementById(id).addEventListener("input",render));
 document.getElementById("clearFilters").addEventListener("click",()=>{document.getElementById("searchSupplier").value="";document.getElementById("filterStatus").value="";document.getElementById("filterType").value="";render();});
}
async function init(){
 const {data:{session}}=await supabaseClient.auth.getSession();if(!session){location.href="admin.html";return;}
 bind();
 try{await loadSuppliers();render();}catch(e){console.error(e);notice("Could not load Supplier Master: "+e.message,"error");}
}
async function loadSuppliers(){
 const {data,error}=await supabaseClient.from("suppliers").select("*").order("supplier_name");
 if(error)throw error;
 state.suppliers=data||[];
}
function render(){
 const q=document.getElementById("searchSupplier").value.toLowerCase().trim(),status=document.getElementById("filterStatus").value,type=document.getElementById("filterType").value;
 const rows=state.suppliers.filter(s=>
   (!q||[s.supplier_code,s.supplier_name,s.contact_person,s.contact_no,s.email].join(" ").toLowerCase().includes(q)) &&
   (!status||s.status===status) &&
   (!type||s.supplier_type===type)
 );
 document.getElementById("metricTotal").textContent=state.suppliers.length;
 document.getElementById("metricActive").textContent=state.suppliers.filter(s=>s.status==="ACTIVE").length;
 document.getElementById("metricInactive").textContent=state.suppliers.filter(s=>s.status==="INACTIVE").length;
 document.getElementById("supplierBody").innerHTML=rows.length?rows.map(s=>
   '<tr>'+
     '<td><strong>'+esc(s.supplier_code)+'</strong></td>'+
     '<td><strong>'+esc(s.supplier_name)+'</strong><br><small style="color:#64748b">'+esc(s.tin||"")+'</small></td>'+
     '<td>'+esc(s.supplier_type)+'</td>'+
     '<td>'+esc(s.contact_person||"—")+'</td>'+
     '<td>'+esc(s.contact_no||"—")+'</td>'+
     '<td>'+esc(s.email||"—")+'</td>'+
     '<td>'+esc(s.payment_terms||"—")+'</td>'+
     '<td><span class="badge '+(s.status==="ACTIVE"?"active":"inactive")+'">'+esc(s.status)+'</span></td>'+
     '<td><div class="actions"><button class="mini edit" data-edit="'+esc(s.supplier_id)+'">EDIT</button>'+
       (s.status==="ACTIVE"?'<button class="mini deactivate" data-toggle="'+esc(s.supplier_id)+'">DEACTIVATE</button>':'<button class="mini activate" data-toggle="'+esc(s.supplier_id)+'">ACTIVATE</button>')+
       '<button class="mini delete" data-delete="'+esc(s.supplier_id)+'">DELETE</button></div></td>'+
   '</tr>'
 ).join(""):'<tr><td colspan="9" class="empty">No suppliers found.</td></tr>';
 document.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>openEdit(b.dataset.edit)));
 document.querySelectorAll("[data-toggle]").forEach(b=>b.addEventListener("click",()=>toggleStatus(b.dataset.toggle)));
 document.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteSupplier(b.dataset.delete)));
}
function resetForm(){
 state.editingId=null;document.getElementById("modalTitle").textContent="ADD SUPPLIER";document.getElementById("supplierName").value="";document.getElementById("supplierType").value="MATERIAL SUPPLIER";document.getElementById("contactPerson").value="";document.getElementById("contactNo").value="";document.getElementById("email").value="";document.getElementById("tin").value="";document.getElementById("address").value="";document.getElementById("paymentTerms").value="";document.getElementById("deliveryTerms").value="";document.getElementById("notes").value="";document.getElementById("supplierStatus").value="ACTIVE";document.getElementById("saveSupplier").textContent="SAVE SUPPLIER";
}
function openAdd(){clearNotice();resetForm();document.getElementById("supplierModal").style.display="flex";}
function openEdit(id){
 clearNotice();const s=state.suppliers.find(x=>x.supplier_id===id);if(!s)return;state.editingId=id;
 document.getElementById("modalTitle").textContent="EDIT SUPPLIER";document.getElementById("saveSupplier").textContent="SAVE CHANGES";
 document.getElementById("supplierName").value=s.supplier_name||"";document.getElementById("supplierType").value=s.supplier_type||"MATERIAL SUPPLIER";document.getElementById("contactPerson").value=s.contact_person||"";document.getElementById("contactNo").value=s.contact_no||"";document.getElementById("email").value=s.email||"";document.getElementById("tin").value=s.tin||"";document.getElementById("address").value=s.address||"";document.getElementById("paymentTerms").value=s.payment_terms||"";document.getElementById("deliveryTerms").value=s.delivery_terms||"";document.getElementById("notes").value=s.notes||"";document.getElementById("supplierStatus").value=s.status||"ACTIVE";
 document.getElementById("supplierModal").style.display="flex";
}
function closeSupplier(){document.getElementById("supplierModal").style.display="none";state.editingId=null;}
async function saveSupplier(){
 const name=document.getElementById("supplierName").value.trim();if(!name)return notice("Supplier Name is required.","error");
 const payload={supplier_name:name,supplier_type:document.getElementById("supplierType").value,contact_person:document.getElementById("contactPerson").value.trim()||null,contact_no:document.getElementById("contactNo").value.trim()||null,email:document.getElementById("email").value.trim()||null,tin:document.getElementById("tin").value.trim()||null,address:document.getElementById("address").value.trim()||null,payment_terms:document.getElementById("paymentTerms").value.trim()||null,delivery_terms:document.getElementById("deliveryTerms").value.trim()||null,notes:document.getElementById("notes").value.trim()||null,status:document.getElementById("supplierStatus").value};
 const btn=document.getElementById("saveSupplier");btn.disabled=true;btn.textContent="SAVING...";
 try{
   if(state.editingId){
     const {error}=await supabaseClient.from("suppliers").update(payload).eq("supplier_id",state.editingId);if(error)throw error;
     notice("Supplier updated successfully.");
   }else{
     const {data,error}=await supabaseClient.from("suppliers").insert(payload).select("supplier_code").single();if(error)throw error;
     notice("Supplier "+data.supplier_code+" registered successfully.");
   }
   closeSupplier();await loadSuppliers();render();
 }catch(e){console.error(e);notice("Could not save supplier: "+e.message,"error");}
 finally{btn.disabled=false;btn.textContent=state.editingId?"SAVE CHANGES":"SAVE SUPPLIER";}
}
function resolveConfirm(answer){document.getElementById("confirmModal").style.display="none";document.getElementById("shade").style.display="none";if(state.confirmResolver){const fn=state.confirmResolver;state.confirmResolver=null;fn(answer);}}
function showConfirm(title,message,confirmText="CONFIRM"){
 document.getElementById("confirmTitle").textContent=title;document.getElementById("confirmMessage").textContent=message;document.getElementById("acceptConfirm").textContent=confirmText;document.getElementById("confirmModal").style.display="flex";
 return new Promise(resolve=>{state.confirmResolver=resolve;});
}
async function toggleStatus(id){
 const s=state.suppliers.find(x=>x.supplier_id===id);if(!s)return;const next=s.status==="ACTIVE"?"INACTIVE":"ACTIVE";
 const ok=await showConfirm(next==="ACTIVE"?"ACTIVATE SUPPLIER":"DEACTIVATE SUPPLIER","Set "+s.supplier_name+" to "+next+" status? ",next==="ACTIVE"?"ACTIVATE":"DEACTIVATE");if(!ok)return;
 const {error}=await supabaseClient.from("suppliers").update({status:next}).eq("supplier_id",id);if(error)return notice("Could not update supplier status: "+error.message,"error");
 notice(s.supplier_name+" is now "+next+".");await loadSuppliers();render();
}
async function deleteSupplier(id){
 const s=state.suppliers.find(x=>x.supplier_id===id);if(!s)return;
 const ok=await showConfirm("DELETE SUPPLIER","Delete "+s.supplier_name+" permanently? This is only allowed when no Purchase Order is linked to the supplier.","DELETE SUPPLIER");if(!ok)return;
 const {error}=await supabaseClient.from("suppliers").delete().eq("supplier_id",id);
 if(error)return notice("Supplier cannot be deleted. It may already be linked to a Purchase Order. Deactivate it instead.","error");
 notice(s.supplier_name+" deleted successfully.");await loadSuppliers();render();
}
document.addEventListener("DOMContentLoaded",()=>init());
