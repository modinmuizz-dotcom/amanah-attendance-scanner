const SUPABASE_URL="https://bafmycjninxomufhkjvy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_EeM9NowMW-xXiDC_F3I7cA_VoCJk9dJ";
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

const state={projects:[],employees:[],suppliers:[],requests:[],requestItems:[],orders:[],orderItems:[],activeRequestId:null,activeOrderId:null,activeTab:"requests",prDraftItems:[],poDraftRequest:null,editingRequestId:null,editingOrderId:null,confirmResolver:null,supplyItemId:null,alternativeSourceItemId:null,alternativeSourceSupplierId:null,access:{role:"UNASSIGNED",permissions:new Set(),canManage:false,canApprove:false}};

function esc(v){return v==null?"":String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
function today(){return new Date().toISOString().slice(0,10);}
function money(v){return "₱"+Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});}
function statusClass(s){return {"DRAFT":"b-draft","SUBMITTED":"b-sub","UNDER REVIEW":"b-review","APPROVED":"b-approved","PARTIALLY ORDERED":"b-ordered","ORDERED":"b-ordered","REJECTED":"b-rejected","CANCELLED":"b-cancel","RECEIVED":"b-received","CLOSED":"b-received","SENT TO SUPPLIER":"b-ordered","WAITING FOR SUPPLIER":"b-review","PARTIALLY FULFILLED":"b-ordered","PARTIALLY RECEIVED":"b-ordered"}[s]||"b-draft";}
function statusBadge(s){return '<span class="badge '+statusClass(s)+'">'+esc(s)+'</span>';}
function msg(text,type="ok"){const el=document.getElementById("message"),shade=document.getElementById("messageShade");el.textContent=text;el.className="message "+type;shade.style.display="block";clearTimeout(window.__amanahPurchasingMessageTimer);window.__amanahPurchasingMessageTimer=setTimeout(()=>{el.className="message";el.textContent="";shade.style.display="none";},2800);}
function clearMsg(){const el=document.getElementById("message");el.className="message";el.textContent="";document.getElementById("messageShade").style.display="none";}
function fmtDate(v){if(!v)return "—";return new Date(v+"T00:00:00").toLocaleDateString();}

async function loadAccess(){
 const {data:{session}}=await supabaseClient.auth.getSession();
 if(!session){location.href="admin.html";return false;}

 await supabaseClient.rpc("amanah_register_current_user");

 const [{data:role,error:roleError},{data:permissionRows,error:permissionError}]=await Promise.all([
   supabaseClient.rpc("amanah_get_current_role"),
   supabaseClient.rpc("amanah_get_current_permissions")
 ]);

 if(roleError)throw roleError;
 if(permissionError)throw permissionError;

 const permissions=new Set((permissionRows||[]).map(x=>x.permission_key));
 state.access={
   role:role||"UNASSIGNED",
   permissions,
   canManage:permissions.has("purchasing.manage"),
   canApprove:permissions.has("purchasing.approve")
 };

 if(!state.access.canManage){
   document.querySelector(".page").innerHTML=
     '<section class="panel" style="padding:50px;text-align:center;margin-top:40px">'+
     '<div style="font-size:10px;letter-spacing:.12em;color:#64748b;font-weight:900">ACCESS CONTROL</div>'+
     '<h2 style="margin:8px 0">PURCHASING CONTROL</h2>'+
     '<p style="color:#64748b">Only the Purchasing Officer / Procurement role and authorized administrators can manage Purchase Requests and Purchase Orders.</p>'+
     '<button class="btn blue" type="button" onclick="location.href=\'dashboard.html\'">RETURN TO DASHBOARD</button>'+
     '</section>';
   return false;
 }

 return true;
}

function startPurchasingRealtime(){
  try{
    supabaseClient
      .channel("amanah-purchasing-request-status")
      .on(
        "postgres_changes",
        {
          event:"UPDATE",
          schema:"public",
          table:"purchase_requests"
        },
        async payload=>{
          const next=payload.new||{};
          const previous=payload.old||{};
          if(String(next.status||"")!==String(previous.status||"")){
            await Promise.allSettled([loadRequests(),loadOrders()]);
            renderAll();

            if(next.status==="APPROVED"){
              msg((next.request_no||"Purchase Request")+" was approved by the General Manager and is now ready for Purchase Order.","ok");
            }else if(next.status==="REJECTED"){
              msg((next.request_no||"Purchase Request")+" was rejected by the General Manager. Review the request remarks and revise it before resubmission.","err");
            }
          }
        }
      )
      .subscribe();
  }catch(error){
    console.warn("Purchasing realtime status subscription could not be started:",error);
  }
}

