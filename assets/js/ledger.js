// Ledger — KPIs, outstanding by student, mark paid, add lesson, log-week-from-schedule.
(function () {
  var userId = null, nameById = {}, students = [], slots = [];
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

  // ---------- rendering ----------
  function renderOutstanding(unpaid){
    var groups={};unpaid.forEach(function(l){(groups[l.student_id]=groups[l.student_id]||[]).push(l);});
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
      return '<div class="card group"><div class="group-head"><span class="gname">'+esc(nameById[id]||"—")+'</span><span class="right"><span class="gsum">'+TL.sgd(sum)+'</span><button class="mark" data-payall="'+lessonIds.join(",")+'">Mark all paid</button></span></div>'+inner+'</div>';
    }).join("");
    $("outstanding").querySelectorAll("[data-pay]").forEach(function(b){b.addEventListener("click",function(){markPaid([b.dataset.pay]);});});
    $("outstanding").querySelectorAll("[data-payall]").forEach(function(b){b.addEventListener("click",function(){if(confirm("Mark all these lessons as paid?"))markPaid(b.dataset.payall.split(","));});});
  }
  function renderMonth(rows){
    var table=$("month-table"),empty=$("month-empty"),body=$("month-body");
    if(!rows.length){table.style.display="none";empty.style.display="block";$("month-hint").textContent="";return;}
    empty.style.display="none";table.style.display="table";
    rows.sort(function(a,b){return b.lesson_date.localeCompare(a.lesson_date);});
    $("month-hint").textContent=rows.length+" lessons";
    body.innerHTML=rows.map(function(l){
      var badge=l.status==="cancelled"?'<span class="kind-tag">cancelled</span>':(l.status==="scheduled"?'<span class="kind-tag">scheduled</span>':(l.paid?'<span class="badge paid">Paid</span>':'<span class="badge owed">Unpaid</span>'));
      return "<tr><td>"+prettyDate(l.lesson_date)+'</td><td class="name">'+esc(nameById[l.student_id]||"—")+"</td><td>"+(l.subject?esc(l.subject):'<span class="muted">—</span>')+"</td><td>"+TL.sgd(l.amount)+"</td><td>"+badge+"</td></tr>";
    }).join("");
  }

  // ---------- actions ----------
  async function markPaid(ids){
    var res=await window.sb.from("lessons").update({paid:true,paid_date:todayISO()}).in("id",ids);
    if(res.error){alert("Couldn't update: "+res.error.message);return;}
    load();
  }

  function studentOptions(){
    $("m-student").innerHTML=students.length?students.map(function(s){return '<option value="'+s.id+'">'+esc(s.name)+"</option>";}).join(""):'<option value="">— add a student first —</option>';
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
  function openAdd(open){
    $("modal").classList.toggle("on",open);
    $("m-msg").textContent="";$("m-msg").className="msg";
    if(open){$("m-date").value=todayISO();prefillFromSlot();}
  }
  async function saveLesson(){
    var msg=$("m-msg");
    var sid=$("m-student").value,date=$("m-date").value,start=$("m-start").value,end=$("m-end").value,rate=parseFloat($("m-rate").value);
    if(!sid){msg.textContent="Pick a student.";msg.className="msg err";return;}
    if(!date){msg.textContent="Pick a date.";msg.className="msg err";return;}
    if(!start||!end||end<=start){msg.textContent="Check the start/end times.";msg.className="msg err";return;}
    if(!(rate>=0)){msg.textContent="Enter a rate.";msg.className="msg err";return;}
    var paid=$("m-paid").checked;
    $("m-save").disabled=true;
    var res=await window.sb.from("lessons").insert({
      tutor_id:userId,student_id:sid,lesson_date:date,start_time:start,end_time:end,
      subject:$("m-subject").value.trim()||null,rate:rate,amount:TL.amount(rate,start,end),
      status:date>todayISO()?"scheduled":"done",paid:paid,paid_date:paid?date:null
    });
    $("m-save").disabled=false;
    if(res.error){msg.textContent=res.error.message;msg.className="msg err";return;}
    $("m-paid").checked=false;["m-subject","m-start","m-end","m-rate","m-cost"].forEach(function(id){$(id).value="";});
    openAdd(false);load();
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

  // ---------- load ----------
  async function load(){
    var st=await window.sb.from("students").select("id,name").order("name");
    students=st.data||[];nameById={};students.forEach(function(s){nameById[s.id]=s.name;});
    studentOptions();

    var sl=await window.sb.from("recurring_slots").select("id,student_id,weekday,start_time,end_time,subject,rate").eq("active",true);
    slots=sl.data||[];
    var projected=slots.reduce(function(t,s){return t+monthOccurrences(s.weekday)*TL.amount(s.rate,hm(s.start_time),hm(s.end_time));},0);
    $("k-projected").textContent=TL.sgd(projected);

    var ls=await window.sb.from("lessons").select("id,student_id,lesson_date,subject,amount,paid,status");
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

    renderOutstanding(unpaid);
    renderMonth(month);
  }

  function init(user){
    userId=user.id;
    $("add-btn").addEventListener("click",function(){openAdd(true);});
    $("gen-btn").addEventListener("click",generateWeek);
    $("m-cancel").addEventListener("click",function(){openAdd(false);});
    $("modal").addEventListener("click",function(e){if(e.target===$("modal"))openAdd(false);});
    $("m-save").addEventListener("click",saveLesson);
    $("m-student").addEventListener("change",prefillFromSlot);
    ["m-rate","m-start","m-end"].forEach(function(id){$(id).addEventListener("input",recalcCost);});
    load();
  }
  TL.requireAuth("ledger",init);
})();