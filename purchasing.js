const SUPABASE_URL="https://bafmycjninxomufhkjvy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ";
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

const state={projects:[],employees:[],requests:[],requestItems:[],orders:[],orderItems:[],activeRequestId:null,activeOrderId:null,activeTab:"requests",prDraftItems:[],poDraftRequest:null,editingRequestId:null,editingOrderId:null,confirmResolver:null};

function esc(v){return v==null?"":String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
function today(){return new Date().toISOString().slice(0,10);}
function money(v){return "₱"+Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});}
function statusClass(s){return {"DRAFT":"b-draft","SUBMITTED":"b-sub","UNDER REVIEW":"b-review","APPROVED":"b-approved","PARTIALLY ORDERED":"b-ordered","ORDERED":"b-ordered","REJECTED":"b-rejected","CANCELLED":"b-cancel","RECEIVED":"b-received","CLOSED":"b-received","SENT TO SUPPLIER":"b-ordered"}[s]||"b-draft";}
function statusBadge(s){return '<span class="badge '+statusClass(s)+'">'+esc(s)+'</span>';}
function msg(text,type="ok"){const el=document.getElementById("message"),shade=document.getElementById("messageShade");el.textContent=text;el.className="message "+type;shade.style.display="block";clearTimeout(window.__amanahPurchasingMessageTimer);window.__amanahPurchasingMessageTimer=setTimeout(()=>{el.className="message";el.textContent="";shade.style.display="none";},2800);}
function clearMsg(){const el=document.getElementById("message");el.className="message";el.textContent="";document.getElementById("messageShade").style.display="none";}
function fmtDate(v){if(!v)return "—";return new Date(v+"T00:00:00").toLocaleDateString();}

