// Invoices — list saved invoices; re-view, re-print, mark paid, delete.
(function () {
  var userId=null, nameById={}, invoices=[], current=null, fFrom="", fTo="", proofTarget=null;
  var $=function(id){return document.getElementById(id);};
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function prettyDate(s){if(!s)return"—";var p=s.split("-");var mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];return (+p[2])+" "+mo[(+p[1])-1]+" "+p[0];}

  function studentName(inv){
    if(inv.student_id&&nameById[inv.student_id])return nameById[inv.student_id];
    // fall back to the snapshot title: Invoice_Name_YYYY-MM-DD
    var t=(inv.data&&inv.data.title)||"";
    var parts=t.split("_");
    return parts.length>=3?parts[1]:"—";
  }

  function openView(inv){
    current=inv;
    $("inv-body").innerHTML=(inv.data&&inv.data.html)||"<p>Snapshot unavailable.</p>";
    $("inv-backdrop").classList.add("on");
  }
  function closeView(){$("inv-backdrop").classList.remove("on");current=null;}

  function printInvoice(){
    if(!current||!current.data||!current.data.html)return;
    var css=document.querySelector('link[rel="stylesheet"]').href;
    var title=esc(current.data.title||("Invoice_"+current.invoice_no));
    var w=window.open("","_blank","width=720,height=900");
    if(!w){alert("Allow pop-ups to print, or use your browser's print on this page.");return;}
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+title+'</title>'+
      '<link rel="stylesheet" href="'+css+'"><style>body{background:#fff;padding:28px;max-width:640px;margin:auto}</style></head>'+
      '<body>'+current.data.html+'</body></html>');
    w.document.close();
    w.onload=function(){ setTimeout(function(){ w.focus(); w.print(); }, 250); };
  }

  function todayISO(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
  async function togglePaid(inv){
    var next=inv.status==="paid"?"issued":"paid", pd=next==="paid"?todayISO():null;
    var res=await window.sb.from("invoices").update({status:next,paid_date:pd}).eq("id",inv.id);
    if(res.error){alert("Couldn't update: "+res.error.message);return;}
    // Keep the Ledger in sync — settle (or un-settle) the lessons this invoice covers.
    var lids=(inv.data&&inv.data.lesson_ids)||null;
    if(lids&&lids.length){
      var lr=await window.sb.from("lessons").update({paid:next==="paid",paid_date:pd}).in("id",lids);
      if(lr.error) alert("Invoice updated, but its lessons didn't sync: "+lr.error.message);
    }
    load();
  }
  async function updatePaidDate(id,date){
    var res=await window.sb.from("invoices").update({paid_date:date||null}).eq("id",id);
    if(res.error){alert("Couldn't update the paid date: "+res.error.message);load();return;}
    var v=invoices.filter(function(x){return x.id===id;})[0];
    if(v){ v.paid_date=date||null;
      var lids=(v.data&&v.data.lesson_ids)||null;
      if(lids&&lids.length) await window.sb.from("lessons").update({paid_date:date||null}).in("id",lids);   // sync lessons' paid date
    }
  }
  async function del(id){
    if(!confirm("Delete this saved invoice? This only removes the saved copy — it does not change any lessons or payments."))return;
    var res=await window.sb.from("invoices").delete().eq("id",id);
    if(res.error){alert("Couldn't delete: "+res.error.message);return;}
    load();
  }

  // ---- income filter (by paid date) ----
  function inRange(v){
    if(!fFrom && !fTo) return true;
    var d=v.paid_date||"";
    if(!d) return false;                 // a range is set → only paid invoices with a paid date
    if(fFrom && d<fFrom) return false;
    if(fTo && d>fTo) return false;
    return true;
  }
  function filtered(){ return invoices.filter(inRange); }

  // ---- transaction screenshot (proof) ----
  function startAttach(id){ proofTarget=id; var f=$("proof-file"); f.value=""; f.click(); }
  async function onProofFile(){
    var file=$("proof-file").files[0]; if(!file||!proofTarget) return;
    var id=proofTarget; proofTarget=null;
    var safe=file.name.replace(/[^A-Za-z0-9._-]/g,"_");
    var path=userId+"/"+id+"_"+Date.now()+"_"+safe;
    var up=await window.sb.storage.from("receipts").upload(path,file,{upsert:false});
    if(up.error){ alert("Upload failed: "+up.error.message); return; }
    var res=await window.sb.from("invoices").update({proof_path:path}).eq("id",id);
    if(res.error){ await window.sb.storage.from("receipts").remove([path]); alert("Couldn't save: "+res.error.message); return; }
    load();
  }
  async function viewProof(v){
    if(!v||!v.proof_path) return;
    var r=await window.sb.storage.from("receipts").createSignedUrl(v.proof_path,3600);
    if(r.error||!r.data){ alert("Couldn't open the screenshot: "+((r.error&&r.error.message)||"unknown")); return; }
    window.open(r.data.signedUrl,"_blank");
  }
  async function removeProof(v){
    if(!v||!v.proof_path) return;
    if(!confirm("Remove the transaction screenshot from this invoice?")) return;
    await window.sb.storage.from("receipts").remove([v.proof_path]);
    var res=await window.sb.from("invoices").update({proof_path:null}).eq("id",v.id);
    if(res.error){ alert("Couldn't update: "+res.error.message); return; }
    load();
  }

  // ---- CSV export of the (filtered) income record ----
  function csvCell(s){ s=String(s==null?"":s); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
  function exportCSV(){
    var list=filtered();
    var lines=[["Paid date","Issued date","Student","Invoice no.","Total","Status","Proof"].join(",")];
    list.forEach(function(v){
      lines.push([v.paid_date||"",v.issued_date||"",studentName(v),v.invoice_no,Number(v.total||0).toFixed(2),v.status,v.proof_path?"yes":"no"].map(csvCell).join(","));
    });
    var blob=new Blob([lines.join("\n")],{type:"text/csv"});
    var a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download="income"+((fFrom||fTo)?("_"+(fFrom||"start")+"_"+(fTo||"end")):"")+".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
  }

  function render(){
    var table=$("i-table"),empty=$("i-empty"),body=$("i-body");
    var list=filtered(), paidList=list.filter(function(v){return v.status==="paid";});
    var income=paidList.reduce(function(t,v){return t+Number(v.total||0);},0);
    var withProof=paidList.filter(function(v){return v.proof_path;}).length, ranged=!!(fFrom||fTo);
    $("i-count").textContent=list.length?list.length+(list.length===1?" invoice":" invoices"):(invoices.length?"none in range":"");
    $("i-income").textContent=paidList.length
      ? "Income"+(ranged?" in range":"")+": "+TL.sgd(income)+" · "+paidList.length+" paid · "+withProof+"/"+paidList.length+" with proof"
      : "";
    if(!list.length){
      table.style.display="none"; empty.style.display="block";
      empty.querySelector("h3").textContent=invoices.length?"No invoices match this range":"No saved invoices yet";
      return;
    }
    empty.style.display="none"; table.style.display="table";
    body.innerHTML=list.map(function(v){
      var paid=v.status==="paid";
      var badge=paid?'<span class="badge paid">Paid</span>':'<span class="badge owed">Issued</span>';
      if(paid&&v.self_reported) badge+=' <span class="badge" style="background:rgba(181,137,43,.14);color:#8a6a1f" title="The parent reported this payment from the invoice link">reported by parent</span>';
      var pd=paid?' <input type="date" data-pd="'+v.id+'" value="'+(v.paid_date||"")+'" title="Paid on" style="font-size:12px;padding:2px 5px;border:1px solid var(--line);border-radius:6px;margin-left:6px;color:var(--muted)">':'';
      var proof=v.proof_path
        ? '<span style="display:inline-flex;align-items:center;gap:14px">'+
            '<button class="tact" data-vproof="'+v.id+'" title="View transaction screenshot">📎 View</button>'+
            '<button class="tact del" data-rproof="'+v.id+'" title="Detach screenshot" aria-label="Detach screenshot">✕ Detach</button>'+
          '</span>'
        : '<button class="tact" data-aproof="'+v.id+'">Attach</button>';
      return '<tr>'+
        '<td data-label="Issued">'+prettyDate(v.issued_date)+'</td>'+
        '<td class="name" data-label="Student">'+(v.student_id?'<a class="snl" href="student.html?id='+v.student_id+'">'+esc(studentName(v))+'</a>':esc(studentName(v)))+'</td>'+
        '<td data-label="Invoice no.">'+esc(v.invoice_no)+'</td>'+
        '<td data-label="Total">'+TL.sgd(v.total)+'</td>'+
        '<td data-label="Proof">'+proof+'</td>'+
        '<td data-label="Status">'+badge+pd+'</td>'+
        '<td class="acts">'+
          '<button class="tact" data-view="'+v.id+'">View</button>'+
          '<button class="tact" data-paid="'+v.id+'">'+(paid?"Mark unpaid":"Mark paid")+'</button>'+
          '<button class="tact del" data-del="'+v.id+'">Delete</button>'+
        '</td></tr>';
    }).join("");
    function find(id){return invoices.filter(function(v){return v.id===id;})[0];}
    body.querySelectorAll("[data-view]").forEach(function(b){b.addEventListener("click",function(){openView(find(b.dataset.view));});});
    body.querySelectorAll("[data-paid]").forEach(function(b){b.addEventListener("click",function(){togglePaid(find(b.dataset.paid));});});
    body.querySelectorAll("[data-del]").forEach(function(b){b.addEventListener("click",function(){del(b.dataset.del);});});
    body.querySelectorAll("[data-pd]").forEach(function(inp){inp.addEventListener("change",function(){updatePaidDate(inp.dataset.pd,inp.value);});});
    body.querySelectorAll("[data-aproof]").forEach(function(b){b.addEventListener("click",function(){startAttach(b.dataset.aproof);});});
    body.querySelectorAll("[data-vproof]").forEach(function(b){b.addEventListener("click",function(){viewProof(find(b.dataset.vproof));});});
    body.querySelectorAll("[data-rproof]").forEach(function(b){b.addEventListener("click",function(){removeProof(find(b.dataset.rproof));});});
  }

  async function load(){
    var st=await window.sb.from("students").select("id,name");
    nameById={};(st.data||[]).forEach(function(s){nameById[s.id]=s.name;});
    var res=await window.sb.from("invoices").select("id,student_id,invoice_no,issued_date,total,status,paid_date,proof_path,self_reported,data").order("issued_date",{ascending:false}).order("created_at",{ascending:false});
    if(res.error){$("i-count").textContent="Couldn't load invoices: "+res.error.message;return;}
    invoices=res.data||[];render();
  }

  function init(user){
    userId=user.id;
    $("inv-close").addEventListener("click",closeView);
    $("inv-backdrop").addEventListener("click",function(e){if(e.target===$("inv-backdrop"))closeView();});
    $("inv-print").addEventListener("click",printInvoice);
    $("f-from").addEventListener("change",function(){fFrom=this.value;render();});
    $("f-to").addEventListener("change",function(){fTo=this.value;render();});
    $("f-year").addEventListener("click",function(){var y=new Date().getFullYear();fFrom=y+"-01-01";fTo=y+"-12-31";$("f-from").value=fFrom;$("f-to").value=fTo;render();});
    $("f-clear").addEventListener("click",function(){fFrom="";fTo="";$("f-from").value="";$("f-to").value="";render();});
    $("i-csv").addEventListener("click",exportCSV);
    $("proof-file").addEventListener("change",onProofFile);
    load();
  }
  TL.requireAuth("invoices",init);
})();