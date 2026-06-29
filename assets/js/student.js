// Per-student profile: header, totals, lesson history, slots, exams.
(function () {
  var userId=null, sid=null, student=null, lessons=[], noteId=null;
  var $=function(id){return document.getElementById(id);};
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function qid(){var m=location.search.match(/[?&]id=([^&]+)/);return m?decodeURIComponent(m[1]):null;}
  var DOW=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  var MO=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function prettyDate(s){if(!s)return"—";var p=s.split("-");return (+p[2])+" "+MO[(+p[1])-1]+" "+p[0];}
  function hhmm(t){return t?t.slice(0,5):"";}
  function todayISO(){var d=new Date();function p(n){return(n<10?"0":"")+n;}return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());}

  function setTitle(name){var h=document.querySelector(".topbar h1");if(h)h.textContent=name;}

  async function load(){
    sid=qid();
    if(!sid){$("p-head").innerHTML='<div class="card"><p>No student selected. <a href="students.html">Back to students</a>.</p></div>';return;}
    await TL.promotePastLessons();

    var sres=await window.sb.from("students").select("id,name,kind,level,contact,recipient_name,notes,active").eq("id",sid).single();
    if(sres.error||!sres.data){$("p-head").innerHTML='<div class="card"><p>Couldn\'t load this student. <a href="students.html">Back to students</a>.</p></div>';return;}
    student=sres.data;setTitle(student.name);

    var lres=await window.sb.from("lessons").select("id,lesson_date,start_time,end_time,subject,amount,paid,status,topics,homework,remarks").eq("student_id",sid);
    lessons=lres.data||[];
    var xres=await window.sb.from("exams").select("id,exam_date,assessment_type,subject,topics").eq("student_id",sid);
    var exams=xres.data||[];
    var slres=await window.sb.from("recurring_slots").select("id,weekday,start_time,end_time,subject,rate").eq("student_id",sid);
    var slots=slres.data||[];

    renderHead();
    renderKpis(lessons);
    renderLessons(lessons);
    renderNotes(lessons);
    renderSlots(slots);
    renderExams(exams);
  }

  function renderHead(){
    var items=[];
    items.push({k:"Type",v:'<span class="kind-tag">'+esc(student.kind)+'</span>'+(student.active?"":' <span class="kind-tag">discontinued</span>')});
    if(student.level)items.push({k:"Level",v:esc(student.level)});
    if(student.contact)items.push({k:"Contact",v:esc(student.contact)});
    if(student.recipient_name)items.push({k:"Messages to",v:esc(student.recipient_name)});
    if(student.notes)items.push({k:"Notes",v:esc(student.notes)});
    $("p-head").innerHTML='<div class="phead">'+items.map(function(i){
      return '<div class="pi"><span class="k">'+i.k+'</span><span class="v">'+i.v+'</span></div>';
    }).join("")+'</div>';
    $("p-actions").innerHTML='<button class="btn" id="p-edit">Edit details</button> <a class="btn btn-gold" href="ledger.html">Open ledger</a>';
    $("p-edit").addEventListener("click",openEdit);
  }
  function openEdit(){
    if(!student)return;
    $("e-name").value=student.name||"";$("e-kind").value=student.kind||"individual";
    $("e-level").value=student.level||"";$("e-contact").value=student.contact||"";
    $("e-recipient").value=student.recipient_name||"";$("e-notes").value=student.notes||"";
    $("e-msg").textContent="";$("e-msg").className="msg";
    $("e-modal").classList.add("on");
  }
  function closeEdit(){$("e-modal").classList.remove("on");}
  async function saveEdit(){
    var name=$("e-name").value.trim(),msg=$("e-msg");
    if(!name){msg.textContent="Give the student a name.";msg.className="msg err";return;}
    var b=$("e-save");b.disabled=true;
    var res=await window.sb.from("students").update({
      name:name,kind:$("e-kind").value,
      level:$("e-level").value.trim()||null,contact:$("e-contact").value.trim()||null,
      recipient_name:$("e-recipient").value.trim()||null,notes:$("e-notes").value.trim()||null
    }).eq("id",sid);
    b.disabled=false;
    if(res.error){msg.textContent=res.error.message;msg.className="msg err";return;}
    closeEdit();load();
  }

  function renderKpis(lessons){
    var live=lessons.filter(function(l){return l.status!=="cancelled";});
    var billed=live.reduce(function(t,l){return t+Number(l.amount);},0);
    var paid=live.filter(function(l){return l.paid;}).reduce(function(t,l){return t+Number(l.amount);},0);
    var outstanding=live.filter(function(l){return !l.paid&&l.status==="done";}).reduce(function(t,l){return t+Number(l.amount);},0);
    var done=live.filter(function(l){return l.status==="done";}).length;
    function kpi(label,val,cls){return '<div class="kpi"><div class="lbl">'+label+'</div><div class="val'+(cls?" "+cls:"")+'">'+val+'</div></div>';}
    $("p-kpis").innerHTML=
      kpi("Outstanding",TL.sgd(outstanding),outstanding>0?"owed":"")+
      kpi("Collected",TL.sgd(paid),"")+
      kpi("Total billed",TL.sgd(billed),"")+
      kpi("Lessons done",done,"");
  }

  function renderLessons(lessons){
    lessons.sort(function(a,b){return (b.lesson_date+ (b.start_time||"")).localeCompare(a.lesson_date+(a.start_time||""));});
    var table=$("p-ltable"),empty=$("p-lempty");
    if(!lessons.length){table.style.display="none";empty.style.display="block";$("p-lhint").textContent="";return;}
    empty.style.display="none";table.style.display="table";
    $("p-lhint").textContent=lessons.length+" total";
    $("p-lbody").innerHTML=lessons.map(function(l){
      var badge=l.status==="cancelled"?'<span class="kind-tag">cancelled</span>':(l.status==="scheduled"?'<span class="kind-tag">scheduled</span>':(l.paid?'<span class="badge paid">Paid</span>':'<span class="badge owed">Unpaid</span>'));
      return '<tr><td data-label="Date">'+prettyDate(l.lesson_date)+'</td>'+
        '<td data-label="Subject">'+(l.subject?esc(l.subject):'<span class="muted">—</span>')+'</td>'+
        '<td data-label="Amount">'+TL.sgd(l.amount)+'</td>'+
        '<td data-label="Status">'+badge+'</td></tr>';
    }).join("");
  }

  function renderNotes(rows){
    var live=rows.filter(function(l){return l.status!=="cancelled";});
    live.sort(function(a,b){return (b.lesson_date+(b.start_time||"")).localeCompare(a.lesson_date+(a.start_time||""));});
    if(!live.length){$("p-notes").innerHTML='<p class="muted" style="font-size:13.5px">No lessons to annotate yet.</p>';$("p-nhint").textContent="";return;}
    $("p-nhint").textContent=live.filter(function(l){return l.topics||l.homework||l.remarks;}).length+" of "+live.length;
    $("p-notes").innerHTML='<div class="nlist">'+live.map(function(l){
      var has=l.topics||l.homework||l.remarks,bits="";
      if(l.topics)bits+='<div class="nbits"><span class="nk">Topics</span>'+esc(l.topics)+'</div>';
      if(l.homework)bits+='<div class="nbits"><span class="nk">Homework</span>'+esc(l.homework)+'</div>';
      if(l.remarks)bits+='<div class="nbits"><span class="nk">Next</span>'+esc(l.remarks)+'</div>';
      if(!has)bits='<div class="nempty">No notes yet</div>';
      return '<div class="nrow"><div class="nhead"><span class="nd">'+prettyDate(l.lesson_date)+(l.subject?' · '+esc(l.subject):"")+'</span>'+
        '<button class="tact" data-note="'+l.id+'">'+(has?"Edit":"Add notes")+'</button></div>'+bits+'</div>';
    }).join("")+'</div>';
    $("p-notes").querySelectorAll("[data-note]").forEach(function(b){b.addEventListener("click",function(){openNotes(b.dataset.note);});});
  }
  function openNotes(id){
    var l=lessons.filter(function(x){return x.id===id;})[0];if(!l)return;
    noteId=id;
    $("n-title").textContent="Lesson notes · "+prettyDate(l.lesson_date);
    $("n-topics").value=l.topics||"";$("n-homework").value=l.homework||"";$("n-remarks").value=l.remarks||"";
    $("n-msg").textContent="";$("n-msg").className="msg";
    $("n-modal").classList.add("on");
  }
  function closeNotes(){$("n-modal").classList.remove("on");noteId=null;}
  async function saveNotes(){
    if(!noteId)return;
    var b=$("n-save");b.disabled=true;
    var res=await window.sb.from("lessons").update({
      topics:$("n-topics").value.trim()||null,
      homework:$("n-homework").value.trim()||null,
      remarks:$("n-remarks").value.trim()||null
    }).eq("id",noteId);
    b.disabled=false;
    if(res.error){$("n-msg").textContent=res.error.message;$("n-msg").className="msg err";return;}
    closeNotes();load();
  }

  function renderSlots(slots){
    if(!slots.length){$("p-slots").innerHTML='<p class="muted" style="font-size:13.5px">No recurring slots. Add them on the Planner.</p>';return;}
    slots.sort(function(a,b){return a.weekday-b.weekday||(a.start_time||"").localeCompare(b.start_time||"");});
    $("p-slots").innerHTML=slots.map(function(s){
      return '<div class="lrow"><span class="lwhen">'+DOW[s.weekday]+" "+hhmm(s.start_time)+"–"+hhmm(s.end_time)+'</span>'+
        '<span>'+(s.subject?esc(s.subject):"")+'</span>'+
        '<span class="right">'+TL.sgd(TL.amount(s.rate,hhmm(s.start_time),hhmm(s.end_time)))+'</span></div>';
    }).join("");
  }

  function renderExams(exams){
    if(!exams.length){$("p-exams").innerHTML='<p class="muted" style="font-size:13.5px">No exams. Add them on the Exams page.</p>';return;}
    var today=todayISO();
    exams.sort(function(a,b){return (a.exam_date||"").localeCompare(b.exam_date||"");});
    $("p-exams").innerHTML=exams.map(function(e){
      var past=e.exam_date&&e.exam_date<today;
      var typ=e.assessment_type?'<span class="kind-tag">'+esc(e.assessment_type)+'</span> ':"";
      return '<div class="lrow"'+(past?' style="opacity:.6"':"")+'><span class="lwhen">'+prettyDate(e.exam_date)+'</span>'+
        '<span>'+typ+(e.subject?esc(e.subject):"")+'</span></div>';
    }).join("");
  }

  function init(user){
    userId=user.id;
    $("n-cancel").addEventListener("click",closeNotes);
    $("n-modal").addEventListener("click",function(e){if(e.target===$("n-modal"))closeNotes();});
    $("n-save").addEventListener("click",saveNotes);
    $("e-cancel").addEventListener("click",closeEdit);
    $("e-modal").addEventListener("click",function(e){if(e.target===$("e-modal"))closeEdit();});
    $("e-save").addEventListener("click",saveEdit);
    load();
  }
  TL.requireAuth("student",init);
})();