async function init(){
 const {data:{session}}=await supabaseClient.auth.getSession();
 if(!session){location.href="admin.html";return;}
 document.getElementById("requestDate").value=today();
 document.getElementById("poDate").value=today();
 bind();
 const results=await Promise.allSettled([loadProjects(),loadEmployees(),loadRequests(),loadOrders()]);
 const failed=results.filter(r=>r.status==="rejected");
 renderAll();
 if(failed.length){
   console.error("AMANAH Purchasing initialization errors:",failed.map(x=>x.reason));
   msg("Purchasing loaded with "+failed.length+" data service error(s). Please refresh or check the affected Supabase table/policy.","err");
 }
}
function bind(){
 document.getElementById("tabRequests").addEventListener("click",()=>switchTab("requests"));
 document.getElementById("tabOrders").addEventListener("click",()=>switchTab("orders"));
 document.getElementById("newRequest").addEventListener("click",openRequestModal);
 document.getElementById("closeRequest").addEventListener("click",closeRequestModal);
 document.getElementById("cancelRequest").addEventListener("click",closeRequestModal);
 document.getElementById("addPrItem").addEventListener("click",()=>{state.prDraftItems.push({material_name:"",specifications:"",quantity:1,unit:"PCS"});renderPrItems();});
  document.getElementById("saveRequest").addEventListener("click",saveRequest);document.getElementById("detailEditButton").addEventListener("click",()=>{const type=document.getElementById("detailTitle").dataset.type,id=type==="PO"?state.activeOrderId:state.activeRequestId;closeDetail();type==="PO"?openPOEdit(id):openRequestEdit(id);});document.getElementById("detailPrintButton").addEventListener("click",()=>{const type=document.getElementById("detailTitle").dataset.type,id=type==="PO"?state.activeOrderId:state.activeRequestId;type==="PO"?printPurchaseOrder(id):printPurchaseRequest(id);});document.getElementById("closeConfirm").addEventListener("click",()=>resolveConfirm(false));document.getElementById("cancelConfirm").addEventListener("click",()=>resolveConfirm(false));document.getElementById("acceptConfirm").addEventListener("click",()=>resolveConfirm(true));
 document.getElementById("closeDetail").addEventListener("click",closeDetail);
 document.getElementById("closeDetailButton").addEventListener("click",closeDetail);
 document.getElementById("detailPrimaryAction").addEventListener("click",primaryDetailAction);
 document.getElementById("closePo").addEventListener("click",closePoModal);
 document.getElementById("cancelPo").addEventListener("click",closePoModal);
 document.getElementById("savePo").addEventListener("click",savePurchaseOrder);
 ["prSearch","prStatus","prProject"].forEach(id=>document.getElementById(id).addEventListener("input",renderRequests));
 ["poSearch","poStatus","poProject"].forEach(id=>document.getElementById(id).addEventListener("input",renderOrders));
 document.getElementById("clearPrFilters").addEventListener("click",()=>{document.getElementById("prSearch").value="";document.getElementById("prStatus").value="";document.getElementById("prProject").value="";renderRequests();});
 document.getElementById("clearPoFilters").addEventListener("click",()=>{document.getElementById("poSearch").value="";document.getElementById("poStatus").value="";document.getElementById("poProject").value="";renderOrders();});
}
function switchTab(tab){state.activeTab=tab;document.getElementById("requestsPanel").style.display=tab==="requests"?"block":"none";document.getElementById("ordersPanel").style.display=tab==="orders"?"block":"none";document.getElementById("tabRequests").classList.toggle("active",tab==="requests");document.getElementById("tabOrders").classList.toggle("active",tab==="orders");}
async function loadProjects(){
 let data,error;
 ({data,error}=await supabaseClient.from("projects").select("project_id,project_name,location").order("project_name"));
 if(error){
   console.warn("Project location query failed; retrying without location.",error);
   ({data,error}=await supabaseClient.from("projects").select("project_id,project_name").order("project_name"));
 }
 if(error)throw error;
 state.projects=data||[];
 const opts='<option value="">SELECT PROJECT</option>'+state.projects.map(p=>'<option value="'+esc(p.project_id)+'">'+esc(p.project_name)+(p.location?" — "+esc(p.location):"")+'</option>').join("");
 document.getElementById("requestProject").innerHTML=opts;
 const filter='<option value="">ALL PROJECTS</option>'+state.projects.map(p=>'<option value="'+esc(p.project_id)+'">'+esc(p.project_name)+'</option>').join("");
 document.getElementById("prProject").innerHTML=filter;
 document.getElementById("poProject").innerHTML=filter;
}
async function loadEmployees(){
 let data,error;
 ({data,error}=await supabaseClient.from("employees").select("employee_id,employee_name,position").order("employee_name"));
 if(error){
   console.warn("Employee position query failed; retrying basic employee fields.",error);
   ({data,error}=await supabaseClient.from("employees").select("employee_id,employee_name").order("employee_name"));
 }
 if(error)throw error;
 state.employees=data||[];
 document.getElementById("requester").innerHTML='<option value="">SELECT SITE ENGINEER</option>'+state.employees.map(e=>'<option value="'+esc(e.employee_id)+'">'+esc(e.employee_name)+(e.position?" — "+esc(e.position):"")+'</option>').join("");
}
async function loadRequests(){
 const {data,error}=await supabaseClient.from("purchase_requests").select("*").order("request_date",{ascending:false}).order("created_at",{ascending:false}); if(error)throw error;
 state.requests=data||[]; if(!state.requests.length){state.requestItems=[];return;}
 const {data:items,error:ierr}=await supabaseClient.from("purchase_request_items").select("*").in("purchase_request_id",state.requests.map(x=>x.purchase_request_id)); if(ierr)throw ierr; state.requestItems=items||[];
}
async function loadOrders(){
 const {data,error}=await supabaseClient.from("purchase_orders").select("*").order("po_date",{ascending:false}).order("created_at",{ascending:false}); if(error)throw error;
 state.orders=data||[]; if(!state.orders.length){state.orderItems=[];return;}
 const {data:items,error:ierr}=await supabaseClient.from("purchase_order_items").select("*").in("purchase_order_id",state.orders.map(x=>x.purchase_order_id)); if(ierr)throw ierr; state.orderItems=items||[];
}
function renderAll(){renderRequests();renderOrders();renderMetrics();}
function renderMetrics(){
 const open=state.requests.filter(r=>["DRAFT","SUBMITTED","UNDER REVIEW","APPROVED","PARTIALLY ORDERED","ORDERED"].includes(r.status)).length;
 const review=state.requests.filter(r=>r.status==="SUBMITTED"||r.status==="UNDER REVIEW").length;
 const approved=state.requests.filter(r=>["APPROVED","PARTIALLY ORDERED","ORDERED"].includes(r.status)).length;
 const po=state.orders.filter(o=>!["CLOSED","CANCELLED"].includes(o.status)).length;
 document.getElementById("mOpen").textContent=open;document.getElementById("mReview").textContent=review;document.getElementById("mApproved").textContent=approved;document.getElementById("mPO").textContent=po;
}
function renderRequests(){
 const q=(document.getElementById("prSearch").value||"").toLowerCase().trim(),status=document.getElementById("prStatus").value,pid=document.getElementById("prProject").value;
 const rows=state.requests.filter(r=>(!q||[r.request_no,r.project_name,r.requester_name,r.purpose].join(" ").toLowerCase().includes(q))&&(!status||r.status===status)&&(!pid||r.project_id===pid));
 document.getElementById("prBody").innerHTML=rows.length?rows.map(r=>{
  const items=state.requestItems.filter(i=>i.purchase_request_id===r.purchase_request_id);
  let actions='<button class="mini blue" data-pr-view="'+esc(r.purchase_request_id)+'">VIEW</button><button class="mini edit" data-pr-edit="'+esc(r.purchase_request_id)+'">EDIT</button><button class="mini print" data-pr-print="'+esc(r.purchase_request_id)+'">PRINT</button><button class="mini delete" data-pr-delete="'+esc(r.purchase_request_id)+'">DELETE</button>';
  if(r.status==="SUBMITTED"||r.status==="UNDER REVIEW")actions+='<button class="mini green" data-pr-approve="'+esc(r.purchase_request_id)+'">APPROVE</button><button class="mini red" data-pr-reject="'+esc(r.purchase_request_id)+'">REJECT</button>';
  if(r.status==="APPROVED"||r.status==="PARTIALLY ORDERED")actions+='<button class="mini green" data-pr-po="'+esc(r.purchase_request_id)+'">CREATE PO</button>';
  return '<tr><td><strong>'+esc(r.request_no)+'</strong></td><td>'+esc(fmtDate(r.request_date))+'</td><td><strong>'+esc(r.project_name)+'</strong><br><small style="color:#64748b">'+esc(r.project_location||"")+'</small></td><td>'+esc(r.requester_name)+'<br><small style="color:#64748b">'+esc(r.requester_position||r.requester_role||"SITE ENGINEER")+'</small></td><td>'+esc(fmtDate(r.needed_by_date))+'</td><td>'+esc(r.priority)+'</td><td>'+items.length+'</td><td>'+statusBadge(r.status)+'</td><td><div class="row-actions">'+actions+'</div></td></tr>';
 }).join(""):'<tr><td colspan="9" class="empty">No purchase requests found.</td></tr>';
 document.querySelectorAll("[data-pr-view]").forEach(b=>b.addEventListener("click",()=>openRequestDetails(b.dataset.prView)));
 document.querySelectorAll("[data-pr-edit]").forEach(b=>b.addEventListener("click",()=>openRequestEdit(b.dataset.prEdit)));
 document.querySelectorAll("[data-pr-print]").forEach(b=>b.addEventListener("click",()=>printPurchaseRequest(b.dataset.prPrint)));
 document.querySelectorAll("[data-pr-delete]").forEach(b=>b.addEventListener("click",()=>deletePurchaseRequest(b.dataset.prDelete)));
 document.querySelectorAll("[data-pr-approve]").forEach(b=>b.addEventListener("click",()=>setRequestStatus(b.dataset.prApprove,"APPROVED")));
 document.querySelectorAll("[data-pr-reject]").forEach(b=>b.addEventListener("click",()=>setRequestStatus(b.dataset.prReject,"REJECTED")));
 document.querySelectorAll("[data-pr-po]").forEach(b=>b.addEventListener("click",()=>openPOModal(b.dataset.prPo)));
}
function renderOrders(){
 const q=(document.getElementById("poSearch").value||"").toLowerCase().trim(),status=document.getElementById("poStatus").value,pid=document.getElementById("poProject").value;
 const rows=state.orders.filter(o=>(!q||[o.po_no,o.supplier_name,o.project_name,o.purchase_request_no].join(" ").toLowerCase().includes(q))&&(!status||o.status===status)&&(!pid||o.project_id===pid));
 document.getElementById("poBody").innerHTML=rows.length?rows.map(o=>'<tr><td><strong>'+esc(o.po_no)+'</strong></td><td>'+esc(fmtDate(o.po_date))+'</td><td>'+esc(o.purchase_request_no||"—")+'</td><td><strong>'+esc(o.project_name)+'</strong><br><small style="color:#64748b">'+esc(o.project_location||"")+'</small></td><td>'+esc(o.requester_name||"—")+'</td><td>'+esc(o.supplier_name)+'</td><td>'+esc(fmtDate(o.expected_delivery_date))+'</td><td>'+money(o.grand_total)+'</td><td>'+statusBadge(o.status)+'</td><td><div class="row-actions"><button class="mini blue" data-po-view="'+esc(o.purchase_order_id)+'">VIEW</button><button class="mini edit" data-po-edit="'+esc(o.purchase_order_id)+'">EDIT</button><button class="mini print" data-po-print="'+esc(o.purchase_order_id)+'">PRINT</button><button class="mini delete" data-po-delete="'+esc(o.purchase_order_id)+'">DELETE</button></div></td></tr>').join(""):'<tr><td colspan="10" class="empty">No purchase orders found.</td></tr>';
 document.querySelectorAll("[data-po-view]").forEach(b=>b.addEventListener("click",()=>openPODetails(b.dataset.poView)));
 document.querySelectorAll("[data-po-edit]").forEach(b=>b.addEventListener("click",()=>openPOEdit(b.dataset.poEdit)));
 document.querySelectorAll("[data-po-print]").forEach(b=>b.addEventListener("click",()=>printPurchaseOrder(b.dataset.poPrint)));
 document.querySelectorAll("[data-po-delete]").forEach(b=>b.addEventListener("click",()=>deletePurchaseOrder(b.dataset.poDelete)));
}
function openRequestModal(){
 clearMsg();state.editingRequestId=null;
 document.getElementById("requestModal").style.display="flex";
 document.getElementById("requestDate").value=today();document.getElementById("neededBy").value="";
 document.getElementById("requestProject").value="";document.getElementById("requester").value="";
 document.getElementById("requestPriority").value="NORMAL";document.getElementById("requestPurpose").value="";document.getElementById("requestRemarks").value="";
 document.getElementById("requestModal").querySelector(".modal-head h3").textContent="PURCHASE REQUEST";
 document.getElementById("requestModal").querySelector(".modal-head div div").textContent="Raised by the site engineer for a specific project.";
 document.getElementById("saveRequest").textContent="SUBMIT REQUEST";
 state.prDraftItems=[{material_name:"",specifications:"",quantity:1,unit:"PCS"}];renderPrItems();
}
function closeRequestModal(){document.getElementById("requestModal").style.display="none";state.editingRequestId=null;}
function renderPrItems(){
 const host=document.getElementById("prItems");
 host.innerHTML=state.prDraftItems.map((it,i)=>'<div class="item-row"><div class="field"><label>Material</label><input data-pr-field="material_name" data-i="'+i+'" value="'+esc(it.material_name)+'" placeholder="Example: Cement"></div><div class="field"><label>Specifications</label><input data-pr-field="specifications" data-i="'+i+'" value="'+esc(it.specifications||"")+'" placeholder="Brand / grade / size"></div><div class="field"><label>Quantity</label><input data-pr-field="quantity" data-i="'+i+'" type="number" min="0.001" step="0.001" value="'+esc(it.quantity)+'"></div><div class="field"><label>Unit</label><input data-pr-field="unit" data-i="'+i+'" value="'+esc(it.unit)+'" placeholder="PCS"></div><div><label>&nbsp;</label><button class="remove-item" type="button" data-remove-pr="'+i+'">×</button></div></div>').join("");
 host.querySelectorAll("[data-pr-field]").forEach(el=>el.addEventListener("input",()=>{const i=Number(el.dataset.i),f=el.dataset.prField;state.prDraftItems[i][f]=f==="quantity"?Number(el.value||0):el.value;}));
 host.querySelectorAll("[data-remove-pr]").forEach(el=>el.addEventListener("click",()=>{state.prDraftItems.splice(Number(el.dataset.removePr),1);if(!state.prDraftItems.length)state.prDraftItems.push({material_name:"",specifications:"",quantity:1,unit:"PCS"});renderPrItems();}));
}
async function saveRequest(){
 const editing=!!state.editingRequestId;
 const projectId=document.getElementById("requestProject").value,reqId=document.getElementById("requester").value,requestDate=document.getElementById("requestDate").value,neededBy=document.getElementById("neededBy").value,priority=document.getElementById("requestPriority").value,purpose=document.getElementById("requestPurpose").value.trim(),remarks=document.getElementById("requestRemarks").value.trim();
 const p=state.projects.find(x=>x.project_id===projectId),e=state.employees.find(x=>x.employee_id===reqId);
 if(!projectId)return msg("Please select the requesting project.","err");if(!reqId)return msg("Please select the requesting site engineer.","err");if(!requestDate)return msg("Please enter the request date.","err");if(neededBy&&neededBy<requestDate)return msg("Needed-by date cannot be earlier than the request date.","err");if(!state.prDraftItems.length)return msg("Add at least one requested material.","err");
 for(const it of state.prDraftItems){if(!it.material_name.trim())return msg("Every request line needs a material name.","err");if(!(Number(it.quantity)>0))return msg("Every request line must have a quantity greater than zero.","err");if(!it.unit.trim())return msg("Every request line needs a unit.","err");}
 const btn=document.getElementById("saveRequest");btn.disabled=true;btn.textContent=editing?"SAVING CHANGES...":"SUBMITTING...";
 try{
  let requestId=state.editingRequestId,requestNo="";
  const payload={project_id:String(projectId),project_name:p?.project_name||"",project_location:p?.location||null,requester_employee_id:String(reqId),requester_name:e?.employee_name||"",requester_position:e?.position||null,requester_role:"SITE ENGINEER",request_date:requestDate,needed_by_date:neededBy||null,priority,purpose:purpose||null,remarks:remarks||null};
  if(editing){
   const {error}=await supabaseClient.from("purchase_requests").update(payload).eq("purchase_request_id",requestId);if(error)throw error;
   const {error:delErr}=await supabaseClient.from("purchase_request_items").delete().eq("purchase_request_id",requestId);if(delErr)throw delErr;
   requestNo=state.requests.find(x=>x.purchase_request_id===requestId)?.request_no||"Purchase Request";
  }else{
   payload.status="SUBMITTED";payload.submitted_at=new Date().toISOString();
   const {data,error}=await supabaseClient.from("purchase_requests").insert(payload).select("purchase_request_id,request_no").single();if(error)throw error;
   requestId=data.purchase_request_id;requestNo=data.request_no;
  }
  const items=state.prDraftItems.map((it,i)=>({purchase_request_id:requestId,line_no:i+1,material_name:it.material_name.trim(),specifications:it.specifications?.trim()||null,quantity:Number(it.quantity),unit:it.unit.trim()}));
  const {error:itemError}=await supabaseClient.from("purchase_request_items").insert(items);if(itemError)throw itemError;
  closeRequestModal();msg(editing?requestNo+" updated successfully.":"Purchase Request "+requestNo+" submitted to Purchasing.");await Promise.all([loadRequests(),loadOrders()]);renderAll();
 }catch(err){console.error(err);msg((editing?"Could not update purchase request: ":"Could not submit purchase request: ")+err.message,"err");}
 finally{btn.disabled=false;btn.textContent=editing?"SAVE CHANGES":"SUBMIT REQUEST";}
}
async function setRequestStatus(id,status){
 const approve=status==="APPROVED";
 const confirmed=await showConfirm(approve?"APPROVE PURCHASE REQUEST":"REJECT PURCHASE REQUEST",approve?"Please confirm that this Purchase Request has been reviewed and may proceed to Purchase Order processing.":"Please confirm that this Purchase Request should be rejected. The request will remain recorded as REJECTED.",approve?"APPROVE REQUEST":"REJECT REQUEST",!approve);
 if(!confirmed)return;
 const {error}=await supabaseClient.from("purchase_requests").update({status,reviewed_at:new Date().toISOString(),review_remarks:approve?"Approved by Purchasing":"Rejected by Purchasing"}).eq("purchase_request_id",id);
 if(error)return msg("Could not update request: "+error.message,"err");
 msg("Purchase Request "+(approve?"approved successfully.":"rejected successfully."));
 await loadRequests();renderAll();
}
function resolveConfirm(answer){const modal=document.getElementById("confirmModal");modal.style.display="none";document.getElementById("messageShade").style.display="none";if(state.confirmResolver){const resolve=state.confirmResolver;state.confirmResolver=null;resolve(answer);}}
function showConfirm(title,message,confirmText,danger){document.getElementById("confirmTitle").textContent=title;document.getElementById("confirmMessage").textContent=message;const btn=document.getElementById("acceptConfirm");btn.textContent=confirmText;btn.className=danger?"btn red":"btn green";document.getElementById("confirmModal").style.display="flex";return new Promise(resolve=>{state.confirmResolver=resolve;});}
function openRequestDetails(id){
 state.activeRequestId=id;state.activeOrderId=null;
 const r=state.requests.find(x=>x.purchase_request_id===id),items=state.requestItems.filter(x=>x.purchase_request_id===id);if(!r)return;
 const title=document.getElementById("detailTitle");title.dataset.type="PR";title.textContent="PURCHASE REQUEST DETAILS";
 document.getElementById("detailBody").innerHTML='<div class="detail-grid"><div class="detail-card"><label>Request No.</label><strong>'+esc(r.request_no)+'</strong></div><div class="detail-card"><label>Status</label><strong>'+statusBadge(r.status)+'</strong></div><div class="detail-card"><label>Project</label><div>'+esc(r.project_name)+'<br><small>'+esc(r.project_location||"")+'</small></div></div><div class="detail-card"><label>Requester</label><div>'+esc(r.requester_name)+'<br><small>'+esc(r.requester_position||r.requester_role)+'</small></div></div><div class="detail-card"><label>Request Date</label><div>'+esc(fmtDate(r.request_date))+'</div></div><div class="detail-card"><label>Needed By</label><div>'+esc(fmtDate(r.needed_by_date))+'</div></div><div class="detail-card"><label>Priority</label><div>'+esc(r.priority)+'</div></div><div class="detail-card full"><label>Purpose</label><div>'+esc(r.purpose||"—")+'</div></div><div class="detail-card full"><label>Remarks</label><div>'+esc(r.remarks||"—")+'</div></div></div><div class="section-label">REQUEST ITEMS</div><div class="table-wrap"><table class="table"><thead><tr><th>Material</th><th>Specifications</th><th>Qty</th><th>Unit</th></tr></thead><tbody>'+items.map(i=>'<tr><td><strong>'+esc(i.material_name)+'</strong></td><td>'+esc(i.specifications||"—")+'</td><td>'+esc(i.quantity)+'</td><td>'+esc(i.unit)+'</td></tr>').join("")+'</tbody></table></div>';
 const editBtn=document.getElementById("detailEditButton");editBtn.style.display=["CANCELLED","CLOSED","ORDERED"].includes(r.status)?"none":"inline-block";editBtn.textContent="EDIT PURCHASE REQUEST";
 const printBtn=document.getElementById("detailPrintButton");printBtn.style.display="inline-block";printBtn.textContent="PRINT / SAVE PDF";
 document.getElementById("detailPrimaryAction").style.display=(r.status==="APPROVED"||r.status==="PARTIALLY ORDERED")?"inline-block":"none";
 if(r.status==="APPROVED"||r.status==="PARTIALLY ORDERED")document.getElementById("detailPrimaryAction").textContent="CREATE PURCHASE ORDER";
 document.getElementById("detailModal").style.display="flex";
}
async function openRequestEdit(id){
 const r=state.requests.find(x=>x.purchase_request_id===id);if(!r)return;
 if(["CANCELLED","CLOSED","ORDERED"].includes(r.status))return msg("This Purchase Request cannot be edited in its current status.","err");
 state.editingRequestId=id;
 document.getElementById("requestProject").value=r.project_id||"";document.getElementById("requester").value=r.requester_employee_id||"";document.getElementById("requestDate").value=r.request_date||today();document.getElementById("neededBy").value=r.needed_by_date||"";document.getElementById("requestPriority").value=r.priority||"NORMAL";document.getElementById("requestPurpose").value=r.purpose||"";document.getElementById("requestRemarks").value=r.remarks||"";
 document.getElementById("requestModal").querySelector(".modal-head h3").textContent="EDIT PURCHASE REQUEST";
 document.getElementById("requestModal").querySelector(".modal-head div div").textContent="Update the project material request before purchasing proceeds.";
 document.getElementById("saveRequest").textContent="SAVE CHANGES";
 state.prDraftItems=state.requestItems.filter(x=>x.purchase_request_id===id).map(x=>({material_name:x.material_name,specifications:x.specifications||"",quantity:Number(x.quantity),unit:x.unit}));
 renderPrItems();document.getElementById("requestModal").style.display="flex";
}
async function deletePurchaseRequest(id){
 const r=state.requests.find(x=>x.purchase_request_id===id);if(!r)return;
 const confirmed=await showConfirm("DELETE PURCHASE REQUEST","This will permanently delete "+r.request_no+" and all requested material lines. This action cannot be undone.","DELETE REQUEST",true);if(!confirmed)return;
 const {data,error}=await supabaseClient.from("purchase_requests").delete().eq("purchase_request_id",id).select("purchase_request_id").maybeSingle();
 if(error){console.error("Purchase Request delete failed:",error);return msg("Could not delete "+r.request_no+". Please verify the Purchasing DELETE permission in Supabase.","err");}
 if(!data)return msg(r.request_no+" was not deleted. No matching record was removed. Please verify the Supabase DELETE policy.","err");
 msg(r.request_no+" deleted successfully.");
 await Promise.allSettled([loadRequests(),loadOrders()]);
 renderAll();
}
function printPurchaseRequest(id){
 const r=state.requests.find(x=>x.purchase_request_id===id);if(!r)return;const items=state.requestItems.filter(x=>x.purchase_request_id===id);
 const rows=items.map(i=>'<tr><td>'+esc(i.material_name)+'</td><td>'+esc(i.specifications||"")+'</td><td>'+esc(i.quantity)+'</td><td>'+esc(i.unit)+'</td></tr>').join("");
 openPrintWindow("PURCHASE REQUEST",r.request_no,r.project_name,r.project_location,r.requester_name,r.requester_position||r.requester_role,r.request_date,r.needed_by_date,rows,"PROJECT MATERIAL REQUEST",null,null,null,null,null,r.remarks);
}
function closeDetail(){document.getElementById("detailModal").style.display="none";state.activeRequestId=null;state.activeOrderId=null;document.getElementById("detailEditButton").style.display="none";document.getElementById("detailPrintButton").style.display="none";}
function primaryDetailAction(){if(state.activeRequestId)openPOModal(state.activeRequestId);}
function openPOModal(requestId){
 const r=state.requests.find(x=>x.purchase_request_id===requestId);if(!r)return;
 if(!["APPROVED","PARTIALLY ORDERED"].includes(r.status))return msg("Purchase Request must be approved before creating a PO.","err");
 state.editingOrderId=null;
 const items=state.requestItems.filter(x=>x.purchase_request_id===requestId).map(x=>({...x,unit_price:0}));state.poDraftRequest={r,items};
 document.getElementById("poModalTitle").textContent="CREATE PURCHASE ORDER";document.getElementById("poFromRequest").textContent=r.request_no+" • "+r.project_name+" • Requested by "+r.requester_name;
 document.getElementById("poSupplier").value="";document.getElementById("poSupplierContact").value="";document.getElementById("poSupplierAddress").value="";document.getElementById("poDate").value=today();document.getElementById("poDelivery").value=r.needed_by_date||"";document.getElementById("poPaymentTerms").value="";document.getElementById("poDeliveryTerms").value="Delivered to project site";document.getElementById("poRemarks").value="";
 renderPoItems();document.getElementById("poModal").style.display="flex";
}
async function openPOEdit(id){
 const o=state.orders.find(x=>x.purchase_order_id===id);if(!o)return;
 if(["RECEIVED","CLOSED","CANCELLED"].includes(o.status))return msg("This Purchase Order cannot be edited in its current status.","err");
 state.editingOrderId=id;const req=state.requests.find(x=>x.purchase_request_id===o.purchase_request_id)||{request_no:o.purchase_request_no,project_id:o.project_id,project_name:o.project_name,project_location:o.project_location,requester_employee_id:o.requester_employee_id,requester_name:o.requester_name};
 state.poDraftRequest={r:req,items:state.orderItems.filter(x=>x.purchase_order_id===id).map(x=>({...x,unit_price:Number(x.unit_price||0)}))};
 document.getElementById("poModalTitle").textContent="EDIT PURCHASE ORDER";document.getElementById("poFromRequest").textContent=o.po_no+" • "+o.project_name+" • Requested by "+(o.requester_name||"—");
 document.getElementById("poSupplier").value=o.supplier_name||"";document.getElementById("poSupplierContact").value=o.supplier_contact||"";document.getElementById("poSupplierAddress").value=o.supplier_address||"";document.getElementById("poDate").value=o.po_date||today();document.getElementById("poDelivery").value=o.expected_delivery_date||"";document.getElementById("poPaymentTerms").value=o.payment_terms||"";document.getElementById("poDeliveryTerms").value=o.delivery_terms||"";document.getElementById("poRemarks").value=o.remarks||"";
 renderPoItems();document.getElementById("poModal").style.display="flex";
}
function renderPoItems(){
 const items=state.poDraftRequest.items;
 document.getElementById("poItems").innerHTML='<div class="items-box">'+items.map((it,i)=>'<div class="item-row"><div class="field"><label>Material</label><input data-po-field="material_name" data-i="'+i+'" value="'+esc(it.material_name)+'"></div><div class="field"><label>Specifications</label><input data-po-field="specifications" data-i="'+i+'" value="'+esc(it.specifications||"")+'"></div><div class="field"><label>Qty</label><input data-po-field="quantity" data-i="'+i+'" type="number" min="0.001" step="0.001" value="'+esc(it.quantity)+'"></div><div class="field"><label>Unit</label><input data-po-field="unit" data-i="'+i+'" value="'+esc(it.unit)+'"></div><div class="field"><label>Unit Price</label><input data-po-field="unit_price" data-i="'+i+'" type="number" min="0" step="0.01" value="'+esc(it.unit_price||0)+'"></div><div class="item-total" data-po-total="'+i+'">'+money(Number(it.quantity||0)*Number(it.unit_price||0))+'</div></div>').join("")+'</div>';
 document.querySelectorAll("[data-po-field]").forEach(el=>el.addEventListener("input",()=>{const i=Number(el.dataset.i),f=el.dataset.poField;items[i][f]=(f==="quantity"||f==="unit_price")?Number(el.value||0):el.value;updatePoTotal();}));
 updatePoTotal();
}
function updatePoTotal(){const items=state.poDraftRequest?.items||[];const total=items.reduce((n,x)=>n+(Number(x.quantity||0)*Number(x.unit_price||0)),0);items.forEach((x,i)=>{const el=document.querySelector('[data-po-total="'+i+'"]');if(el)el.textContent=money(Number(x.quantity||0)*Number(x.unit_price||0));});document.getElementById("poSubtotal").textContent=money(total);}
function closePoModal(){document.getElementById("poModal").style.display="none";state.poDraftRequest=null;state.editingOrderId=null;document.getElementById("poModalTitle").textContent="CREATE PURCHASE ORDER";}
async function savePurchaseOrder(){
 const d=state.poDraftRequest;if(!d)return;const editing=!!state.editingOrderId;
 const supplier=document.getElementById("poSupplier").value.trim(),contact=document.getElementById("poSupplierContact").value.trim(),address=document.getElementById("poSupplierAddress").value.trim(),poDate=document.getElementById("poDate").value,delivery=document.getElementById("poDelivery").value,payment=document.getElementById("poPaymentTerms").value.trim(),deliveryTerms=document.getElementById("poDeliveryTerms").value.trim(),remarks=document.getElementById("poRemarks").value.trim();
 if(!supplier)return msg("Supplier name is required.","err");if(!poDate)return msg("PO date is required.","err");if(delivery&&delivery<poDate)return msg("Expected delivery cannot be earlier than PO date.","err");
 for(const it of d.items){if(!it.material_name.trim())return msg("Every PO line needs a material name.","err");if(!(Number(it.quantity)>0))return msg("Every PO line needs a quantity greater than zero.","err");if(!(Number(it.unit_price)>=0))return msg("Unit price cannot be negative.","err");}
 const total=d.items.reduce((n,x)=>n+(Number(x.quantity||0)*Number(x.unit_price||0)),0);
 const btn=document.getElementById("savePo");btn.disabled=true;btn.textContent=editing?"SAVING CHANGES...":"SAVING...";
 try{
  let poId=state.editingOrderId,poNo="";
  const payload={project_id:d.r.project_id,project_name:d.r.project_name,project_location:d.r.project_location||null,requester_employee_id:d.r.requester_employee_id||null,requester_name:d.r.requester_name||null,supplier_name:supplier,supplier_contact:contact||null,supplier_address:address||null,po_date:poDate,expected_delivery_date:delivery||null,subtotal:total,tax_amount:0,other_charges:0,grand_total:total,payment_terms:payment||null,delivery_terms:deliveryTerms||null,remarks:remarks||null};
  if(editing){const {error}=await supabaseClient.from("purchase_orders").update(payload).eq("purchase_order_id",poId);if(error)throw error;const {error:delErr}=await supabaseClient.from("purchase_order_items").delete().eq("purchase_order_id",poId);if(delErr)throw delErr;}
  else{payload.purchase_request_id=d.r.purchase_request_id;payload.purchase_request_no=d.r.request_no;payload.status="DRAFT";const {data,error}=await supabaseClient.from("purchase_orders").insert(payload).select("purchase_order_id,po_no").single();if(error)throw error;poId=data.purchase_order_id;poNo=data.po_no;}
  const items=d.items.map((it,i)=>({purchase_order_id:poId,line_no:i+1,purchase_request_item_id:it.purchase_request_item_id||null,material_name:it.material_name.trim(),specifications:it.specifications?.trim()||null,quantity:Number(it.quantity),unit:it.unit.trim(),unit_price:Number(it.unit_price||0)}));
  const {error:ierr}=await supabaseClient.from("purchase_order_items").insert(items);if(ierr)throw ierr;
  if(!editing)await supabaseClient.from("purchase_requests").update({status:"ORDERED"}).eq("purchase_request_id",d.r.purchase_request_id);
  const existing=state.orders.find(x=>x.purchase_order_id===poId);const savedNo=editing?(existing?.po_no||"Purchase Order"):poNo;
  closePoModal();msg(savedNo+" "+(editing?"updated successfully.":"created successfully."));await Promise.all([loadRequests(),loadOrders()]);renderAll();if(!editing)switchTab("orders");
 }catch(err){console.error(err);msg((editing?"Could not update purchase order: ":"Could not create purchase order: ")+err.message,"err");}
 finally{btn.disabled=false;btn.textContent="SAVE PURCHASE ORDER";}
}
async function openPODetails(id){
 const o=state.orders.find(x=>x.purchase_order_id===id);if(!o)return;const items=state.orderItems.filter(i=>i.purchase_order_id===id);
 state.activeOrderId=id;state.activeRequestId=null;const title=document.getElementById("detailTitle");title.dataset.type="PO";title.textContent="PURCHASE ORDER DETAILS";
 document.getElementById("detailBody").innerHTML='<div class="detail-grid"><div class="detail-card"><label>PO No.</label><strong>'+esc(o.po_no)+'</strong></div><div class="detail-card"><label>Status</label><strong>'+statusBadge(o.status)+'</strong></div><div class="detail-card"><label>Purchase Request</label><div>'+esc(o.purchase_request_no||"—")+'</div></div><div class="detail-card"><label>Project</label><div>'+esc(o.project_name)+'<br><small>'+esc(o.project_location||"")+'</small></div></div><div class="detail-card"><label>Requester</label><div>'+esc(o.requester_name||"—")+'</div></div><div class="detail-card"><label>Supplier</label><div>'+esc(o.supplier_name)+'<br><small>'+esc(o.supplier_contact||"")+'</small></div></div><div class="detail-card"><label>PO Date</label><div>'+esc(fmtDate(o.po_date))+'</div></div><div class="detail-card"><label>Expected Delivery</label><div>'+esc(fmtDate(o.expected_delivery_date))+'</div></div><div class="detail-card full"><label>Payment / Delivery Terms</label><div>'+esc(o.payment_terms||"—")+' • '+esc(o.delivery_terms||"—")+'</div></div><div class="detail-card full"><label>Remarks</label><div>'+esc(o.remarks||"—")+'</div></div></div><div class="section-label">ORDER ITEMS</div><div class="table-wrap"><table class="table"><thead><tr><th>Material</th><th>Specifications</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>'+items.map(i=>'<tr><td><strong>'+esc(i.material_name)+'</strong></td><td>'+esc(i.specifications||"—")+'</td><td>'+esc(i.quantity)+'</td><td>'+esc(i.unit)+'</td><td>'+money(i.unit_price)+'</td><td>'+money(i.line_total)+'</td></tr>').join("")+'</tbody></table></div><div class="total-box"><span>GRAND TOTAL</span><strong>'+money(o.grand_total)+'</strong></div>';
 const editBtn=document.getElementById("detailEditButton");editBtn.style.display=["RECEIVED","CLOSED","CANCELLED"].includes(o.status)?"none":"inline-block";editBtn.textContent="EDIT PURCHASE ORDER";
 document.getElementById("detailPrintButton").style.display="inline-block";document.getElementById("detailPrintButton").textContent="PRINT / SAVE PDF";document.getElementById("detailPrimaryAction").style.display="none";document.getElementById("detailModal").style.display="flex";
}
async function deletePurchaseOrder(id){
 const o=state.orders.find(x=>x.purchase_order_id===id);if(!o)return;
 const confirmed=await showConfirm("DELETE PURCHASE ORDER","This will permanently delete "+o.po_no+" and its order lines. The linked Purchase Request will be returned to APPROVED.","DELETE PURCHASE ORDER",true);
 if(!confirmed)return;
 const {data,error}=await supabaseClient.from("purchase_orders").delete().eq("purchase_order_id",id).select("purchase_order_id").maybeSingle();
 if(error){console.error("Purchase Order delete failed:",error);return msg("Could not delete "+o.po_no+". Please verify the Purchasing DELETE permission in Supabase.","err");}
 if(!data)return msg(o.po_no+" was not deleted. No matching record was removed. Please verify the Supabase DELETE policy.","err");
 if(o.purchase_request_id){
   const {error:updateError}=await supabaseClient.from("purchase_requests").update({status:"APPROVED"}).eq("purchase_request_id",o.purchase_request_id);
   if(updateError)console.warn("Purchase Request status restore failed:",updateError);
 }
 msg(o.po_no+" deleted successfully.");
 await Promise.allSettled([loadRequests(),loadOrders()]);
 renderAll();
}
function printPurchaseOrder(id){
 const o=state.orders.find(x=>x.purchase_order_id===id);if(!o)return;const items=state.orderItems.filter(x=>x.purchase_order_id===id);
 const rows=items.map(i=>'<tr><td>'+esc(i.material_name)+'</td><td>'+esc(i.specifications||"")+'</td><td>'+esc(i.quantity)+'</td><td>'+esc(i.unit)+'</td><td>'+money(i.unit_price)+'</td><td>'+money(i.line_total)+'</td></tr>').join("");
 openPrintWindow("PURCHASE ORDER",o.po_no,o.project_name,o.project_location,o.requester_name,"",o.po_date,o.expected_delivery_date,rows,"SUPPLIER PURCHASE ORDER",o.supplier_name,o.supplier_contact,o.supplier_address,o.payment_terms,o.delivery_terms,o.remarks,o.grand_total);
}
function openPrintWindow(title,docNo,project,location,requester,requesterPosition,date,needed,rows,subtitle,supplier,supplierContact,supplierAddress,paymentTerms,deliveryTerms,remarks,grandTotal){
  const win=window.open("","_blank","width=1000,height=800");
  if(!win){
    msg("Please allow pop-ups for printable Purchasing documents.","err");
    return;
  }

  const isPO=title==="PURCHASE ORDER";
  const css=[
    "body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:0;padding:34px}",
    ".header{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #0f172a;padding-bottom:16px;margin-bottom:20px}",
    ".brand{font-size:24px;font-weight:900;letter-spacing:.04em}",
    ".muted{color:#64748b;font-size:11px}",
    ".doc{text-align:right}.doc h1{margin:0;font-size:20px}",
    ".meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}",
    ".box{border:1px solid #cbd5e1;border-radius:8px;padding:10px}",
    ".box label{display:block;font-size:9px;font-weight:900;letter-spacing:.08em;color:#64748b;text-transform:uppercase;margin-bottom:4px}",
    ".box strong{font-size:12px}",
    ".items{width:100%;border-collapse:collapse;margin-top:12px}",
    ".items th,.items td{border:1px solid #cbd5e1;padding:9px;font-size:11px;text-align:left}",
    ".items th{background:#f1f5f9;font-size:9px;text-transform:uppercase;letter-spacing:.06em}",
    ".total{text-align:right;margin-top:14px;font-size:16px;font-weight:900}",
    ".footer{margin-top:42px;display:grid;grid-template-columns:1fr 1fr;gap:30px}",
    ".sig{border-top:1px solid #94a3b8;padding-top:6px;font-size:10px}",
    ".remark{margin-top:16px;border:1px solid #cbd5e1;padding:10px}",
    ".actions{margin-top:24px;text-align:center}",
    ".actions button{padding:10px 16px;font-weight:800}",
    "@media print{.actions{display:none}body{padding:20px}}"
  ].join("");

  win.document.open();
  win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+" "+esc(docNo)+'</title><style>'+css+'</style></head><body>');
  win.document.write(
    '<div class="header">'+
      '<div><div class="brand">AMANAH CONSTRUCTION SERVICES</div><div class="muted">CONSTRUCTION MANAGEMENT SYSTEM</div></div>'+
      '<div class="doc"><h1>'+esc(title)+'</h1><div class="muted">'+esc(docNo)+'</div></div>'+
    '</div>'
  );
  win.document.write(
    '<div class="meta">'+
      '<div class="box"><label>Project</label><strong>'+esc(project||"—")+'</strong><div class="muted">'+esc(location||"")+'</div></div>'+
      '<div class="box"><label>Requester</label><strong>'+esc(requester||"—")+'</strong><div class="muted">'+esc(requesterPosition||"")+'</div></div>'+
      '<div class="box"><label>Document Date</label><strong>'+esc(fmtDate(date))+'</strong></div>'+
      '<div class="box"><label>'+(isPO?"Expected Delivery":"Needed By")+'</label><strong>'+esc(fmtDate(needed))+'</strong></div>'+
    '</div>'
  );

  if(isPO){
    win.document.write(
      '<div class="meta">'+
        '<div class="box"><label>Supplier</label><strong>'+esc(supplier||"—")+'</strong><div class="muted">'+esc(supplierContact||"")+'<br>'+esc(supplierAddress||"")+'</div></div>'+
        '<div class="box"><label>Payment / Delivery Terms</label><strong>'+esc(paymentTerms||"—")+'</strong><div class="muted">'+esc(deliveryTerms||"—")+'</div></div>'+
      '</div>'
    );
  }

  const columns=isPO
    ?'<th>Material</th><th>Specifications</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Total</th>'
    :'<th>Material</th><th>Specifications</th><th>Qty</th><th>Unit</th>';

  win.document.write(
    '<h3 style="font-size:13px;margin:20px 0 6px">'+esc(subtitle)+'</h3>'+
    '<table class="items"><thead><tr>'+columns+'</tr></thead><tbody>'+rows+'</tbody></table>'
  );

  if(isPO){
    win.document.write('<div class="total">GRAND TOTAL: '+money(grandTotal)+'</div>');
  }

  if(remarks){
    win.document.write('<div class="remark"><strong style="font-size:10px">REMARKS</strong><div style="margin-top:5px;font-size:11px;white-space:pre-wrap">'+esc(remarks)+'</div></div>');
  }

  win.document.write(
    '<div class="footer">'+
      '<div class="sig">REQUESTED / PREPARED BY<br><br><strong>'+esc(requester||"")+'</strong></div>'+
      '<div class="sig">'+(isPO?"PURCHASING / APPROVAL":"PURCHASING REVIEW")+'<br><br><strong>AMANAH CONSTRUCTION SERVICES</strong></div>'+
    '</div>'+
    '<div class="actions"><button onclick="window.print()">PRINT / SAVE PDF</button></div>'
  );

  win.document.write('</body></html>');
  win.document.close();
  win.focus();
}

document.addEventListener("DOMContentLoaded",()=>init().catch(e=>{console.error(e);msg("Could not initialize purchasing: "+e.message,"err");}));
