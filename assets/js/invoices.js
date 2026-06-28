// Invoices — list saved invoices; re-view, re-print, mark paid, delete.
(function () {
  var userId=null, nameById={}, invoices=[], current=null;
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

  async function togglePaid(inv){
    var next=inv.status==="paid"?"issued":"paid";
    var res=await window.sb.from("invoices").update({status:next}).eq("id",inv.id);
    if(res.error){alert("Couldn't update: "+res.error.message);return;}
    load();
  }
  async function del(id){
    if(!confirm("Delete this saved invoice? This only removes the saved copy — it does not change any lessons or payments."))return;
    var res=await window.sb.from("invoices").delete().eq("id",id);
    if(res.error){alert("Couldn't delete: "+res.error.message);return;}
    load();
  }

  function render(){
    var table=$("i-table"),empty=$("i-empty"),body=$("i-body");
    $("i-count").textContent=invoices.length?invoices.length+(invoices.length===1?" invoice":" invoices"):"";
    if(!invoices.length){table.style.display="none";empty.style.display="block";return;}
    empty.style.display="none";table.style.display="table";
    body.innerHTML=invoices.map(function(v){
      var paid=v.status==="paid";
      var badge=paid?'<span class="badge paid">Paid</span>':'<span class="badge owed">Issued</span>';
      return '<tr>'+
        '<td data-label="Issued">'+prettyDate(v.issued_date)+'</td>'+
        '<td class="name" data-label="Student">'+esc(studentName(v))+'</td>'+
        '<td data-label="Invoice no.">'+esc(v.invoice_no)+'</td>'+
        '<td data-label="Total">'+TL.sgd(v.total)+'</td>'+
        '<td data-label="Status">'+badge+'</td>'+
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
  }

  async function load(){
    var st=await window.sb.from("students").select("id,name");
    nameById={};(st.data||[]).forEach(function(s){nameById[s.id]=s.name;});
    var res=await window.sb.from("invoices").select("id,student_id,invoice_no,issued_date,total,status,data").order("issued_date",{ascending:false}).order("created_at",{ascending:false});
    if(res.error){$("i-count").textContent="Couldn't load invoices: "+res.error.message;return;}
    invoices=res.data||[];render();
  }

  function init(user){
    userId=user.id;
    $("inv-close").addEventListener("click",closeView);
    $("inv-backdrop").addEventListener("click",function(e){if(e.target===$("inv-backdrop"))closeView();});
    $("inv-print").addEventListener("click",printInvoice);
    load();
  }
  TL.requireAuth("invoices",init);
})();