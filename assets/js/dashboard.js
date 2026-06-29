// Dashboard — live KPIs, income-by-month chart, upcoming exam countdown.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function pad(n){return (n<10?"0":"")+n;}
  function iso(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
  function todayISO(){return iso(new Date());}
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
  function hm(t){return t?t.slice(0,5):"";}
  function monthOccurrences(weekday){var now=new Date(),y=now.getFullYear(),m=now.getMonth(),c=0,d=new Date(y,m,1);while(d.getMonth()===m){if(((d.getDay()+6)%7)===weekday)c++;d.setDate(d.getDate()+1);}return c;}

  var chartObj=null;
  function renderChart(collected, pending, upcoming, year){
    var labels=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var r2=function(v){return Math.round(v*100)/100;};
    var ctx=$("incomeChart").getContext("2d");
    if(chartObj)chartObj.destroy();
    chartObj=new Chart(ctx,{
      type:"bar",
      data:{labels:labels,datasets:[
        {label:"Collected",data:collected.map(r2),backgroundColor:"#B5892B",maxBarThickness:34,stack:"s",borderRadius:3},
        {label:"Pending payment",data:pending.map(r2),backgroundColor:"#B3402F",maxBarThickness:34,stack:"s",borderRadius:3},
        {label:"Projected (upcoming)",data:upcoming.map(r2),backgroundColor:"#0E7C7B",maxBarThickness:34,stack:"s",borderRadius:3}
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

  function renderExams(exams, nameById){
    var today=todayISO();
    var up=exams.filter(function(e){return e.exam_date&&e.exam_date>=today;})
                .sort(function(a,b){return a.exam_date.localeCompare(b.exam_date);}).slice(0,7);
    $("exam-hint").textContent=up.length?up.length+" ahead:"+"":"";
    if(!up.length){$("exam-list").innerHTML='<div class="muted" style="font-size:13.5px">No upcoming exams.</div>';return;}
    var now=new Date(); now.setHours(0,0,0,0);
    $("exam-list").innerHTML=up.map(function(e){
      var d=new Date(e.exam_date+"T00:00:00");
      var days=Math.round((d-now)/86400000);
      var soon=days<=14;
      var label=[e.assessment_type,e.subject].filter(Boolean).join(" · ")||"exam";
      return '<div class="exam-row"><div class="ex-main"><div class="ex-name">'+esc(nameById[e.student_id]||"—")+'</div><div class="ex-sub">'+esc(label)+(e.topics?" — "+esc(e.topics):"")+'</div></div>'+
        '<div class="days'+(soon?" soon":"")+'"><b>'+days+'</b><small>'+(days===1?"day":"days")+'</small></div></div>';
    }).join("");
  }

  async function load(){
    await TL.promotePastLessons();
    var st=await window.sb.from("students").select("id,name");
    var nameById={};(st.data||[]).forEach(function(s){nameById[s.id]=s.name;});

    var sl=await window.sb.from("recurring_slots").select("weekday,start_time,end_time,rate").eq("active",true);

    var ls=await window.sb.from("lessons").select("student_id,lesson_date,amount,paid,status");
    var lessons=ls.data||[];

    renderOnboarding((st.data||[]).length, (sl.data||[]).length, lessons.length);
    var now=new Date(),y=now.getFullYear(),m=now.getMonth();
    var mFirst=y+"-"+pad(m+1)+"-01",mLast=y+"-"+pad(m+1)+"-"+pad(new Date(y,m+1,0).getDate());

    var unpaid=lessons.filter(function(l){return l.status==="done"&&!l.paid;});
    $("k-pending").textContent=TL.sgd(unpaid.reduce(function(t,l){return t+Number(l.amount);},0));
    $("k-pending-n").textContent=unpaid.length+" unpaid lessons";

    var month=lessons.filter(function(l){return l.lesson_date>=mFirst&&l.lesson_date<=mLast;});
    var projected=month.filter(function(l){return l.status!=="cancelled";}).reduce(function(t,l){return t+Number(l.amount);},0);
    $("k-projected").textContent=TL.sgd(projected);
    $("k-collected").textContent=TL.sgd(month.filter(function(l){return l.paid;}).reduce(function(t,l){return t+Number(l.amount);},0));
    $("k-collected-n").textContent=now.toLocaleString("en-SG",{month:"long"});

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
    renderExams(ex.data||[],nameById);
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