// Weekly planner — Mon–Sun grid from recurring_slots; add, EDIT, remove slots.
(function () {
  function fillSubjects(list){var el=document.getElementById("dl-subject");if(!el)return;var u=[];(list||[]).forEach(function(s){s=(s||"").trim();if(s&&u.indexOf(s)<0)u.push(s);});el.innerHTML=u.sort().map(function(s){return "<option value=\""+s.replace(/"/g,"&quot;")+"\">";}).join("");}
  var DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  var SHORT=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  var userId=null, students=[], allStudents=[], allSlots=[], editingId=null;
  var $=function(id){return document.getElementById(id);};
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function hhmm(t){return t?t.slice(0,5):"";}
  function nameOf(id){for(var i=0;i<allStudents.length;i++)if(allStudents[i].id===id)return allStudents[i].name;return "—";}

  function studentOptions(){
    $("m-student").innerHTML=students.length?students.map(function(s){return '<option value="'+s.id+'">'+esc(s.name)+"</option>";}).join(""):'<option value="">— no students yet —</option>';
  }
  function clearForm(){
    $("m-subject").value="";$("m-level").value="";$("m-start").value="";$("m-end").value="";$("m-rate").value="";$("m-split").value="1";splitHint();
    $("m-day").value="0";if(students.length)$("m-student").value=students[0].id;
  }
  // ---- Calendar export (ICS) ----
  // One recurring weekly event per slot. Times are written as floating local
  // times (no timezone suffix) so they land at the same clock time in any calendar.
  function icsEsc(s){return String(s==null?"":s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n");}
  function fold(line){ // RFC 5545: lines over 75 octets must be folded
    if(line.length<=74)return line;
    var out=line.slice(0,74),rest=line.slice(74);
    while(rest.length){ out+="\r\n "+rest.slice(0,73); rest=rest.slice(73); }
    return out;
  }
  function pad2(n){return String(n).padStart(2,"0");}
  function nextDateFor(weekday){ // weekday 0=Mon..6=Sun -> next occurrence (incl. today)
    var d=new Date(); d.setHours(0,0,0,0);
    var cur=(d.getDay()+6)%7;                 // today as 0=Mon..6=Sun
    d.setDate(d.getDate()+((weekday-cur)+7)%7);
    return d;
  }
  function stamp(d,hhmmStr){
    var p=(hhmmStr||"00:00").split(":");
    return d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate())+"T"+pad2(p[0])+pad2(p[1])+"00";
  }
  function exportICS(){
    var slots=allSlots.filter(function(s){return s.start_time&&s.end_time;});
    if(!slots.length){alert("No recurring slots to export yet. Add them on the planner first.");return;}
    var DAYS=["MO","TU","WE","TH","FR","SA","SU"];
    var now=new Date();
    var dtstamp=now.getUTCFullYear()+pad2(now.getUTCMonth()+1)+pad2(now.getUTCDate())+"T"+
                pad2(now.getUTCHours())+pad2(now.getUTCMinutes())+pad2(now.getUTCSeconds())+"Z";
    var L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//T-Leng Tuition//Planner//EN",
           "CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:T-Leng Tuition — Timetable"];
    slots.forEach(function(s){
      var first=nextDateFor(s.weekday);
      var title=[nameOf(s.student_id),s.subject].filter(Boolean).join(" · ")||"Lesson";
      var desc=[s.level?"Level: "+s.level:"", s.rate?"Rate: S$"+s.rate+"/hr":"",
                (s.split&&s.split>1)?"Split between "+s.split:""].filter(Boolean).join("\n");
      L.push("BEGIN:VEVENT");
      L.push("UID:slot-"+s.id+"@tleng");
      L.push("DTSTAMP:"+dtstamp);
      L.push("DTSTART:"+stamp(first,hhmm(s.start_time)));
      L.push("DTEND:"+stamp(first,hhmm(s.end_time)));
      L.push("RRULE:FREQ=WEEKLY;BYDAY="+DAYS[s.weekday]);
      L.push(fold("SUMMARY:"+icsEsc(title)));
      if(desc)L.push(fold("DESCRIPTION:"+icsEsc(desc)));
      L.push("END:VEVENT");
    });
    L.push("END:VCALENDAR");
    var blob=new Blob([L.join("\r\n")+"\r\n"],{type:"text/calendar;charset=utf-8"});
    var url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="T-Leng-Timetable.ics";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},4000);
  }

  function splitHint(){
    var el=$("m-splithint");if(!el)return;
    var rate=parseFloat($("m-rate").value),sp=Math.max(1,parseInt($("m-split").value,10)||1),
        s=$("m-start").value,e=$("m-end").value;
    if(!(rate>=0)||sp<2){el.textContent="";return;}
    if(s&&e&&e>s){
      var each=Math.round(TL.amount(rate,s,e)/sp*100)/100;
      el.textContent="Each student pays "+TL.sgd(each)+" per lesson (rate ÷ "+sp+").";
    } else {
      el.textContent="Each student pays "+TL.sgd(Math.round(rate/sp*100)/100)+"/hr (rate ÷ "+sp+").";
    }
  }

  function planPrefill(){
    if(editingId)return;                 // don't overwrite when editing an existing slot
    var sid=$("m-student").value;
    var slot=allSlots.find(function(x){return x.student_id===sid;});
    if(!slot)return;                     // no existing slot to copy from
    $("m-rate").value=slot.rate!=null?slot.rate:"";
    $("m-split").value=slot.split||1;
    if(!$("m-subject").value)$("m-subject").value=slot.subject||"";
    if(!$("m-level").value)$("m-level").value=slot.level||"";
    splitHint();
  }

  function openModal(open, slot){
    $("modal").classList.toggle("on",open);
    $("m-msg").textContent="";$("m-msg").className="msg";
    if(!open)return;
    if(slot){
      editingId=slot.id;
      $("m-title").textContent="Edit slot";$("m-save").textContent="Save changes";
      $("m-student").value=slot.student_id;$("m-day").value=slot.weekday;
      $("m-subject").value=slot.subject||"";$("m-level").value=slot.level||"";$("m-start").value=hhmm(slot.start_time);
      $("m-end").value=hhmm(slot.end_time);$("m-rate").value=slot.rate;$("m-split").value=slot.split||1;splitHint();
    }else{
      editingId=null;clearForm();
      $("m-title").textContent="Add weekly slot";$("m-save").textContent="Save slot";
    }
    if(!students.length){$("m-msg").textContent="Add a student first (Students tab).";$("m-msg").className="msg err";}
  }

  function render(){
    var byDay=[[],[],[],[],[],[],[]];
    allSlots.forEach(function(s){if(s.weekday>=0&&s.weekday<=6)byDay[s.weekday].push(s);});
    byDay.forEach(function(a){a.sort(function(x,y){return (x.start_time||"").localeCompare(y.start_time||"");});});
    var weekTotal=0;
    $("week").innerHTML=byDay.map(function(arr,d){
      var dayTotal=0;
      function slotHTML(s){
        var sp=s.split||1;
        var cost=Math.round(TL.amount(s.rate,hhmm(s.start_time),hhmm(s.end_time))/sp*100)/100;dayTotal+=cost;
        return '<div class="slot" data-edit="'+s.id+'">'+
          '<button class="x" data-del="'+s.id+'" title="Remove">×</button>'+
          '<div class="t">'+hhmm(s.start_time)+"–"+hhmm(s.end_time)+'</div>'+
          (s.subject||s.level?'<div class="subj">'+esc([s.subject,s.level].filter(Boolean).join(" · "))+'</div>':"")+
          '<div class="s"><a class="snl" href="student.html?id='+s.student_id+'">'+esc(nameOf(s.student_id))+'</a></div>'+
          '<div class="c">'+TL.sgd(cost)+(sp>1?' <span class="muted" style="font-weight:400">(÷'+sp+')</span>':'')+'</div></div>';
      }
      var inner;
      if(!arr.length){ inner='<div class="none">—</div>'; }
      else {
        // group consecutive slots that start at the same time so they sit side by side
        var groups=[],cur=null;
        arr.forEach(function(s){
          if(cur&&cur.key===s.start_time){cur.items.push(s);}
          else {cur={key:s.start_time,items:[s]};groups.push(cur);}
        });
        inner=groups.map(function(g){
          var cells=g.items.map(slotHTML).join("");
          return g.items.length>1?'<div class="slot-row">'+cells+'</div>':cells;
        }).join("");
      }
      weekTotal+=dayTotal;
      return '<div class="day"><h3 class="'+(arr.length?"has":"")+'"><span>'+SHORT[d]+'</span>'+
        '<span class="dtot">'+(dayTotal?TL.sgd(dayTotal):"")+'</span></h3><div class="slots">'+inner+'</div></div>';
    }).join("");
    $("p-total").innerHTML=allSlots.length?"Weekly total <b>"+TL.sgd(weekTotal)+"</b> · "+allSlots.length+" slots":"No recurring slots yet — add your first.";

    $("week").querySelectorAll("[data-del]").forEach(function(b){b.addEventListener("click",function(e){e.stopPropagation();removeSlot(b.dataset.del);});});
    $("week").querySelectorAll("a.snl").forEach(function(a){a.addEventListener("click",function(e){e.stopPropagation();});});
    $("week").querySelectorAll("[data-edit]").forEach(function(el){el.addEventListener("click",function(){
      var s=allSlots.find(function(x){return x.id===el.dataset.edit;});if(s)openModal(true,s);});});
  }

  async function load(){
    var st=await window.sb.from("students").select("id,name,active").order("name");
    if(!st.error){allStudents=st.data||[];students=allStudents.filter(function(s){return s.active!==false;});studentOptions();}
    var res=await window.sb.from("recurring_slots").select("id,student_id,weekday,start_time,end_time,subject,level,rate,split");
    if(res.error){$("p-total").textContent="Couldn't load schedule: "+res.error.message;return;}
    allSlots=res.data||[];fillSubjects(allSlots.map(function(s){return s.subject;}));render();
  }

  async function removeSlot(id){
    if(!confirm("Remove this weekly slot?"))return;
    var res=await window.sb.from("recurring_slots").delete().eq("id",id);
    if(res.error){alert("Couldn't remove: "+res.error.message);return;}
    load();
  }

  async function save(){
    var msg=$("m-msg");
    var sid=$("m-student").value,start=$("m-start").value,end=$("m-end").value,rate=parseFloat($("m-rate").value);
    if(!sid){msg.textContent="Pick a student.";msg.className="msg err";return;}
    if(!start||!end){msg.textContent="Set a start and end time.";msg.className="msg err";return;}
    if(end<=start){msg.textContent="End time must be after start.";msg.className="msg err";return;}
    if(!(rate>=0)){msg.textContent="Enter an hourly rate.";msg.className="msg err";return;}
    var payload={tutor_id:userId,student_id:sid,weekday:parseInt($("m-day").value,10),
      start_time:start,end_time:end,subject:$("m-subject").value.trim()||null,level:$("m-level").value.trim()||null,rate:rate,split:Math.max(1,parseInt($("m-split").value,10)||1)};
    $("m-save").disabled=true;
    var res=editingId
      ? await window.sb.from("recurring_slots").update(payload).eq("id",editingId)
      : await window.sb.from("recurring_slots").insert(payload);
    $("m-save").disabled=false;
    if(res.error){msg.textContent=res.error.message;msg.className="msg err";return;}
    openModal(false);load();
  }

  function init(user){
    userId=user.id;
    $("add-btn").addEventListener("click",function(){openModal(true,null);});
    var ics=$("ics-btn"); if(ics)ics.addEventListener("click",exportICS);
    $("m-cancel").addEventListener("click",function(){openModal(false);});
    $("modal").addEventListener("click",function(e){if(e.target===$("modal"))openModal(false);});
    $("m-save").addEventListener("click",save);
    $("m-student").addEventListener("change",planPrefill);
    ["m-rate","m-split","m-start","m-end"].forEach(function(id){var el=$(id);if(el)el.addEventListener("input",splitHint);});
    load();
  }
  TL.requireAuth("planner",init);
})();