// Calendar — week time-grid of the ledger.
// Shows real logged lessons (with status/paid) plus faded "projected" blocks
// from the recurring template for occurrences not yet logged. Read-only:
// clicking a block opens a details popover that links into the Ledger.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var HOUR_PX = 46, MIN_HR = 6;  // min hours shown so a light week isn't a sliver

  var userId = null, weekStart = null;
  var students = [], slots = [], lessons = [], nameById = {}, loadedStatic = false, lastBlocks = [];

  function pad(n){ return (n<10?"0":"")+n; }
  function iso(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
  function hhmm(t){ return t ? String(t).slice(0,5) : ""; }
  function toMin(t){ var p=String(t||"0:0").split(":"); return (+p[0])*60+(+p[1]); }
  function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function mondayOf(date){ var d=new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d; }
  function addDays(d,n){ var x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function dayIdx(dateISO){ var d=new Date(dateISO+"T00:00:00"); return (d.getDay()+6)%7; }  // Mon=0…Sun=6

  var MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var DAY=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  function rangeLabel(ws){
    var end=addDays(ws,6);
    return ws.getMonth()===end.getMonth()
      ? ws.getDate()+"–"+end.getDate()+" "+MON[end.getMonth()]
      : ws.getDate()+" "+MON[ws.getMonth()]+" – "+end.getDate()+" "+MON[end.getMonth()];
  }
  function hourLabel(min){ var h=Math.floor(min/60), ap=(h<12||h>=24)?"AM":"PM", hr=h%12; if(hr===0)hr=12; return hr+" "+ap; }

  // Real lessons this week, plus projected blocks for un-logged slot occurrences.
  function buildBlocks(){
    var wsISO=iso(weekStart), weISO=iso(addDays(weekStart,6)), blocks=[], seen={};
    lessons.forEach(function(l){
      if(l.lesson_date<wsISO||l.lesson_date>weISO) return;
      seen[l.student_id+"|"+l.lesson_date+"|"+hhmm(l.start_time)]=1;
      var st=l.status==="cancelled" ? "cancel" : l.status==="scheduled" ? "sched" : (l.paid?"paid":"unpaid");
      blocks.push({ id:l.id, day:dayIdx(l.lesson_date), startMin:toMin(l.start_time), endMin:toMin(l.end_time),
        name:nameById[l.student_id]||"—", subject:l.subject||"", level:l.level||"", amount:l.amount,
        kind:"lesson", state:st, postponed:!!l.postponed, dateISO:l.lesson_date });
    });
    slots.forEach(function(s){
      var d=addDays(weekStart,s.weekday), di=iso(d);
      if(seen[s.student_id+"|"+di+"|"+hhmm(s.start_time)]) return;  // already logged
      blocks.push({ id:"slot-"+s.id, day:s.weekday, startMin:toMin(s.start_time), endMin:toMin(s.end_time),
        name:nameById[s.student_id]||"—", subject:s.subject||"", level:s.level||"",
        kind:"proj", state:"proj", dateISO:di });
    });
    return blocks;
  }

  // Within one day: cluster overlapping blocks, give each a lane, flag clusters that need 2+ lanes.
  function laneAssign(day){
    day.sort(function(a,b){ return a.startMin-b.startMin || a.endMin-b.endMin; });
    var i=0;
    while(i<day.length){
      var cluster=[day[i]], end=day[i].endMin, j=i+1;
      while(j<day.length && day[j].startMin<end){ cluster.push(day[j]); end=Math.max(end,day[j].endMin); j++; }
      var laneEnds=[];
      cluster.forEach(function(b){
        var placed=false;
        for(var k=0;k<laneEnds.length;k++){ if(b.startMin>=laneEnds[k]){ b.lane=k; laneEnds[k]=b.endMin; placed=true; break; } }
        if(!placed){ b.lane=laneEnds.length; laneEnds.push(b.endMin); }
      });
      cluster.forEach(function(b){ b.lanes=laneEnds.length; b.clash=laneEnds.length>1; });
      i=j;
    }
  }

  function bounds(blocks){
    if(!blocks.length) return { start:15*60, end:21*60 };
    var mn=Math.min.apply(null,blocks.map(function(b){return b.startMin;}));
    var mx=Math.max.apply(null,blocks.map(function(b){return b.endMin;}));
    var start=Math.floor(mn/60)*60, end=Math.ceil(mx/60)*60;
    if((end-start)/60 < MIN_HR) end=start+MIN_HR*60;
    return { start:start, end:end };
  }

  function evHTML(b, top, height){
    var cls=["cal-ev","is-"+b.state];
    if(b.clash) cls.push("is-clash");
    if(height<34) cls.push("tight");
    var w=100/b.lanes, left=b.lane*w;
    var style="top:"+top+"px;height:"+Math.max(height-2,15)+"px;left:calc("+left+"% + 2px);width:calc("+w+"% - 4px)";
    var time=hhmm2(b.startMin);
    var sub=[b.subject,b.level].filter(Boolean).join(" · ");
    return '<div class="'+cls.join(" ")+'" style="'+style+'" data-ev="'+esc(String(b.id))+'">'+
      '<span class="ce-t">'+time+(b.clash?'<span class="ce-warn">⚠</span>':'')+'</span>'+
      '<span class="ce-n">'+esc(b.name)+(b.postponed?' ↻':'')+'</span>'+
      (sub?'<span class="ce-s">'+esc(sub)+'</span>':'')+'</div>';
  }
  function hhmm2(min){ return pad(Math.floor(min/60))+":"+pad(min%60); }

  function render(){
    var el=$("cal"); if(!el) return;
    $("cal-range").textContent=rangeLabel(weekStart);
    var blocks=buildBlocks();
    var byDay=[[],[],[],[],[],[],[]];
    blocks.forEach(function(b){ byDay[b.day].push(b); });
    byDay.forEach(laneAssign);
    lastBlocks=blocks;  // keep the laid-out blocks (with lane/clash) for the popover
    var bd=bounds(blocks), hours=(bd.end-bd.start)/60, gridH=hours*HOUR_PX;
    var today=iso(new Date());

    var headCells="";
    for(var d=0; d<7; d++){
      var date=addDays(weekStart,d), isToday=iso(date)===today;
      headCells+='<div class="cal-day-h'+(isToday?" today":"")+'">'+DAY[d]+'<b>'+date.getDate()+'</b></div>';
    }
    var gutter="";
    for(var h=0; h<hours; h++)
      gutter+='<div class="cal-hr" style="height:'+HOUR_PX+'px"><span>'+hourLabel(bd.start+h*60)+'</span></div>';

    var cols="";
    for(var c=0; c<7; c++){
      var isT=iso(addDays(weekStart,c))===today, evs="";
      byDay[c].forEach(function(b){
        var top=(b.startMin-bd.start)/60*HOUR_PX, height=(b.endMin-b.startMin)/60*HOUR_PX;
        evs+=evHTML(b, top, height);
      });
      cols+='<div class="cal-col'+(isT?" today":"")+'">'+evs+'</div>';
    }

    var gridBg="background-image:repeating-linear-gradient(var(--line) 0 1px,transparent 1px "+HOUR_PX+"px)";
    el.innerHTML='<div class="cal-head"><div class="cal-gutter-h"></div>'+headCells+'</div>'+
      '<div class="cal-body"><div class="cal-gutter">'+gutter+'</div>'+
      '<div class="cal-cols" style="height:'+gridH+'px;'+gridBg+'">'+cols+'</div></div>';
    if(!blocks.length)
      el.innerHTML+='<div class="cal-empty">No lessons or recurring slots this week. Add slots on the Planner, or log lessons in the Ledger.</div>';

    el.querySelectorAll("[data-ev]").forEach(function(node){
      node.addEventListener("click", function(e){ e.stopPropagation(); showPopover(node); });
    });
  }

  // ---- details popover (read-only; edits live in the Ledger) ----
  function findBlock(id){ return lastBlocks.filter(function(b){ return String(b.id)===String(id); })[0]; }
  function showPopover(node){
    var b=findBlock(node.dataset.ev); if(!b) return;
    var pop=$("cal-pop");
    var label={paid:["Paid","rgba(14,124,123,.14)","#0b5b5a"], unpaid:["Unpaid","rgba(179,64,47,.12)","#8a2f22"],
      sched:["Scheduled","rgba(26,42,79,.10)","var(--navy)"], cancel:["Cancelled","#f3f0e8","var(--muted)"],
      proj:["Not logged yet","rgba(181,137,43,.12)","#7a5f1f"]}[b.state];
    var when=DAY[b.day]+" "+addDays(weekStart,b.day).getDate()+" "+MON[addDays(weekStart,b.day).getMonth()]+
             " · "+hhmm2(b.startMin)+"–"+hhmm2(b.endMin);
    var sub=[b.subject,b.level].filter(Boolean).join(" · ");
    pop.innerHTML='<span class="cp-x" id="cp-x">×</span><h4>'+esc(b.name)+'</h4>'+
      '<div class="cp-row">'+esc(when)+'</div>'+
      (sub?'<div class="cp-row"><b>'+esc(sub)+'</b></div>':'')+
      (b.kind==="lesson"&&b.amount!=null?'<div class="cp-row">Amount <b>'+TL.sgd(b.amount)+'</b></div>':'')+
      (b.clash?'<div class="cp-row" style="color:var(--owed);font-weight:700">⚠ Overlaps another lesson</div>':'')+
      '<span class="cp-tag" style="background:'+label[1]+';color:'+label[2]+'">'+label[0]+'</span>'+
      (b.postponed?' <span class="cp-tag" style="background:rgba(200,146,42,.18);color:#8a5f14">Postponed</span>':'')+
      '<a class="cp-act" href="ledger.html">'+(b.kind==="proj"?"Log in Ledger →":"Open in Ledger →")+'</a>';
    pop.style.display="block";
    var r=node.getBoundingClientRect(), pw=260, ph=pop.offsetHeight;
    var left=Math.min(r.left, window.innerWidth-pw-10);
    var top=r.bottom+8; if(top+ph>window.innerHeight-10) top=Math.max(10, r.top-ph-8);
    pop.style.left=Math.max(10,left)+"px"; pop.style.top=top+"px";
    $("cp-x").addEventListener("click", hidePopover);
  }
  function hidePopover(){ var p=$("cal-pop"); if(p) p.style.display="none"; }

  function shiftWeek(n){ weekStart=addDays(weekStart,n*7); loadWeek(); }
  function goToday(){ weekStart=mondayOf(new Date()); loadWeek(); }

  async function loadStatic(){
    var st=await window.sb.from("students").select("id,name,active");
    students=st.error?[]:(st.data||[]);
    nameById={}; students.forEach(function(s){ nameById[s.id]=s.name; });
    var sl=await window.sb.from("recurring_slots").select("id,student_id,weekday,start_time,end_time,subject,level,rate,split").eq("active",true);
    slots=sl.error?[]:(sl.data||[]);
    loadedStatic=true;
  }
  async function loadWeek(){
    if(!loadedStatic) await loadStatic();
    var wsISO=iso(weekStart), weISO=iso(addDays(weekStart,6));
    var ls=await window.sb.from("lessons")
      .select("id,student_id,lesson_date,start_time,end_time,subject,level,amount,paid,status,postponed")
      .gte("lesson_date",wsISO).lte("lesson_date",weISO);
    lessons=ls.error?[]:(ls.data||[]);
    render();
  }

  function init(user){
    userId=user.id;
    weekStart=mondayOf(new Date());
    $("cal-prev").addEventListener("click", function(){ shiftWeek(-1); });
    $("cal-next").addEventListener("click", function(){ shiftWeek(1); });
    $("cal-today").addEventListener("click", goToday);
    document.addEventListener("click", hidePopover);
    window.addEventListener("resize", hidePopover);
    if(window.TL && TL.promotePastLessons) TL.promotePastLessons();
    loadWeek();
  }

  if (window.__CAL_TEST__) {
    window.CAL = { setData:function(s,sl,l,ws){ students=s; slots=sl; lessons=l; weekStart=ws;
      nameById={}; s.forEach(function(x){ nameById[x.id]=x.name; }); }, render:render };
  } else {
    TL.requireAuth("calendar", init);
  }
})();
