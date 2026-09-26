const SPREADSHEET_ID = '1niD9R4QDFXxYc6BTbk_MMJGfmcIIsBd_w0x3C6Zwivc';

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('SWIFTSUPPLY_SHARED_SECRET');
    if (!expected || body.secret !== expected) return json_({ ok:false, error:'unauthorized' });
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    (body.events || []).forEach(ev => route_(ss, ev));
    SpreadsheetApp.flush();
    return json_({ ok:true, processed:(body.events||[]).length });
  } catch (err) {
    return json_({ ok:false, error:String(err) });
  } finally { lock.releaseLock(); }
}

function route_(ss, ev) {
  const t=ev.entity_table, d=ev.data||{}, r=ev.related||{};
  if(t==='ops_jobs' && d.business_unit==='SSPW') { upsertPressureWashing_(ss,d,r); upsertLead_(ss,d,r); }
  else if(t==='ops_subscriptions') upsertSubscription_(ss,d,r);
  else if(t==='ops_transactions') upsertMoney_(ss,d);
  else if(t==='ops_psss_sales') upsertPsssSale_(ss,d,r);
  else if(t==='ops_vending_locations') upsertLocation_(ss,d);
  else if(t==='ops_products') upsertProduct_(ss,d);
  else if(t==='ops_vending_visits') upsertVendingVisit_(ss,d,r);
  else if(t==='ops_vending_restock_items') upsertRestock_(ss,d,r);
  else if(t==='ops_maintenance') upsertMaintenance_(ss,d,r);
}

function sheet_(ss,name){const s=ss.getSheetByName(name);if(!s)throw new Error('Missing sheet: '+name);return s}
function rowForValue_(s,col,start,value){if(!value)return -1;const n=Math.max(s.getLastRow()-start+1,1),vals=s.getRange(start,col,n,1).getDisplayValues();for(let i=0;i<vals.length;i++)if(String(vals[i][0])===String(value))return start+i;return -1}
function rowForMarker_(s,col,start,marker){const n=Math.max(s.getLastRow()-start+1,1),vals=s.getRange(start,col,n,1).getDisplayValues();for(let i=0;i<vals.length;i++)if(String(vals[i][0]).indexOf(marker)>=0)return start+i;return -1}
function nextRow_(s,start){return Math.max(s.getLastRow()+1,start)}
function jsDate_(v){return v?new Date(v):''}
function yesno_(v){return v?'Yes':'No'}

