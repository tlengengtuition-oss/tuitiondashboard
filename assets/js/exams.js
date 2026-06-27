// Exams — manage assessments: add, edit, delete; upcoming (with countdown) vs past.
(function () {
  var userId=null, students=[], nameById={}, exams=[], editingId=null;
  var $=function(id){return document.getElementById(id);};
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function pad(n){return (n<10?"0":"")+n;}
  function todayISO(){var d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
  function prettyDate(s){if(!s)return"—";var p=s.split("-");var mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];return (+p[2])+" "+mo[(+p[1])-1]+" "+p[0];}
  function daysAway(s){var now=new Date();now.setHours(0,0,0,0);return Math.round((new Date(s+"T00:00:00")-now)/86400000);}

  function studentOptions(){
    var act=students.filter(function(s){return s.active!==false;});
    $("m-student").innerHTML=act.length?act.map(function(s){return '<option value="'+s.id+'">'+esc(s.name)+"</option>";}).join(""):'<option value="">— add a student first —</option>';
  }

  function openModal(open, ex){
    $("modal").classList.toggle("on",open);
    $("m-msg").textContent="";$("m-msg").className="msg";
    if(!open)return;
    if(ex){
      editingId=ex.id;
      $("m-title").textContent="Edit exam";$("m-save").textContent="Save changes";
      $("m-student").value=ex.student_id;$("m-date").value=ex.exam_date||"";$("m-type").value=ex.assessment_type||"";
      $("m-subject").value=ex.subject||"";$("m-topics").value=ex.topics||"";$("m-remarks").value=ex.remarks||"";
    }else{
      editingId=null;
      $("m-title").textContent="Add exam";$("m-save").textContent="Save exam";
      ["m-type","m-subject","m-topics","m-remarks"].forEach(function(id){$(id).value="";});
      $("m-date").value="";
    }
  }

  async function save(){
    var msg=$("m-msg");
    var sid=$("m-student").value,date=$("m-date").value;
    if(!sid){msg.textContent="Pick a student.";msg.className="msg err";return;}
    if(!date){msg.textContent="Set an exam date.";msg.className="msg err";return;}
    var fields={student_id:sid,exam_date:date,
      assessment_type:$("m-type").value.trim()||null,
      subject:$("m-subject").value.trim()||null,
      topics:$("m-topics").value.trim()||null,
      remarks:$("m-remarks").value.trim()||null};
    $("m-save").disabled=true;
    var res=editingId
      ? await window.sb.from("exams").update(fields).eq("id",editingId)
      : await window.sb.from("exams").insert(Object.assign({tutor_id:userId},fields));
    $("m-save").disabled=false;
    if(res.error){msg.textContent=res.error.message;msg.className="msg err";return;}
    openModal(false);load();
  }

  async function del(id){
    if(!confirm("Delete this exam?"))return;
    var res=await window.sb.from("exams").delete().eq("id",id);
    if(res.error){alert("Couldn't delete: "+res.error.message);return;}
    load();
  }

  function row(ex, upcoming){
    var acts='<button class="tact" data-edit="'+ex.id+'">Edit</button><button class="tact del" data-del="'+ex.id+'">Delete</button>';
    var base="<td>"+prettyDate(ex.exam_date)+'</td><td class="name">'+esc(nameById[ex.student_id]||"—")+"</td>"+
      "<td>"+( (ex.assessment_type?'<span class="kind-tag">'+esc(ex.assessment_type)+'</span> ':'') + (ex.subject?esc(ex.subject):(ex.assessment_type?'':'<span class="muted">—</span>')) )+"</td>"+
      "<td>"+(ex.topics?esc(ex.topics):'<span class="muted">—</span>')+"</td>";
    if(upcoming){
      var d=daysAway(ex.exam_date);
      var soon=d<=14;
      base+='<td><span class="days'+(soon?" soon":"")+'" style="display:inline-block;min-width:46px"><b>'+d+'</b><small>'+(d===1?"day":"days")+'</small></span></td>';
    }
    return '<tr>'+base+'<td class="acts">'+acts+'</td></tr>';
  }

  function wire(scope){
    function find(id){return exams.filter(function(e){return e.id===id;})[0];}
    scope.querySelectorAll("[data-edit]").forEach(function(b){b.addEventListener("click",function(){openModal(true,find(b.dataset.edit));});});
    scope.querySelectorAll("[data-del]").forEach(function(b){b.addEventListener("click",function(){del(b.dataset.del);});});
  }

  async function load(){
    var st=await window.sb.from("students").select("id,name,active").order("name");
    students=st.data||[];nameById={};students.forEach(function(s){nameById[s.id]=s.name;});
    studentOptions();

    var res=await window.sb.from("exams").select("id,student_id,exam_date,assessment_type,subject,topics,remarks");
    if(res.error){$("x-count").textContent="Couldn't load exams: "+res.error.message;return;}
    exams=res.data||[];
    var today=todayISO();
    var up=exams.filter(function(e){return e.exam_date&&e.exam_date>=today;}).sort(function(a,b){return a.exam_date.localeCompare(b.exam_date);});
    var past=exams.filter(function(e){return !e.exam_date||e.exam_date<today;}).sort(function(a,b){return (b.exam_date||"").localeCompare(a.exam_date||"");});

    $("x-count").textContent=exams.length?exams.length+(exams.length===1?" exam":" exams"):"";
    $("up-hint").textContent=up.length?up.length+" ahead":"";

    var upTable=$("up-table"),upEmpty=$("up-empty");
    if(!up.length){upTable.style.display="none";upEmpty.style.display="block";}
    else{upEmpty.style.display="none";upTable.style.display="table";$("up-body").innerHTML=up.map(function(e){return row(e,true);}).join("");wire($("up-body"));}

    if(past.length){
      $("past-title").style.display="";$("past-card").style.display="";
      $("past-body").innerHTML=past.map(function(e){return row(e,false);}).join("");wire($("past-body"));
    }else{$("past-title").style.display="none";$("past-card").style.display="none";}
  }

  function init(user){
    userId=user.id;
    $("add-btn").addEventListener("click",function(){openModal(true,null);});
    $("m-cancel").addEventListener("click",function(){openModal(false);});
    $("modal").addEventListener("click",function(e){if(e.target===$("modal"))openModal(false);});
    $("m-save").addEventListener("click",save);
    load();
  }
  TL.requireAuth("exams",init);
})();