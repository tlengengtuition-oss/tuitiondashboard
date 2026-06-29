// Per-student profile: header, totals, lesson history, slots, exams.
(function () {
  var userId=null, sid=null, student=null;
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

    var lres=await window.sb.from("lessons").select("id,lesson_date,start_time,end_time,subject,amount,paid,status").eq("student_id",sid);
    var lessons=lres.data||[];
    var xres=await window.sb.from("exams").select("id,exam_date,assessment_type,subject,topics").eq("student_id",sid);
    var exams=xres.data||[];
    var slres=await window.sb.from("recurring_slots").select("id,weekday,start_time,end_time,subject,rate").eq("student_id",sid);
    var slots=slres.data||[];

    renderHead();
    renderKpis(lessons);
    renderLessons(lessons);
    renderSlots(slots);
    renderExams(exams);
  }

  function renderHead(){
    var tags='<span class="kind-tag">'+esc(student.kind)+"</span>";
    if(!student.active)tags+=' <span class="kind-tag">discontinued</span>';
    var bits=[];
    if(student.level)bits.push("Level: "+esc(student.level));
    if(student.contact)bits.push("Contact: "+esc(student.contact));
    if(student.recipient_name)bits.push("Messages to: "+esc(student.recipient_name));
    $("p-head").innerHTML='<div class="card"><div class="group-head" style="margin-bottom:'+(bits.length||student.notes?"10px":"0")+'">'+
      '<span class="gname" style="font-size:20px">'+esc(student.name)+'</span><span class="right">'+tags+'</span></div>'+
      (bits.length?'<div class="muted" style="font-size:13.5px">'+bits.join(" &nbsp;·&nbsp; ")+'</div>':"")+
      (student.notes?'<div style="margin-top:8px;font-size:13.5px">'+esc(student.notes)+'</div>':"")+'</div>';
    $("p-actions").innerHTML='<a class="btn btn-gold" href="ledger.html">Open ledger</a>';
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

  function init(user){ userId=user.id; load(); }
  TL.requireAuth("student",init);
})();