function upsertPressureWashing_(ss,d,r){
  const s=sheet_(ss,'Pressure Washing'), row=rowForValue_(s,1,6,d.job_code)>0?rowForValue_(s,1,6,d.job_code):nextRow_(s,6), c=r.customer||{};
  const status={lead:'Quoted',quoted:'Quoted',scheduled:'Scheduled',in_progress:'Scheduled',completed:'Completed',cancelled:'Cancelled'}[d.status]||'Quoted';
  const revenue=d.status==='completed'?Number(d.actual_revenue||0):0;
  s.getRange(row,1,1,9).setValues([[d.job_code,jsDate_(d.scheduled_start||d.created_at),c.name||'',d.service||d.title||'',d.area||d.address||'',status,d.payment_method||'Other',revenue,Number(d.direct_cost||0)]]);
  s.getRange(row,10).setFormula(`=IF(A${row}="","",H${row}-I${row})`);
  s.getRange(row,11,1,2).setValues([[0,`${d.notes||''} [OPS:${d.job_code}]`]]);
}
function upsertLead_(ss,d,r){
  const s=sheet_(ss,'SSPW Leads'), row=rowForValue_(s,1,6,d.job_code)>0?rowForValue_(s,1,6,d.job_code):nextRow_(s,6), c=r.customer||{};
  const stage={lead:'Lead',quoted:'Quote Sent',scheduled:'Booked',in_progress:'Booked',completed:'Booked',cancelled:'Lost'}[d.status]||'Lead';
  s.getRange(row,1,1,9).setValues([[d.job_code,c.name||d.title||'',c.phone||c.email||'',d.area||d.address||'',d.service||d.title||'',stage,Number(d.estimated_value||0),jsDate_(d.scheduled_start),`${d.notes||''} [OPS:${d.job_code}]`]]);
}
function upsertSubscription_(ss,d,r){
  const s=sheet_(ss,'SSPW Subscribers'), id='SUB-'+String(d.id).slice(0,8), row=rowForValue_(s,1,6,id)>0?rowForValue_(s,1,6,id):nextRow_(s,6), c=r.customer||{};
  const status=d.status==='active'?'Active':d.status==='paused'?'Paused':'Cancelled';
  s.getRange(row,1,1,5).setValues([[id,c.name||'',c.phone||c.email||'',c.address||c.city||'',d.plan_name||'']]);
  // Column F is an array-formula price lookup in the workbook; preserve it.
  s.getRange(row,7,1,6).setValues([[status,jsDate_(d.start_date),jsDate_(d.last_service),jsDate_(d.next_service),'',`${d.notes||''} [OPS:${id}]`]]);
}
function upsertMoney_(ss,d){
  const s=sheet_(ss,'Money Tracker'), marker='[OPS:'+d.transaction_code+']', found=rowForMarker_(s,8,11,marker), row=found>0?found:nextRow_(s,11);
  s.getRange(row,1,1,8).setValues([[jsDate_(d.occurred_at),d.account,d.direction,d.status,Number(d.amount||0),d.source_category,d.business_area,`${d.notes||''} ${marker}`.trim()]]);
}
function upsertPsssSale_(ss,d,r){
  const s=sheet_(ss,'Personal Selling'), marker='[OPS:'+d.sale_code+']', found=rowForMarker_(s,8,9,marker), row=found>0?found:nextRow_(s,9), items=r.items||[];
  const itemText=items.map(i=>`${i.quantity} ${i.product?.name||'item'}`).join(' + '), qty=items.reduce((a,i)=>a+Number(i.quantity||0),0), owed=Math.max(Number(d.total_amount||0)-Number(d.collected_amount||0),0);
  s.getRange(row,1,1,8).setValues([[jsDate_(d.sold_at),itemText||'PSSS sale','Sale',qty,Number(d.collected_amount||0),owed>0&&Number(d.collected_amount||0)===0?'Pending':d.payment_method,d.buyer_place||'',`${d.notes||''}${owed>0?' • Owed '+owed.toFixed(2):''} ${marker}`.trim()]]);
  items.forEach(i=>{if(i.product)updatePsssInventory_(s,i.product.name,Number(i.product.current_stock||0))});
}
function updatePsssInventory_(s,name,stock){const vals=s.getRange(4,9,20,1).getDisplayValues();for(let i=0;i<vals.length;i++){if(String(vals[i][0]).toLowerCase()===String(name).toLowerCase()){s.getRange(4+i,10).setValue(stock);return}}}
function upsertLocation_(ss,d){
  const s=sheet_(ss,'Location Tracker'), row=rowForValue_(s,1,6,d.location_code)>0?rowForValue_(s,1,6,d.location_code):nextRow_(s,6);
  s.getRange(row,1,1,4).setValues([[d.location_code,d.name,d.business_name||'',d.address||d.city||'']]);
  s.getRange(row,19,1,3).setValues([[Number(d.commission_pct||0),Number(d.fixed_rent||0),Number(d.estimated_monthly_sales||0)]]);
  s.getRange(row,25).setValue(yesno_(d.agreement_signed)); s.getRange(row,28).setValue(`${d.notes||''} [OPS:${d.location_code}]`);
}
function upsertProduct_(ss,d){
  if(d.business_unit==='PSSS'){const s=sheet_(ss,'Personal Selling');updatePsssInventory_(s,d.name,Number(d.current_stock||0));return}
  if(d.business_unit!=='SS')return;
  const s=sheet_(ss,'Inventory'), pid=d.sku||('OPS-'+String(d.id).slice(0,8)), row=rowForValue_(s,1,6,pid)>0?rowForValue_(s,1,6,pid):nextRow_(s,6);
  s.getRange(row,1,1,10).setValues([[pid,d.name,d.brand||'',d.category||'',d.flavor||'',d.size||'','','',0,Number(d.unit_cost||0)*Number(d.current_stock||0)]]);
  s.getRange(row,11).setFormula(`=IFERROR(J${row}/I${row},0)`); s.getRange(row,12).setValue(Number(d.sell_price||0)); s.getRange(row,13).setFormula(`=IF(A${row}="","",L${row}-K${row})`); s.getRange(row,14).setFormula(`=IFERROR(M${row}/L${row},0)`);
  s.getRange(row,15,1,4).setValues([[Number(d.current_stock||0),0,Number(d.current_stock||0),Number(d.reorder_level||0)]]); s.getRange(row,19).setFormula(`=IF(A${row}="","",IF(O${row}<=R${row},"REORDER","OK"))`); s.getRange(row,26).setValue(`${d.notes||''} [OPS:${pid}]`);
}
function upsertVendingVisit_(ss,d,r){
  if(d.status!=='completed')return; const s=sheet_(ss,'SS Simple Tracker'), machine=r.machine||{}, location=r.location||{}, date=jsDate_(d.completed_at||d.created_at), area=machine.label||machine.machine_code||'Vending', base=d.visit_code;
  const entries=[]; const sales=Number(d.cash_collected||0)+Number(d.card_sales||0); if(sales>0)entries.push(['SALES','Revenue','Sales','Vending sales',sales,'Cash/Card']); if(Number(d.restock_cost||0)>0)entries.push(['RESTOCK','Expense','Restocking','Restock',Number(d.restock_cost),'Cash']); if(Number(d.location_fee||0)>0)entries.push(['LOCATION','Expense','Location Fee','Location commission/rent',Number(d.location_fee),'Other']); if(Number(d.card_fees||0)>0)entries.push(['CARD','Expense','Card Fees','Card processing',Number(d.card_fees),'Card']); if(Number(d.other_cost||0)>0)entries.push(['OTHER','Expense','Other','Other vending cost',Number(d.other_cost),'Other']);
  entries.forEach(x=>{const marker='[OPS:'+base+':'+x[0]+']',found=rowForMarker_(s,8,11,marker),row=found>0?found:nextRow_(s,11);s.getRange(row,1,1,8).setValues([[date,area,x[1],x[2],x[3],x[4],x[5],`${location.name||''} ${d.notes||''} ${marker}`.trim()]])});
  (r.restock_items||[]).forEach(item=>upsertRestock_(ss,item,{visit:d,product:(r.products||[]).find(p=>p.id===item.product_id),employee:r.employee,machine,location}));
}
function upsertRestock_(ss,d,r){
  const visit=r.visit||{},product=r.product||{},machine=r.machine||{},location=r.location||{}, s=sheet_(ss,'Restock Tracker'), marker='[OPS:RST:'+String(d.id).slice(0,8)+']',found=rowForMarker_(s,16,6,marker),row=found>0?found:nextRow_(s,6);
  s.getRange(row,1,1,10).setValues([[jsDate_(visit.completed_at||d.created_at),machine.machine_code||'',location.name||'',product.sku||product.name||'',Number(d.inventory_before||0),Number(d.quantity_added||0),Number(d.inventory_after||0),Number(d.estimated_units_sold||0),Number(d.revenue_generated||0),Number(d.restock_cost||0)]]); s.getRange(row,11).setFormula(`=I${row}-J${row}`); s.getRange(row,12,1,5).setValues([[Number(d.expired_removed||0),Number(d.damaged_removed||0),Number(visit.cash_collected||0),r.employee?.full_name||'',`${d.notes||''} ${marker}`.trim()]]);
}
function upsertMaintenance_(ss,d,r){
  const s=sheet_(ss,'Maintenance Log'), marker='[OPS:'+d.maintenance_code+']',found=rowForMarker_(s,18,6,marker),row=found>0?found:nextRow_(s,6),m=r.machine||{};
  s.getRange(row,1,1,12).setValues([[jsDate_(d.reported_at),m.label||'',m.machine_code||'',d.problem,d.problem_category||'Other',yesno_(d.machine_down),'SwiftSupply Ops',yesno_(d.repair_needed),d.technician||'',d.parts_needed||'',Number(d.parts_cost||0),Number(d.labor_cost||0)]]); s.getRange(row,13).setFormula(`=IF(A${row}="","",K${row}+L${row})`); s.getRange(row,14).setValue(jsDate_(d.fixed_at)); s.getRange(row,15).setFormula(`=IF(OR(A${row}="",N${row}=""),"",N${row}-A${row})`); s.getRange(row,16,1,3).setValues([[d.warranty_covered==null?'Unknown':yesno_(d.warranty_covered),d.status,`${d.notes||''} ${marker}`.trim()]]);
}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)}
