const SUPABASE_URL="https://bafmycjninxomufhkjvy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ";
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

const state={projects:[],employees:[],requests:[],requestItems:[],orders:[],orderItems:[],activeRequestId:null,activeTab:"requests",prDraftItems:[],poDraftRequest:null};

function esc(v){return v==null?"":String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
function today(){return new Date().toISOString().slice(0,10);}
function money(v){return "₱"+Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});}
function statusClass(s){return {"DRAFT":"b-draft","SUBMITTED":"b-sub","UNDER REVIEW":"b-review","APPROVED":"b-approved","PARTIALLY ORDERED":"b-ordered","ORDERED":"b-ordered","REJECTED":"b-rejected","CANCELLED":"b-cancel","RECEIVED":"b-received","CLOSED":"b-received","SENT TO SUPPLIER":"b-ordered"}[s]||"b-draft";}
function statusBadge(s){return '<span class="badge '+statusClass(s)+'">'+esc(s)+'</span>';}
function msg(text,type="ok"){const el=document.getElementById("message");el.textContent=text;el.className="message "+type;window.scrollTo({top:0,behavior:"smooth"});}
function clearMsg(){const el=document.getElementById("message");el.className="message";el.textContent="";}
function fmtDate(v){if(!v)return "—";return new Date(v+"T00:00:00").toLocaleDateString();}
function sumItems(items,field){return items.reduce((n,x)=>n+Number(x[field]||0),0);}
function rowTotal(row){return Number(row.quantity||0)*Number(row.unit_price??row.estimated_unit_cost??0);}

