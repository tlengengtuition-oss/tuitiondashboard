// Dashboard — live KPIs, income-by-month chart, upcoming exam countdown.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function pad(n){return (n<10?"0":"")+n;}
  function iso(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
  function todayISO(){return iso(new Date());}
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
  function hm(t){return t?t.slice(0,5):"";}
  function monthOccurrences(weekday){var now=new Date(),y=now.getFullYear(),m=now.getMonth(),c=0,d=new Date(y,m,1);while(d.getMonth()===m){if(((d.getDay()+6)%7)===weekday)c++;d.setDate(d.getDate()+1);}return c;}

  var chartObj=null, allLessons=[], selY=null, selM=null, dmWired=false;
  function renderMonthKpis(){
    var mFirst=selY+"-"+pad(selM+1)+"-01",mLast=selY+"-"+pad(selM+1)+"-"+pad(new Date(selY,selM+1,0).getDate());
    var month=allLessons.filter(function(l){return l.lesson_date>=mFirst&&l.lesson_date<=mLast;});
    var projected=month.filter(function(l){return l.status!=="cancelled";}).reduce(function(t,l){return t+Number(l.amount);},0);
    var collected=month.filter(function(l){return l.paid;}).reduce(function(t,l){return t+Number(l.amount);},0);
    $("k-projected").textContent=TL.sgd(projected);
    $("k-collected").textContent=TL.sgd(collected);
    var d1=new Date(selY,selM,1);
    $("k-collected-n").textContent=d1.toLocaleString("en-SG",{month:"long"});
    if($("dm-label"))$("dm-label").textContent=d1.toLocaleString("en-SG",{month:"long",year:"numeric"});
  }
  function stepDMonth(d){var dt=new Date(selY,selM+d,1);selY=dt.getFullYear();selM=dt.getMonth();renderMonthKpis();}

  function renderChart(collected, pending, upcoming, year){
    var labels=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var r2=function(v){return Math.round(v*100)/100;};
    var ctx=$("incomeChart").getContext("2d");
    if(chartObj)chartObj.destroy();
    chartObj=new Chart(ctx,{
      type:"bar",
      data:{labels:labels,datasets:[
        {label:"Collected",data:collected.map(r2),backgroundColor:"#0E7C7B",maxBarThickness:34,stack:"s",borderRadius:3},
        {label:"Pending payment",data:pending.map(r2),backgroundColor:"#B3402F",maxBarThickness:34,stack:"s",borderRadius:3},
        {label:"Projected (upcoming)",data:upcoming.map(r2),backgroundColor:"#BCB3A0",maxBarThickness:34,stack:"s",borderRadius:3}
      ]},
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{
          legend:{display:true,position:"bottom",labels:{boxWidth:12,boxHeight:12,font:{size:11},padding:14}},
          tooltip:{callbacks:{label:function(c){return c.dataset.label+": "+TL.sgd(c.parsed.y);}}}
        },
        scales:{
          x:{stacked:true,grid:{display:false}},
          y:{stacked:true,beginAtZero:true,ticks:{callback:function(v){return "$"+v;}},grid:{color:"#eee7d6"}}
        }
      }
    });
  }

  function renderExams(exams, nameById, listId, hintId){
    var today=todayISO();
    var up=exams.filter(function(e){return e.exam_date&&e.exam_date>=today;})
                .sort(function(a,b){return a.exam_date.localeCompare(b.exam_date);}).slice(0,7);
    if(hintId&&$(hintId))$(hintId).textContent=up.length?up.length+" ahead":"";
    if(!up.length){$(listId).innerHTML='<div class="muted" style="font-size:13.5px">No upcoming exams.</div>';return;}
    var now=new Date(); now.setHours(0,0,0,0);
    $(listId).innerHTML=up.map(function(e){
      var d=new Date(e.exam_date+"T00:00:00");
      var days=Math.round((d-now)/86400000);
      var soon=days<=14;
      var label=[e.assessment_type,e.subject].filter(Boolean).join(" · ")||"exam";
      return '<div class="exam-row"><div class="ex-main"><div class="ex-name">'+esc(nameById[e.student_id]||"—")+'</div><div class="ex-sub">'+esc(label)+(e.topics?" — "+esc(e.topics):"")+'</div></div>'+
        '<div class="days'+(soon?" soon":"")+'"><b>'+days+'</b><small>'+(days===1?"day":"days")+'</small></div></div>';
    }).join("");
  }

  function shortDate(d){return new Date(d+"T00:00:00").toLocaleDateString("en-SG",{day:"numeric",month:"short"});}
  function summarizeLast(l){
    if(!l) return '<div class="tr-empty">No previous lessons recorded.</div>';
    var when='<div class="tr-when">Last lesson · '+shortDate(l.lesson_date)+'</div>';
    var parts=[];
    if(l.topics)   parts.push('<div class="tr-note"><b>Topics:</b> '+esc(l.topics)+'</div>');
    if(l.homework) parts.push('<div class="tr-note"><b>Homework:</b> '+esc(l.homework)+'</div>');
    if(l.remarks)  parts.push('<div class="tr-note"><b>Remarks:</b> '+esc(l.remarks)+'</div>');
    return when+(parts.length?parts.join(""):'<div class="tr-empty">No notes recorded for that lesson.</div>');
  }
  function renderTeaching(slots, lessons, nameById){
    var doneByStu={};
    lessons.forEach(function(l){ if(l.status!=="done")return; (doneByStu[l.student_id]=doneByStu[l.student_id]||[]).push(l); });
    Object.keys(doneByStu).forEach(function(k){doneByStu[k].sort(function(a,b){return b.lesson_date.localeCompare(a.lesson_date);});});
    function lastBefore(stu, beforeISO){var a=doneByStu[stu]||[];for(var i=0;i<a.length;i++){if(a[i].lesson_date<beforeISO)return a[i];}return null;}
    var today=new Date(); today.setHours(0,0,0,0);
    var tmr=new Date(today); tmr.setDate(today.getDate()+1);
    function renderDay(listId, subId, headId, dateObj, label){
      var wday=(dateObj.getDay()+6)%7, dISO=iso(dateObj);
      var day=slots.filter(function(s){return s.weekday===wday;})
        .sort(function(a,b){return (a.start_time||"").localeCompare(b.start_time||"");});
      if($(headId))$(headId).textContent=label;
      if($(subId))$(subId).textContent=dateObj.toLocaleDateString("en-SG",{weekday:"long",day:"numeric",month:"long"});
      if(!day.length){$(listId).innerHTML='<div class="tr-empty">No lessons scheduled.</div>';return;}
      $(listId).innerHTML=day.map(function(s){
        return '<div class="teach-row"><div class="tr-time">'+hm(s.start_time)+'</div>'+
          '<div class="tr-body"><div class="tr-name">'+esc(nameById[s.student_id]||"—")+
          (s.subject?'<span class="tr-subj">'+esc(s.subject)+'</span>':'')+'</div>'+
          summarizeLast(lastBefore(s.student_id,dISO))+'</div></div>';
      }).join("");
    }
    renderDay("today-list","today-sub","today-h", today, "Today");
    renderDay("tmr-list","tmr-sub","tmr-h", tmr, "Tomorrow");
  }

  var segWired=false;
  function setDashMode(mode){
    var teach=mode==="teach";
    if($("fin-view"))$("fin-view").style.display=teach?"none":"block";
    if($("teach-view"))$("teach-view").style.display=teach?"block":"none";
    if($("seg-fin"))$("seg-fin").classList.toggle("on",!teach);
    if($("seg-teach"))$("seg-teach").classList.toggle("on",teach);
    try{localStorage.setItem("tl_dash_mode",mode);}catch(e){}
  }

  async function load(){
    await TL.promotePastLessons();
    var st=await window.sb.from("students").select("id,name");
    var nameById={};(st.data||[]).forEach(function(s){nameById[s.id]=s.name;});

    var sl=await window.sb.from("recurring_slots").select("student_id,weekday,start_time,end_time,subject,rate").eq("active",true);

    var ls=await window.sb.from("lessons").select("student_id,lesson_date,amount,paid,status,topics,homework,remarks");
    var lessons=ls.data||[];

    renderOnboarding((st.data||[]).length, (sl.data||[]).length, lessons.length);
    allLessons=lessons;
    var now=new Date(),y=now.getFullYear(),m=now.getMonth();
    if(selY===null){selY=y;selM=m;}

    var unpaid=lessons.filter(function(l){return l.status==="done"&&!l.paid;});
    $("k-pending").textContent=TL.sgd(unpaid.reduce(function(t,l){return t+Number(l.amount);},0));
    $("k-pending-n").textContent=unpaid.length+" unpaid lessons";

    renderMonthKpis();
    if(!dmWired){
      dmWired=true;
      var on=function(id,fn){var el=$(id);if(el)el.addEventListener("click",fn);};
      on("dm-prev",function(){stepDMonth(-1);});
      on("dm-next",function(){stepDMonth(1);});
      on("dm-today",function(){var n=new Date();selY=n.getFullYear();selM=n.getMonth();renderMonthKpis();});
    }

    // lessons this week (Mon–Sun, excluding cancelled)
    var mon=new Date();mon.setHours(0,0,0,0);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
    var sun=new Date(mon);sun.setDate(mon.getDate()+6);
    var ws=iso(mon),we=iso(sun);
    var week=lessons.filter(function(l){return l.lesson_date>=ws&&l.lesson_date<=we&&l.status!=="cancelled";});
    $("k-week").textContent=week.length;

    // income by month for current year: collected (paid) + pending (done, unpaid) + upcoming (scheduled)
    var collected=new Array(12).fill(0),pending=new Array(12).fill(0),upcoming=new Array(12).fill(0);
    lessons.forEach(function(l){
      if(!l.lesson_date||l.lesson_date.slice(0,4)!=String(y)||l.status==="cancelled")return;
      var mi=parseInt(l.lesson_date.slice(5,7),10)-1,amt=Number(l.amount);
      if(l.paid)collected[mi]+=amt;
      else if(l.status==="done")pending[mi]+=amt;
      else upcoming[mi]+=amt;
    });
    var ytd=collected.reduce(function(a,b){return a+b;},0);
    $("inc-hint").textContent="Collected YTD "+TL.sgd(ytd);
    if(window.Chart)renderChart(collected,pending,upcoming,y);

    var ex=await window.sb.from("exams").select("student_id,exam_date,assessment_type,subject,topics");
    var exams=ex.data||[];
    renderExams(exams,nameById,"exam-list","exam-hint");
    renderExams(exams,nameById,"teach-exam-list",null);
    renderTeaching(sl.data||[],lessons,nameById);

    if(!segWired){
      segWired=true;
      if($("seg-fin"))$("seg-fin").addEventListener("click",function(){setDashMode("fin");});
      if($("seg-teach"))$("seg-teach").addEventListener("click",function(){setDashMode("teach");});
      var saved="fin"; try{saved=localStorage.getItem("tl_dash_mode")||"fin";}catch(e){}
      setDashMode(saved);   // applied after the chart rendered while visible, so sizing is correct
    }
  }

  function renderOnboarding(students, slots, lessons){
    var box=$("onboard");if(!box)return;
    var steps=[
      {done:students>0, t:"Add your students", d:"Create a profile for each student you teach.", href:"students.html", cta:"Add students"},
      {done:slots>0,    t:"Set up the weekly schedule", d:"In the planner, add each student's recurring lesson slots.", href:"planner.html", cta:"Open planner"},
      {done:lessons>0,  t:"Fill the ledger from your schedule", d:"On the ledger, tap \u201CLog this week\u201D or \u201CLog this month\u201D to create lessons from your slots.", href:"ledger.html", cta:"Open ledger"}
    ];
    if(steps.every(function(s){return s.done;})){box.style.display="none";box.innerHTML="";return;}
    var nextShown=false;
    var rows=steps.map(function(s,i){
      var isNext=!s.done&&!nextShown; if(isNext)nextShown=true;
      var num=s.done?"\u2713":(i+1);
      var btn=s.done?"":'<a class="btn '+(isNext?"btn-gold":"")+'" href="'+s.href+'">'+s.cta+'</a>';
      return '<div class="ob-step'+(s.done?" done":"")+'">'+
        '<span class="ob-num">'+num+'</span>'+
        '<span class="ob-body"><span class="ob-t">'+s.t+'</span><span class="ob-d">'+s.d+'</span></span>'+
        btn+'</div>';
    }).join("");
    box.innerHTML='<div class="ob-card"><h3 class="ob-h">Let\u2019s get you set up</h3>'+
      '<p class="ob-sub">Three steps to a working dashboard. It\u2019ll disappear once you\u2019re done.</p>'+rows+'</div>';
    box.style.display="block";
  }

  TL.requireAuth("dashboard",function(){load();});
})();