async function init(){
 const allowed=await loadAccess();
 if(!allowed)return;
 document.getElementById("requestDate").value=today();
 document.getElementById("poDate").value=today();
 bind();
 const results=await Promise.allSettled([loadProjects(),loadEmployees(),loadSuppliers(),loadRequests(),loadOrders()]);
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
 document.getElementById("savePo").addEventListener("click",savePurchaseOrder);document.getElementById("poSupplier").addEventListener("change",applySelectedSupplier);document.getElementById("closeSupply").addEventListener("click",closeSupplyModal);document.getElementById("cancelSupply").addEventListener("click",closeSupplyModal);document.getElementById("saveSupply").addEventListener("click",saveSupplyStatus);document.getElementById("sourceAlternative").addEventListener("click",sourceAlternativeSupplier);
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
async function loadSuppliers(){
 const {data,error}=await supabaseClient.from("suppliers").select("*").eq("status","ACTIVE").order("supplier_name");
 if(error)throw error;
 state.suppliers=data||[];
 const select=document.getElementById("poSupplier");
 if(select){
   select.innerHTML='<option value="">SELECT REGISTERED SUPPLIER</option>'+state.suppliers.map(s=>'<option value="'+esc(s.supplier_id)+'">'+esc(s.supplier_name)+' • '+esc(s.supplier_code)+'</option>').join("");
 }
}
function applySelectedSupplier(){
 const id=document.getElementById("poSupplier").value;
 const s=state.suppliers.find(x=>x.supplier_id===id);

 document.getElementById("poSupplierContact").value =
   s ? [s.contact_person,s.phone,s.email].filter(Boolean).join(" • ") : "";

 document.getElementById("poSupplierAddress").value =
   s?.address || "";

 document.getElementById("poPaymentTerms").value =
   s?.payment_terms || "";

 document.getElementById("poDeliveryTerms").value =
   s?.delivery_terms || "Delivered to project site";
}

function showPOValidation(message){
 const box=document.getElementById("poValidationMessage");
 if(!box)return msg(message,"err");
 box.textContent=message;
 box.style.display="block";
}

function clearPOValidation(){
 const box=document.getElementById("poValidationMessage");
 if(!box)return;
 box.textContent="";
 box.style.display="none";
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
 const open=state.requests.filter(r=>["DRAFT","SUBMITTED","UNDER REVIEW","PENDING APPROVAL"].includes(r.status)).length;
 const review=state.requests.filter(r=>r.status==="PENDING APPROVAL").length;
 const approved=state.requests.filter(r=>["APPROVED","PARTIALLY ORDERED","ORDERED"].includes(r.status)).length;
 const po=state.orders.filter(o=>!["CLOSED","CANCELLED"].includes(o.status)).length;
 document.getElementById("mOpen").textContent=open;
 document.getElementById("mReview").textContent=review;
 document.getElementById("mApproved").textContent=approved;
 document.getElementById("mPO").textContent=po;
}

function showCancelRequestDialog(title,requestNo,projectName,approved=false){
  return new Promise(resolve=>{
    document.getElementById("amanahCancelRequestModal")?.remove();
    const wrap=document.createElement("div");
    wrap.id="amanahCancelRequestModal";
    wrap.style.cssText="position:fixed;inset:0;z-index:30000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.68);backdrop-filter:blur(4px)";
    wrap.innerHTML=
      '<div style="width:min(560px,100%);background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 30px 90px rgba(15,23,42,.3);overflow:hidden">'+
        '<div style="display:flex;gap:12px;align-items:flex-start;padding:20px;border-bottom:1px solid #e2e8f0">'+
          '<div style="width:40px;height:40px;border-radius:11px;display:grid;place-items:center;background:#fff7ed;color:#b45309;font-weight:900">!</div>'+
          '<div><div style="color:#2563eb;font-size:8px;font-weight:900;letter-spacing:.1em">PURCHASE REQUEST</div><h3 style="margin:5px 0;color:#0f172a;font-size:18px">'+(approved?"REQUEST PURCHASE CANCELLATION":"CANCEL REQUEST")+'</h3><p style="margin:0;color:#64748b;font-size:10px;line-height:1.5">'+(approved?"This approved purchase request requires General Manager approval before it can be cancelled.":"This purchase request is still awaiting General Manager approval.")+'</p></div>'+
          '<button type="button" data-cancel-close style="margin-left:auto;border:1px solid #dbe3ef;background:#fff;border-radius:9px;width:34px;height:34px;font-size:20px;color:#475569;cursor:pointer">×</button>'+
        '</div>'+
        '<div style="padding:18px 20px">'+
          '<div style="padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc"><strong style="display:block;color:#0f172a;font-size:11px">'+esc(requestNo)+'</strong><span style="display:block;margin-top:4px;color:#475569;font-size:11px">'+esc(projectName||"—")+'</span></div>'+
          '<label style="display:block;margin-top:14px;color:#334155;font-size:9px;font-weight:900;letter-spacing:.08em">CANCELLATION REASON</label>'+
          '<textarea data-cancel-reason rows="4" placeholder="Enter the reason for withdrawing this purchase request..." style="width:100%;box-sizing:border-box;margin-top:7px;border:1px solid #cbd5e1;border-radius:10px;padding:11px 12px;font:inherit;resize:vertical"></textarea>'+
          '<div style="margin-top:6px;color:#94a3b8;font-size:9px">The reason will be retained in the approval history.</div>'+
        '</div>'+
        '<div style="display:flex;justify-content:flex-end;gap:8px;padding:15px 20px;border-top:1px solid #e2e8f0;background:#fbfdff">'+
          '<button type="button" data-cancel-close class="btn gray">KEEP REQUEST</button>'+
          '<button type="button" data-cancel-confirm class="btn red">CANCEL REQUEST</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(wrap);
    const reason=wrap.querySelector("[data-cancel-reason]");setTimeout(()=>reason?.focus(),30);
    const finish=value=>{wrap.remove();resolve(value);};
    wrap.querySelectorAll("[data-cancel-close]").forEach(b=>b.addEventListener("click",()=>finish(null)));
    wrap.querySelector("[data-cancel-confirm]").addEventListener("click",()=>{
      const v=(reason?.value||"").trim();
      if(!v){reason.focus();reason.style.borderColor="#dc2626";return;}
      finish(v);
    });
    wrap.addEventListener("click",e=>{if(e.target===wrap)finish(null);});
  });
}

async function cancelPurchaseRequest(id){
  const r=state.requests.find(x=>x.purchase_request_id===id);
  if(!r)return;
  const approved=r.status==="APPROVED";
  if(!["PENDING APPROVAL","APPROVED"].includes(r.status))return;
  const reason=await showCancelRequestDialog(approved?"REQUEST PURCHASE CANCELLATION":"CANCEL PURCHASE REQUEST",r.request_no,r.project_name,approved);
  if(!reason)return;
  try{
    if(!approved){
      const {data:req,error:reqError}=await supabaseClient.from("amanah_approval_requests").select("approval_id").eq("request_type","PURCHASE_REQUEST").eq("entity_id",id).eq("status","PENDING").maybeSingle();
      if(reqError)throw reqError;
      if(!req?.approval_id)throw new Error("No pending approval request was found for this purchase request.");
      const {error}=await supabaseClient.rpc("amanah_cancel_approval",{p_approval_id:req.approval_id,p_reason:reason});
      if(error)throw error;
      msg("Purchase Request "+r.request_no+" cancelled successfully.","ok");
    }else{
      const {error}=await supabaseClient.rpc("amanah_submit_approval",{
        p_request_type:"PURCHASE_REQUEST",
        p_entity_id:id,
        p_title:"Cancellation: "+(r.request_no||"Purchase Request"),
        p_description:"Cancellation request submitted for General Manager approval.",
        p_payload:{
          request_action:"CANCEL",
          request_no:r.request_no||"",
          project_name:r.project_name||"",
          project_location:r.project_location||"",
          requester_name:r.requester_name||"",
          requester_position:r.requester_position||r.requester_role||"",
          needed_by_date:r.needed_by_date||"",
          priority:r.priority||"NORMAL",
          purpose:r.purpose||"",
          cancellation_reason:reason
        }
      });
      if(error)throw error;
      msg("Purchase cancellation request submitted for General Manager approval.","ok");
    }
    await loadRequests();
    renderRequests();
  }catch(error){
    console.error(error);msg(error.message||"Unable to process purchase cancellation.","err");
  }
}
function renderRequests(){
 const q=(document.getElementById("prSearch").value||"").toLowerCase().trim(),status=document.getElementById("prStatus").value,pid=document.getElementById("prProject").value;
 const rows=state.requests.filter(r=>(!q||[r.request_no,r.project_name,r.requester_name,r.purpose].join(" ").toLowerCase().includes(q))&&(!status||r.status===status)&&(!pid||r.project_id===pid));
 document.getElementById("prBody").innerHTML=rows.length?rows.map(r=>{
  const items=state.requestItems.filter(i=>i.purchase_request_id===r.purchase_request_id);
  let actions='<button class="mini blue" data-pr-view="'+esc(r.purchase_request_id)+'">VIEW</button><button class="mini print" data-pr-print="'+esc(r.purchase_request_id)+'">PRINT</button>';
  if(state.access.canManage && !["APPROVED","ORDERED","CLOSED","CANCELLED","REJECTED"].includes(r.status))actions+='<button class="mini edit" data-pr-edit="'+esc(r.purchase_request_id)+'">EDIT</button>';
  if(state.access.canManage && ["DRAFT","REJECTED","CANCELLED"].includes(r.status))actions+='<button class="mini delete" data-pr-delete="'+esc(r.purchase_request_id)+'">DELETE</button>';
  if(r.status==="PENDING APPROVAL" && state.access.canManage)actions+='<button class="mini gray" data-pr-cancel="'+esc(r.purchase_request_id)+'">CANCEL REQUEST</button>';
  if(r.status==="APPROVED" && state.access.canManage)actions+='<button class="mini gray" data-pr-cancel="'+esc(r.purchase_request_id)+'">REQUEST CANCELLATION</button>';
  if(state.access.canApprove && (r.status==="PENDING APPROVAL"||r.status==="SUBMITTED"||r.status==="UNDER REVIEW"))actions+='<button class="mini green" data-pr-approve="'+esc(r.purchase_request_id)+'">APPROVE</button><button class="mini red" data-pr-reject="'+esc(r.purchase_request_id)+'">REJECT</button>';
  if(state.access.canManage && (r.status==="APPROVED"||r.status==="PARTIALLY ORDERED"))actions+='<button class="mini green" type="button" data-pr-po="'+esc(r.purchase_request_id)+'" onclick="openPOModal(\''+esc(r.purchase_request_id)+'\'); return false;">CREATE PO</button>';
  return '<tr><td><strong>'+esc(r.request_no)+'</strong></td><td>'+esc(fmtDate(r.request_date))+'</td><td><strong>'+esc(r.project_name)+'</strong><br><small style="color:#64748b">'+esc(r.project_location||"")+'</small></td><td>'+esc(r.requester_name)+'<br><small style="color:#64748b">'+esc(r.requester_position||r.requester_role||"SITE ENGINEER")+'</small></td><td>'+esc(fmtDate(r.needed_by_date))+'</td><td>'+esc(r.priority)+'</td><td>'+items.length+'</td><td>'+statusBadge(r.status)+'</td><td><div class="row-actions">'+actions+'</div></td></tr>';
 }).join(""):'<tr><td colspan="9" class="empty">No purchase requests found.</td></tr>';
 document.querySelectorAll("[data-pr-view]").forEach(b=>b.addEventListener("click",()=>openRequestDetails(b.dataset.prView)));
 document.querySelectorAll("[data-pr-edit]").forEach(b=>b.addEventListener("click",()=>openRequestEdit(b.dataset.prEdit)));
 document.querySelectorAll("[data-pr-print]").forEach(b=>b.addEventListener("click",()=>printPurchaseRequest(b.dataset.prPrint)));
 document.querySelectorAll("[data-pr-delete]").forEach(b=>b.addEventListener("click",()=>deletePurchaseRequest(b.dataset.prDelete)));
 document.querySelectorAll("[data-pr-cancel]").forEach(b=>b.addEventListener("click",()=>cancelPurchaseRequest(b.dataset.prCancel)));
 document.querySelectorAll("[data-pr-approve]").forEach(b=>b.addEventListener("click",()=>setRequestStatus(b.dataset.prApprove,"APPROVED")));
 document.querySelectorAll("[data-pr-reject]").forEach(b=>b.addEventListener("click",()=>setRequestStatus(b.dataset.prReject,"REJECTED")));
 document.querySelectorAll("[data-pr-po]").forEach(b=>b.addEventListener("click",()=>openPOModal(b.dataset.prPo)));
}
document.addEventListener("click",function(event){
  const button=event.target.closest("[data-pr-po]");
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  const id=button.getAttribute("data-pr-po");
  try{
    openPOModal(id);
  }catch(error){
    console.error("CREATE PO button error:",error);
    msg(error.message||"Unable to open Purchase Order form.","err");
  }
});

function renderOrders(){
 const q=(document.getElementById("poSearch").value||"").toLowerCase().trim(),status=document.getElementById("poStatus").value,pid=document.getElementById("poProject").value;
 const rows=state.orders.filter(o=>(!q||[o.po_no,o.supplier_name,o.project_name,o.purchase_request_no].join(" ").toLowerCase().includes(q))&&(!status||o.status===status)&&(!pid||o.project_id===pid));
 document.getElementById("poBody").innerHTML=rows.length?rows.map(o=>{
   const items=state.orderItems.filter(x=>x.purchase_order_id===o.purchase_order_id);
   const unavailable=items.filter(x=>["UNAVAILABLE","BACKORDERED"].includes(String(x.supply_status||"").toUpperCase())).length;
   const pending=items.filter(x=>String(x.supply_status||"").toUpperCase()==="PENDING SUPPLIER CONFIRMATION").length;
   const supplySummary=unavailable?unavailable+" ITEM(S) NEED SUPPLIER ACTION":pending?pending+" ITEM(S) PENDING":"SUPPLY TRACKED";
   return '<tr><td><strong>'+esc(o.po_no)+'</strong></td><td>'+esc(fmtDate(o.po_date))+'</td><td>'+esc(o.purchase_request_no||"—")+'</td><td><strong>'+esc(o.project_name)+'</strong><br><small style="color:#64748b">'+esc(o.project_location||"")+'</small></td><td>'+esc(o.requester_name||"—")+'</td><td>'+esc(o.supplier_name)+'</td><td>'+esc(fmtDate(o.expected_delivery_date))+'</td><td>'+money(o.grand_total)+'</td><td>'+statusBadge(o.status)+'<br><small style="color:#64748b">'+esc(supplySummary)+'</small></td><td><div class="row-actions"><button class="mini blue" data-po-view="'+esc(o.purchase_order_id)+'">VIEW</button><button class="mini edit" data-po-edit="'+esc(o.purchase_order_id)+'">EDIT</button><button class="mini print" data-po-print="'+esc(o.purchase_order_id)+'">PRINT</button><button class="mini delete" data-po-delete="'+esc(o.purchase_order_id)+'">DELETE</button></div></td></tr>';
 }).join(""):'<tr><td colspan="10" class="empty">No purchase orders found.</td></tr>';
 document.querySelectorAll("[data-po-view]").forEach(b=>b.addEventListener("click",()=>openPODetails(b.dataset.poView)));
 document.querySelectorAll("[data-po-edit]").forEach(b=>b.addEventListener("click",()=>openPOEdit(b.dataset.poEdit)));
 document.querySelectorAll("[data-po-print]").forEach(b=>b.addEventListener("click",()=>printPurchaseOrder(b.dataset.poPrint)));
 document.querySelectorAll("[data-po-delete]").forEach(b=>b.addEventListener("click",()=>deletePurchaseOrder(b.dataset.poDelete)));
}
function openRequestModal(){
 if(!state.access.canManage)return msg("Only the Purchasing Officer / Procurement role can encode a Purchase Request.","err");
 clearMsg();state.editingRequestId=null;
 document.getElementById("requestModal").style.display="flex";
 document.getElementById("requestDate").value=today();document.getElementById("neededBy").value="";
 document.getElementById("requestProject").value="";document.getElementById("requester").value="";
 document.getElementById("requestPriority").value="NORMAL";document.getElementById("requestPurpose").value="";document.getElementById("requestRemarks").value="";
 document.getElementById("requestModal").querySelector(".modal-head h3").textContent="PURCHASE REQUEST";
 document.getElementById("requestModal").querySelector(".modal-head div div").textContent="Encoded by the Purchasing Officer on behalf of the requesting Site Engineer.";
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
   payload.status="PENDING APPROVAL";
   payload.reviewed_at=null;
   payload.reviewed_by=null;
   payload.review_remarks=null;
   const {error}=await supabaseClient.from("purchase_requests").update(payload).eq("purchase_request_id",requestId);if(error)throw error;
   const {error:delErr}=await supabaseClient.from("purchase_request_items").delete().eq("purchase_request_id",requestId);if(delErr)throw delErr;
   requestNo=state.requests.find(x=>x.purchase_request_id===requestId)?.request_no||"Purchase Request";
  }else{
   payload.status="PENDING APPROVAL";payload.submitted_at=new Date().toISOString();
   const {data,error}=await supabaseClient.from("purchase_requests").insert(payload).select("purchase_request_id,request_no").single();if(error)throw error;
   requestId=data.purchase_request_id;requestNo=data.request_no;
  }
  const items=state.prDraftItems.map((it,i)=>({purchase_request_id:requestId,line_no:i+1,material_name:it.material_name.trim(),specifications:it.specifications?.trim()||null,quantity:Number(it.quantity),unit:it.unit.trim()}));
  const {error:itemError}=await supabaseClient.from("purchase_request_items").insert(items);if(itemError)throw itemError;
  const itemsSummary=state.prDraftItems.map(it=>String(it.material_name||"")+" × "+String(it.quantity||0)+" "+String(it.unit||"")).join(", ");
  const {error:approvalError}=await supabaseClient.rpc("amanah_submit_approval",{
    p_request_type:"PURCHASE_REQUEST",
    p_entity_id:requestId,
    p_title:requestNo||"Purchase Request",
    p_description:"Purchase request submitted for General Manager approval.",
    p_payload:{
      request_no:requestNo,
      project_name:p?.project_name||"",
      project_location:p?.location||"",
      requester_name:e?.employee_name||"",
      requester_position:e?.position||"",
      needed_by_date:neededBy||"",
      priority,
      purpose:purpose||"",
      items_summary:itemsSummary
    }
  });
  if(approvalError)throw approvalError;
  closeRequestModal();msg(editing?requestNo+" saved and resubmitted for General Manager approval.":"Purchase Request "+requestNo+" submitted for General Manager approval.");await Promise.all([loadRequests(),loadOrders()]);renderAll();
 }catch(err){console.error(err);msg((editing?"Could not update purchase request: ":"Could not submit purchase request: ")+err.message,"err");}
 finally{btn.disabled=false;btn.textContent=editing?"SAVE CHANGES":"SUBMIT REQUEST";}
}
async function setRequestStatus(id,status){
 const approve=status==="APPROVED";
 const confirmed=await showConfirm(approve?"APPROVE PURCHASE REQUEST":"REJECT PURCHASE REQUEST",approve?"Please confirm that this Purchase Request has been reviewed by the General Manager and may proceed to Purchase Order processing.":"Please confirm that this Purchase Request should be rejected by the General Manager.",approve?"APPROVE REQUEST":"REJECT REQUEST",!approve);
 if(!confirmed)return;
 const remarks=approve?"Approved by General Manager":"Rejected by General Manager";
 const {error}=await supabaseClient.rpc("amanah_decide_pending_approval",{
   p_request_type:"PURCHASE_REQUEST",
   p_entity_id:id,
   p_decision:status,
   p_remarks:remarks
 });
 if(error)return msg("Could not update approval: "+error.message,"err");
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
 document.getElementById("detailPrimaryAction").style.display=(state.access.canManage && (r.status==="APPROVED"||r.status==="PARTIALLY ORDERED"))?"inline-block":"none";
 if(state.access.canManage && (r.status==="APPROVED"||r.status==="PARTIALLY ORDERED"))document.getElementById("detailPrimaryAction").textContent="CREATE PURCHASE ORDER";
 document.getElementById("detailModal").style.display="flex";
}
async function openRequestEdit(id){
 const r=state.requests.find(x=>x.purchase_request_id===id);if(!r)return;
 if(!state.access.canManage)return msg("Only the Purchasing Officer / Procurement role can edit Purchase Requests.","err");
 if(["CANCELLED","CLOSED","ORDERED","APPROVED"].includes(r.status))return msg("This Purchase Request cannot be edited in its current status.","err");
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
function primaryDetailAction(){if(state.activeRequestId && state.access.canManage)openPOModal(state.activeRequestId);}
function openPOModal(requestId){
 const r=state.requests.find(x=>x.purchase_request_id===requestId);if(!r)return;
 if(!state.access.canManage)return msg("Only the Purchasing Officer / Procurement role can create Purchase Orders.","err");
 if(!["APPROVED","PARTIALLY ORDERED"].includes(r.status))return msg("Purchase Request must be approved by the General Manager before creating a PO.","err");
 clearPOValidation();
 state.editingOrderId=null;
 const items=state.requestItems
   .filter(x=>x.purchase_request_id===requestId)
   .map(x=>({...x,unit_price:""}));
 state.poDraftRequest={r,items};
 document.getElementById("poModalTitle").textContent="CREATE PURCHASE ORDER";document.getElementById("poFromRequest").textContent=r.request_no+" • "+r.project_name+" • Requested by "+r.requester_name;
 const poDate=today();
 const requestedDelivery=r.needed_by_date||"";
 const deliveryDate=requestedDelivery && requestedDelivery>=poDate ? requestedDelivery : poDate;
 refreshPoSupplierOptions(state.alternativeSourceSupplierId);
 document.getElementById("poSupplier").value="";
 document.getElementById("poSupplierContact").value="";
 document.getElementById("poSupplierAddress").value="";
 document.getElementById("poDate").value=poDate;
 document.getElementById("poDelivery").value=deliveryDate;
 document.getElementById("poPaymentTerms").value="";
 document.getElementById("poDeliveryTerms").value="Delivered to project site";
 document.getElementById("poRemarks").value="";

 if(state.suppliers.length===1){
   document.getElementById("poSupplier").value=state.suppliers[0].supplier_id;
   applySelectedSupplier();
 }

 renderPoItems();document.getElementById("poModal").style.display="flex";
}
async function openPOEdit(id){
 const o=state.orders.find(x=>x.purchase_order_id===id);if(!o)return;
 if(["RECEIVED","CLOSED","CANCELLED"].includes(o.status))return msg("This Purchase Order cannot be edited in its current status.","err");
 state.editingOrderId=id;const req=state.requests.find(x=>x.purchase_request_id===o.purchase_request_id)||{request_no:o.purchase_request_no,project_id:o.project_id,project_name:o.project_name,project_location:o.project_location,requester_employee_id:o.requester_employee_id,requester_name:o.requester_name};
 state.poDraftRequest={
  r:req,
  items:state.orderItems
    .filter(x=>x.purchase_order_id===id)
    .map(x=>({...x,unit_price:x.unit_price==null?"":Number(x.unit_price)})
    )
};
 document.getElementById("poModalTitle").textContent="EDIT PURCHASE ORDER";document.getElementById("poFromRequest").textContent=o.po_no+" • "+o.project_name+" • Requested by "+(o.requester_name||"—");
 document.getElementById("poSupplier").value=o.supplier_id||"";document.getElementById("poSupplierContact").value=o.supplier_contact||"";document.getElementById("poSupplierAddress").value=o.supplier_address||"";document.getElementById("poDate").value=o.po_date||today();document.getElementById("poDelivery").value=o.expected_delivery_date||"";document.getElementById("poPaymentTerms").value=o.payment_terms||"";document.getElementById("poDeliveryTerms").value=o.delivery_terms||"";document.getElementById("poRemarks").value=o.remarks||"";
 renderPoItems();document.getElementById("poModal").style.display="flex";
}
function renderPoItems(){
 const items=state.poDraftRequest.items;
 document.getElementById("poItems").innerHTML='<div class="items-box">'+items.map((it,i)=>{
   const hasPrice=it.unit_price!=="" && it.unit_price!==null && it.unit_price!==undefined;
   const lineTotal=hasPrice ? Number(it.quantity||0)*Number(it.unit_price||0) : null;
   return '<div class="item-row">'+
     '<div class="field"><label>Material</label><input data-po-field="material_name" data-i="'+i+'" value="'+esc(it.material_name)+'"></div>'+
     '<div class="field"><label>Specifications</label><input data-po-field="specifications" data-i="'+i+'" value="'+esc(it.specifications||"")+'"></div>'+
     '<div class="field"><label>Qty</label><input data-po-field="quantity" data-i="'+i+'" type="number" min="0.001" step="0.001" value="'+esc(it.quantity)+'"></div>'+
     '<div class="field"><label>Unit</label><input data-po-field="unit" data-i="'+i+'" value="'+esc(it.unit)+'"></div>'+
     '<div class="field"><label>Unit Price <span style="color:#64748b;font-size:8px">(OPTIONAL)</span></label><input data-po-field="unit_price" data-i="'+i+'" type="number" min="0" step="0.01" placeholder="TO BE QUOTED" value="'+(hasPrice?esc(it.unit_price):"")+'"></div>'+
     '<div class="item-total" data-po-total="'+i+'">'+(lineTotal===null?'<span style="color:#64748b;font-size:10px">TO BE PRICED</span>':money(lineTotal))+'</div>'+
   '</div>';
 }).join("")+'</div>';
 document.querySelectorAll("[data-po-field]").forEach(el=>el.addEventListener("input",()=>{
   const i=Number(el.dataset.i),f=el.dataset.poField;
   if(f==="quantity")items[i][f]=Number(el.value||0);
   else if(f==="unit_price")items[i][f]=el.value===""?"":Number(el.value);
   else items[i][f]=el.value;
   updatePoTotal();
 }));
 updatePoTotal();
}
function updatePoTotal(){
 const items=state.poDraftRequest?.items||[];
 let total=0;
 let pending=false;
 items.forEach((x,i)=>{
   const hasPrice=x.unit_price!=="" && x.unit_price!==null && x.unit_price!==undefined;
   const el=document.querySelector('[data-po-total="'+i+'"]');
   if(hasPrice){
     const line=Number(x.quantity||0)*Number(x.unit_price||0);
     total+=line;
     if(el)el.textContent=money(line);
   }else{
     pending=true;
     if(el)el.innerHTML='<span style="color:#64748b;font-size:10px">TO BE PRICED</span>';
   }
 });
 document.getElementById("poSubtotal").textContent=pending ? money(total)+" + PENDING PRICE" : money(total);
}

function supplyStatusClass(status){
 const s=String(status||"").toUpperCase();
 if(s==="AVAILABLE"||s==="SUBSTITUTE APPROVED"||s==="RECEIVED")return "b-received";
 if(s==="UNAVAILABLE"||s==="CANCELLED")return "b-rejected";
 if(s==="BACKORDERED"||s==="PENDING SUPPLIER CONFIRMATION"||s==="SUBSTITUTE PROPOSED")return "b-review";
 if(s==="PARTIALLY AVAILABLE")return "b-ordered";
 return "b-draft";
}

function supplyBadge(status){
 const s=String(status||"PENDING SUPPLIER CONFIRMATION").toUpperCase();
 return '<span class="badge '+supplyStatusClass(s)+'">'+esc(s)+'</span>';
}

function currentRequestedQuantity(requestItemId){
 const item=state.requestItems.find(x=>x.purchase_request_item_id===requestItemId);
 return Number(item?.quantity||0);
}

function effectiveProcurementQuantityForRequestItem(requestItemId){
 return state.orderItems
   .filter(x=>x.purchase_request_item_id===requestItemId)
   .reduce((sum,x)=>{
     const status=String(x.supply_status||"PENDING SUPPLIER CONFIRMATION").toUpperCase();
     if(["UNAVAILABLE","CANCELLED"].includes(status))return sum;
     if(status==="PARTIALLY AVAILABLE")return sum+Number(x.confirmed_quantity||0);
     if(status==="RECEIVED")return sum+Number(x.received_quantity||0);
     if(status==="AVAILABLE" || status==="SUBSTITUTE APPROVED")return sum+Number(x.confirmed_quantity||0);
     return sum+Number(x.quantity||0);
   },0);
}

function sourceRemainingQuantity(requestItemId){
 return Math.max(currentRequestedQuantity(requestItemId)-effectiveProcurementQuantityForRequestItem(requestItemId),0);
}

function refreshPoSupplierOptions(excludeSupplierId=null){
 const select=document.getElementById("poSupplier");
 if(!select)return;
 const rows=state.suppliers.filter(s=>!excludeSupplierId || s.supplier_id!==excludeSupplierId);
 select.innerHTML='<option value="">SELECT REGISTERED SUPPLIER</option>'+
   rows.map(s=>'<option value="'+esc(s.supplier_id)+'">'+esc(s.supplier_name)+' • '+esc(s.supplier_code)+'</option>').join("");
}

function clearSupplyValidation(){
 const box=document.getElementById("supplyValidation");
 if(!box)return;
 box.textContent="";
 box.style.display="none";
}

function showSupplyValidation(message){
 const box=document.getElementById("supplyValidation");
 if(!box)return msg(message,"err");
 box.textContent=message;
 box.style.display="block";
}

async function openSupplyModal(itemId){
 const item=state.orderItems.find(x=>x.purchase_order_item_id===itemId);
 if(!item)return;
 const order=state.orders.find(x=>x.purchase_order_id===item.purchase_order_id);
 if(!order)return;

 state.supplyItemId=itemId;
 clearSupplyValidation();

 document.getElementById("supplyFromPO").textContent=(order.po_no||"PURCHASE ORDER")+" • "+(order.supplier_name||"")+" • "+(order.project_name||"");
 document.getElementById("supplyMaterial").textContent=item.material_name||"—";
 document.getElementById("supplySpecifications").textContent=item.specifications||"—";
 document.getElementById("supplyOrderedQty").textContent=Number(item.quantity||0).toLocaleString("en-PH",{maximumFractionDigits:3});
 document.getElementById("supplyUnit").textContent=item.unit||"—";
 document.getElementById("supplyStatus").value=item.supply_status||"PENDING SUPPLIER CONFIRMATION";
 document.getElementById("supplyUnitPrice").value=item.unit_price==null?"":item.unit_price;
 document.getElementById("supplyConfirmedQty").value=item.confirmed_quantity??0;
 document.getElementById("supplyReceivedQty").value=item.received_quantity??0;
 document.getElementById("supplyReceivedDate").value=item.received_date||"";
 document.getElementById("supplyDeliveryReference").value=item.delivery_reference||"";
 document.getElementById("supplyReceivingRemarks").value=item.receiving_remarks||"";
 document.getElementById("supplyAvailabilityDate").value=item.expected_availability_date||"";
 document.getElementById("supplySubstituteStatus").value=item.substitute_status||"NONE";
 document.getElementById("supplySubstituteMaterial").value=item.substitute_material_name||"";
 document.getElementById("supplySubstituteSpecifications").value=item.substitute_specifications||"";
 document.getElementById("supplySupplierRemarks").value=item.supplier_remarks||"";

 const remaining=sourceRemainingQuantity(item.purchase_request_item_id);
 const showAlternative=["UNAVAILABLE","BACKORDERED","PARTIALLY AVAILABLE","SUBSTITUTE PROPOSED"].includes(String(item.supply_status||"").toUpperCase()) && remaining>0;
 const alt=document.getElementById("sourceAlternative");
 alt.style.display=showAlternative?"inline-block":"none";
 alt.textContent="SOURCE ALTERNATIVE ("+remaining.toLocaleString("en-PH",{maximumFractionDigits:3})+" "+(item.unit||"")+")";

 document.getElementById("supplyModal").style.display="flex";
}

function closeSupplyModal(){
 document.getElementById("supplyModal").style.display="none";
 state.supplyItemId=null;
 clearSupplyValidation();
}

async function saveSupplyStatus(){
 const item=state.orderItems.find(x=>x.purchase_order_item_id===state.supplyItemId);
 if(!item)return;
 const status=document.getElementById("supplyStatus").value;
 const unitPriceRaw=document.getElementById("supplyUnitPrice").value;
 const unitPrice=unitPriceRaw===""?null:Number(unitPriceRaw);
 const confirmed=Number(document.getElementById("supplyConfirmedQty").value||0);
 const received=Number(document.getElementById("supplyReceivedQty").value||0);
 const receivedDate=document.getElementById("supplyReceivedDate").value||null;
 const deliveryReference=document.getElementById("supplyDeliveryReference").value.trim()||null;
 const receivingRemarks=document.getElementById("supplyReceivingRemarks").value.trim()||null;
 const availability=document.getElementById("supplyAvailabilityDate").value||null;
 const substituteStatus=document.getElementById("supplySubstituteStatus").value;
 const substituteMaterial=document.getElementById("supplySubstituteMaterial").value.trim()||null;
 const substituteSpecifications=document.getElementById("supplySubstituteSpecifications").value.trim()||null;
 const supplierRemarks=document.getElementById("supplySupplierRemarks").value.trim()||null;
 const ordered=Number(item.quantity||0);

 if(confirmed<0 || confirmed>ordered)return showSupplyValidation("Confirmed quantity must be between 0 and the ordered quantity.");
 if(received<0 || received>confirmed)return showSupplyValidation("Received quantity cannot exceed the confirmed quantity.");
 if(unitPrice!==null && (!Number.isFinite(unitPrice)||unitPrice<0))return showSupplyValidation("Unit price must be blank or zero and above.");
 if(received>0 && !receivedDate)return showSupplyValidation("Received date is required when received quantity is greater than zero.");
 if(received>0 && !deliveryReference)return showSupplyValidation("Delivery reference (DR / Invoice / Receipt No.) is required when recording a receipt.");
 if(status==="AVAILABLE" && confirmed<=0)return showSupplyValidation("Enter the quantity confirmed available by the supplier.");
 if(status==="RECEIVED" && received<=0)return showSupplyValidation("Enter the quantity actually received.");
 if((status==="UNAVAILABLE"||status==="BACKORDERED") && !supplierRemarks)return showSupplyValidation("Please record the supplier's reason or availability remarks.");
 if(status==="SUBSTITUTE PROPOSED" && !substituteMaterial)return showSupplyValidation("Enter the proposed substitute material.");
 if(substituteStatus==="PROPOSED" && !substituteMaterial)return showSupplyValidation("Enter the proposed substitute material.");

 const btn=document.getElementById("saveSupply");
 btn.disabled=true;
 btn.textContent="SAVING...";

 let receiverName=item.received_by_name||state.access?.role||"PURCHASING OFFICER";
 if(received>0){
   const {data:userData}=await supabaseClient.auth.getUser();
   receiverName=userData?.user?.user_metadata?.full_name || userData?.user?.email || receiverName;
 }

 try{
   const {data:savedItem,error}=await supabaseClient.from("purchase_order_items").update({
     supply_status:status,
     unit_price:unitPrice,
     confirmed_quantity:confirmed,
     received_quantity:received,
     received_date:receivedDate,
     delivery_reference:deliveryReference,
     receiving_remarks:receivingRemarks,
     received_by_name:received>0 ? receiverName : (item.received_by_name||null),
     received_at:received>0 ? new Date().toISOString() : null,
     expected_availability_date:availability,
     supplier_remarks:supplierRemarks,
     substitute_material_name:substituteMaterial,
     substitute_specifications:substituteSpecifications,
     substitute_status:substituteStatus
   }).eq("purchase_order_item_id",item.purchase_order_item_id)
     .select("*")
     .single();
   if(error)throw error;

   // Immediately update the in-memory row so the open PO screen cannot show stale data.
   const savedIndex=state.orderItems.findIndex(x=>x.purchase_order_item_id===item.purchase_order_item_id);
   if(savedIndex>=0) state.orderItems[savedIndex]={...state.orderItems[savedIndex],...savedItem};

   const {data:poItems,error:itemsError}=await supabaseClient.from("purchase_order_items").select("quantity,unit_price").eq("purchase_order_id",item.purchase_order_id);
   if(itemsError)throw itemsError;
   const subtotal=(poItems||[]).reduce((sum,x)=>sum+(x.unit_price==null?0:Number(x.quantity||0)*Number(x.unit_price||0)),0);
   const {error:poUpdateError}=await supabaseClient.from("purchase_orders").update({subtotal,grand_total:subtotal}).eq("purchase_order_id",item.purchase_order_id);
   if(poUpdateError)throw poUpdateError;

   const {error:poStatusError}=await supabaseClient.rpc("amanah_refresh_purchase_order_status",{p_purchase_order_id:item.purchase_order_id});
   if(poStatusError)throw poStatusError;
   const requestItem=state.requestItems.find(ri=>ri.purchase_request_item_id===item.purchase_request_item_id);
   const request=state.requests.find(pr=>pr.purchase_request_id===requestItem?.purchase_request_id);
   if(request){
     const {error:requestStatusError}=await supabaseClient.rpc("amanah_refresh_purchase_request_status",{p_purchase_request_id:request.purchase_request_id});
     if(requestStatusError)throw requestStatusError;
   }

   closeSupplyModal();

   // Fresh read after the write, then redraw the open PO details.
   await Promise.all([loadRequests(),loadOrders()]);
   const freshItem=state.orderItems.find(x=>x.purchase_order_item_id===item.purchase_order_item_id);
   if(freshItem && freshItem.supply_status!==status){
     // Last-resort authoritative refresh of this single row.
     const {data:authoritativeItem,error:authoritativeError}=await supabaseClient
       .from("purchase_order_items")
       .select("*")
       .eq("purchase_order_item_id",item.purchase_order_item_id)
       .single();
     if(!authoritativeError && authoritativeItem){
       const idx=state.orderItems.findIndex(x=>x.purchase_order_item_id===item.purchase_order_item_id);
       if(idx>=0)state.orderItems[idx]=authoritativeItem;
     }
   }

   renderAll();
   await openPODetails(item.purchase_order_id);
   msg(received>0 ? "Supply and receiving details updated successfully." : "Material supply status updated successfully.","ok");
 }catch(error){
   console.error(error);
   showSupplyValidation(error.message||"Unable to save material supply status.");
 }finally{
   btn.disabled=false;
   btn.textContent="SAVE SUPPLY STATUS";
 }
}

async function sourceAlternativeSupplier(){
 const item=state.orderItems.find(x=>x.purchase_order_item_id===state.supplyItemId);
 if(!item)return;
 const order=state.orders.find(x=>x.purchase_order_id===item.purchase_order_id);
 if(!order)return;
 const remaining=sourceRemainingQuantity(item.purchase_request_item_id);
 if(remaining<=0)return showSupplyValidation("There is no remaining quantity that needs an alternative supplier.");

 const availableSuppliers=state.suppliers.filter(s=>s.supplier_id!==order.supplier_id);
 if(!availableSuppliers.length)return showSupplyValidation("No alternative active supplier is registered. Add another supplier in Master Data first.");

 const req=state.requests.find(x=>x.purchase_request_id===order.purchase_request_id)||{
   purchase_request_id:order.purchase_request_id,
   request_no:order.purchase_request_no,
   project_id:order.project_id,
   project_name:order.project_name,
   project_location:order.project_location,
   requester_employee_id:order.requester_employee_id,
   requester_name:order.requester_name,
   needed_by_date:order.expected_delivery_date
 };
 state.poDraftRequest={r:req,items:[{
   purchase_request_item_id:item.purchase_request_item_id,
   material_name:item.material_name,
   specifications:item.specifications||"",
   quantity:remaining,
   unit:item.unit||"",
   unit_price:""
 }]};
 state.editingOrderId=null;
 state.alternativeSourceItemId=item.purchase_request_item_id;
 state.alternativeSourceSupplierId=order.supplier_id;

 closeSupplyModal();
 document.getElementById("poModalTitle").textContent="SOURCE ALTERNATIVE SUPPLIER";
 document.getElementById("poFromRequest").textContent=(order.po_no||"PURCHASE ORDER")+" • "+(req.request_no||"PURCHASE REQUEST")+" • Remaining "+remaining+" "+(item.unit||"");
 refreshPoSupplierOptions(order.supplier_id);
 document.getElementById("poSupplier").value="";
 document.getElementById("poSupplierContact").value="";
 document.getElementById("poSupplierAddress").value="";
 document.getElementById("poDate").value=today();
 document.getElementById("poDelivery").value=req.needed_by_date && req.needed_by_date>=today()?req.needed_by_date:today();
 document.getElementById("poPaymentTerms").value="";
 document.getElementById("poDeliveryTerms").value="Delivered to project site";
 document.getElementById("poRemarks").value="Alternative supplier for unavailable material from "+(order.supplier_name||"original supplier")+".";

 renderPoItems();
 document.getElementById("poModal").style.display="flex";
}

function closePoModal(){document.getElementById("poModal").style.display="none";state.poDraftRequest=null;state.editingOrderId=null;document.getElementById("poModalTitle").textContent="CREATE PURCHASE ORDER";}
async function savePurchaseOrder(){
 const d=state.poDraftRequest;
 if(!d)return;
 if(!state.access.canManage)return msg("Only the Purchasing Officer / Procurement role can create or edit Purchase Orders.","err");
 clearPOValidation();

 const editing=!!state.editingOrderId;
 const supplierId=document.getElementById("poSupplier").value,supplier=state.suppliers.find(s=>s.supplier_id===supplierId),contact=document.getElementById("poSupplierContact").value.trim(),address=document.getElementById("poSupplierAddress").value.trim(),poDate=document.getElementById("poDate").value,delivery=document.getElementById("poDelivery").value,payment=document.getElementById("poPaymentTerms").value.trim(),deliveryTerms=document.getElementById("poDeliveryTerms").value.trim(),remarks=document.getElementById("poRemarks").value.trim();
 if(!supplierId||!supplier){
   showPOValidation("SUPPLIER IS REQUIRED — please select a registered supplier before saving the Purchase Order.");
   document.getElementById("poSupplier")?.focus();
   return;
 }
 if(!poDate){
   showPOValidation("PO date is required.");
   document.getElementById("poDate")?.focus();
   return;
 }
 if(delivery&&delivery<poDate){
   showPOValidation("Expected delivery cannot be earlier than the PO date.");
   document.getElementById("poDelivery")?.focus();
   return;
 }
 for(const it of d.items){
   if(!it.material_name.trim())return msg("Every PO line needs a material name.","err");
   if(!(Number(it.quantity)>0))return msg("Every PO line needs a quantity greater than zero.","err");
   if(it.unit_price!=="" && it.unit_price!==null && it.unit_price!==undefined && Number(it.unit_price)<0) return msg("Unit price cannot be negative.","err");
 }
 const total=d.items.reduce((n,x)=>n+(x.unit_price===""||x.unit_price===null||x.unit_price===undefined ? 0 : Number(x.quantity||0)*Number(x.unit_price||0)),0);
 const btn=document.getElementById("savePo");btn.disabled=true;btn.textContent=editing?"SAVING CHANGES...":"SAVING...";
 try{
  let poId=state.editingOrderId,poNo="";
  const payload={project_id:d.r.project_id,project_name:d.r.project_name,project_location:d.r.project_location||null,requester_employee_id:d.r.requester_employee_id||null,requester_name:d.r.requester_name||null,supplier_id:supplierId,supplier_name:supplier.supplier_name,supplier_contact:contact||null,supplier_address:address||null,po_date:poDate,expected_delivery_date:delivery||null,subtotal:total,tax_amount:0,other_charges:0,grand_total:total,payment_terms:payment||null,delivery_terms:deliveryTerms||null,remarks:remarks||null};
  if(editing){const {error}=await supabaseClient.from("purchase_orders").update(payload).eq("purchase_order_id",poId);if(error)throw error;const {error:delErr}=await supabaseClient.from("purchase_order_items").delete().eq("purchase_order_id",poId);if(delErr)throw delErr;}
  else{payload.purchase_request_id=d.r.purchase_request_id;payload.purchase_request_no=d.r.request_no;payload.status="DRAFT";const {data,error}=await supabaseClient.from("purchase_orders").insert(payload).select("purchase_order_id,po_no").single();if(error)throw error;poId=data.purchase_order_id;poNo=data.po_no;}
  const items=d.items.map((it,i)=>({
    purchase_order_id:poId,
    line_no:i+1,
    purchase_request_item_id:it.purchase_request_item_id||null,
    material_name:it.material_name.trim(),
    specifications:it.specifications?.trim()||null,
    quantity:Number(it.quantity),
    unit:it.unit.trim(),
    unit_price:(it.unit_price===""||it.unit_price===null||it.unit_price===undefined)?null:Number(it.unit_price),
    supply_status:"PENDING SUPPLIER CONFIRMATION",
    confirmed_quantity:0,
    received_quantity:0,
    substitute_status:"NONE"
  }));
  const {error:ierr}=await supabaseClient.from("purchase_order_items").insert(items);if(ierr)throw ierr;
  const {error:poStatusError}=await supabaseClient.rpc("amanah_refresh_purchase_order_status",{p_purchase_order_id:poId});
  if(poStatusError)throw poStatusError;

  const {error:requestStatusError}=await supabaseClient.rpc("amanah_refresh_purchase_request_status",{p_purchase_request_id:d.r.purchase_request_id});
  if(requestStatusError)throw requestStatusError;
  const existing=state.orders.find(x=>x.purchase_order_id===poId);const savedNo=editing?(existing?.po_no||"Purchase Order"):poNo;
  closePoModal();msg(savedNo+" "+(editing?"updated successfully.":"created successfully."));await Promise.all([loadRequests(),loadOrders()]);renderAll();if(!editing)switchTab("orders");
 }catch(err){console.error(err);msg((editing?"Could not update purchase order: ":"Could not create purchase order: ")+err.message,"err");}
 finally{btn.disabled=false;btn.textContent="SAVE PURCHASE ORDER";}
}
async function openPODetails(id){
 const o=state.orders.find(x=>x.purchase_order_id===id);if(!o)return;
 const items=state.orderItems.filter(i=>i.purchase_order_id===id);
 state.activeOrderId=id;state.activeRequestId=null;
 const title=document.getElementById("detailTitle");
 title.dataset.type="PO";
 title.textContent="PURCHASE ORDER DETAILS";

 const itemsHtml=items.map(i=>{
   const remaining=Math.max(Number(i.quantity||0)-Number(i.confirmed_quantity||0),0);
   return '<tr>'+
     '<td><strong>'+esc(i.material_name)+'</strong></td>'+
     '<td>'+esc(i.specifications||"—")+'</td>'+
     '<td>'+esc(i.quantity)+'</td>'+
     '<td>'+esc(i.unit)+'</td>'+
     '<td>'+supplyBadge(i.supply_status)+'</td>'+
     '<td>'+esc(i.confirmed_quantity??0)+'</td>'+
     '<td>'+esc(i.received_quantity??0)+'</td>'+
     '<td>'+esc(remaining)+'</td>'+
     '<td>'+esc(i.received_date?fmtDate(i.received_date):"—")+'</td>'+
     '<td>'+esc(i.delivery_reference||"—")+'</td>'+
     '<td>'+money(i.unit_price)+'</td>'+
     '<td>'+money(i.line_total)+'</td>'+
     '<td><button type="button" class="mini blue" data-supply-item="'+esc(i.purchase_order_item_id)+'">MANAGE SUPPLY</button></td>'+
   '</tr>';
 }).join("");

 const supplyRows=items.length?itemsHtml:'<tr><td colspan="11" class="empty">No order items found.</td></tr>';

 document.getElementById("detailBody").innerHTML=
   '<div class="detail-grid">'+
     '<div class="detail-card"><label>PO No.</label><strong>'+esc(o.po_no)+'</strong></div>'+
     '<div class="detail-card"><label>Status</label><strong>'+statusBadge(o.status)+'</strong></div>'+
     '<div class="detail-card"><label>Purchase Request</label><div>'+esc(o.purchase_request_no||"—")+'</div></div>'+
     '<div class="detail-card"><label>Project</label><div>'+esc(o.project_name)+'<br><small>'+esc(o.project_location||"")+'</small></div></div>'+
     '<div class="detail-card"><label>Requester</label><div>'+esc(o.requester_name||"—")+'</div></div>'+
     '<div class="detail-card"><label>Supplier</label><div>'+esc(o.supplier_name)+'<br><small>'+esc(o.supplier_contact||"")+(o.supplier_id?" • Registered Supplier":"")+'</small></div></div>'+
     '<div class="detail-card"><label>PO Date</label><div>'+esc(fmtDate(o.po_date))+'</div></div>'+
     '<div class="detail-card"><label>Expected Delivery</label><div>'+esc(fmtDate(o.expected_delivery_date))+'</div></div>'+
     '<div class="detail-card full"><label>Payment / Delivery Terms</label><div>'+esc(o.payment_terms||"—")+' • '+esc(o.delivery_terms||"—")+'</div></div>'+
     '<div class="detail-card full"><label>Remarks</label><div>'+esc(o.remarks||"—")+'</div></div>'+
   '</div>'+
   '<div class="section-label">MATERIAL SUPPLY TRACKING</div>'+
   '<div class="table-wrap"><table class="table"><thead><tr><th>Material</th><th>Specifications</th><th>Ordered</th><th>Unit</th><th>Supply Status</th><th>Confirmed</th><th>Received</th><th>Remaining</th><th>Received Date</th><th>Delivery Ref.</th><th>Unit Price</th><th>Total</th><th>Action</th></tr></thead><tbody>'+supplyRows+'</tbody></table></div>'+
   '<div class="total-box"><span>PO TOTAL</span><strong>'+money(o.grand_total)+'</strong></div>';

 document.querySelectorAll("[data-supply-item]").forEach(b=>b.addEventListener("click",()=>openSupplyModal(b.dataset.supplyItem)));

 const editBtn=document.getElementById("detailEditButton");
 editBtn.style.display=["RECEIVED","CLOSED","CANCELLED"].includes(o.status)?"none":"inline-block";
 editBtn.textContent="EDIT PURCHASE ORDER";
 document.getElementById("detailPrintButton").style.display="inline-block";
 document.getElementById("detailPrintButton").textContent="PRINT / SAVE PDF";
 document.getElementById("detailPrimaryAction").style.display="none";
 document.getElementById("detailModal").style.display="flex";
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