async function init(){
 const {data:{session}}=await supabaseClient.auth.getSession(); if(!session){location.href="admin.html";return;}
 document.getElementById("requestDate").value=today(); document.getElementById("poDate").value=today();
 bind(); await Promise.all([loadProjects(),loadEmployees(),loadRequests(),loadOrders()]); renderAll();
}
function bind(){
 document.getElementById("tabRequests").addEventListener("click",()=>switchTab("requests"));
 document.getElementById("tabOrders").addEventListener("click",()=>switchTab("orders"));
 document.getElementById("newRequest").addEventListener("click",openRequestModal);
 document.getElementById("closeRequest").addEventListener("click",closeRequestModal);
 document.getElementById("cancelRequest").addEventListener("click",closeRequestModal);
 document.getElementById("addPrItem").addEventListener("click",()=>{state.prDraftItems.push({material_name:"",specifications:"",quantity:1,unit:"PCS",estimated_unit_cost:0});renderPrItems();});
 document.getElementById("saveRequest").addEventListener("click",saveRequest);
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
 const {data,error}=await supabaseClient.from("projects").select("project_id,project_name,location").order("project_name"); if(error)throw error; state.projects=data||[];
 const opts='<option value="">SELECT PROJECT</option>'+state.projects.map(p=>'<option value="'+esc(p.project_id)+'">'+esc(p.project_name)+" — "+esc(p.location||"")+"</option>").join("");
 ["requestProject"].forEach(id=>document.getElementById(id).innerHTML=opts);
 const filter='<option value="">ALL PROJECTS</option>'+state.projects.map(p=>'<option value="'+esc(p.project_id)+'">'+esc(p.project_name)+"</option>").join("");
 document.getElementById("prProject").innerHTML=filter;document.getElementById("poProject").innerHTML=filter;
}
async function loadEmployees(){
 const {data,error}=await supabaseClient.from("employees").select("*").order("employee_name"); if(error)throw error;state.employees=data||[];
 document.getElementById("requester").innerHTML='<option value="">SELECT SITE ENGINEER</option>'+state.employees.map(e=>'<option value="'+esc(e.employee_id)+'" data-name="'+esc(e.employee_name)+'" data-position="'+esc(e.position||"")+'">'+esc(e.employee_name)+" — "+esc(e.position||"")+"</option>").join("");
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
  const items=state.requestItems.filter(i=>i.purchase_request_id===r.purchase_request_id),total=sumItems(items,"estimated_total"),hasPo=state.orders.some(o=>o.purchase_request_id===r.purchase_request_id);
  let actions='<button class="mini blue" data-pr-view="'+esc(r.purchase_request_id)+'">VIEW</button>';
  if(r.status==="SUBMITTED"||r.status==="UNDER REVIEW") actions+='<button class="mini green" data-pr-approve="'+esc(r.purchase_request_id)+'">APPROVE</button><button class="mini red" data-pr-reject="'+esc(r.purchase_request_id)+'">REJECT</button>';
  if(r.status==="APPROVED"||r.status==="PARTIALLY ORDERED") actions+='<button class="mini green" data-pr-po="'+esc(r.purchase_request_id)+'">CREATE PO</button>';
  return '<tr><td><strong>'+esc(r.request_no)+'</strong></td><td>'+esc(fmtDate(r.request_date))+'</td><td><strong>'+esc(r.project_name)+'</strong><br><small style="color:#64748b">'+esc(r.project_location||"")+'</small></td><td>'+esc(r.requester_name)+'<br><small style="color:#64748b">'+esc(r.requester_position||r.requester_role||"SITE ENGINEER")+'</small></td><td>'+esc(fmtDate(r.needed_by_date))+'</td><td>'+esc(r.priority)+'</td><td>'+items.length+'</td><td>'+money(total)+'</td><td>'+statusBadge(r.status)+'</td><td><div class="row-actions">'+actions+'</div></td></tr>';
 }).join(""):'<tr><td colspan="10" class="empty">No purchase requests found.</td></tr>';
 document.querySelectorAll("[data-pr-view]").forEach(b=>b.addEventListener("click",()=>openRequestDetails(b.dataset.prView)));
 document.querySelectorAll("[data-pr-approve]").forEach(b=>b.addEventListener("click",()=>setRequestStatus(b.dataset.prApprove,"APPROVED")));
 document.querySelectorAll("[data-pr-reject]").forEach(b=>b.addEventListener("click",()=>setRequestStatus(b.dataset.prReject,"REJECTED")));
 document.querySelectorAll("[data-pr-po]").forEach(b=>b.addEventListener("click",()=>openPOModal(b.dataset.prPo)));
}
function renderOrders(){
 const q=(document.getElementById("poSearch").value||"").toLowerCase().trim(),status=document.getElementById("poStatus").value,pid=document.getElementById("poProject").value;
 const rows=state.orders.filter(o=>(!q||[o.po_no,o.supplier_name,o.project_name,o.purchase_request_no].join(" ").toLowerCase().includes(q))&&(!status||o.status===status)&&(!pid||o.project_id===pid));
 document.getElementById("poBody").innerHTML=rows.length?rows.map(o=>'<tr><td><strong>'+esc(o.po_no)+'</strong></td><td>'+esc(fmtDate(o.po_date))+'</td><td>'+esc(o.purchase_request_no||"—")+'</td><td><strong>'+esc(o.project_name)+'</strong><br><small style="color:#64748b">'+esc(o.project_location||"")+'</small></td><td>'+esc(o.requester_name||"—")+'</td><td>'+esc(o.supplier_name)+'</td><td>'+esc(fmtDate(o.expected_delivery_date))+'</td><td>'+money(o.grand_total)+'</td><td>'+statusBadge(o.status)+'</td><td><div class="row-actions"><button class="mini blue" data-po-view="'+esc(o.purchase_order_id)+'">VIEW</button></div></td></tr>').join(""):'<tr><td colspan="10" class="empty">No purchase orders found.</td></tr>';
 document.querySelectorAll("[data-po-view]").forEach(b=>b.addEventListener("click",()=>openPODetails(b.dataset.poView)));
}
function openRequestModal(){
 clearMsg();document.getElementById("requestModal").style.display="flex";document.getElementById("requestDate").value=today();document.getElementById("neededBy").value="";document.getElementById("requestProject").value="";document.getElementById("requester").value="";document.getElementById("requestPurpose").value="";document.getElementById("requestRemarks").value="";state.prDraftItems=[{material_name:"",specifications:"",quantity:1,unit:"PCS",estimated_unit_cost:0}];renderPrItems();
}
function closeRequestModal(){document.getElementById("requestModal").style.display="none";}
function renderPrItems(){
 const host=document.getElementById("prItems");
 host.innerHTML=state.prDraftItems.map((it,i)=>'<div class="item-row"><div class="field"><label>Material</label><input data-pr-field="material_name" data-i="'+i+'" value="'+esc(it.material_name)+'" placeholder="Example: Cement"></div><div class="field"><label>Specifications</label><input data-pr-field="specifications" data-i="'+i+'" value="'+esc(it.specifications)+'" placeholder="Brand / grade / size"></div><div class="field"><label>Quantity</label><input data-pr-field="quantity" data-i="'+i+'" type="number" min="0.001" step="0.001" value="'+esc(it.quantity)+'"></div><div class="field"><label>Unit</label><input data-pr-field="unit" data-i="'+i+'" value="'+esc(it.unit)+'" placeholder="PCS"></div><div class="field"><label>Est. Unit Cost</label><input data-pr-field="estimated_unit_cost" data-i="'+i+'" type="number" min="0" step="0.01" value="'+esc(it.estimated_unit_cost)+'"></div><div><label>&nbsp;</label><button class="remove-item" type="button" data-remove-pr="'+i+'">×</button></div></div>').join("");
 host.querySelectorAll("[data-pr-field]").forEach(el=>el.addEventListener("input",()=>{const i=Number(el.dataset.i),f=el.dataset.prField;state.prDraftItems[i][f]=(f==="quantity"||f==="estimated_unit_cost")?Number(el.value||0):el.value;updatePrTotal();}));
 host.querySelectorAll("[data-remove-pr]").forEach(el=>el.addEventListener("click",()=>{state.prDraftItems.splice(Number(el.dataset.removePr),1);if(!state.prDraftItems.length)state.prDraftItems.push({material_name:"",specifications:"",quantity:1,unit:"PCS",estimated_unit_cost:0});renderPrItems();}));
 updatePrTotal();
}
function updatePrTotal(){document.getElementById("prGrandTotal").textContent=money(state.prDraftItems.reduce((n,x)=>n+(Number(x.quantity||0)*Number(x.estimated_unit_cost||0)),0));}
async function saveRequest(){
 const projectId=document.getElementById("requestProject").value,reqId=document.getElementById("requester").value,requestDate=document.getElementById("requestDate").value,neededBy=document.getElementById("neededBy").value,priority=document.getElementById("requestPriority").value,purpose=document.getElementById("requestPurpose").value.trim(),remarks=document.getElementById("requestRemarks").value.trim();
 const p=state.projects.find(x=>x.project_id===projectId),e=state.employees.find(x=>x.employee_id===reqId);
 if(!projectId)return msg("Please select the requesting project.","err"); if(!reqId)return msg("Please select the requesting site engineer.","err"); if(!requestDate)return msg("Please enter the request date.","err"); if(neededBy&&neededBy<requestDate)return msg("Needed-by date cannot be earlier than the request date.","err"); if(!state.prDraftItems.length)return msg("Add at least one requested material.","err");
 for(const it of state.prDraftItems){if(!it.material_name.trim())return msg("Every request line needs a material name.","err");if(!(Number(it.quantity)>0))return msg("Every request line must have a quantity greater than zero.","err");if(!it.unit.trim())return msg("Every request line needs a unit.","err");}
 const btn=document.getElementById("saveRequest");btn.disabled=true;btn.textContent="SUBMITTING...";
 try{
  const payload={project_id:String(projectId),project_name:p?.project_name||"",project_location:p?.location||null,requester_employee_id:String(reqId),requester_name:e?.employee_name||"",requester_position:e?.position||null,requester_role:"SITE ENGINEER",request_date:requestDate,needed_by_date:neededBy||null,priority,purpose:purpose||null,remarks:remarks||null,status:"SUBMITTED",submitted_at:new Date().toISOString()};
  const {data,error}=await supabaseClient.from("purchase_requests").insert(payload).select("purchase_request_id,request_no").single(); if(error)throw error;
  const items=state.prDraftItems.map((it,i)=>({purchase_request_id:data.purchase_request_id,line_no:i+1,material_name:it.material_name.trim(),specifications:it.specifications?.trim()||null,quantity:Number(it.quantity),unit:it.unit.trim(),estimated_unit_cost:Number(it.estimated_unit_cost||0)}));
  const {error:itemError}=await supabaseClient.from("purchase_request_items").insert(items); if(itemError)throw itemError;
  closeRequestModal();msg("Purchase Request "+data.request_no+" submitted to Purchasing.");await Promise.all([loadRequests(),loadOrders()]);renderAll();
 }catch(err){console.error(err);msg("Could not submit purchase request: "+err.message,"err");}finally{btn.disabled=false;btn.textContent="SUBMIT REQUEST";}
}
async function setRequestStatus(id,status){
 const label=status==="APPROVED"?"approve":"reject";
 if(!confirm("Are you sure you want to "+label+" this purchase request?"))return;
 const {error}=await supabaseClient.from("purchase_requests").update({status,reviewed_at:new Date().toISOString(),review_remarks:status==="REJECTED"?"Rejected by Purchasing":"Approved by Purchasing"}).eq("purchase_request_id",id);
 if(error)return msg("Could not update request: "+error.message,"err");
 msg("Purchase Request "+(status==="APPROVED"?"approved":"rejected")+".");await loadRequests();renderAll();
}
function openRequestDetails(id){
 state.activeRequestId=id;const r=state.requests.find(x=>x.purchase_request_id===id),items=state.requestItems.filter(x=>x.purchase_request_id===id);if(!r)return;
 document.getElementById("detailTitle").textContent="PURCHASE REQUEST DETAILS";
 document.getElementById("detailBody").innerHTML='<div class="detail-grid"><div class="detail-card"><label>Request No.</label><strong>'+esc(r.request_no)+'</strong></div><div class="detail-card"><label>Status</label><strong>'+statusBadge(r.status)+'</strong></div><div class="detail-card"><label>Project</label><div>'+esc(r.project_name)+'<br><small>'+esc(r.project_location||"")+'</small></div></div><div class="detail-card"><label>Requester</label><div>'+esc(r.requester_name)+'<br><small>'+esc(r.requester_position||r.requester_role)+'</small></div></div><div class="detail-card"><label>Request Date</label><div>'+esc(fmtDate(r.request_date))+'</div></div><div class="detail-card"><label>Needed By</label><div>'+esc(fmtDate(r.needed_by_date))+'</div></div><div class="detail-card full"><label>Purpose</label><div>'+esc(r.purpose||"—")+'</div></div><div class="detail-card full"><label>Remarks</label><div>'+esc(r.remarks||"—")+'</div></div></div><div class="section-label">REQUEST ITEMS</div><div class="table-wrap"><table class="table"><thead><tr><th>Material</th><th>Specifications</th><th>Qty</th><th>Unit</th><th>Est. Unit Cost</th><th>Total</th></tr></thead><tbody>'+items.map(i=>'<tr><td><strong>'+esc(i.material_name)+'</strong></td><td>'+esc(i.specifications||"—")+'</td><td>'+esc(i.quantity)+'</td><td>'+esc(i.unit)+'</td><td>'+money(i.estimated_unit_cost)+'</td><td>'+money(i.estimated_total)+'</td></tr>').join("")+'</tbody></table></div>';
 const btn=document.getElementById("detailPrimaryAction");
 if(r.status==="APPROVED"||r.status==="PARTIALLY ORDERED"){btn.style.display="inline-block";btn.textContent="CREATE PURCHASE ORDER";}else{btn.style.display="none";}
 document.getElementById("detailModal").style.display="flex";
}
function closeDetail(){document.getElementById("detailModal").style.display="none";state.activeRequestId=null;}
function primaryDetailAction(){if(state.activeRequestId)openPOModal(state.activeRequestId);}
function openPOModal(requestId){
 const r=state.requests.find(x=>x.purchase_request_id===requestId);if(!r)return;
 if(!["APPROVED","PARTIALLY ORDERED"].includes(r.status))return msg("Purchase Request must be approved before creating a PO.","err");
 const items=state.requestItems.filter(x=>x.purchase_request_id===requestId);state.poDraftRequest={r,items};
 document.getElementById("poFromRequest").textContent=r.request_no+" • "+r.project_name+" • Requested by "+r.requester_name;
 document.getElementById("poSupplier").value="";document.getElementById("poSupplierContact").value="";document.getElementById("poSupplierAddress").value="";document.getElementById("poDate").value=today();document.getElementById("poDelivery").value=r.needed_by_date||"";document.getElementById("poPaymentTerms").value="";document.getElementById("poDeliveryTerms").value="Delivered to project site";document.getElementById("poRemarks").value="";
 renderPoItems();document.getElementById("poModal").style.display="flex";
}
function renderPoItems(){
 const items=state.poDraftRequest.items;
 document.getElementById("poItems").innerHTML='<div class="items-box">'+items.map((it,i)=>'<div class="item-row"><div class="field"><label>Material</label><input data-po-field="material_name" data-i="'+i+'" value="'+esc(it.material_name)+'"></div><div class="field"><label>Specifications</label><input data-po-field="specifications" data-i="'+i+'" value="'+esc(it.specifications||"")+'"></div><div class="field"><label>Qty</label><input data-po-field="quantity" data-i="'+i+'" type="number" min="0.001" step="0.001" value="'+esc(it.quantity)+'"></div><div class="field"><label>Unit</label><input data-po-field="unit" data-i="'+i+'" value="'+esc(it.unit)+'"></div><div class="field"><label>Unit Price</label><input data-po-field="unit_price" data-i="'+i+'" type="number" min="0" step="0.01" value="'+esc(it.estimated_unit_cost||0)+'"></div><div class="item-total" data-po-total="'+i+'">'+money(Number(it.quantity||0)*Number(it.estimated_unit_cost||0))+'</div></div>').join("")+'</div>';
 document.querySelectorAll("[data-po-field]").forEach(el=>el.addEventListener("input",()=>{const i=Number(el.dataset.i),f=el.dataset.poField;items[i][f]=(f==="quantity"||f==="unit_price")?Number(el.value||0):el.value;updatePoTotal();}));
 updatePoTotal();
}
function updatePoTotal(){const items=state.poDraftRequest?.items||[];const total=items.reduce((n,x)=>n+(Number(x.quantity||0)*Number(x.unit_price??x.estimated_unit_cost??0)),0);items.forEach((x,i)=>{const el=document.querySelector('[data-po-total="'+i+'"]');if(el)el.textContent=money(Number(x.quantity||0)*Number(x.unit_price??x.estimated_unit_cost??0));});document.getElementById("poSubtotal").textContent=money(total);}
function closePoModal(){document.getElementById("poModal").style.display="none";state.poDraftRequest=null;}
async function savePurchaseOrder(){
 const d=state.poDraftRequest;if(!d)return;const supplier=document.getElementById("poSupplier").value.trim(),contact=document.getElementById("poSupplierContact").value.trim(),address=document.getElementById("poSupplierAddress").value.trim(),poDate=document.getElementById("poDate").value,delivery=document.getElementById("poDelivery").value,payment=document.getElementById("poPaymentTerms").value.trim(),deliveryTerms=document.getElementById("poDeliveryTerms").value.trim(),remarks=document.getElementById("poRemarks").value.trim();
 if(!supplier)return msg("Supplier name is required.","err");if(!poDate)return msg("PO date is required.","err");if(delivery&&delivery<poDate)return msg("Expected delivery cannot be earlier than PO date.","err");
 for(const it of d.items){if(!it.material_name.trim())return msg("Every PO line needs a material name.","err");if(!(Number(it.quantity)>0))return msg("Every PO line needs a quantity greater than zero.","err");if(!(Number(it.unit_price)>=0))return msg("Unit price cannot be negative.","err");}
 const total=d.items.reduce((n,x)=>n+(Number(x.quantity||0)*Number(x.unit_price??x.estimated_unit_cost??0)),0);
 const btn=document.getElementById("savePo");btn.disabled=true;btn.textContent="SAVING...";
 try{
  const payload={purchase_request_id:d.r.purchase_request_id,purchase_request_no:d.r.request_no,project_id:d.r.project_id,project_name:d.r.project_name,project_location:d.r.project_location,requester_employee_id:d.r.requester_employee_id,requester_name:d.r.requester_name,supplier_name:supplier,supplier_contact:contact||null,supplier_address:address||null,po_date:poDate,expected_delivery_date:delivery||null,status:"DRAFT",subtotal:total,tax_amount:0,other_charges:0,grand_total:total,payment_terms:payment||null,delivery_terms:deliveryTerms||null,remarks:remarks||null};
  const {data,error}=await supabaseClient.from("purchase_orders").insert(payload).select("purchase_order_id,po_no").single();if(error)throw error;
  const items=d.items.map((it,i)=>({purchase_order_id:data.purchase_order_id,line_no:i+1,purchase_request_item_id:it.purchase_request_item_id||null,material_name:it.material_name.trim(),specifications:it.specifications?.trim()||null,quantity:Number(it.quantity),unit:it.unit.trim(),unit_price:Number(it.unit_price??it.estimated_unit_cost??0)}));
  const {error:ierr}=await supabaseClient.from("purchase_order_items").insert(items);if(ierr)throw ierr;
  await supabaseClient.from("purchase_requests").update({status:"ORDERED"}).eq("purchase_request_id",d.r.purchase_request_id);
  closePoModal();msg("Purchase Order "+data.po_no+" created.");await Promise.all([loadRequests(),loadOrders()]);renderAll();switchTab("orders");
 }catch(err){console.error(err);msg("Could not create purchase order: "+err.message,"err");}finally{btn.disabled=false;btn.textContent="SAVE PURCHASE ORDER";}
}
async function openPODetails(id){
 const o=state.orders.find(x=>x.purchase_order_id===id);if(!o)return;const items=state.orderItems.filter(i=>i.purchase_order_id===id);
 document.getElementById("detailTitle").textContent="PURCHASE ORDER DETAILS";
 document.getElementById("detailBody").innerHTML='<div class="detail-grid"><div class="detail-card"><label>PO No.</label><strong>'+esc(o.po_no)+'</strong></div><div class="detail-card"><label>Status</label><strong>'+statusBadge(o.status)+'</strong></div><div class="detail-card"><label>Purchase Request</label><div>'+esc(o.purchase_request_no||"—")+'</div></div><div class="detail-card"><label>Project</label><div>'+esc(o.project_name)+'<br><small>'+esc(o.project_location||"")+'</small></div></div><div class="detail-card"><label>Requester</label><div>'+esc(o.requester_name||"—")+'</div></div><div class="detail-card"><label>Supplier</label><div>'+esc(o.supplier_name)+'<br><small>'+esc(o.supplier_contact||"")+'</small></div></div><div class="detail-card"><label>PO Date</label><div>'+esc(fmtDate(o.po_date))+'</div></div><div class="detail-card"><label>Expected Delivery</label><div>'+esc(fmtDate(o.expected_delivery_date))+'</div></div></div><div class="section-label">ORDER ITEMS</div><div class="table-wrap"><table class="table"><thead><tr><th>Material</th><th>Specifications</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>'+items.map(i=>'<tr><td><strong>'+esc(i.material_name)+'</strong></td><td>'+esc(i.specifications||"—")+'</td><td>'+esc(i.quantity)+'</td><td>'+esc(i.unit)+'</td><td>'+money(i.unit_price)+'</td><td>'+money(i.line_total)+'</td></tr>').join("")+'</tbody></table></div><div class="total-box"><span>GRAND TOTAL</span><strong>'+money(o.grand_total)+'</strong></div>';
 document.getElementById("detailPrimaryAction").style.display="none";document.getElementById("detailModal").style.display="flex";
}
document.addEventListener("DOMContentLoaded",()=>init().catch(e=>{console.error(e);msg("Could not initialize purchasing: "+e.message,"err");}));
