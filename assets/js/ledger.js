// Ledger — KPIs, outstanding by student, mark paid, add lesson, log-week-from-schedule.
(function () {
  function fillSubjects(list){var el=document.getElementById("dl-subject");if(!el)return;var u=[];(list||[]).forEach(function(s){s=(s||"").trim();if(s&&u.indexOf(s)<0)u.push(s);});el.innerHTML=u.sort().map(function(s){return "<option value=\""+s.replace(/"/g,"&quot;")+"\">";}).join("");}
  var userId = null, nameById = {}, contactById = {}, recipientById = {}, students = [], slots = [], profile = null, outGroups = {}, monthById = {}, editLessonId = null, allLessons = [], period = null, genWeekOff = 0, genMonthOff = 0, selectedStudents = {}, lastUnpaid = [], householdBy = {};
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
  function setGenLabel(){
    var mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var moFull=["January","February","March","April","May","June","July","August","September","October","November","December"];
    var mon=mondayOf(new Date());mon.setDate(mon.getDate()+genWeekOff*7);
    var sun=new Date(mon);sun.setDate(mon.getDate()+6);
    var range=mon.getMonth()===sun.getMonth()
      ? mon.getDate()+"–"+sun.getDate()+" "+mo[sun.getMonth()]
      : mon.getDate()+" "+mo[mon.getMonth()]+" – "+sun.getDate()+" "+mo[sun.getMonth()];
    var wpre=genWeekOff===0?"this week":(genWeekOff===1?"next week":"week");
    var b=$("gen-btn");if(b)b.textContent="Log "+wpre+" ("+range+")";
    var now=new Date(),mb=new Date(now.getFullYear(),now.getMonth()+genMonthOff,1);
    var mpre=genMonthOff===0?"this month":(genMonthOff===1?"next month":"month");
    var mlbl=moFull[mb.getMonth()]+(mb.getFullYear()!==now.getFullYear()?" "+mb.getFullYear():"");
    var mbtn=$("gen-month-btn");if(mbtn)mbtn.textContent="Log "+mpre+" ("+mlbl+")";
  }
  function stepWeek(d){genWeekOff=Math.max(0,genWeekOff+d);setGenLabel();}
  function stepMonth(d){genMonthOff=Math.max(0,genMonthOff+d);setGenLabel();}

  function openCustom(){
    var t=new Date(),plus=new Date();plus.setDate(plus.getDate()+13);
    $("cr-from").value=iso(t);$("cr-to").value=iso(plus);
    $("cr-msg").textContent="";$("cr-msg").className="msg";
    $("cr-modal").classList.add("on");
  }
  function closeCustom(){$("cr-modal").classList.remove("on");}
  async function generateRange(){
    var msg=$("cr-msg");
    if(!slots.length){msg.textContent="No recurring slots to generate from. Add them on the Planner first.";msg.className="msg err";return;}
    var fromISO=$("cr-from").value,toISO=$("cr-to").value;
    if(!fromISO||!toISO){msg.textContent="Pick both a start and end date.";msg.className="msg err";return;}
    if(toISO<fromISO){msg.textContent="\u201CTo\u201D must be on or after \u201CFrom\u201D.";msg.className="msg err";return;}
    var start=new Date(fromISO+"T00:00:00"),end=new Date(toISO+"T00:00:00");
    if(Math.round((end-start)/86400000)+1>366){msg.textContent="Range too large \u2014 keep it within a year.";msg.className="msg err";return;}
    var b=$("cr-save");b.disabled=true;
    var ex=await window.sb.from("lessons").select("student_id,lesson_date,start_time").gte("lesson_date",fromISO).lte("lesson_date",toISO);
    var seen={};(ex.data||[]).forEach(function(l){seen[l.student_id+"|"+l.lesson_date+"|"+hm(l.start_time)]=1;});
    var rows=[];
    for(var d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
      var wd=(d.getDay()+6)%7,di=iso(d);
      slots.forEach(function(s){
        if(s.weekday!==wd)return;
        if(seen[s.student_id+"|"+di+"|"+hm(s.start_time)])return;
        rows.push({tutor_id:userId,student_id:s.student_id,slot_id:s.id,lesson_date:di,start_time:s.start_time,end_time:s.end_time,subject:s.subject,level:s.level,rate:s.rate,split:s.split||1,amount:splitAmt(s.rate,hm(s.start_time),hm(s.end_time),s.split),status:di>todayISO()?"scheduled":"done",paid:false});
      });
    }
    b.disabled=false;
    if(!rows.length){msg.textContent="That range is already logged \u2014 nothing new to add.";msg.className="msg";return;}
    if(!confirm("Add "+rows.length+" lessons from "+fromISO+" to "+toISO+"? Already-logged lessons are skipped."))return;
    b.disabled=true;
    var res=await window.sb.from("lessons").insert(rows);
    b.disabled=false;
    if(res.error){msg.textContent="Couldn't generate: "+res.error.message;msg.className="msg err";return;}
    closeCustom();load();
  }

  // ---------- rendering ----------
  function daysSince(iso){
    var d=new Date(iso+"T00:00:00"),t=new Date();t.setHours(0,0,0,0);
    return Math.max(0,Math.round((t-d)/86400000));
  }
  function ageTag(days){
    if(days<7)return "";
    var lbl=days>=30?(Math.floor(days/30)+"mth"+(days>=60?"s":"")):(Math.floor(days/7)+"wk"+(days>=14?"s":""));
    var cls=days>=30?"age bad":(days>=14?"age warn":"age");
    return '<span class="'+cls+'">'+lbl+' overdue</span>';
  }
  function renderOutstanding(unpaid){
    lastUnpaid=unpaid;
    var groups={};unpaid.forEach(function(l){(groups[l.student_id]=groups[l.student_id]||[]).push(l);});
    outGroups=groups;
    function oldestOf(id){return groups[id].reduce(function(m,l){return (!m||l.lesson_date<m)?l.lesson_date:m;},null);}
    // oldest debt first — chase these before anything else
    var ids=Object.keys(groups).sort(function(a,b){
      var oa=oldestOf(a),ob=oldestOf(b);
      if(oa!==ob)return oa.localeCompare(ob);
      var sa=groups[a].reduce(function(t,l){return t+Number(l.amount);},0);
      var sb=groups[b].reduce(function(t,l){return t+Number(l.amount);},0);return sb-sa;});
    if(!ids.length){$("outstanding").innerHTML='<div class="card empty"><h3>All settled 🎉</h3><p>No unpaid lessons right now.</p></div>';$("out-hint").textContent="";return;}
    $("out-hint").textContent=ids.length+(ids.length===1?" student owing":" students owing");
    function studentCard(id){
      var rows=groups[id].sort(function(a,b){return a.lesson_date.localeCompare(b.lesson_date);});
      var sum=rows.reduce(function(t,l){return t+Number(l.amount);},0);
      var lessonIds=rows.map(function(l){return l.id;});
      var age=ageTag(daysSince(rows[0].lesson_date));
      var inner=rows.map(function(l){var d=daysSince(l.lesson_date);return '<div class="lrow"><span class="lwhen">'+prettyDate(l.lesson_date)+(d>=14?' <span class="agedot" title="'+d+' days unpaid">•</span>':"")+"</span><span>"+(l.subject?esc(l.subject):'<span class="muted">lesson</span>')+'</span><span class="lamt">'+TL.sgd(l.amount)+'</span><button class="mark lite" data-pay="'+l.id+'">Mark paid</button></div>';}).join("");
      return '<div class="card group"><div class="group-head"><span class="gsel"><input type="checkbox" data-sel="'+id+'" title="Select to bill together"><span class="gname"><a class="snl" href="student.html?id='+id+'">'+esc(nameById[id]||"—")+'</a></span>'+age+'</span><span class="right"><span class="gsum">'+TL.sgd(sum)+'</span><button class="mark lite" data-remind="'+id+'">Remind</button><button class="mark lite" data-inv="'+id+'">Invoice</button><button class="mark" data-payall="'+lessonIds.join(",")+'">Mark all paid</button></span></div>'+inner+'</div>';
    }
    // group owing students by household
    var byHH={}; ids.forEach(function(id){var h=householdBy[id];if(h)(byHH[h]=byHH[h]||[]).push(id);});
    var doneHH={};
    $("outstanding").innerHTML=ids.map(function(id){
      var h=householdBy[id];
      if(h&&byHH[h].length>=2){
        if(doneHH[h])return "";
        doneHH[h]=1;
        var members=byHH[h];
        var hhLabel=members.map(function(m){return recipientById[m];}).filter(Boolean)[0]||contactById[members[0]]||"Household";
        var hhSum=members.reduce(function(t,m){return t+groups[m].reduce(function(s,l){return s+Number(l.amount);},0);},0);
        var hhOldest=members.reduce(function(m,id){var o=oldestOf(id);return (!m||o<m)?o:m;},null);
        return '<div class="hh-block"><div class="hh-head"><span class="gsel"><input type="checkbox" data-hh="'+encodeURIComponent(h)+'" title="Select all with this phone number"><span class="hh-name">⌂ '+esc(hhLabel)+' <span class="muted" style="font-weight:600;font-size:12px">· '+members.length+' students</span></span>'+ageTag(daysSince(hhOldest))+'</span>'+
          '<span class="hh-actions"><span class="gsum">'+TL.sgd(hhSum)+'</span><button class="mark lite" data-hhrem="'+members.join(",")+'">Remind</button><button class="mark lite" data-hhinv="'+members.join(",")+'">Invoice together</button></span></div>'+members.map(studentCard).join("")+'</div>';
      }
      return studentCard(id);
    }).join("");
    $("outstanding").querySelectorAll("[data-pay]").forEach(function(b){b.addEventListener("click",function(){markPaid([b.dataset.pay]);});});
    $("outstanding").querySelectorAll("[data-payall]").forEach(function(b){b.addEventListener("click",function(){if(confirm("Mark all these lessons as paid?"))markPaid(b.dataset.payall.split(","));});});
    $("outstanding").querySelectorAll("[data-inv]").forEach(function(b){b.addEventListener("click",function(){openInvoice(b.dataset.inv);});});
    $("outstanding").querySelectorAll("[data-remind]").forEach(function(b){b.addEventListener("click",function(){remind(b.dataset.remind);});});
    // drop selections for students no longer owing
    Object.keys(selectedStudents).forEach(function(id){if(!groups[id])delete selectedStudents[id];});
    $("outstanding").querySelectorAll("[data-sel]").forEach(function(cb){
      cb.checked=!!selectedStudents[cb.dataset.sel];
      cb.addEventListener("change",function(){
        if(cb.checked)selectedStudents[cb.dataset.sel]=1; else delete selectedStudents[cb.dataset.sel];
        updateCombineBar();
      });
    });
    $("outstanding").querySelectorAll("[data-hh]").forEach(function(cb){
      var h=decodeURIComponent(cb.dataset.hh);
      var members=ids.filter(function(id){return householdBy[id]===h;});
      cb.checked=members.length>0&&members.every(function(id){return selectedStudents[id];});
      cb.addEventListener("change",function(){
        members.forEach(function(id){ if(cb.checked)selectedStudents[id]=1; else delete selectedStudents[id]; });
        renderOutstanding(lastUnpaid);
      });
    });
    $("outstanding").querySelectorAll("[data-hhinv]").forEach(function(b){b.addEventListener("click",function(){openInvoiceMany(b.dataset.hhinv.split(","));});});
    $("outstanding").querySelectorAll("[data-hhrem]").forEach(function(b){b.addEventListener("click",function(){remindMany(b.dataset.hhrem.split(","));});});
    updateCombineBar();
  }

  function updateCombineBar(){
    var bar=$("combine-bar");if(!bar)return;
    var ids=Object.keys(selectedStudents);
    if(ids.length<2){bar.style.display="none";bar.innerHTML="";return;}
    var total=0,count=0;
    ids.forEach(function(id){(outGroups[id]||[]).forEach(function(l){total+=Number(l.amount);count++;});});
    var names=ids.map(function(id){return nameById[id]||"—";});
    bar.innerHTML='<span class="cb-txt">'+ids.length+' selected · '+esc(names.join(", "))+'</span>'+
      '<span class="cb-sum">'+TL.sgd(total)+' · '+count+' lesson'+(count===1?"":"s")+'</span>'+
      '<span class="spacer"></span>'+
      '<button class="cb-rem" id="cb-remind">Remind together</button>'+
      '<button class="cb-inv" id="cb-invoice">Invoice together</button>'+
      '<button class="cb-clear" id="cb-clear">Clear</button>';
    bar.style.display="flex";
    $("cb-invoice").addEventListener("click",function(){openInvoiceMany(Object.keys(selectedStudents));});
    $("cb-remind").addEventListener("click",function(){remindMany(Object.keys(selectedStudents));});
    $("cb-clear").addEventListener("click",function(){selectedStudents={};renderOutstanding(lastUnpaid);});
  }

  function waNumber(raw){
    var d=String(raw||"").replace(/\D/g,"");
    if(!d)return "";
    d=d.replace(/^0+/,"");
    if(d.length===8)return "65"+d;   // Singapore local mobile/landline
    return d;                         // assume it already carries a country code
  }
  var DEFAULT_REMINDER="Hi {name}! Friendly reminder from {business}: you have an outstanding balance of {amount} for {count} tuition lesson(s). PayNow to {paynow}. Thank you!";
  var DEFAULT_INVOICE="Hi {name}! Here's your invoice {invoice} from {business} — total {amount}. PayNow to {paynow}. Thank you!";
  function fillTemplate(tpl,vars){return String(tpl).replace(/\{(\w+)\}/g,function(_,k){return vars[k]!=null?String(vars[k]):"";});}
  var MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
  function monthsLabel(rows){
    var seen={},keys=[];
    (rows||[]).forEach(function(l){var k=(l.lesson_date||"").slice(0,7);if(k&&!seen[k]){seen[k]=1;keys.push(k);}});
    keys.sort();
    var names=keys.map(function(k){return MONTHS[parseInt(k.slice(5,7),10)-1];});
    if(!names.length)return "";
    if(names.length===1)return names[0];
    if(names.length===2)return names[0]+" & "+names[1];
    return names.slice(0,-1).join(", ")+" & "+names[names.length-1];
  }

  function remind(id){
    var num=waNumber(contactById[id]);
    if(!num){alert("No contact number saved for "+(nameById[id]||"this student")+".\n\nAdd one on the Students page (Edit → Contact), then try again.");return;}
    var rows=outGroups[id]||[];
    if(!rows.length)return;
    var sum=rows.reduce(function(t,l){return t+Number(l.amount);},0);
    var vars={name:recipientById[id]||nameById[id]||"",student:nameById[id]||"",business:(profile&&profile.business_name)||"T-Leng Tuition",
      amount:TL.sgd(sum),count:rows.length,invoice:"",paynow:(profile&&profile.paynow_id)||"",
      month:monthsLabel(rows),date:prettyDate(iso(new Date())),year:String(new Date().getFullYear())};
    var tpl=(profile&&profile.reminder_message)||DEFAULT_REMINDER;
    window.open("https://wa.me/"+num+"?text="+encodeURIComponent(fillTemplate(tpl,vars)),"_blank");
  }

  function remindMany(ids){
    var num="", targetId=null;
    ids.some(function(id){var n=waNumber(contactById[id]);if(n){num=n;targetId=id;return true;}return false;});
    if(!num){alert("None of the selected students have a saved contact number.\n\nAdd one on the Students page (Edit → Contact), then try again.");return;}
    var all=[]; ids.forEach(function(id){(outGroups[id]||[]).forEach(function(l){all.push(l);});});
    if(!all.length)return;
    var sum=all.reduce(function(t,l){return t+Number(l.amount);},0);
    var names=ids.map(function(id){return nameById[id]||"";}).filter(Boolean);
    var who=names.length===2?names[0]+" & "+names[1]:names.join(", ");
    var vars={name:recipientById[targetId]||nameById[targetId]||"",student:who,business:(profile&&profile.business_name)||"T-Leng Tuition",
      amount:TL.sgd(sum),count:all.length,invoice:"",paynow:(profile&&profile.paynow_id)||"",
      month:monthsLabel(all),date:prettyDate(iso(new Date())),year:String(new Date().getFullYear())};
    var tpl=(profile&&profile.reminder_message)||DEFAULT_REMINDER;
    window.open("https://wa.me/"+num+"?text="+encodeURIComponent(fillTemplate(tpl,vars)),"_blank");
  }
  function periodLabel(){return period.mode==="all"?"All time":new Date(period.y,period.m,1).toLocaleString("en-SG",{month:"long",year:"numeric"});}
  function fillOpt(id,pairs,label){
    var el=$(id);if(!el)return;var cur=el.value;
    el.innerHTML='<option value="">'+label+'</option>'+pairs.map(function(p){return '<option value="'+String(p[0]).replace(/"/g,"&quot;")+'">'+esc(p[1])+'</option>';}).join("");
    el.value=cur;
  }
  function fillRecFilters(){
    var stu=[],sub=[],lvl=[];
    allLessons.forEach(function(l){
      if(l.student_id&&stu.indexOf(l.student_id)<0)stu.push(l.student_id);
      if(l.subject&&sub.indexOf(l.subject)<0)sub.push(l.subject);
      if(l.level&&lvl.indexOf(l.level)<0)lvl.push(l.level);
    });
    stu.sort(function(a,b){return (nameById[a]||"").localeCompare(nameById[b]||"");});
    fillOpt("rec-student",stu.map(function(id){return [id,nameById[id]||"—"];}),"All students");
    fillOpt("rec-subject",sub.sort().map(function(s){return [s,s];}),"All subjects");
    fillOpt("rec-level",lvl.sort().map(function(s){return [s,s];}),"All levels");
  }
  function clearRecFilters(){
    ["rec-search","rec-student","rec-subject","rec-level","rec-status"].forEach(function(id){var el=$(id);if(el)el.value="";});
    renderRecords();
  }
  function renderRecords(){
    if(!period)period={mode:"month",y:new Date().getFullYear(),m:new Date().getMonth()};
    $("period-label").textContent=periodLabel();
    $("all-time").classList.toggle("on",period.mode==="all");
    var rows=allLessons.filter(function(l){
      if(period.mode==="all")return true;
      return l.lesson_date.slice(0,7)===period.y+"-"+pad(period.m+1);
    });
    var q=($("rec-search")?$("rec-search").value:"").trim().toLowerCase();
    var fStu=$("rec-student")?$("rec-student").value:"";
    var fSub=$("rec-subject")?$("rec-subject").value:"";
    var fLvl=$("rec-level")?$("rec-level").value:"";
    var stat=$("rec-status")?$("rec-status").value:"";
    if(q)rows=rows.filter(function(l){return [nameById[l.student_id],l.subject,l.level].some(function(v){return (v||"").toLowerCase().indexOf(q)>-1;});});
    if(fStu)rows=rows.filter(function(l){return l.student_id===fStu;});
    if(fSub)rows=rows.filter(function(l){return (l.subject||"")===fSub;});
    if(fLvl)rows=rows.filter(function(l){return (l.level||"")===fLvl;});
    if(stat)rows=rows.filter(function(l){
      if(stat==="unpaid")return l.status==="done"&&!l.paid;
      if(stat==="paid")return l.paid;
      if(stat==="postponed")return !!l.postponed;
      return l.status===stat; // scheduled / cancelled
    });
    var anyFilter=!!(q||fStu||fSub||fLvl||stat);
    ["rec-student","rec-subject","rec-level","rec-status"].forEach(function(id){var el=$(id);if(el)el.classList.toggle("on",!!el.value);});
    if($("rec-clear"))$("rec-clear").style.display=anyFilter?"":"none";
    var table=$("month-table"),empty=$("month-empty"),body=$("month-body");
    monthById={};rows.forEach(function(l){monthById[l.id]=l;});
    if(!rows.length){
      table.style.display="none";empty.style.display="block";
      empty.innerHTML="<h3>"+(anyFilter?"No lessons match these filters":"No lessons in "+periodLabel())+"</h3>";
      $("month-hint").textContent="";return;
    }
    empty.style.display="none";table.style.display="table";
    rows.sort(function(a,b){return b.lesson_date.localeCompare(a.lesson_date);});
    $("month-hint").textContent=rows.length+" lessons";
    body.innerHTML=rows.map(function(l){
      var badge=l.status==="cancelled"?'<span class="kind-tag">cancelled</span>':(l.status==="scheduled"?'<span class="kind-tag">scheduled</span>':(l.paid?'<span class="badge paid">Paid</span>':'<span class="badge owed">Unpaid</span>'));
      if(l.postponed)badge+=' <span class="kind-tag" style="background:#C8922A;color:#fff">postponed</span>';
      var cancelBtn=l.status==="cancelled"
        ? '<button class="tact" data-restore="'+l.id+'">Restore</button>'
        : '<button class="tact warn" data-cancel="'+l.id+'">Cancel</button>';
      return '<tr><td data-label="Date">'+prettyDate(l.lesson_date)+'</td><td class="name" data-label="Student"><a class="snl" href="student.html?id='+l.student_id+'">'+esc(nameById[l.student_id]||"—")+'</a></td><td data-label="Subject">'+(l.subject?esc(l.subject):'<span class="muted">—</span>')+'</td><td data-label="Level">'+(l.level?esc(l.level):'<span class="muted">—</span>')+'</td><td data-label="Amount">'+TL.sgd(l.amount)+'</td><td data-label="Status">'+badge+'</td>'+
        '<td class="acts"><button class="tact" data-edit="'+l.id+'">Postpone / edit</button>'+cancelBtn+'<button class="tact del" data-delete="'+l.id+'">Delete</button></td></tr>';
    }).join("");
    body.querySelectorAll("[data-edit]").forEach(function(b){b.addEventListener("click",function(){openAdd(true,monthById[b.dataset.edit]);});});
    body.querySelectorAll("[data-cancel]").forEach(function(b){b.addEventListener("click",function(){cancelLesson(b.dataset.cancel);});});
    body.querySelectorAll("[data-restore]").forEach(function(b){b.addEventListener("click",function(){restoreLesson(monthById[b.dataset.restore]);});});
    body.querySelectorAll("[data-delete]").forEach(function(b){b.addEventListener("click",function(){deleteLesson(b.dataset.delete);});});
  }
  function shiftMonth(d){period.mode="month";var dt=new Date(period.y,period.m+d,1);period.y=dt.getFullYear();period.m=dt.getMonth();renderRecords();}
  function toggleAll(){period.mode=period.mode==="all"?"month":"all";if(period.mode==="month"){period.y=new Date().getFullYear();period.m=new Date().getMonth();}renderRecords();}

  function csvCell(v){v=String(v==null?"":v);return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
  function exportCSV(){
    var rows=allLessons.filter(function(l){
      if(period.mode==="all")return true;
      return l.lesson_date.slice(0,7)===period.y+"-"+pad(period.m+1);
    });
    rows.sort(function(a,b){return (a.lesson_date+(a.start_time||"")).localeCompare(b.lesson_date+(b.start_time||""));});
    var head=["Date","Start","End","Student","Subject","Level","Amount (S$)","Status","Paid","Paid date"];
    var lines=[head.join(",")];
    rows.forEach(function(l){
      lines.push([l.lesson_date,hm(l.start_time),hm(l.end_time),nameById[l.student_id]||"",l.subject||"",l.level||"",
        Number(l.amount).toFixed(2),l.status,l.paid?"Yes":"No",l.paid_date||""].map(csvCell).join(","));
    });
    var csv="\ufeff"+lines.join("\r\n");
    var blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    var url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="Ledger_"+periodLabel().replace(/\s+/g,"-")+".csv";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},4000);
  }

  async function cancelLesson(id){
    if(!confirm("Mark this lesson as cancelled? It won't count toward income or pending."))return;
    var res=await window.sb.from("lessons").update({status:"cancelled",paid:false,paid_date:null}).eq("id",id);
    if(res.error){alert("Couldn't cancel: "+res.error.message);return;}
    load();
  }
  async function restoreLesson(l){
    var status=l.lesson_date>todayISO()?"scheduled":"done";
    var res=await window.sb.from("lessons").update({status:status}).eq("id",l.id);
    if(res.error){alert("Couldn't restore: "+res.error.message);return;}
    load();
  }
  async function deleteLesson(id){
    if(!confirm("Delete this lesson permanently? (Use Cancel instead if you just want to void it.)"))return;
    var res=await window.sb.from("lessons").delete().eq("id",id);
    if(res.error){alert("Couldn't delete: "+res.error.message);return;}
    load();
  }

  // ---------- actions ----------
  // ---- keep invoices in step with payments ----
  // Reuse: if an unpaid invoice already covers these lessons, mark THAT paid.
  // Create: otherwise generate a paid receipt so it can be sent to the parent.
  async function createPaidInvoice(rows){
    if(!profile)return;
    var byStu={};rows.forEach(function(l){(byStu[l.student_id]=byStu[l.student_id]||[]).push(l);});
    var stuIds=Object.keys(byStu),single=stuIds.length===1;
    var names=stuIds.map(function(id){return nameById[id]||"Student";});
    var billTo=single?names[0]:(names.length===2?names[0]+" & "+names[1]:names.join(", "));
    var now=new Date();
    var total=Math.round(rows.reduce(function(t,l){return t+Number(l.amount);},0)*100)/100;
    var slug=single?((names[0]||"").replace(/[^A-Za-z0-9]/g,"").slice(0,8).toUpperCase()||"STUDENT")
                   :(names.map(function(n){return n.replace(/[^A-Za-z0-9]/g,"").slice(0,4);}).join("+").toUpperCase().slice(0,18)||"GROUP");
    var invoiceNo=(profile.invoice_prefix||"INV")+"-"+now.getFullYear()+pad(now.getMonth()+1)+pad(now.getDate())+"-"+slug;
    var sorted=rows.slice().sort(function(a,b){return a.lesson_date.localeCompare(b.lesson_date);});
    if(!single)sorted=sorted.map(function(l){return Object.assign({_who:nameById[l.student_id]||"—"},l);});
    var dstr=now.toLocaleDateString("en-SG",{day:"numeric",month:"short",year:"numeric"});
    var data={biz:profile.business_name||"Tuition",invoiceNo:invoiceNo,dateStr:dstr,paidStr:dstr,
      student:billTo,lessons:sorted,total:total,combined:!single,paid:true,
      payTo:profile.paynow_id?PayNow.normalize(profile.paynow_type,profile.paynow_id):""};
    var html=invoiceHTML(data,"");   // paid receipt — no QR needed
    return window.sb.from("invoices").insert({
      tutor_id:userId,student_id:single?stuIds[0]:null,invoice_no:invoiceNo,
      issued_date:iso(now),total:total,status:"paid",paid_date:todayISO(),
      data:{html:html,title:"Invoice_"+slug+"_"+now.getFullYear()+"-"+pad(now.getMonth()+1)+"-"+pad(now.getDate()),
        students:single?null:stuIds,name:single?null:billTo,lesson_ids:rows.map(function(l){return l.id;})}
    });
  }
  async function syncInvoiceOnPaid(ids){
    var rows=allLessons.filter(function(l){return ids.indexOf(l.id)>-1;});
    if(!rows.length)return;
    var q=await window.sb.from("invoices").select("id,data,status");
    if(q.error)return;
    var match=null;
    (q.data||[]).forEach(function(v){
      if(match)return;
      var lids=(v.data&&v.data.lesson_ids)||null;
      if(!lids||!lids.length)return;
      if(lids.some(function(x){return ids.indexOf(x)>-1;}))match=v;
    });
    if(match){
      if(match.status==="paid")return;              // already settled — nothing to do
      var lids=match.data.lesson_ids;
      var chk=await window.sb.from("lessons").select("id,paid").in("id",lids);
      var got=chk.data||[];
      // only settle the invoice once every lesson on it is paid
      if(got.length&&got.every(function(l){return l.paid;}))
        await window.sb.from("invoices").update({status:"paid",paid_date:todayISO()}).eq("id",match.id);
      return;                       // an invoice exists — never duplicate it
    }
    await createPaidInvoice(rows);
  }
  async function markPaid(ids){
    var res=await window.sb.from("lessons").update({paid:true,paid_date:todayISO()}).in("id",ids);
    if(res.error){alert("Couldn't update: "+res.error.message);return;}
    try{ await syncInvoiceOnPaid(ids); }
    catch(e){ console.warn("Invoice sync skipped:",e); }   // payment still stands
    load();
  }

  function studentOptions(){
    var act=students.filter(function(s){return s.active!==false;});
    $("m-student").innerHTML=act.length?act.map(function(s){return '<option value="'+s.id+'">'+esc(s.name)+"</option>";}).join(""):'<option value="">— add a student first —</option>';
  }
  function splitAmt(rate,s,e,split){var sp=(split&&split>1)?split:1;return Math.round(TL.amount(rate,s,e)/sp*100)/100;}
  function mSplit(){return Math.max(1,parseInt($("m-split").value,10)||1);}
  function recalcCost(){
    var r=parseFloat($("m-rate").value),s=$("m-start").value,e=$("m-end").value;
    $("m-cost").value=(r>=0&&s&&e&&e>s)?TL.sgd(splitAmt(r,s,e,mSplit())):"";
  }
  function prefillFromSlot(){
    var sid=$("m-student").value;
    var slot=slots.find(function(x){return x.student_id===sid;});
    if(!slot){ // no recurring slot for this student — clear slot-derived fields
      ["m-start","m-end","m-rate","m-subject","m-level"].forEach(function(id){$(id).value="";});
      $("m-split").value="1"; recalcCost(); return;
    }
    $("m-rate").value=slot.rate!=null?slot.rate:"";
    $("m-split").value=slot.split||1;
    $("m-start").value=hm(slot.start_time);
    $("m-end").value=hm(slot.end_time);
    $("m-subject").value=slot.subject||"";
    $("m-level").value=slot.level||"";
    recalcCost();
  }
  function openAdd(open, lesson){
    $("modal").classList.toggle("on",open);
    $("m-msg").textContent="";$("m-msg").className="msg";
    if(!open)return;
    if(lesson){
      editLessonId=lesson.id;
      $("m-title").textContent="Postpone / edit lesson";$("m-save").textContent="Save changes";
      $("m-student").value=lesson.student_id;
      $("m-date").value=lesson.lesson_date;
      $("m-subject").value=lesson.subject||"";$("m-level").value=lesson.level||"";
      $("m-start").value=hm(lesson.start_time);$("m-end").value=hm(lesson.end_time);
      $("m-rate").value=lesson.rate;$("m-split").value=lesson.split||1;$("m-paid").checked=!!lesson.paid;$("m-postponed").checked=!!lesson.postponed;
      recalcCost();
    }else{
      editLessonId=null;
      $("m-title").textContent="Add lesson";$("m-save").textContent="Save lesson";
      $("m-date").value=todayISO();$("m-paid").checked=false;$("m-postponed").checked=false;
      ["m-subject","m-level","m-start","m-end","m-rate","m-cost"].forEach(function(id){$(id).value="";});
      $("m-split").value="1";
      prefillFromSlot();
    }
  }
  async function saveLesson(){
    var msg=$("m-msg");
    var sid=$("m-student").value,date=$("m-date").value,start=$("m-start").value,end=$("m-end").value,rate=parseFloat($("m-rate").value),split=mSplit();
    if(!sid){msg.textContent="Pick a student.";msg.className="msg err";return;}
    if(!date){msg.textContent="Pick a date.";msg.className="msg err";return;}
    if(!start||!end||end<=start){msg.textContent="Check the start/end times.";msg.className="msg err";return;}
    if(!(rate>=0)){msg.textContent="Enter a rate.";msg.className="msg err";return;}
    var paid=$("m-paid").checked;
    var fields={student_id:sid,lesson_date:date,start_time:start,end_time:end,
      subject:$("m-subject").value.trim()||null,level:$("m-level").value.trim()||null,rate:rate,split:split,amount:splitAmt(rate,start,end,split),
      status:date>todayISO()?"scheduled":"done",paid:paid,paid_date:paid?date:null,postponed:$("m-postponed").checked};
    $("m-save").disabled=true;
    var res=editLessonId
      ? await window.sb.from("lessons").update(fields).eq("id",editLessonId)
      : await window.sb.from("lessons").insert(Object.assign({tutor_id:userId},fields));
    $("m-save").disabled=false;
    if(res.error){msg.textContent=res.error.message;msg.className="msg err";return;}
    openAdd(false);load();
  }
  async function generateMonth(){
    if(!slots.length){alert("No recurring slots to generate from. Add them on the Planner first.");return;}
    var now=new Date(),base=new Date(now.getFullYear(),now.getMonth()+genMonthOff,1),y=base.getFullYear(),m=base.getMonth();
    var last=new Date(y,m+1,0).getDate();
    var mStart=iso(new Date(y,m,1)),mEnd=iso(new Date(y,m,last));
    var mo=["January","February","March","April","May","June","July","August","September","October","November","December"][m];
    var ex=await window.sb.from("lessons").select("student_id,lesson_date,start_time").gte("lesson_date",mStart).lte("lesson_date",mEnd);
    var seen={};(ex.data||[]).forEach(function(l){seen[l.student_id+"|"+l.lesson_date+"|"+hm(l.start_time)]=1;});
    var rows=[];
    for(var day=1;day<=last;day++){
      var d=new Date(y,m,day),wd=(d.getDay()+6)%7,di=iso(d);
      slots.forEach(function(s){
        if(s.weekday!==wd)return;
        if(seen[s.student_id+"|"+di+"|"+hm(s.start_time)])return;
        rows.push({tutor_id:userId,student_id:s.student_id,slot_id:s.id,lesson_date:di,start_time:s.start_time,end_time:s.end_time,subject:s.subject,level:s.level,rate:s.rate,split:s.split||1,amount:splitAmt(s.rate,hm(s.start_time),hm(s.end_time),s.split),status:di>todayISO()?"scheduled":"done",paid:false});
      });
    }
    if(!rows.length){alert(mo+" is already fully logged — nothing new to add.");return;}
    if(!confirm("Add "+rows.length+" lessons to fill every recurring slot across "+mo+"? Already-logged lessons are skipped."))return;
    var res=await window.sb.from("lessons").insert(rows);
    if(res.error){alert("Couldn't generate: "+res.error.message);return;}
    load();
  }
  async function generateWeek(){
    if(!slots.length){alert("No recurring slots to generate from. Add them on the Planner first.");return;}
    var mon=mondayOf(new Date());mon.setDate(mon.getDate()+genWeekOff*7);
    var weekStart=iso(mon),end=new Date(mon);end.setDate(mon.getDate()+6);var weekEnd=iso(end);
    var ex=await window.sb.from("lessons").select("student_id,lesson_date,start_time").gte("lesson_date",weekStart).lte("lesson_date",weekEnd);
    var seen={};(ex.data||[]).forEach(function(l){seen[l.student_id+"|"+l.lesson_date+"|"+hm(l.start_time)]=1;});
    var rows=[];
    slots.forEach(function(s){
      var d=new Date(mon);d.setDate(mon.getDate()+s.weekday);var di=iso(d);
      if(seen[s.student_id+"|"+di+"|"+hm(s.start_time)])return;
      rows.push({tutor_id:userId,student_id:s.student_id,slot_id:s.id,lesson_date:di,start_time:s.start_time,end_time:s.end_time,subject:s.subject,level:s.level,rate:s.rate,split:s.split||1,amount:splitAmt(s.rate,hm(s.start_time),hm(s.end_time),s.split),status:di>todayISO()?"scheduled":"done",paid:false});
    });
    if(!rows.length){alert("This week is already logged — nothing new to add.");return;}
    if(!confirm("Add "+rows.length+" lessons for "+weekStart+" to "+weekEnd+"?"))return;
    var res=await window.sb.from("lessons").insert(rows);
    if(res.error){alert("Couldn't generate: "+res.error.message);return;}
    load();
  }

  // ---------- invoice ----------
  function invoiceHTML(d, qrUrl){
    var combined=!!d.combined;
    var rows=d.lessons.map(function(l){
      var desc=(l.subject?esc(l.subject):"Lesson")+(l.level?' <span style="color:#6b7280">· '+esc(l.level)+'</span>':"");
      return "<tr><td>"+prettyDate(l.lesson_date)+"</td>"+
        (combined?"<td>"+esc(l._who||"")+"</td>":"")+
        "<td>"+desc+'</td><td class="r">'+TL.sgd(l.amount)+"</td></tr>";
    }).join("");
    return '<div class="invoice">'+
      '<div class="inv-head"><div class="inv-biz">'+esc(d.biz)+'<small>Invoice</small></div>'+
        '<div class="inv-meta"><b>'+esc(d.invoiceNo)+'</b><br>'+d.dateStr+'</div></div>'+
      '<div class="inv-to"><span class="lbl">Bill to</span><br><b>'+esc(d.student)+'</b></div>'+
      '<table class="inv-table"><thead><tr><th>Date</th>'+(combined?"<th>Student</th>":"")+'<th>Description</th><th class="r">Amount</th></tr></thead>'+
        '<tbody>'+rows+'</tbody></table>'+
      '<div class="inv-total"><span>'+(d.paid?"Total paid":"Total due")+'</span><span>'+TL.sgd(d.total)+'</span></div>'+
      (d.paid
        ? '<div class="inv-pay"><div><div class="pn-h"><span class="pn-dot"></span>Paid</div>'+
          '<div class="pn-sub">Received with thanks'+(d.paidStr?" on <b>"+esc(d.paidStr)+"</b>":"")+'.<br>'+
          (d.payTo?'Paid to <b>'+esc(d.payTo)+'</b><br>':'')+'Ref: <b>'+esc(d.invoiceNo)+'</b></div></div></div>'
        : '<div class="inv-pay"><img src="'+qrUrl+'" alt="PayNow QR">'+
          '<div><div class="pn-h"><span class="pn-dot"></span>PayNow</div>'+
          '<div class="pn-sub">Scan with any Singapore banking app to pay.<br>'+
          'Pays to <b>'+esc(d.payTo)+'</b><br>Ref: <b>'+esc(d.invoiceNo)+'</b></div></div></div>')+
      '</div>';
  }

  // Load the QR library on demand, trying two CDNs (resilient to a blocked/missing script tag)
  var qrLoading=null;
  function loadQR(){
    if(window.QRCode&&window.QRCode.toDataURL)return Promise.resolve();
    if(qrLoading)return qrLoading;
    var urls=["assets/js/qrlib.js",
              "https://cdn.jsdelivr.net/npm/qrcode@1.4.4/build/qrcode.min.js",
              "https://unpkg.com/qrcode@1.4.4/build/qrcode.min.js"];
    qrLoading=new Promise(function(resolve,reject){
      var i=0;
      (function next(){
        if(window.QRCode&&window.QRCode.toDataURL)return resolve();
        if(i>=urls.length)return reject(new Error("blocked"));
        var s=document.createElement("script");
        s.src=urls[i++];
        s.onload=function(){(window.QRCode&&window.QRCode.toDataURL)?resolve():next();};
        s.onerror=next;
        document.head.appendChild(s);
      })();
    });
    return qrLoading;
  }

  async function openInvoice(studentId){
    if(!profile){
      alert("Couldn't read your profile. Make sure you've run db/migration_paynow.sql in Supabase.");
      return;
    }
    if(!profile.paynow_id){
      if(confirm("No PayNow details saved yet. Open Settings to add them now?")) location.href="settings.html";
      return;
    }
    var lessons=(outGroups[studentId]||[]).slice().sort(function(a,b){return a.lesson_date.localeCompare(b.lesson_date);});
    if(!lessons.length)return;
    try{ await loadQR(); }
    catch(e){
      alert("The QR code library is being blocked (ad-blocker or network). Allow cdn.jsdelivr.net or unpkg.com, then try again.");
      return;
    }
    var total=Math.round(lessons.reduce(function(t,l){return t+Number(l.amount);},0)*100)/100;
    var student=nameById[studentId]||"Student";
    var now=new Date();
    window._invTitle="Invoice_"+(student.replace(/[^A-Za-z0-9]+/g,"")||"Student")+"_"+now.getFullYear()+"-"+pad(now.getMonth()+1)+"-"+pad(now.getDate());
    var slug=student.replace(/[^A-Za-z0-9]/g,"").slice(0,8).toUpperCase();
    var invoiceNo=(profile.invoice_prefix||"INV")+"-"+now.getFullYear()+pad(now.getMonth()+1)+pad(now.getDate())+"-"+slug;
    var payTo=PayNow.normalize(profile.paynow_type,profile.paynow_id);
    var data={biz:profile.business_name||"Tuition",invoiceNo:invoiceNo,
      dateStr:now.toLocaleDateString("en-SG",{day:"numeric",month:"short",year:"numeric"}),
      student:student,lessons:lessons,total:total,payTo:payTo};
    try{
      var payload=PayNow.build({type:profile.paynow_type,id:profile.paynow_id,amount:total,name:profile.business_name||"Tuition",reference:invoiceNo});
      window.QRCode.toDataURL(payload,{margin:1,width:300},function(err,url){
        if(err){alert("Couldn't generate QR: "+(err.message||err));return;}
        window._invHTML=invoiceHTML(data,url);
        window._invMeta={studentId:studentId,invoiceNo:invoiceNo,total:total,issuedDate:iso(now),month:monthsLabel(lessons),lessonIds:lessons.map(function(l){return l.id;})};
        $("inv-body").innerHTML=window._invHTML;
        $("inv-save").textContent="Save to app";$("inv-save").disabled=false;
        $("inv-backdrop").classList.add("on");
      });
    }catch(e){ alert("Invoice error: "+(e.message||e)); }
  }

  async function openInvoiceMany(ids){
    if(!profile){alert("Couldn't read your profile. Make sure you've run db/migration_paynow.sql in Supabase.");return;}
    if(!profile.paynow_id){if(confirm("No PayNow details saved yet. Open Settings to add them now?"))location.href="settings.html";return;}
    var all=[];
    ids.forEach(function(id){(outGroups[id]||[]).forEach(function(l){all.push(Object.assign({_who:nameById[id]||"—"},l));});});
    all.sort(function(a,b){return a.lesson_date.localeCompare(b.lesson_date)||String(a._who).localeCompare(String(b._who));});
    if(!all.length)return;
    try{ await loadQR(); }
    catch(e){ alert("The QR code library is being blocked (ad-blocker or network). Allow cdn.jsdelivr.net or unpkg.com, then try again."); return; }
    var total=Math.round(all.reduce(function(t,l){return t+Number(l.amount);},0)*100)/100;
    var names=ids.map(function(id){return nameById[id]||"Student";});
    var billTo=names.length===2?names[0]+" & "+names[1]:names.join(", ");
    var now=new Date();
    var slug=names.map(function(n){return n.replace(/[^A-Za-z0-9]/g,"").slice(0,4);}).join("+").toUpperCase().slice(0,18)||"GROUP";
    window._invTitle="Invoice_"+slug+"_"+now.getFullYear()+"-"+pad(now.getMonth()+1)+"-"+pad(now.getDate());
    var invoiceNo=(profile.invoice_prefix||"INV")+"-"+now.getFullYear()+pad(now.getMonth()+1)+pad(now.getDate())+"-"+slug;
    var payTo=PayNow.normalize(profile.paynow_type,profile.paynow_id);
    var data={biz:profile.business_name||"Tuition",invoiceNo:invoiceNo,
      dateStr:now.toLocaleDateString("en-SG",{day:"numeric",month:"short",year:"numeric"}),
      student:billTo,lessons:all,total:total,payTo:payTo,combined:true};
    try{
      var payload=PayNow.build({type:profile.paynow_type,id:profile.paynow_id,amount:total,name:profile.business_name||"Tuition",reference:invoiceNo});
      window.QRCode.toDataURL(payload,{margin:1,width:300},function(err,url){
        if(err){alert("Couldn't generate QR: "+(err.message||err));return;}
        window._invHTML=invoiceHTML(data,url);
        window._invMeta={studentId:null,students:ids,name:billTo,invoiceNo:invoiceNo,total:total,issuedDate:iso(now),month:monthsLabel(all),lessonIds:all.map(function(l){return l.id;})};
        $("inv-body").innerHTML=window._invHTML;
        $("inv-save").textContent="Save to app";$("inv-save").disabled=false;
        $("inv-backdrop").classList.add("on");
      });
    }catch(e){ alert("Invoice error: "+(e.message||e)); }
  }

  async function saveInvoice(){
    if(!window._invHTML||!window._invMeta)return;
    var m=window._invMeta,b=$("inv-save");
    b.disabled=true;b.textContent="Saving…";
    var res=await window.sb.from("invoices").insert({
      tutor_id:userId,student_id:m.studentId,invoice_no:m.invoiceNo,
      issued_date:m.issuedDate,total:m.total,status:"issued",
      data:{html:window._invHTML,title:window._invTitle||("Invoice_"+m.invoiceNo),
        students:m.students||null,name:m.name||null,lesson_ids:m.lessonIds||null}
    });
    b.disabled=false;
    if(res.error){b.textContent="Save to app";alert("Couldn't save invoice: "+res.error.message);return;}
    b.textContent="Saved ✓";setTimeout(function(){b.textContent="Save to app";},1600);
  }

  // Lazily load html2canvas (self-hosted copy first, then CDNs) for rendering the invoice to an image.
  function loadH2C(){
    if(window.html2canvas)return Promise.resolve();
    var urls=["assets/js/html2canvas.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
      "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
      "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js"];
    return new Promise(function(resolve,reject){
      (function tryNext(i){
        if(i>=urls.length){reject(new Error("could not load the image library"));return;}
        var s=document.createElement("script");s.src=urls[i];
        s.onload=function(){window.html2canvas?resolve():tryNext(i+1);};
        s.onerror=function(){tryNext(i+1);};
        document.head.appendChild(s);
      })(0);
    });
  }
  function invoiceMsg(m){
    var isCombined=!m.studentId;
    var vars={name:isCombined?(m.name||""):(recipientById[m.studentId]||nameById[m.studentId]||""),
      student:isCombined?(m.name||""):(nameById[m.studentId]||""),business:(profile&&profile.business_name)||"T-Leng Tuition",
      amount:TL.sgd(m.total),count:"",invoice:m.invoiceNo,paynow:(profile&&profile.paynow_id)||"",
      month:m.month||"",date:prettyDate(m.issuedDate),year:(m.issuedDate||"").slice(0,4)};
    var tpl=(profile&&profile.invoice_message)||DEFAULT_INVOICE;
    return fillTemplate(tpl,vars);
  }
  async function shareInvoice(){
    if(!window._invHTML||!window._invMeta)return;
    var m=window._invMeta,b=$("inv-wa"),msg=invoiceMsg(m);
    b.disabled=true;b.textContent="Preparing…";
    try{
      await loadH2C();
      var node=$("inv-body").firstElementChild||$("inv-body");
      var canvas=await window.html2canvas(node,{backgroundColor:"#ffffff",scale:2,useCORS:true});
      canvas.toBlob(async function(blob){
        b.disabled=false;b.textContent="Send on WhatsApp";
        if(!blob){alert("Couldn't render the invoice image.");return;}
        var file=new File([blob],(window._invTitle||("Invoice_"+m.invoiceNo))+".png",{type:"image/png"});
        // Best path: native share sheet with the image attached (mobile)
        if(navigator.canShare&&navigator.canShare({files:[file]})){
          try{ await navigator.share({files:[file],text:msg}); return; }
          catch(e){ if(e&&e.name==="AbortError")return; /* otherwise fall through */ }
        }
        // Fallback (desktop / unsupported): download image, open WhatsApp with text to attach manually
        var url=URL.createObjectURL(blob),a=document.createElement("a");
        a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
        setTimeout(function(){URL.revokeObjectURL(url);},5000);
        var num=waNumber(contactById[m.studentId]);
        window.open("https://wa.me/"+num+"?text="+encodeURIComponent(msg),"_blank");
        alert("Your device can't attach files to WhatsApp automatically.\n\nThe invoice image was just downloaded — attach it in the WhatsApp chat that opened.");
      },"image/png");
    }catch(e){
      b.disabled=false;b.textContent="Send on WhatsApp";
      alert("Couldn't prepare the invoice image: "+(e.message||e)+"\n\nIf this keeps happening, the image library may be blocked — tell me and I'll set up a self-hosted copy.");
    }
  }

  function printInvoice(){
    if(!window._invHTML)return;
    var css=document.querySelector('link[rel="stylesheet"]').href;
    var w=window.open("","_blank","width=720,height=900");
    if(!w){alert("Allow pop-ups to print, or use your browser's print on this page.");return;}
    var title=esc(window._invTitle||"Invoice");
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+title+'</title>'+
      '<link rel="stylesheet" href="'+css+'"><style>body{background:#fff;padding:28px;max-width:640px;margin:auto}</style></head>'+
      '<body>'+window._invHTML+'</body></html>');
    w.document.close();
    w.onload=function(){ setTimeout(function(){ w.focus(); w.print(); }, 250); };
  }

  // ---------- load ----------
  async function load(){
    await TL.promotePastLessons();
    var pr=await window.sb.from("profiles").select("business_name,paynow_type,paynow_id,invoice_prefix,reminder_message,invoice_message").eq("id",userId).single();
    profile=pr.error?null:pr.data;

    var st=await window.sb.from("students").select("id,name,active,contact,recipient_name").order("name");
    students=st.data||[];nameById={};contactById={};recipientById={};householdBy={};students.forEach(function(s){nameById[s.id]=s.name;contactById[s.id]=s.contact;recipientById[s.id]=s.recipient_name;householdBy[s.id]=(function(c){var d=(c||"").replace(/\D/g,"");if(d.length===10&&d.slice(0,2)==="65")d=d.slice(2);return d||null;})(s.contact);});
    studentOptions();

    var sl=await window.sb.from("recurring_slots").select("id,student_id,weekday,start_time,end_time,subject,level,rate,split").eq("active",true);
    slots=sl.data||[];

    var ls=await window.sb.from("lessons").select("id,student_id,lesson_date,start_time,end_time,subject,level,rate,split,amount,paid,paid_date,status,postponed");
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

    var projected=month.filter(function(l){return l.status!=="cancelled";}).reduce(function(t,l){return t+Number(l.amount);},0);
    $("k-projected").textContent=TL.sgd(projected);

    renderOutstanding(unpaid);
    allLessons=lessons;fillSubjects(allLessons.map(function(l){return l.subject;}).concat(slots.map(function(s){return s.subject;})));fillRecFilters();
    renderRecords();
  }

  function init(user){
    userId=user.id;
    var on=function(id,evt,fn){var el=$(id);if(el)el.addEventListener(evt,fn);};
    on("add-btn","click",function(){openAdd(true);});
    on("gen-btn","click",generateWeek);
    on("gen-month-btn","click",generateMonth);
    on("wk-prev","click",function(){stepWeek(-1);});
    on("wk-next","click",function(){stepWeek(1);});
    on("mo-prev","click",function(){stepMonth(-1);});
    on("mo-next","click",function(){stepMonth(1);});
    on("gen-custom-btn","click",openCustom);
    on("cr-cancel","click",closeCustom);
    on("cr-modal","click",function(e){if(e.target===$("cr-modal"))closeCustom();});
    on("cr-save","click",generateRange);
    setGenLabel();
    on("m-cancel","click",function(){openAdd(false);});
    on("modal","click",function(e){if(e.target===$("modal"))openAdd(false);});
    on("m-save","click",saveLesson);
    on("m-student","change",prefillFromSlot);
    ["m-rate","m-split","m-start","m-end"].forEach(function(id){on(id,"input",recalcCost);});
    on("inv-close","click",function(){$("inv-backdrop").classList.remove("on");});
    on("inv-backdrop","click",function(e){if(e.target===$("inv-backdrop"))$("inv-backdrop").classList.remove("on");});
    on("inv-print","click",printInvoice);
    on("inv-wa","click",shareInvoice);
    on("inv-save","click",saveInvoice);
    on("prev-m","click",function(){shiftMonth(-1);});
    on("next-m","click",function(){shiftMonth(1);});
    on("all-time","click",toggleAll);
    on("csv-btn","click",exportCSV);
    on("rec-search","input",renderRecords);
    ["rec-student","rec-subject","rec-level","rec-status"].forEach(function(id){on(id,"change",renderRecords);});
    on("rec-clear","click",clearRecFilters);
    load();
  }
  TL.requireAuth("ledger",init);
})();