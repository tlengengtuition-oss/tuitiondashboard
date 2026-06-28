// Dashboard — live KPIs, income-by-month chart, upcoming exam countdown.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function pad(n){return (n<10?"0":"")+n;}
  function iso(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
  function todayISO(){return iso(new Date());}
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
  function hm(t){return t?t.slice(0,5):"";}
  function monthOccurrences(weekday){var now=new Date(),y=now.getFullYear(),m=now.getMonth(),c=0,d=new Date(y,m,1);while(d.getMonth()===m){if(((d.getDay()+6)%7)===weekday)c++;d.setDate(d.getDate()+1);}return c;}

  function renderChart(byMonth, year){
    var labels=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var ctx=$("incomeChart").getContext("2d");
    new Chart(ctx,{
      type:"bar",
      data:{labels:labels,datasets:[{
        label:"Collected ("+year+")",
        data:byMonth,
        backgroundColor:"#B5892B",
        borderRadius:5,
        maxBarThickness:34
      }]},
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},
          tooltip:{callbacks:{label:function(c){return TL.sgd(c.parsed.y);}}}},
        scales:{
          y:{beginAtZero:true,ticks:{callback:function(v){return "$"+v;}},grid:{color:"#eee7d6"}},
          x:{grid:{display:false}}
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

    // income by month (collected = paid) for current year
    var byMonth=new Array(12).fill(0);
    lessons.forEach(function(l){
      if(l.paid&&l.lesson_date&&l.lesson_date.slice(0,4)==String(y)){
        byMonth[parseInt(l.lesson_date.slice(5,7),10)-1]+=Number(l.amount);
      }
    });
    var ytd=byMonth.reduce(function(a,b){return a+b;},0);
    $("inc-hint").textContent="YTD "+TL.sgd(ytd);
    if(window.Chart)renderChart(byMonth.map(function(v){return Math.round(v*100)/100;}),y);

    var ex=await window.sb.from("exams").select("student_id,exam_date,assessment_type,subject,topics");
    renderExams(ex.data||[],nameById);
  }

  TL.requireAuth("dashboard",function(){load();});
})();