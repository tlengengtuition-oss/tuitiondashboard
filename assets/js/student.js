// Per-student profile: header, totals, lesson history, slots, exams.
(function () {
  var userId=null, sid=null, student=null, lessons=[], exams=[], noteId=null, lessonId=null, examId=null;
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

    var sres=await window.sb.from("students").select("id,name,kind,level,contact,location,recipient_name,notes,active").eq("id",sid).single();
    if(sres.error||!sres.data){$("p-head").innerHTML='<div class="card"><p>Couldn\'t load this student. <a href="students.html">Back to students</a>.</p></div>';return;}
    student=sres.data;setTitle(student.name);

    var lres=await window.sb.from("lessons").select("id,lesson_date,start_time,end_time,subject,amount,paid,status,topics,homework,remarks").eq("student_id",sid);
    lessons=lres.data||[];
    var xres=await window.sb.from("exams").select("id,exam_date,assessment_type,subject,topics,remarks,score,max_score").eq("student_id",sid);
    exams=xres.data||[];
    var slres=await window.sb.from("recurring_slots").select("id,weekday,start_time,end_time,subject,rate").eq("student_id",sid);
    var slots=slres.data||[];

    renderHead();
    renderKpis(lessons);
    renderLessons(lessons);
    renderNotes(lessons);
    renderSlots(slots);
    renderExams(exams);
    renderProgress(exams);
  }

  function renderHead(){
    var items=[];
    if(!student.active)items.push({k:"Status",v:'<span class="kind-tag">discontinued</span>'});
    if(student.level)items.push({k:"Level",v:esc(student.level)});
    if(student.contact)items.push({k:"Contact",v:esc(student.contact)});
    if(student.location)items.push({k:"Location",v:esc(student.location)});
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
    $("e-name").value=student.name||"";
    $("e-level").value=student.level||"";$("e-contact").value=student.contact||"";
    $("e-location").value=student.location||"";
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
      name:name,
      level:$("e-level").value.trim()||null,contact:$("e-contact").value.trim()||null,
      location:$("e-location").value.trim()||null,
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
        '<td data-label="Status">'+badge+'</td>'+
        '<td class="acts"><button class="tact" data-led="'+l.id+'">Edit</button></td></tr>';
    }).join("");
    $("p-lbody").querySelectorAll("[data-led]").forEach(function(b){b.addEventListener("click",function(){openLesson(b.dataset.led);});});
  }

  // ---- lesson edit ----
  function openLesson(id){
    var l=lessons.filter(function(x){return x.id===id;})[0];if(!l)return;
    lessonId=id;
    $("l-title").textContent="Edit lesson · "+prettyDate(l.lesson_date);
    $("l-date").value=l.lesson_date||"";$("l-subject").value=l.subject||"";
    $("l-amount").value=(l.amount!=null?l.amount:"");$("l-paid").checked=!!l.paid;
    $("l-toggle").textContent=l.status==="cancelled"?"Restore lesson":"Cancel lesson";
    $("l-msg").textContent="";$("l-msg").className="msg";
    $("l-modal").classList.add("on");
  }
  function closeLesson(){$("l-modal").classList.remove("on");lessonId=null;}
  async function saveLesson(){
    var l=lessons.filter(function(x){return x.id===lessonId;})[0];if(!l)return;
    var date=$("l-date").value,paid=$("l-paid").checked,msg=$("l-msg");
    if(!date){msg.textContent="Set a date.";msg.className="msg err";return;}
    var fields={lesson_date:date,subject:$("l-subject").value.trim()||null,
      amount:Number($("l-amount").value)||0,paid:paid,paid_date:paid?date:null};
    var b=$("l-save");b.disabled=true;
    var res=await window.sb.from("lessons").update(fields).eq("id",lessonId);
    b.disabled=false;
    if(res.error){msg.textContent=res.error.message;msg.className="msg err";return;}
    closeLesson();load();
  }
  async function toggleLesson(){
    var l=lessons.filter(function(x){return x.id===lessonId;})[0];if(!l)return;
    var next;
    if(l.status==="cancelled"){next=(l.lesson_date>todayISO())?"scheduled":"done";}
    else{next="cancelled";}
    var res=await window.sb.from("lessons").update({status:next}).eq("id",lessonId);
    if(res.error){$("l-msg").textContent=res.error.message;$("l-msg").className="msg err";return;}
    closeLesson();load();
  }
  async function deleteLesson(){
    if(!confirm("Delete this lesson permanently?"))return;
    var res=await window.sb.from("lessons").delete().eq("id",lessonId);
    if(res.error){alert("Couldn't delete: "+res.error.message);return;}
    closeLesson();load();
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
    var link='<a class="slink plink" href="planner.html">Manage on planner ›</a>';
    if(!slots.length){$("p-slots").innerHTML='<div class="slotwrap"><p class="muted" style="font-size:13.5px;margin:0 0 12px">No recurring slots yet.</p>'+link+'</div>';return;}
    slots.sort(function(a,b){return a.weekday-b.weekday||(a.start_time||"").localeCompare(b.start_time||"");});
    var rows=slots.map(function(s){
      return '<div class="slotline">'+
        '<span class="slt">'+DOW[s.weekday]+" "+hhmm(s.start_time)+"–"+hhmm(s.end_time)+'</span>'+
        '<span class="slsub">'+(s.subject?esc(s.subject):"")+'</span>'+
        '<span class="slc">'+TL.sgd(TL.amount(s.rate,hhmm(s.start_time),hhmm(s.end_time)))+'</span></div>';
    }).join("");
    $("p-slots").innerHTML='<div class="slotwrap">'+rows+link+'</div>';
  }

  function renderProgress(rows){
    var pts=rows.filter(function(e){return e.score!=null&&e.max_score>0&&e.exam_date;})
      .map(function(e){return {t:new Date(e.exam_date+"T00:00:00").getTime(),date:e.exam_date,pct:Math.round(e.score/e.max_score*100),subject:(e.subject||"General")};})
      .sort(function(a,b){return a.t-b.t;});
    var card=$("p-progress-card");
    if(pts.length<2){ card.style.display="none"; return; }
    card.style.display="";
    var W=360,H=190,padL=32,padR=12,padT=12,padB=26;
    var x0=padL,x1=W-padR,y0=H-padB,y1=padT;
    var tmin=pts[0].t,tmax=pts[pts.length-1].t; if(tmax===tmin)tmax=tmin+1;
    function X(t){return x0+(t-tmin)/(tmax-tmin)*(x1-x0);}
    function Y(p){return y0-(p/100)*(y0-y1);}
    var colors=["#0E7C7B","#B5892B","#1A2A4F","#B3402F","#6C4F8C","#2E7D32"];
    // group by subject
    var bySub={},order=[];
    pts.forEach(function(p){ if(!bySub[p.subject]){bySub[p.subject]=[];order.push(p.subject);} bySub[p.subject].push(p); });
    var svg='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-width:520px;display:block">';
    // y gridlines 0/50/100
    [0,50,100].forEach(function(g){var y=Y(g);svg+='<line x1="'+x0+'" y1="'+y+'" x2="'+x1+'" y2="'+y+'" stroke="#e7ddc7"/>'+
      '<text x="'+(x0-6)+'" y="'+(y+3)+'" text-anchor="end" font-size="9" fill="#8a8577">'+g+'%</text>';});
    // x labels (first + last date)
    svg+='<text x="'+x0+'" y="'+(H-8)+'" font-size="9" fill="#8a8577">'+prettyDate(pts[0].date)+'</text>'+
         '<text x="'+x1+'" y="'+(H-8)+'" text-anchor="end" font-size="9" fill="#8a8577">'+prettyDate(pts[pts.length-1].date)+'</text>';
    order.forEach(function(sub,i){
      var col=colors[i%colors.length],ps=bySub[sub];
      if(ps.length>1){
        var d=ps.map(function(p,j){return (j?"L":"M")+X(p.t).toFixed(1)+" "+Y(p.pct).toFixed(1);}).join(" ");
        svg+='<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="2"/>';
      }
      ps.forEach(function(p){svg+='<circle cx="'+X(p.t).toFixed(1)+'" cy="'+Y(p.pct).toFixed(1)+'" r="3.2" fill="'+col+'"><title>'+esc(sub)+" · "+prettyDate(p.date)+" · "+p.pct+'%</title></circle>';});
    });
    svg+='</svg>';
    var legend='<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:12px">'+
      order.map(function(sub,i){return '<span style="display:inline-flex;align-items:center;gap:5px"><i style="width:10px;height:10px;border-radius:3px;background:'+colors[i%colors.length]+';display:inline-block"></i>'+esc(sub)+'</span>';}).join("")+'</div>';
    $("p-progress").innerHTML=svg+legend;
  }

  function renderExams(rows){
    if(!rows.length){$("p-exams").innerHTML='<p class="muted" style="font-size:13.5px">No exams yet.</p>';return;}
    var today=todayISO();
    rows.sort(function(a,b){return (a.exam_date||"").localeCompare(b.exam_date||"");});
    $("p-exams").innerHTML=rows.map(function(e){
      var past=e.exam_date&&e.exam_date<today;
      var typ=e.assessment_type?'<span class="kind-tag">'+esc(e.assessment_type)+'</span> ':"";
      var resu=(e.score!=null&&e.max_score)?'<b>'+esc(e.score+"/"+e.max_score)+'</b> <small class="muted">('+Math.round(e.score/e.max_score*100)+'%)</small>':(past?'<span class="muted">no result</span>':"");
      return '<div class="lrow"'+(past&&e.score==null?' style="opacity:.6"':"")+'><span class="lwhen">'+prettyDate(e.exam_date)+'</span>'+
        '<span>'+typ+(e.subject?esc(e.subject):"")+'</span>'+
        '<span class="right">'+(resu?resu+' ':"")+'<button class="tact" data-xed="'+e.id+'">Edit</button></span></div>';
    }).join("");
    $("p-exams").querySelectorAll("[data-xed]").forEach(function(b){b.addEventListener("click",function(){openExam(b.dataset.xed);});});
  }

  // ---- exam edit ----
  function openExam(id){
    var e=id?exams.filter(function(x){return x.id===id;})[0]:null;
    examId=e?e.id:null;
    $("x-title").textContent=e?"Edit exam":"Add exam";
    $("x-del").style.display=e?"":"none";
    $("x-date").value=e?(e.exam_date||""):"";
    $("x-type").value=e?(e.assessment_type||""):"";
    $("x-subject").value=e?(e.subject||""):"";
    $("x-topics").value=e?(e.topics||""):"";
    $("x-remarks").value=e?(e.remarks||""):"";
    $("x-score").value=e&&e.score!=null?e.score:"";
    $("x-maxscore").value=e&&e.max_score!=null?e.max_score:"";
    $("x-msg").textContent="";$("x-msg").className="msg";
    $("x-modal").classList.add("on");
  }
  function closeExam(){$("x-modal").classList.remove("on");examId=null;}
  async function saveExam(){
    var date=$("x-date").value,msg=$("x-msg");
    if(!date){msg.textContent="Set an exam date.";msg.className="msg err";return;}
    var fields={exam_date:date,assessment_type:$("x-type").value.trim()||null,
      subject:$("x-subject").value.trim()||null,topics:$("x-topics").value.trim()||null,
      remarks:$("x-remarks").value.trim()||null,
      score:$("x-score").value!==""?parseFloat($("x-score").value):null,
      max_score:$("x-maxscore").value!==""?parseFloat($("x-maxscore").value):null};
    var b=$("x-save");b.disabled=true;
    var res=examId
      ? await window.sb.from("exams").update(fields).eq("id",examId)
      : await window.sb.from("exams").insert(Object.assign({tutor_id:userId,student_id:sid},fields));
    b.disabled=false;
    if(res.error){msg.textContent=res.error.message;msg.className="msg err";return;}
    closeExam();load();
  }
  async function deleteExam(){
    if(!examId||!confirm("Delete this exam?"))return;
    var res=await window.sb.from("exams").delete().eq("id",examId);
    if(res.error){alert("Couldn't delete: "+res.error.message);return;}
    closeExam();load();
  }

  function init(user){
    userId=user.id;
    $("n-cancel").addEventListener("click",closeNotes);
    $("n-modal").addEventListener("click",function(e){if(e.target===$("n-modal"))closeNotes();});
    $("n-save").addEventListener("click",saveNotes);
    $("e-cancel").addEventListener("click",closeEdit);
    $("e-modal").addEventListener("click",function(e){if(e.target===$("e-modal"))closeEdit();});
    $("e-save").addEventListener("click",saveEdit);
    TL.wirePostal("e-postal-btn","e-location","e-postal-msg");
    $("l-save").addEventListener("click",saveLesson);
    $("l-toggle").addEventListener("click",toggleLesson);
    $("l-del").addEventListener("click",deleteLesson);
    $("l-modal").addEventListener("click",function(e){if(e.target===$("l-modal"))closeLesson();});
    $("p-addexam").addEventListener("click",function(){openExam(null);});
    $("x-save").addEventListener("click",saveExam);
    $("x-close").addEventListener("click",closeExam);
    $("x-del").addEventListener("click",deleteExam);
    $("x-modal").addEventListener("click",function(e){if(e.target===$("x-modal"))closeExam();});
    load();
  }
  TL.requireAuth("student",init);
})();