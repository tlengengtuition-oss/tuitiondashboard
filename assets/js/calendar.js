// Calendar — week/month view of the ledger.
// Shows real logged lessons (with status/paid) plus faded "projected" blocks
// from the recurring template for occurrences not yet logged. Read-only:
// clicking a block opens a details popover that links into the Ledger.
//
// Loading: students + active slots load once; lessons are fetched a whole month
// at a time and cached in memory (keyed "YYYY-MM"), so paging/toggling back to a
// month already seen is instant. All fetches for a view run in parallel.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var HOUR_PX = 46, MIN_HR = 6;

  var userId = null, anchor = null, mode = "week";
  var students = [], slots = [], nameById = {}, locById = {}, hhById = {}, loadedStatic = false;
  var lessonCache = {}, pending = {}, lastBlocks = [], hidden = {};

  function pad(n){ return (n<10?"0":"")+n; }
  function iso(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
  function hhmm(t){ return t ? String(t).slice(0,5) : ""; }
  function hhmm2(min){ return pad(Math.floor(min/60))+":"+pad(min%60); }
  function toMin(t){ var p=String(t||"0:0").split(":"); return (+p[0])*60+(+p[1]); }
  function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function mondayOf(date){ var d=new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d; }
  function addDays(d,n){ var x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function dayIdx(dateISO){ var d=new Date(dateISO+"T00:00:00"); return (d.getDay()+6)%7; }
  // Household key = normalised phone (matches ledger.js): same number → same household.
  function hhKey(c){ var d=String(c||"").replace(/\D/g,""); if(d.length===10&&d.slice(0,2)==="65") d=d.slice(2); return d||null; }

  var MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var MONF=["January","February","March","April","May","June","July","August","September","October","November","December"];
  var DAY=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  // ---- what span a given anchor+mode covers ----
  function rangeFor(a, m){
    if(m==="month"){
      var first=new Date(a.getFullYear(),a.getMonth(),1);
      var last=new Date(a.getFullYear(),a.getMonth()+1,0);
      return { start:mondayOf(first), end:addDays(mondayOf(last),6) };
    }
    var ws=mondayOf(a);
    return { start:ws, end:addDays(ws,6) };
  }
  function visibleRange(){ return rangeFor(anchor, mode); }
  function monthsIn(range){
    var out=[], d=new Date(range.start.getFullYear(),range.start.getMonth(),1),
        endM=new Date(range.end.getFullYear(),range.end.getMonth(),1);
    while(d<=endM){ out.push(d.getFullYear()+"-"+pad(d.getMonth()+1)); d=new Date(d.getFullYear(),d.getMonth()+1,1); }
    return out;
  }
  function rangeLabel(){
    if(mode==="month") return MONF[anchor.getMonth()]+" "+anchor.getFullYear();
    var ws=mondayOf(anchor), end=addDays(ws,6);
    return ws.getMonth()===end.getMonth()
      ? ws.getDate()+"–"+end.getDate()+" "+MON[end.getMonth()]
      : ws.getDate()+" "+MON[ws.getMonth()]+" – "+end.getDate()+" "+MON[end.getMonth()];
  }
  function hourLabel(min){ var h=Math.floor(min/60), ap=(h<12||h>=24)?"AM":"PM", hr=h%12; if(hr===0)hr=12; return hr+" "+ap; }

  // ---- data ----
  async function loadStatic(){
    var r=await Promise.all([
      window.sb.from("students").select("id,name,location,contact,active"),
      window.sb.from("recurring_slots").select("id,student_id,weekday,start_time,end_time,subject,level,rate,split").eq("active",true)
    ]);
    students=r[0].error?[]:(r[0].data||[]);
    nameById={}; locById={}; hhById={};
    students.forEach(function(s){ nameById[s.id]=s.name; locById[s.id]=s.location||""; hhById[s.id]=hhKey(s.contact); });
    slots=r[1].error?[]:(r[1].data||[]);
    loadedStatic=true;
  }
  // Returns a promise; no-ops if the month is already cached, and dedupes a month
  // that a background prefetch and a visible load ask for at the same time.
  function fetchMonth(key){
    if(key in lessonCache) return Promise.resolve();
    if(pending[key]) return pending[key];
    var p=key.split("-"), y=+p[0], m=+p[1]-1;
    var first=iso(new Date(y,m,1)), last=iso(new Date(y,m+1,0));
    pending[key]=window.sb.from("lessons")
      .select("id,slot_id,slot_date,student_id,lesson_date,start_time,end_time,subject,level,amount,paid,status,postponed")
      .gte("lesson_date",first).lte("lesson_date",last)
      .then(function(ls){ lessonCache[key]=ls.error?[]:(ls.data||[]); delete pending[key]; });
    return pending[key];
  }
  function lessonsForRange(range){
    var s=iso(range.start), e=iso(range.end), out=[];
    monthsIn(range).forEach(function(k){
      (lessonCache[k]||[]).forEach(function(l){ if(l.lesson_date>=s&&l.lesson_date<=e) out.push(l); });
    });
    return out;
  }
  // Load what the visible range needs (fetchMonth no-ops on cached months), paint,
  // then warm the neighbouring months in the background so ‹ / › are instant too.
  async function ensureData(){
    var jobs=[];
    if(!loadedStatic) jobs.push(loadStatic());
    monthsIn(visibleRange()).forEach(function(k){ jobs.push(fetchMonth(k)); });
    await Promise.all(jobs);
    render();
    prefetchAdjacent();
  }
  // The months touched by one step back and one step forward (week or month).
  function neighborMonths(){
    var out={};
    [-1,1].forEach(function(dir){
      var a2 = mode==="month" ? new Date(anchor.getFullYear(),anchor.getMonth()+dir,1) : addDays(anchor,dir*7);
      monthsIn(rangeFor(a2,mode)).forEach(function(k){ out[k]=1; });
    });
    return Object.keys(out);
  }
  function prefetchAdjacent(){ neighborMonths().forEach(function(k){ fetchMonth(k); }); }  // fire-and-forget

  // ---- blocks: real lessons + projected slot occurrences across a date range ----
  // Every slot occurrence a lesson fulfils, keyed slot_id|slot_date. Because slot_date is
  // fixed at generation and never moves, a postponed lesson still claims its ORIGINAL
  // occurrence — so no phantom "not logged" appears, on any day or month boundary.
  // Built from the whole cache, so a lesson postponed into another (cached) month still
  // claims its occurrence back here. Falls back to the exact time for one-off lessons and
  // any pre-backfill rows that lack slot_date.
  function loggedOccurrences(){
    var occ={}, time={};
    Object.keys(lessonCache).forEach(function(m){
      lessonCache[m].forEach(function(l){
        if(l.slot_id && l.slot_date) occ[l.slot_id+"|"+l.slot_date]=1;
        time[l.student_id+"|"+l.lesson_date+"|"+hhmm(l.start_time)]=1;
      });
    });
    return { occ:occ, time:time };
  }
  function buildBlocks(range){
    var blocks=[], claimed=loggedOccurrences(), lessons=lessonsForRange(range);
    lessons.forEach(function(l){
      var st=l.status==="cancelled" ? "cancel" : l.status==="scheduled" ? "sched" : (l.paid?"paid":"unpaid");
      blocks.push({ id:l.id, dateISO:l.lesson_date, day:dayIdx(l.lesson_date), startMin:toMin(l.start_time), endMin:toMin(l.end_time),
        name:nameById[l.student_id]||"—", subject:l.subject||"", level:l.level||"", location:locById[l.student_id]||"", amount:l.amount,
        kind:"lesson", state:st, postponed:!!l.postponed, adhoc:!l.slot_id, hh:hhById[l.student_id]||null });
    });
    for(var d=new Date(range.start); iso(d)<=iso(range.end); d=addDays(d,1)){
      var di=iso(d), wd=(d.getDay()+6)%7;
      slots.forEach(function(s){
        if(s.weekday!==wd) return;
        if(claimed.occ[s.id+"|"+di]) return;                                 // this occurrence is logged
        if(claimed.time[s.student_id+"|"+di+"|"+hhmm(s.start_time)]) return; // one-off / pre-backfill fallback
        blocks.push({ id:"slot-"+s.id+"-"+di, dateISO:di, day:wd, startMin:toMin(s.start_time), endMin:toMin(s.end_time),
          name:nameById[s.student_id]||"—", subject:s.subject||"", level:s.level||"", location:locById[s.student_id]||"", kind:"proj", state:"proj" });
      });
    }
    return blocks.filter(function(b){ return !hidden[b.state]; });   // legend toggles
  }

  // Within one day: cluster overlaps, give each a lane, and flag genuine double-bookings.
  // A clash needs two *real* lessons to overlap. A cancelled lesson isn't happening, and a
  // projected ("not logged") block is only a preview of the template — neither is a real
  // booking, so overlapping either is not a clash. The clash appears once you actually log
  // the second lesson (it becomes real).
  function isReal(b){ return b.state!=="cancel" && b.state!=="proj"; }
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
      var real=cluster.filter(isReal);
      cluster.forEach(function(b){
        b.lanes=laneEnds.length;
        // Clash = overlaps another real lesson from a DIFFERENT household. Same household at
        // the same time is an intentional group (e.g. siblings), so no clash.
        b.clash = isReal(b) && real.some(function(o){
          return o!==b && o.startMin<b.endMin && b.startMin<o.endMin && !(b.hh && o.hh && b.hh===o.hh);
        });
      });
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

  // ---- week (time-grid) ----
  function evHTML(b, top, height){
    var cls=["cal-ev","is-"+b.state];
    if(b.clash) cls.push("is-clash");
    if(height<34) cls.push("tight");
    var w=100/b.lanes, left=b.lane*w;
    var style="top:"+top+"px;height:"+Math.max(height-2,15)+"px;left:calc("+left+"% + 2px);width:calc("+w+"% - 4px)";
    var sub=[b.subject,b.level].filter(Boolean).join(" · ");
    return '<div class="'+cls.join(" ")+'" style="'+style+'" data-ev="'+esc(String(b.id))+'">'+
      '<span class="ce-t">'+hhmm2(b.startMin)+(b.clash?'<span class="ce-warn">⚠</span>':'')+'</span>'+
      '<span class="ce-n">'+esc(b.name)+(b.adhoc?' ✦':'')+(b.postponed?' ↻':'')+'</span>'+
      (sub?'<span class="ce-s">'+esc(sub)+'</span>':'')+
      (b.location?'<span class="ce-loc">◍ '+esc(b.location)+'</span>':'')+'</div>';
  }
  function renderWeek(range){
    var ws=range.start, blocks=buildBlocks(range);
    var byDay=[[],[],[],[],[],[],[]];
    blocks.forEach(function(b){ byDay[b.day].push(b); });
    byDay.forEach(laneAssign);
    lastBlocks=blocks;
    var bd=bounds(blocks), hours=(bd.end-bd.start)/60, gridH=hours*HOUR_PX, today=iso(new Date());

    var headCells="";
    for(var d=0; d<7; d++){
      var date=addDays(ws,d), isT=iso(date)===today;
      headCells+='<div class="cal-day-h'+(isT?" today":"")+'">'+DAY[d]+'<b>'+date.getDate()+'</b></div>';
    }
    var gutter="";
    for(var h=0; h<hours; h++)
      gutter+='<div class="cal-hr" style="height:'+HOUR_PX+'px"><span>'+hourLabel(bd.start+h*60)+'</span></div>';
    var cols="";
    for(var c=0; c<7; c++){
      var isTc=iso(addDays(ws,c))===today, evs="";
      byDay[c].forEach(function(b){
        var top=(b.startMin-bd.start)/60*HOUR_PX, height=(b.endMin-b.startMin)/60*HOUR_PX;
        evs+=evHTML(b, top, height);
      });
      cols+='<div class="cal-col'+(isTc?" today":"")+'">'+evs+'</div>';
    }
    var gridBg="background-image:repeating-linear-gradient(var(--line) 0 1px,transparent 1px "+HOUR_PX+"px)";
    var el=$("cal");
    el.innerHTML='<div class="cal-head"><div class="cal-gutter-h"></div>'+headCells+'</div>'+
      '<div class="cal-body"><div class="cal-gutter">'+gutter+'</div>'+
      '<div class="cal-cols" style="height:'+gridH+'px;'+gridBg+'">'+cols+'</div></div>';
    if(!blocks.length)
      el.innerHTML+='<div class="cal-empty">No lessons or recurring slots this week. Add slots on the Planner, or log lessons in the Ledger.</div>';
    wireEvents();
  }

  // ---- month (day-cell grid) ----
  function chipHTML(b){
    var cls="cal-chip is-"+b.state+(b.clash?" is-clash":"");
    return '<span class="'+cls+'" data-ev="'+esc(String(b.id))+'">'+(b.clash?'⚠ ':'')+hhmm2(b.startMin)+' '+esc(b.name)+'</span>';
  }
  function renderMonth(range){
    var blocks=buildBlocks(range);
    var byDate={}; blocks.forEach(function(b){ (byDate[b.dateISO]=byDate[b.dateISO]||[]).push(b); });
    Object.keys(byDate).forEach(function(k){ laneAssign(byDate[k]); });   // sets clash per day
    lastBlocks=blocks;
    var today=iso(new Date()), curMonth=anchor.getMonth();
    var head=DAY.map(function(d){ return '<div class="cal-mh">'+d+'</div>'; }).join("");
    var cells="";
    for(var d=new Date(range.start); iso(d)<=iso(range.end); d=addDays(d,1)){
      var di=iso(d), inMonth=d.getMonth()===curMonth, isT=di===today;
      var chips=(byDate[di]||[]).slice().sort(function(a,b){ return a.startMin-b.startMin; });
      var shown=chips.slice(0,3).map(chipHTML).join("");
      var more=chips.length>3?'<div class="cal-more">+'+(chips.length-3)+' more</div>':"";
      cells+='<div class="cal-mday'+(inMonth?"":" other")+(isT?" today":"")+'" data-day="'+di+'">'+
        '<div class="md-num">'+d.getDate()+'</div>'+shown+more+'</div>';
    }
    $("cal").innerHTML='<div class="cal-mhead">'+head+'</div><div class="cal-month">'+cells+'</div>';
    // click a day (not a chip) → open that week
    $("cal").querySelectorAll(".cal-mday").forEach(function(cell){
      cell.addEventListener("click", function(){ anchor=new Date(cell.dataset.day+"T00:00:00"); setMode("week"); });
    });
    wireEvents();
  }

  function render(){
    if(!$("cal")) return;
    $("cal-range").textContent=rangeLabel();
    if(mode==="month") renderMonth(visibleRange()); else renderWeek(visibleRange());
  }

  function wireEvents(){
    $("cal").querySelectorAll("[data-ev]").forEach(function(node){
      node.addEventListener("click", function(e){ e.stopPropagation(); showPopover(node); });
    });
  }

  // ---- popover (read-only) ----
  function findBlock(id){ return lastBlocks.filter(function(b){ return String(b.id)===String(id); })[0]; }
  function showPopover(node){
    var b=findBlock(node.dataset.ev); if(!b) return;
    var pop=$("cal-pop");
    var label={paid:["Paid","rgba(14,124,123,.14)","#0b5b5a"], unpaid:["Unpaid","rgba(179,64,47,.12)","#8a2f22"],
      sched:["Scheduled","rgba(26,42,79,.10)","var(--navy)"], cancel:["Cancelled","#f3f0e8","var(--muted)"],
      proj:["Not logged yet","rgba(181,137,43,.12)","#7a5f1f"]}[b.state];
    var dt=new Date(b.dateISO+"T00:00:00");
    var when=DAY[(dt.getDay()+6)%7]+" "+dt.getDate()+" "+MON[dt.getMonth()]+" · "+hhmm2(b.startMin)+"–"+hhmm2(b.endMin);
    var sub=[b.subject,b.level].filter(Boolean).join(" · ");
    pop.innerHTML='<span class="cp-x" id="cp-x">×</span><h4>'+esc(b.name)+'</h4>'+
      '<div class="cp-row">'+esc(when)+'</div>'+
      (sub?'<div class="cp-row"><b>'+esc(sub)+'</b></div>':'')+
      (b.location?'<div class="cp-row">◍ <b>'+esc(b.location)+'</b></div>':'')+
      (b.kind==="lesson"&&b.amount!=null?'<div class="cp-row">Amount <b>'+TL.sgd(b.amount)+'</b></div>':'')+
      (b.clash?'<div class="cp-row" style="color:var(--owed);font-weight:700">⚠ Overlaps another lesson</div>':'')+
      '<span class="cp-tag" style="background:'+label[1]+';color:'+label[2]+'">'+label[0]+'</span>'+
      (b.adhoc?' <span class="cp-tag" style="background:rgba(26,42,79,.10);color:var(--navy)">✦ One-off</span>':'')+
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

  // ---- export to .ics (one-time; import into Google/Apple Calendar) ----
  function icsEsc(s){ return String(s==null?"":s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n"); }
  function icsFold(line){ var out="", s=line; while(s.length>73){ out+=s.slice(0,73)+"\r\n "; s=s.slice(73); } return out+s; }
  function icsStamp(dateISO, hhmmv){ return dateISO.replace(/-/g,"")+"T"+hhmmv.replace(":","")+"00"; }
  // Real logged lessons only (each a dated event), recent past + all future, excluding cancelled.
  // Floating local time (no TZ) so events keep their clock time. Stable UID per lesson id.
  async function exportICS(){
    if(!loadedStatic) await loadStatic();
    var from=new Date(); from.setMonth(from.getMonth()-2);
    var ls=await window.sb.from("lessons")
      .select("id,student_id,lesson_date,start_time,end_time,subject,level,amount,paid,status,postponed,slot_id")
      .gte("lesson_date", iso(from));
    if(ls.error){ alert("Couldn't export: "+ls.error.message); return; }
    var rows=(ls.data||[]).filter(function(l){ return l.status!=="cancelled"; });
    if(!rows.length){ alert("No lessons to export yet — log some in the Ledger first."); return; }
    var n=new Date();
    var dtstamp=n.getUTCFullYear()+pad(n.getUTCMonth()+1)+pad(n.getUTCDate())+"T"+pad(n.getUTCHours())+pad(n.getUTCMinutes())+pad(n.getUTCSeconds())+"Z";
    var L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//T-Leng Tuition//Calendar//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:Tuition lessons"];
    rows.forEach(function(l){
      var summary=[nameById[l.student_id]||"Lesson", l.subject].filter(Boolean).join(" · ");
      var d=[]; if(l.level) d.push("Level: "+l.level);
      if(l.amount!=null) d.push("Amount: S$"+l.amount);
      d.push(l.status==="scheduled"?"Scheduled":(l.paid?"Paid":"Unpaid"));
      if(l.postponed) d.push("Postponed"); if(!l.slot_id) d.push("One-off");
      var loc=locById[l.student_id]||"";
      L.push("BEGIN:VEVENT");
      L.push("UID:lesson-"+l.id+"@tleng");
      L.push("DTSTAMP:"+dtstamp);
      L.push("DTSTART:"+icsStamp(l.lesson_date, hhmm(l.start_time)));
      L.push("DTEND:"+icsStamp(l.lesson_date, hhmm(l.end_time)));
      L.push(icsFold("SUMMARY:"+icsEsc(summary)));
      if(loc) L.push(icsFold("LOCATION:"+icsEsc(loc)));
      L.push(icsFold("DESCRIPTION:"+icsEsc(d.join("\n"))));
      L.push("END:VEVENT");
    });
    L.push("END:VCALENDAR");
    var blob=new Blob([L.join("\r\n")+"\r\n"], {type:"text/calendar;charset=utf-8"});
    var url=URL.createObjectURL(blob), a=document.createElement("a");
    a.href=url; a.download="tuition-lessons.ics"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  }

  // ---- Google Calendar sync (client-side OAuth via Google Identity Services) ----
  var GCLIENT=(window.TLENG_CONFIG||{}).GOOGLE_CLIENT_ID||"";
  var GSCOPE="https://www.googleapis.com/auth/calendar.events", GTZ="Asia/Singapore";
  var gToken=null, gTokenClient=null;

  function gcalConfigured(){ return !!GCLIENT; }
  function gcalConnected(){ try{ return localStorage.getItem("tl_gcal_connected")==="1"; }catch(e){ return false; } }
  function gStatus(t,cls){ var el=$("gcal-status"); if(el){ el.textContent=t||""; el.className="gcal-status"+(cls?" "+cls:""); } }
  function gBtnLabel(){ var b=$("gcal-btn"); if(b) b.textContent=gcalConnected()?"↻ Sync to Google":"Connect Google Calendar"; }

  function whenGoogleReady(cb){
    if(window.google && google.accounts && google.accounts.oauth2){ cb(); return; }
    var n=0, t=setInterval(function(){ n++; if(window.google&&google.accounts&&google.accounts.oauth2){ clearInterval(t); cb(); } else if(n>40){ clearInterval(t); } },200);
  }
  function initGcal(){
    if(!gcalConfigured() || !$("gcal-btn")) return;
    $("gcal-btn").style.display="";
    whenGoogleReady(function(){
      gTokenClient=google.accounts.oauth2.initTokenClient({
        client_id:GCLIENT, scope:GSCOPE,
        callback:function(resp){
          if(resp && resp.access_token){ gToken=resp.access_token; try{localStorage.setItem("tl_gcal_connected","1");}catch(e){} gBtnLabel(); runSync(); }
          else { gStatus("Couldn't connect to Google.","err"); }
        }
      });
      gBtnLabel();
      if(gcalConnected()) gTokenClient.requestAccessToken({prompt:""});   // silent re-auth + sync on load
    });
  }
  function connectGcal(){
    if(!gTokenClient){ gStatus("Google isn't ready yet — try again in a second.","err"); return; }
    gTokenClient.requestAccessToken({ prompt: gToken?"":"consent" });
  }

  function gEvent(l){
    var summary=[nameById[l.student_id]||"Lesson", l.subject].filter(Boolean).join(" · ");
    var d=[]; if(l.level)d.push("Level: "+l.level); if(l.amount!=null)d.push("Amount: S$"+l.amount);
    d.push(l.status==="scheduled"?"Scheduled":(l.paid?"Paid":"Unpaid"));
    if(l.postponed)d.push("Postponed"); if(!l.slot_id)d.push("One-off");
    var e={ summary:summary, description:d.join("\n"),
      start:{ dateTime:l.lesson_date+"T"+hhmm(l.start_time)+":00", timeZone:GTZ },
      end:{ dateTime:l.lesson_date+"T"+hhmm(l.end_time)+":00", timeZone:GTZ } };
    var loc=locById[l.student_id]; if(loc) e.location=loc;
    return e;
  }
  async function gapi(method, path, body){
    var res=await fetch("https://www.googleapis.com/calendar/v3"+path, {
      method:method, headers:{ "Authorization":"Bearer "+gToken, "Content-Type":"application/json" },
      body: body?JSON.stringify(body):undefined });
    if(res.status===401){ gToken=null; var err=new Error("expired"); err.code=401; throw err; }
    if(!res.ok && res.status!==410) throw new Error("Google API "+res.status);   // 410 = already gone
    return (res.status===204||res.status===410) ? null : res.json();
  }
  // Push lessons in a rolling window to the user's primary Google Calendar:
  // create if new (store the event id), update if already synced, delete if now cancelled.
  async function runSync(){
    if(!gToken) return;
    gStatus("Syncing…");
    var from=new Date(); from.setMonth(from.getMonth()-2);
    var to=new Date(); to.setMonth(to.getMonth()+6);
    var ls=await window.sb.from("lessons")
      .select("id,student_id,lesson_date,start_time,end_time,subject,level,amount,paid,status,postponed,slot_id,gcal_event_id")
      .gte("lesson_date", iso(from)).lte("lesson_date", iso(to));
    if(ls.error){ gStatus("Couldn't read lessons: "+ls.error.message,"err"); return; }
    var rows=ls.data||[], made=0, upd=0, del=0, fail=0;
    for(var i=0;i<rows.length;i++){
      var l=rows[i];
      try{
        if(l.status==="cancelled"){
          if(l.gcal_event_id){ await gapi("DELETE","/calendars/primary/events/"+encodeURIComponent(l.gcal_event_id)); await window.sb.from("lessons").update({gcal_event_id:null}).eq("id",l.id); del++; }
        } else if(l.gcal_event_id){
          await gapi("PUT","/calendars/primary/events/"+encodeURIComponent(l.gcal_event_id), gEvent(l)); upd++;
        } else {
          var ev=await gapi("POST","/calendars/primary/events", gEvent(l));
          if(ev && ev.id){ await window.sb.from("lessons").update({gcal_event_id:ev.id}).eq("id",l.id); made++; }
        }
      }catch(e){ if(e && e.code===401){ gStatus("Google session expired — click Connect again.","err"); return; } fail++; }
    }
    gStatus("Synced ✓ "+made+" new, "+upd+" updated"+(del?", "+del+" removed":"")+(fail?" · "+fail+" failed":""), "ok");
  }

  // ---- nav / mode ----
  function setMode(m){
    mode=m;
    try{ localStorage.setItem("tl_cal_mode",m); }catch(e){}
    $("seg-week").classList.toggle("on",m==="week");
    $("seg-month").classList.toggle("on",m==="month");
    ensureData();
  }
  function shiftRange(dir){
    if(mode==="month") anchor=new Date(anchor.getFullYear(),anchor.getMonth()+dir,1);
    else anchor=addDays(anchor,dir*7);
    ensureData();
  }
  function goToday(){ anchor=new Date(); ensureData(); }

  function initLegend(){
    document.querySelectorAll(".cal-legend .leg").forEach(function(btn){
      var cat=btn.dataset.cat;
      btn.classList.toggle("off", !!hidden[cat]);
      btn.addEventListener("click", function(e){
        e.stopPropagation();
        if(hidden[cat]) delete hidden[cat]; else hidden[cat]=true;
        btn.classList.toggle("off", !!hidden[cat]);
        try{ localStorage.setItem("tl_cal_hidden", JSON.stringify(hidden)); }catch(e2){}
        render();   // re-filter; no refetch needed
      });
    });
  }

  function init(user){
    userId=user.id; anchor=new Date();
    try{ mode=localStorage.getItem("tl_cal_mode")||"week"; }catch(e){ mode="week"; }
    try{ hidden=JSON.parse(localStorage.getItem("tl_cal_hidden")||"{}")||{}; }catch(e){ hidden={}; }
    $("seg-week").classList.toggle("on",mode==="week");
    $("seg-month").classList.toggle("on",mode==="month");
    $("cal-prev").addEventListener("click", function(){ shiftRange(-1); });
    $("cal-next").addEventListener("click", function(){ shiftRange(1); });
    $("cal-today").addEventListener("click", goToday);
    if($("cal-export")) $("cal-export").addEventListener("click", exportICS);
    if($("gcal-btn")) $("gcal-btn").addEventListener("click", connectGcal);
    initGcal();
    $("seg-week").addEventListener("click", function(){ setMode("week"); });
    $("seg-month").addEventListener("click", function(){ setMode("month"); });
    initLegend();
    document.addEventListener("click", hidePopover);
    window.addEventListener("resize", hidePopover);
    if(window.TL && TL.promotePastLessons) TL.promotePastLessons();
    ensureData();
  }

  if (window.__CAL_TEST__) {
    window.CAL = { seed:function(s,sl,l,a,m){
      students=s; slots=sl; loadedStatic=true; anchor=a; mode=m||"week";
      nameById={}; locById={}; hhById={}; s.forEach(function(x){ nameById[x.id]=x.name; locById[x.id]=x.location||""; hhById[x.id]=hhKey(x.contact); });
      lessonCache={}; (l||[]).forEach(function(x){ var k=x.lesson_date.slice(0,7); (lessonCache[k]=lessonCache[k]||[]).push(x); });
      var w=$("seg-week"), mo=$("seg-month");
      if(w) w.classList.toggle("on",mode==="week"); if(mo) mo.classList.toggle("on",mode==="month");
    }, render:render, ensureData:ensureData, initLegend:initLegend, exportICS:exportICS,
       go:function(a,m){ anchor=a; if(m) mode=m; },
       blocks:function(){ return buildBlocks(visibleRange()); },
       cachedMonths:function(){ return Object.keys(lessonCache); } };
  } else {
    TL.requireAuth("calendar", init);
  }
})();
