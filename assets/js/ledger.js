// Ledger — KPIs, outstanding by student, mark paid, add lesson, log-week-from-schedule.
(function () {
  var userId = null, nameById = {}, contactById = {}, recipientById = {}, students = [], slots = [], profile = null, outGroups = {}, monthById = {}, editLessonId = null, allLessons = [], period = null;
  var $ = function (id) { return document.getElementById(id); };

  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function pad(n){return (n<10?"0":"")+n;}
  function iso(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
  function todayISO(){return iso(new Date());}
  function hm(t){return t?t.slice(0,5):"";}
  function prettyDate(s){if(!s)return"";var p=s.split("-");var mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];return (+p[2])+" "+mo[(+p[1])-1];}
  function monthOccurrences(weekday){var now=new Date(),y=now.getFullYear(),m=now.getMonth(),c=0,d=new Date(y,m,1);while(d.getMonth()===m){if(((d.getDay()+6)%7)===weekday)c++;d.setDate(d.getDate()+1);}return c;}
  function monthRange(){var now=new Date(),y=now.getFullYear(),m=now.getMonth();return{first:y+"-"+pad(m+1)+"-01",last:y+"-"+pad(m+1)+"-"+pad(new Date(y,m+1,0).getDate()),label:now.toLocaleString("en-SG",{month:"long"})};}
  function mondayOf(date){var d=new Date(date);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d;}
  function setGenLabel(){
    var mon=mondayOf(new Date()),sun=new Date(mon);sun.setDate(mon.getDate()+6);
    var mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var range=mon.getMonth()===sun.getMonth()
      ? mon.getDate()+"–"+sun.getDate()+" "+mo[sun.getMonth()]
      : mon.getDate()+" "+mo[mon.getMonth()]+" – "+sun.getDate()+" "+mo[sun.getMonth()];
    var b=$("gen-btn");if(b)b.textContent="Log this week ("+range+")";
    var mb=$("gen-month-btn");if(mb)mb.textContent="Log this month ("+mo[new Date().getMonth()]+")";
  }

  // ---------- rendering ----------
  function renderOutstanding(unpaid){
    var groups={};unpaid.forEach(function(l){(groups[l.student_id]=groups[l.student_id]||[]).push(l);});
    outGroups=groups;
    var ids=Object.keys(groups).sort(function(a,b){
      var sa=groups[a].reduce(function(t,l){return t+Number(l.amount);},0);
      var sb=groups[b].reduce(function(t,l){return t+Number(l.amount);},0);return sb-sa;});
    if(!ids.length){$("outstanding").innerHTML='<div class="card empty"><h3>All settled 🎉</h3><p>No unpaid lessons right now.</p></div>';$("out-hint").textContent="";return;}
    $("out-hint").textContent=ids.length+(ids.length===1?" student owing":" students owing");
    $("outstanding").innerHTML=ids.map(function(id){
      var rows=groups[id].sort(function(a,b){return a.lesson_date.localeCompare(b.lesson_date);});
      var sum=rows.reduce(function(t,l){return t+Number(l.amount);},0);
      var lessonIds=rows.map(function(l){return l.id;});
      var inner=rows.map(function(l){return '<div class="lrow"><span class="lwhen">'+prettyDate(l.lesson_date)+"</span><span>"+(l.subject?esc(l.subject):'<span class="muted">lesson</span>')+'</span><span class="lamt">'+TL.sgd(l.amount)+'</span><button class="mark lite" data-pay="'+l.id+'">Mark paid</button></div>';}).join("");
      return '<div class="card group"><div class="group-head"><span class="gname">'+esc(nameById[id]||"—")+'</span><span class="right"><span class="gsum">'+TL.sgd(sum)+'</span><button class="mark lite" data-remind="'+id+'">Remind</button><button class="mark lite" data-inv="'+id+'">Invoice</button><button class="mark" data-payall="'+lessonIds.join(",")+'">Mark all paid</button></span></div>'+inner+'</div>';
    }).join("");
    $("outstanding").querySelectorAll("[data-pay]").forEach(function(b){b.addEventListener("click",function(){markPaid([b.dataset.pay]);});});
    $("outstanding").querySelectorAll("[data-payall]").forEach(function(b){b.addEventListener("click",function(){if(confirm("Mark all these lessons as paid?"))markPaid(b.dataset.payall.split(","));});});
    $("outstanding").querySelectorAll("[data-inv]").forEach(function(b){b.addEventListener("click",function(){openInvoice(b.dataset.inv);});});
    $("outstanding").querySelectorAll("[data-remind]").forEach(function(b){b.addEventListener("click",function(){remind(b.dataset.remind);});});
  }

  function waNumber(raw){
    var d=String(raw||"").replace(/\D/g,"");
    if(!d)return "";
    d=d.replace(/^0+/,"");
    if(d.length===8)return "65"+d;   // Singapore local mobile/landline
    return d;                         // assume it already carries a country code
  }
  var DEFAULT_REMINDER="Hi {name}! Friendly reminder from {business}: you have an outstanding balance of {amount} for {count} tuition lesson(s). PayNow to {paynow}. Thank you!";
  var DEFAULT_INVOICE="Hi {name}! Here's your invoice {invoice} from {business} — total {amount}. PayNow to {paynow}. Thank you!";
  function fillTemplate(tpl,vars){return String(tpl).replace(/\{(\w+)\}/g,function(_,k){return vars[k]!=null?String(vars[k]):"";});}

  function remind(id){
    var num=waNumber(contactById[id]);
    if(!num){alert("No contact number saved for "+(nameById[id]||"this student")+".\n\nAdd one on the Students page (Edit → Contact), then try again.");return;}
    var rows=outGroups[id]||[];
    if(!rows.length)return;
    var sum=rows.reduce(function(t,l){return t+Number(l.amount);},0);
    var vars={name:recipientById[id]||nameById[id]||"",student:nameById[id]||"",business:(profile&&profile.business_name)||"T-Leng Tuition",
      amount:TL.sgd(sum),count:rows.length,invoice:"",paynow:(profile&&profile.paynow_id)||""};
    var tpl=(profile&&profile.reminder_message)||DEFAULT_REMINDER;
    window.open("https://wa.me/"+num+"?text="+encodeURIComponent(fillTemplate(tpl,vars)),"_blank");
  }
  function periodLabel(){return period.mode==="all"?"All time":new Date(period.y,period.m,1).toLocaleString("en-SG",{month:"long",year:"numeric"});}
  function renderRecords(){
    if(!period)period={mode:"month",y:new Date().getFullYear(),m:new Date().getMonth()};
    $("period-label").textContent=periodLabel();
    $("all-time").classList.toggle("on",period.mode==="all");
    var rows=allLessons.filter(function(l){
      if(period.mode==="all")return true;
      return l.lesson_date.slice(0,7)===period.y+"-"+pad(period.m+1);
    });
    var table=$("month-table"),empty=$("month-empty"),body=$("month-body");
    monthById={};rows.forEach(function(l){monthById[l.id]=l;});
    if(!rows.length){
      table.style.display="none";empty.style.display="block";
      empty.innerHTML="<h3>No lessons in "+periodLabel()+"</h3>";
      $("month-hint").textContent="";return;
    }
    empty.style.display="none";table.style.display="table";
    rows.sort(function(a,b){return b.lesson_date.localeCompare(a.lesson_date);});
    $("month-hint").textContent=rows.length+" lessons";
    body.innerHTML=rows.map(function(l){
      var badge=l.status==="cancelled"?'<span class="kind-tag">cancelled</span>':(l.status==="scheduled"?'<span class="kind-tag">scheduled</span>':(l.paid?'<span class="badge paid">Paid</span>':'<span class="badge owed">Unpaid</span>'));
      var cancelBtn=l.status==="cancelled"
        ? '<button class="tact" data-restore="'+l.id+'">Restore</button>'
        : '<button class="tact warn" data-cancel="'+l.id+'">Cancel</button>';
      return '<tr><td data-label="Date">'+prettyDate(l.lesson_date)+'</td><td class="name" data-label="Student">'+esc(nameById[l.student_id]||"—")+'</td><td data-label="Subject">'+(l.subject?esc(l.subject):'<span class="muted">—</span>')+'</td><td data-label="Amount">'+TL.sgd(l.amount)+'</td><td data-label="Status">'+badge+'</td>'+
        '<td class="acts"><button class="tact" data-edit="'+l.id+'">Postpone / edit</button>'+cancelBtn+'<button class="tact del" data-delete="'+l.id+'">Delete</button></td></tr>';
    }).join("");
    body.querySelectorAll("[data-edit]").forEach(function(b){b.addEventListener("click",function(){openAdd(true,monthById[b.dataset.edit]);});});
    body.querySelectorAll("[data-cancel]").forEach(function(b){b.addEventListener("click",function(){cancelLesson(b.dataset.cancel);});});
    body.querySelectorAll("[data-restore]").forEach(function(b){b.addEventListener("click",function(){restoreLesson(monthById[b.dataset.restore]);});});
    body.querySelectorAll("[data-delete]").forEach(function(b){b.addEventListener("click",function(){deleteLesson(b.dataset.delete);});});
  }
  function shiftMonth(d){period.mode="month";var dt=new Date(period.y,period.m+d,1);period.y=dt.getFullYear();period.m=dt.getMonth();renderRecords();}
  function toggleAll(){period.mode=period.mode==="all"?"month":"all";if(period.mode==="month"){period.y=new Date().getFullYear();period.m=new Date().getMonth();}renderRecords();}

  async function cancelLesson(id){
    if(!confirm("Mark this lesson as cancelled? It won't count toward income or pending."))return;
    var res=await window.sb.from("lessons").update({status:"cancelled",paid:false,paid_date:null}).eq("id",id);
    if(res.error){alert("Couldn't cancel: "+res.error.message);return;}
    load();
  }
  async function restoreLesson(l){
    var status=l.lesson_date>todayISO()?"scheduled":"done";
    var res=await window.sb.from("lessons").update({status:status}).eq("id",l.id);
    if(res.error){alert("Couldn't restore: "+res.error.message);return;}
    load();
  }
  async function deleteLesson(id){
    if(!confirm("Delete this lesson permanently? (Use Cancel instead if you just want to void it.)"))return;
    var res=await window.sb.from("lessons").delete().eq("id",id);
    if(res.error){alert("Couldn't delete: "+res.error.message);return;}
    load();
  }

  // ---------- actions ----------
  async function markPaid(ids){
    var res=await window.sb.from("lessons").update({paid:true,paid_date:todayISO()}).in("id",ids);
    if(res.error){alert("Couldn't update: "+res.error.message);return;}
    load();
  }

  function studentOptions(){
    var act=students.filter(function(s){return s.active!==false;});
    $("m-student").innerHTML=act.length?act.map(function(s){return '<option value="'+s.id+'">'+esc(s.name)+"</option>";}).join(""):'<option value="">— add a student first —</option>';
  }
  function recalcCost(){
    var r=parseFloat($("m-rate").value),s=$("m-start").value,e=$("m-end").value;
    $("m-cost").value=(r>=0&&s&&e&&e>s)?TL.sgd(TL.amount(r,s,e)):"";
  }
  function prefillFromSlot(){
    var sid=$("m-student").value;
    var slot=slots.find(function(x){return x.student_id===sid;});
    if(slot){
      if(!$("m-rate").value)$("m-rate").value=slot.rate;
      if(!$("m-start").value)$("m-start").value=hm(slot.start_time);
      if(!$("m-end").value)$("m-end").value=hm(slot.end_time);
      if(!$("m-subject").value&&slot.subject)$("m-subject").value=slot.subject;
      recalcCost();
    }
  }
  function openAdd(open, lesson){
    $("modal").classList.toggle("on",open);
    $("m-msg").textContent="";$("m-msg").className="msg";
    if(!open)return;
    if(lesson){
      editLessonId=lesson.id;
      $("m-title").textContent="Postpone / edit lesson";$("m-save").textContent="Save changes";
      $("m-student").value=lesson.student_id;
      $("m-date").value=lesson.lesson_date;
      $("m-subject").value=lesson.subject||"";
      $("m-start").value=hm(lesson.start_time);$("m-end").value=hm(lesson.end_time);
      $("m-rate").value=lesson.rate;$("m-paid").checked=!!lesson.paid;
      recalcCost();
    }else{
      editLessonId=null;
      $("m-title").textContent="Add lesson";$("m-save").textContent="Save lesson";
      $("m-date").value=todayISO();$("m-paid").checked=false;
      ["m-subject","m-start","m-end","m-rate","m-cost"].forEach(function(id){$(id).value="";});
      prefillFromSlot();
    }
  }
  async function saveLesson(){
    var msg=$("m-msg");
    var sid=$("m-student").value,date=$("m-date").value,start=$("m-start").value,end=$("m-end").value,rate=parseFloat($("m-rate").value);
    if(!sid){msg.textContent="Pick a student.";msg.className="msg err";return;}
    if(!date){msg.textContent="Pick a date.";msg.className="msg err";return;}
    if(!start||!end||end<=start){msg.textContent="Check the start/end times.";msg.className="msg err";return;}
    if(!(rate>=0)){msg.textContent="Enter a rate.";msg.className="msg err";return;}
    var paid=$("m-paid").checked;
    var fields={student_id:sid,lesson_date:date,start_time:start,end_time:end,
      subject:$("m-subject").value.trim()||null,rate:rate,amount:TL.amount(rate,start,end),
      status:date>todayISO()?"scheduled":"done",paid:paid,paid_date:paid?date:null};
    $("m-save").disabled=true;
    var res=editLessonId
      ? await window.sb.from("lessons").update(fields).eq("id",editLessonId)
      : await window.sb.from("lessons").insert(Object.assign({tutor_id:userId},fields));
    $("m-save").disabled=false;
    if(res.error){msg.textContent=res.error.message;msg.className="msg err";return;}
    openAdd(false);load();
  }
  async function generateMonth(){
    if(!slots.length){alert("No recurring slots to generate from. Add them on the Planner first.");return;}
    var now=new Date(),y=now.getFullYear(),m=now.getMonth();
    var last=new Date(y,m+1,0).getDate();
    var mStart=iso(new Date(y,m,1)),mEnd=iso(new Date(y,m,last));
    var mo=["January","February","March","April","May","June","July","August","September","October","November","December"][m];
    var ex=await window.sb.from("lessons").select("student_id,lesson_date,start_time").gte("lesson_date",mStart).lte("lesson_date",mEnd);
    var seen={};(ex.data||[]).forEach(function(l){seen[l.student_id+"|"+l.lesson_date+"|"+hm(l.start_time)]=1;});
    var rows=[];
    for(var day=1;day<=last;day++){
      var d=new Date(y,m,day),wd=(d.getDay()+6)%7,di=iso(d);
      slots.forEach(function(s){
        if(s.weekday!==wd)return;
        if(seen[s.student_id+"|"+di+"|"+hm(s.start_time)])return;
        rows.push({tutor_id:userId,student_id:s.student_id,slot_id:s.id,lesson_date:di,start_time:s.start_time,end_time:s.end_time,subject:s.subject,rate:s.rate,amount:TL.amount(s.rate,hm(s.start_time),hm(s.end_time)),status:di>todayISO()?"scheduled":"done",paid:false});
      });
    }
    if(!rows.length){alert(mo+" is already fully logged — nothing new to add.");return;}
    if(!confirm("Add "+rows.length+" lessons to fill every recurring slot across "+mo+"? Already-logged lessons are skipped."))return;
    var res=await window.sb.from("lessons").insert(rows);
    if(res.error){alert("Couldn't generate: "+res.error.message);return;}
    load();
  }
  async function generateWeek(){
    if(!slots.length){alert("No recurring slots to generate from. Add them on the Planner first.");return;}
    var mon=mondayOf(new Date());
    var weekStart=iso(mon),end=new Date(mon);end.setDate(mon.getDate()+6);var weekEnd=iso(end);
    var ex=await window.sb.from("lessons").select("student_id,lesson_date,start_time").gte("lesson_date",weekStart).lte("lesson_date",weekEnd);
    var seen={};(ex.data||[]).forEach(function(l){seen[l.student_id+"|"+l.lesson_date+"|"+hm(l.start_time)]=1;});
    var rows=[];
    slots.forEach(function(s){
      var d=new Date(mon);d.setDate(mon.getDate()+s.weekday);var di=iso(d);
      if(seen[s.student_id+"|"+di+"|"+hm(s.start_time)])return;
      rows.push({tutor_id:userId,student_id:s.student_id,slot_id:s.id,lesson_date:di,start_time:s.start_time,end_time:s.end_time,subject:s.subject,rate:s.rate,amount:TL.amount(s.rate,hm(s.start_time),hm(s.end_time)),status:di>todayISO()?"scheduled":"done",paid:false});
    });
    if(!rows.length){alert("This week is already logged — nothing new to add.");return;}
    if(!confirm("Add "+rows.length+" lessons for "+weekStart+" to "+weekEnd+"?"))return;
    var res=await window.sb.from("lessons").insert(rows);
    if(res.error){alert("Couldn't generate: "+res.error.message);return;}
    load();
  }

  // ---------- invoice ----------
  function invoiceHTML(d, qrUrl){
    var rows=d.lessons.map(function(l){
      return "<tr><td>"+prettyDate(l.lesson_date)+"</td><td>"+(l.subject?esc(l.subject):"Lesson")+
        '</td><td class="r">'+TL.sgd(l.amount)+"</td></tr>";
    }).join("");
    return '<div class="invoice">'+
      '<div class="inv-head"><div class="inv-biz">'+esc(d.biz)+'<small>Invoice</small></div>'+
        '<div class="inv-meta"><b>'+esc(d.invoiceNo)+'</b><br>'+d.dateStr+'</div></div>'+
      '<div class="inv-to"><span class="lbl">Bill to</span><br><b>'+esc(d.student)+'</b></div>'+
      '<table class="inv-table"><thead><tr><th>Date</th><th>Description</th><th class="r">Amount</th></tr></thead>'+
        '<tbody>'+rows+'</tbody></table>'+
      '<div class="inv-total"><span>Total due</span><span>'+TL.sgd(d.total)+'</span></div>'+
      '<div class="inv-pay"><img src="'+qrUrl+'" alt="PayNow QR">'+
        '<div><div class="pn-h"><span class="pn-dot"></span>PayNow</div>'+
        '<div class="pn-sub">Scan with any Singapore banking app to pay.<br>'+
        'Pays to <b>'+esc(d.payTo)+'</b><br>Ref: <b>'+esc(d.invoiceNo)+'</b></div></div></div>'+
      '</div>';
  }

  // Load the QR library on demand, trying two CDNs (resilient to a blocked/missing script tag)
  var qrLoading=null;
  function loadQR(){
    if(window.QRCode&&window.QRCode.toDataURL)return Promise.resolve();
    if(qrLoading)return qrLoading;
    var urls=["assets/js/qrlib.js",
              "https://cdn.jsdelivr.net/npm/qrcode@1.4.4/build/qrcode.min.js",
              "https://unpkg.com/qrcode@1.4.4/build/qrcode.min.js"];
    qrLoading=new Promise(function(resolve,reject){
      var i=0;
      (function next(){
        if(window.QRCode&&window.QRCode.toDataURL)return resolve();
        if(i>=urls.length)return reject(new Error("blocked"));
        var s=document.createElement("script");
        s.src=urls[i++];
        s.onload=function(){(window.QRCode&&window.QRCode.toDataURL)?resolve():next();};
        s.onerror=next;
        document.head.appendChild(s);
      })();
    });
    return qrLoading;
  }

  async function openInvoice(studentId){
    if(!profile){
      alert("Couldn't read your profile. Make sure you've run db/migration_paynow.sql in Supabase.");
      return;
    }
    if(!profile.paynow_id){
      if(confirm("No PayNow details saved yet. Open Settings to add them now?")) location.href="settings.html";
      return;
    }
    var lessons=(outGroups[studentId]||[]).slice().sort(function(a,b){return a.lesson_date.localeCompare(b.lesson_date);});
    if(!lessons.length)return;
    try{ await loadQR(); }
    catch(e){
      alert("The QR code library is being blocked (ad-blocker or network). Allow cdn.jsdelivr.net or unpkg.com, then try again.");
      return;
    }
    var total=Math.round(lessons.reduce(function(t,l){return t+Number(l.amount);},0)*100)/100;
    var student=nameById[studentId]||"Student";
    var now=new Date();
    window._invTitle="Invoice_"+(student.replace(/[^A-Za-z0-9]+/g,"")||"Student")+"_"+now.getFullYear()+"-"+pad(now.getMonth()+1)+"-"+pad(now.getDate());
    var slug=student.replace(/[^A-Za-z0-9]/g,"").slice(0,8).toUpperCase();
    var invoiceNo=(profile.invoice_prefix||"INV")+"-"+now.getFullYear()+pad(now.getMonth()+1)+pad(now.getDate())+"-"+slug;
    var payTo=PayNow.normalize(profile.paynow_type,profile.paynow_id);
    var data={biz:profile.business_name||"Tuition",invoiceNo:invoiceNo,
      dateStr:now.toLocaleDateString("en-SG",{day:"numeric",month:"short",year:"numeric"}),
      student:student,lessons:lessons,total:total,payTo:payTo};
    try{
      var payload=PayNow.build({type:profile.paynow_type,id:profile.paynow_id,amount:total,name:profile.business_name||"Tuition",reference:invoiceNo});
      window.QRCode.toDataURL(payload,{margin:1,width:300},function(err,url){
        if(err){alert("Couldn't generate QR: "+(err.message||err));return;}
        window._invHTML=invoiceHTML(data,url);
        window._invMeta={studentId:studentId,invoiceNo:invoiceNo,total:total,issuedDate:iso(now)};
        $("inv-body").innerHTML=window._invHTML;
        $("inv-save").textContent="Save to app";$("inv-save").disabled=false;
        $("inv-backdrop").classList.add("on");
      });
    }catch(e){ alert("Invoice error: "+(e.message||e)); }
  }

  async function saveInvoice(){
    if(!window._invHTML||!window._invMeta)return;
    var m=window._invMeta,b=$("inv-save");
    b.disabled=true;b.textContent="Saving…";
    var res=await window.sb.from("invoices").insert({
      tutor_id:userId,student_id:m.studentId,invoice_no:m.invoiceNo,
      issued_date:m.issuedDate,total:m.total,status:"issued",
      data:{html:window._invHTML,title:window._invTitle||("Invoice_"+m.invoiceNo)}
    });
    b.disabled=false;
    if(res.error){b.textContent="Save to app";alert("Couldn't save invoice: "+res.error.message);return;}
    b.textContent="Saved ✓";setTimeout(function(){b.textContent="Save to app";},1600);
  }

  // Lazily load html2canvas (self-hosted copy first, then CDNs) for rendering the invoice to an image.
  function loadH2C(){
    if(window.html2canvas)return Promise.resolve();
    var urls=["assets/js/html2canvas.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
      "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
      "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js"];
    return new Promise(function(resolve,reject){
      (function tryNext(i){
        if(i>=urls.length){reject(new Error("could not load the image library"));return;}
        var s=document.createElement("script");s.src=urls[i];
        s.onload=function(){window.html2canvas?resolve():tryNext(i+1);};
        s.onerror=function(){tryNext(i+1);};
        document.head.appendChild(s);
      })(0);
    });
  }
  function invoiceMsg(m){
    var vars={name:recipientById[m.studentId]||nameById[m.studentId]||"",student:nameById[m.studentId]||"",business:(profile&&profile.business_name)||"T-Leng Tuition",
      amount:TL.sgd(m.total),count:"",invoice:m.invoiceNo,paynow:(profile&&profile.paynow_id)||""};
    var tpl=(profile&&profile.invoice_message)||DEFAULT_INVOICE;
    return fillTemplate(tpl,vars);
  }
  async function shareInvoice(){
    if(!window._invHTML||!window._invMeta)return;
    var m=window._invMeta,b=$("inv-wa"),msg=invoiceMsg(m);
    b.disabled=true;b.textContent="Preparing…";
    try{
      await loadH2C();
      var node=$("inv-body").firstElementChild||$("inv-body");
      var canvas=await window.html2canvas(node,{backgroundColor:"#ffffff",scale:2,useCORS:true});
      canvas.toBlob(async function(blob){
        b.disabled=false;b.textContent="Send on WhatsApp";
        if(!blob){alert("Couldn't render the invoice image.");return;}
        var file=new File([blob],(window._invTitle||("Invoice_"+m.invoiceNo))+".png",{type:"image/png"});
        // Best path: native share sheet with the image attached (mobile)
        if(navigator.canShare&&navigator.canShare({files:[file]})){
          try{ await navigator.share({files:[file],text:msg}); return; }
          catch(e){ if(e&&e.name==="AbortError")return; /* otherwise fall through */ }
        }
        // Fallback (desktop / unsupported): download image, open WhatsApp with text to attach manually
        var url=URL.createObjectURL(blob),a=document.createElement("a");
        a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
        setTimeout(function(){URL.revokeObjectURL(url);},5000);
        var num=waNumber(contactById[m.studentId]);
        window.open("https://wa.me/"+num+"?text="+encodeURIComponent(msg),"_blank");
        alert("Your device can't attach files to WhatsApp automatically.\n\nThe invoice image was just downloaded — attach it in the WhatsApp chat that opened.");
      },"image/png");
    }catch(e){
      b.disabled=false;b.textContent="Send on WhatsApp";
      alert("Couldn't prepare the invoice image: "+(e.message||e)+"\n\nIf this keeps happening, the image library may be blocked — tell me and I'll set up a self-hosted copy.");
    }
  }

  function printInvoice(){
    if(!window._invHTML)return;
    var css=document.querySelector('link[rel="stylesheet"]').href;
    var w=window.open("","_blank","width=720,height=900");
    if(!w){alert("Allow pop-ups to print, or use your browser's print on this page.");return;}
    var title=esc(window._invTitle||"Invoice");
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+title+'</title>'+
      '<link rel="stylesheet" href="'+css+'"><style>body{background:#fff;padding:28px;max-width:640px;margin:auto}</style></head>'+
      '<body>'+window._invHTML+'</body></html>');
    w.document.close();
    w.onload=function(){ setTimeout(function(){ w.focus(); w.print(); }, 250); };
  }

  // ---------- load ----------
  async function load(){
    await TL.promotePastLessons();
    var pr=await window.sb.from("profiles").select("business_name,paynow_type,paynow_id,invoice_prefix,reminder_message,invoice_message").eq("id",userId).single();
    profile=pr.error?null:pr.data;

    var st=await window.sb.from("students").select("id,name,active,contact,recipient_name").order("name");
    students=st.data||[];nameById={};contactById={};recipientById={};students.forEach(function(s){nameById[s.id]=s.name;contactById[s.id]=s.contact;recipientById[s.id]=s.recipient_name;});
    studentOptions();

    var sl=await window.sb.from("recurring_slots").select("id,student_id,weekday,start_time,end_time,subject,rate").eq("active",true);
    slots=sl.data||[];

    var ls=await window.sb.from("lessons").select("id,student_id,lesson_date,start_time,end_time,subject,rate,amount,paid,status");
    if(ls.error){$("k-pending").textContent="—";$("out-hint").textContent="Couldn't load: "+ls.error.message;return;}
    var lessons=ls.data||[];

    var unpaid=lessons.filter(function(l){return l.status==="done"&&!l.paid;});
    var pending=unpaid.reduce(function(t,l){return t+Number(l.amount);},0);
    $("k-pending").textContent=TL.sgd(pending);
    $("k-pending-n").textContent=unpaid.length+" unpaid lessons";

    var mr=monthRange();
    var month=lessons.filter(function(l){return l.lesson_date>=mr.first&&l.lesson_date<=mr.last;});
    var collected=month.filter(function(l){return l.paid;}).reduce(function(t,l){return t+Number(l.amount);},0);
    $("k-collected").textContent=TL.sgd(collected);
    $("k-collected-n").textContent=mr.label;

    var projected=month.filter(function(l){return l.status!=="cancelled";}).reduce(function(t,l){return t+Number(l.amount);},0);
    $("k-projected").textContent=TL.sgd(projected);

    renderOutstanding(unpaid);
    allLessons=lessons;
    renderRecords();
  }

  function init(user){
    userId=user.id;
    var on=function(id,evt,fn){var el=$(id);if(el)el.addEventListener(evt,fn);};
    on("add-btn","click",function(){openAdd(true);});
    on("gen-btn","click",generateWeek);
    on("gen-month-btn","click",generateMonth);
    setGenLabel();
    on("m-cancel","click",function(){openAdd(false);});
    on("modal","click",function(e){if(e.target===$("modal"))openAdd(false);});
    on("m-save","click",saveLesson);
    on("m-student","change",prefillFromSlot);
    ["m-rate","m-start","m-end"].forEach(function(id){on(id,"input",recalcCost);});
    on("inv-close","click",function(){$("inv-backdrop").classList.remove("on");});
    on("inv-backdrop","click",function(e){if(e.target===$("inv-backdrop"))$("inv-backdrop").classList.remove("on");});
    on("inv-print","click",printInvoice);
    on("inv-wa","click",shareInvoice);
    on("inv-save","click",saveInvoice);
    on("prev-m","click",function(){shiftMonth(-1);});
    on("next-m","click",function(){shiftMonth(1);});
    on("all-time","click",toggleAll);
    load();
  }
  TL.requireAuth("ledger",init);
})();