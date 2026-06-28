// Students — roster with add, EDIT, MERGE (de-dupe safely), and remove.
(function () {
  var userId=null, students=[], editingId=null, mergeSource=null;
  var $=function(id){return document.getElementById(id);};
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

  // ---------- add / edit ----------
  function openModal(open, st){
    $("modal").classList.toggle("on",open);
    $("m-msg").textContent="";$("m-msg").className="msg";
    if(!open)return;
    if(st){
      editingId=st.id;
      $("m-title").textContent="Edit student";$("m-save").textContent="Save changes";
      $("m-name").value=st.name||"";$("m-kind").value=st.kind||"individual";
      $("m-level").value=st.level||"";$("m-contact").value=st.contact||"";$("m-notes").value=st.notes||"";
    }else{
      editingId=null;
      $("m-title").textContent="Add student";$("m-save").textContent="Save student";
      ["m-name","m-level","m-contact","m-notes"].forEach(function(id){$(id).value="";});
      $("m-kind").value="individual";
    }
    $("m-name").focus();
  }
  async function save(){
    var name=$("m-name").value.trim(),msg=$("m-msg");
    if(!name){msg.textContent="Give the student a name.";msg.className="msg err";return;}
    var fields={name:name,kind:$("m-kind").value,
      level:$("m-level").value.trim()||null,contact:$("m-contact").value.trim()||null,
      notes:$("m-notes").value.trim()||null};
    $("m-save").disabled=true;
    var res=editingId
      ? await window.sb.from("students").update(fields).eq("id",editingId)
      : await window.sb.from("students").insert(Object.assign({tutor_id:userId},fields));
    $("m-save").disabled=false;
    if(res.error){msg.textContent=res.error.message;msg.className="msg err";return;}
    openModal(false);load();
  }

  // ---------- merge ----------
  function openMerge(open, source){
    $("merge-modal").classList.toggle("on",open);
    $("mg-msg").textContent="";$("mg-msg").className="msg";
    if(!open)return;
    mergeSource=source;
    $("mg-source").textContent=source.name;
    $("mg-target").innerHTML=students.filter(function(s){return s.id!==source.id;})
      .map(function(s){return '<option value="'+s.id+'">'+esc(s.name)+"</option>";}).join("");
  }
  async function doMerge(){
    var target=$("mg-target").value,msg=$("mg-msg");
    if(!target){msg.textContent="Pick a student to merge into.";msg.className="msg err";return;}
    $("mg-save").disabled=true;
    try{
      for(var i=0;i<3;i++){
        var table=["lessons","recurring_slots","exams"][i];
        var r=await window.sb.from(table).update({student_id:target}).eq("student_id",mergeSource.id);
        if(r.error)throw r.error;
      }
      var del=await window.sb.from("students").delete().eq("id",mergeSource.id);
      if(del.error)throw del.error;
    }catch(e){
      $("mg-save").disabled=false;
      msg.textContent="Merge failed: "+(e.message||e);msg.className="msg err";return;
    }
    $("mg-save").disabled=false;
    openMerge(false);load();
  }

  // ---------- remove ----------
  async function remove(id,name){
    if(!confirm("Remove "+name+"?\n\nThis permanently DELETES their lessons, slots and exams too. "+
                "To combine duplicates without losing history, use Merge instead."))return;
    var res=await window.sb.from("students").delete().eq("id",id);
    if(res.error){alert("Couldn't remove: "+res.error.message);return;}
    load();
  }
  async function setActive(id,active){
    var res=await window.sb.from("students").update({active:active}).eq("id",id);
    if(res.error){alert("Couldn't update: "+res.error.message);return;}
    load();
  }

  // ---------- list ----------
  function rowHtml(r,active){
    var acts=active
      ? '<button class="tact" data-edit="'+r.id+'">Edit</button>'+
        '<button class="tact warn" data-merge="'+r.id+'">Merge</button>'+
        '<button class="tact" data-off="'+r.id+'">Discontinue</button>'+
        '<button class="tact del" data-del="'+r.id+'">Remove</button>'
      : '<button class="tact" data-edit="'+r.id+'">Edit</button>'+
        '<button class="tact" data-on="'+r.id+'">Reactivate</button>'+
        '<button class="tact del" data-del="'+r.id+'">Remove</button>';
    return '<tr class="'+(active?"":"inactive")+'" data-id="'+r.id+'">'+
      '<td class="name" data-label="Name">'+esc(r.name)+"</td>"+
      '<td data-label="Type"><span class="kind-tag">'+esc(r.kind)+"</span></td>"+
      '<td data-label="Level">'+(r.level?esc(r.level):'<span class="muted">—</span>')+"</td>"+
      '<td data-label="Contact">'+(r.contact?esc(r.contact):'<span class="muted">—</span>')+"</td>"+
      '<td class="acts">'+acts+"</td></tr>";
  }
  function wire(scope){
    function find(id){return students.filter(function(s){return s.id===id;})[0];}
    scope.querySelectorAll("[data-edit]").forEach(function(b){b.addEventListener("click",function(){openModal(true,find(b.dataset.edit));});});
    scope.querySelectorAll("[data-merge]").forEach(function(b){b.addEventListener("click",function(){openMerge(true,find(b.dataset.merge));});});
    scope.querySelectorAll("[data-off]").forEach(function(b){b.addEventListener("click",function(){setActive(b.dataset.off,false);});});
    scope.querySelectorAll("[data-on]").forEach(function(b){b.addEventListener("click",function(){setActive(b.dataset.on,true);});});
    scope.querySelectorAll("[data-del]").forEach(function(b){b.addEventListener("click",function(){remove(b.dataset.del,find(b.dataset.del).name);});});
  }
  async function load(){
    var res=await window.sb.from("students").select("id,name,kind,level,contact,notes,active").order("name");
    if(res.error){$("s-count").textContent="Couldn't load students: "+res.error.message;return;}
    students=res.data||[];
    var act=students.filter(function(s){return s.active!==false;});
    var off=students.filter(function(s){return s.active===false;});
    $("s-count").textContent=act.length?act.length+(act.length===1?" active student":" active students"):"";

    var table=$("s-table"),empty=$("s-empty"),body=$("s-body");
    if(!act.length){table.style.display="none";empty.style.display="block";}
    else{empty.style.display="none";table.style.display="table";body.innerHTML=act.map(function(r){return rowHtml(r,true);}).join("");wire(body);}

    if(off.length){
      $("disc-title").style.display="";$("disc-card").style.display="";
      $("disc-hint").textContent=off.length+" hidden from slot & lesson pickers";
      $("disc-body").innerHTML=off.map(function(r){return rowHtml(r,false);}).join("");wire($("disc-body"));
    }else{$("disc-title").style.display="none";$("disc-card").style.display="none";}
  }

  function init(user){
    userId=user.id;
    $("add-btn").addEventListener("click",function(){openModal(true,null);});
    $("m-cancel").addEventListener("click",function(){openModal(false);});
    $("modal").addEventListener("click",function(e){if(e.target===$("modal"))openModal(false);});
    $("m-save").addEventListener("click",save);
    $("m-name").addEventListener("keydown",function(e){if(e.key==="Enter")save();});
    $("mg-cancel").addEventListener("click",function(){openMerge(false);});
    $("merge-modal").addEventListener("click",function(e){if(e.target===$("merge-modal"))openMerge(false);});
    $("mg-save").addEventListener("click",doMerge);
    load();
  }
  TL.requireAuth("students",init);
})();